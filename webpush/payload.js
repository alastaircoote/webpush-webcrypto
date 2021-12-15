/**
 * @typedef {import('./application-server-keys.js').ApplicationServerKeys} ApplicationServerKeys
 *
 * @typedef SerializedClientKeys
 * @property {string} p256dh
 * @property {string} auth
 *
 * @typedef PushTarget
 * @property {string} endpoint
 * @property {SerializedClientKeys} keys
 *
 * @typedef PushOptions
 * @property {string} payload
 * @property {ApplicationServerKeys} applicationServerKeys
 * @property {PushTarget} target
 * @property {string} adminContact
 * @property {number} ttl
 * @property {string} [topic]
 * @property {"very-low" | "low" | "normal" | "high"} [urgency]
 */

import {
	AUTH_ENCODING_HEADER,
	CONTENT_ENCRYPTION_KEY_HEADER,
	CONTEXT_KEY_LABEL,
	NONCE_ENCODING_HEADER,
} from "./constants.js";
import { createJWT } from "./jwt.js";
import {
	base64urlEncode,
	concatTypedArrays,
	decodeBase64URL,
	crypto,
} from "./util.js";

/**
 * A JSON-serialized PushSubscription contains p256 and auth keys
 * as base64URL-encoded strings. They need to be converted in order
 * to be usable.
 * @param {SerializedClientKeys} keys
 * @returns {Promise<{auth: ArrayBuffer, p256: CryptoKey}>}
 */
async function importClientKeys(keys) {
	const auth = decodeBase64URL(keys.auth);
	if (auth.byteLength !== 16) {
		throw new Error(
			`incorrect auth length, expected 16 bytes got ${auth.byteLength}`
		);
	}
	const p256 = await crypto.subtle.importKey(
		"raw",
		decodeBase64URL(keys.p256dh),
		{
			name: "ECDH",
			namedCurve: "P-256",
		},
		true,
		[]
	);

	return { auth, p256 };
}

/**
 * The shared secret is calculated by both the sender and receiver. ECDH allows this
 * because a combination of device A's public key and device B's private key will
 * derive the same secret as device B's public key and device A's private key.
 * @param {CryptoKey} clientPublicKey
 * @param {CryptoKey} localPrivateKey
 */
async function deriveSharedSecret(clientPublicKey, localPrivateKey) {
	const sharedSecretBytes = await crypto.subtle.deriveBits(
		{
			name: "ECDH",
			public: clientPublicKey,
		},
		localPrivateKey,
		256
	);

	// Now that we have our bits we need to convert them into a key, in this
	// case a HKDF one:
	// https://en.wikipedia.org/wiki/HKDF

	return crypto.subtle.importKey(
		"raw",
		sharedSecretBytes,
		{ name: "HKDF" },
		false,
		["deriveBits", "deriveKey"]
	);
}

/**
 * We use our shared secret HKDF key to make a more crytographically strong
 * psuedo random key.
 *
 * @param {ArrayBuffer} auth
 * @param {CryptoKey} sharedSecret
 * @returns {Promise<CryptoKey>}
 */
async function derivePsuedoRandomKey(auth, sharedSecret) {
	const pseudoRandomKeyBytes = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: auth,
			// Adding Content-Encoding data info here is required by the Web
			// Push API
			info: AUTH_ENCODING_HEADER,
		},
		sharedSecret,
		256
	);

	return crypto.subtle.importKey("raw", pseudoRandomKeyBytes, "HKDF", false, [
		"deriveBits",
	]);
}

/**
 * The context is used when creating our nonce and content encryption key. I'm not
 * totally sure *why* it has to include what it does, but it does.
 *
 * @param {CryptoKey} clientPublicKey The browser's p256dh key
 * @param {CryptoKey} localPublicKey Our locally generated public key
 * @returns {Promise<Uint8Array>}
 */
async function createContext(clientPublicKey, localPublicKey) {
	const clientKeyBytes = await crypto.subtle.exportKey("raw", clientPublicKey);
	const localKeyBytes = await crypto.subtle.exportKey("raw", localPublicKey);

	return concatTypedArrays([
		CONTEXT_KEY_LABEL,
		new Uint8Array([0, clientKeyBytes.byteLength]),
		new Uint8Array(clientKeyBytes),
		new Uint8Array([0, localKeyBytes.byteLength]),
		new Uint8Array(localKeyBytes),
	]);
}

/**
 * "A nonce is a value that prevents replay attacks as it should only be used once."
 * https://en.wikipedia.org/wiki/Cryptographic_nonce
 *
 * Since our salt is unique for each push this nonce value will be, too.
 *
 * @param {CryptoKey} pseudoRandomKey
 * @param {ArrayBuffer} salt
 * @param {Uint8Array} context
 * @returns {Promise<ArrayBuffer>}
 */
async function deriveNonce(pseudoRandomKey, salt, context) {
	const nonceInfo = concatTypedArrays([NONCE_ENCODING_HEADER, context]);
	return crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: salt,
			info: nonceInfo,
		},
		pseudoRandomKey,
		12 * 8
	);
}

/**
 * We're finally here! We get to generate a key that we will actually finally use
 * to encrypt the payload of our push message.
 *
 * @param {CryptoKey} pseudoRandomKey
 * @param {ArrayBuffer} salt
 * @param {Uint8Array} context
 * @returns {Promise<CryptoKey>}
 */
async function deriveContentEncryptionKey(pseudoRandomKey, salt, context) {
	const cekInfo = concatTypedArrays([CONTENT_ENCRYPTION_KEY_HEADER, context]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: salt,
			info: cekInfo,
		},
		pseudoRandomKey,
		16 * 8
	);

	return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt"]);
}

/**
 * It's possible that the size of any given web push payload could give away
 * its contents (or at least what category of content it is), given that a lot
 * of data can be fixed length. In order to disguise pushes we add some 0-byte
 * padding. We prefix this padding with a Uint16 saying how long the padding is.
 *
 * @param {Uint8Array} payload
 */
function padPayload(payload) {
	// Web push payloads have an overall max size of 4KB (4096 bytes). With the
	// required overhead for encryption etc our actual max payload size is 4078.
	// https://developers.google.com/web/updates/2016/03/web-push-encryption

	const MAX_PAYLOAD_SIZE = 4078;

	let paddingSize = Math.round(Math.random() * 100);
	// +2 here because we use 2 bytes to indicate padding length, that's also
	// included
	const payloadSizeWithPadding = payload.byteLength + 2 + paddingSize;

	if (payloadSizeWithPadding > MAX_PAYLOAD_SIZE) {
		// is our payload now too large with padding added? If so, trim down the
		// padding so it fits
		paddingSize -= payloadSizeWithPadding - MAX_PAYLOAD_SIZE;
	}

	const paddingArray = new ArrayBuffer(2 + paddingSize);
	// The first 2 bytes of the array are used to store the overall length of
	// padding, so let's store that:
	new DataView(paddingArray).setUint16(0, paddingSize);

	// Then return our new payload with padding added:
	return concatTypedArrays([paddingArray, payload]);
}

/**
 * @typedef HeaderOptions
 * @property {PushOptions} options
 * @property {number} payloadLength
 * @property {ArrayBuffer} salt
 * @property {CryptoKey} localPublicKey
 */

/**
 * Calculate the HTTP headers we need to attach to the request in order for it to
 * send successfully.
 * @param {HeaderOptions} options
 * @returns {Promise<Record<string,string>>}
 */
async function getHeaders({ options, payloadLength, salt, localPublicKey }) {
	const localPublicKeyBytes = await crypto.subtle.exportKey(
		"raw",
		localPublicKey
	);

	const appKey = await crypto.subtle.exportKey(
		"raw",
		options.applicationServerKeys.publicKey
	);

	const localPublicKeyB64 = base64urlEncode(localPublicKeyBytes);
	const appKeyB64 = base64urlEncode(appKey);

	const endpointURL = new URL(options.target.endpoint);

	const jwt = await createJWT(options.applicationServerKeys, {
		aud: endpointURL.origin,
		sub: options.adminContact,
	});

	const headers = {
		Encryption: `salt=${base64urlEncode(salt)}`,
		"Crypto-Key": `dh=${localPublicKeyB64}; p256ecdsa=${appKeyB64}`,
		"Content-Length": payloadLength.toString(),
		"Content-Type": "application/octet-stream",
		"Content-Encoding": "aesgcm",
		Authorization: `WebPush ${jwt}`,
		TTL: options.ttl.toString(),
	};

	if (options.topic) {
		headers["Topic"] = options.topic;
	}
	if (options.urgency) {
		headers["Urgency"] = options.urgency;
	}

	return headers;
}

/**
 * Encrypt a push payload and calculate the various HTTP headers required to successfully
 * send a push.
 * @param {PushOptions} options
 * @returns {Promise<{headers: Record<string,string>, body: ArrayBuffer, endpoint: string}>}
 */
export async function generatePushHTTPRequest(options) {
	// These keys are used for encrypting your payload content. They
	// can be unique to every push so there's no need to save them.
	const localKeys = await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"]
	);

	if (!localKeys.privateKey || !localKeys.publicKey) {
		// Shouldn't ever happen. TS types suggest it can so... shrug.
		throw new Error("Local key generation failed");
	}

	// Take our base64 encoded client keys and turn them into something we
	// can actually use:
	const clientKeys = await importClientKeys(options.target.keys);

	const sharedSecret = await deriveSharedSecret(
		clientKeys.p256,
		localKeys.privateKey
	);

	const pseudoRandomKey = await derivePsuedoRandomKey(
		clientKeys.auth,
		sharedSecret
	);

	const context = await createContext(clientKeys.p256, localKeys.publicKey);

	// The salt is just 16 random bytes, different for every push. Used to ensure
	// the same request is never sent twice.
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);

	const nonce = await deriveNonce(pseudoRandomKey, salt, context);

	const contentEncryptionKey = await deriveContentEncryptionKey(
		pseudoRandomKey,
		salt,
		context
	);

	// Take our string payload and encode as UTF8 text:
	const encodedPayload = new TextEncoder().encode(options.payload);

	// Pad it for security:
	const paddedPayload = padPayload(encodedPayload);

	// And finally encrypt it:
	/** @type ArrayBuffer */
	const encryptedPayload = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: nonce,
		},
		contentEncryptionKey,
		paddedPayload
	);

	const headers = await getHeaders({
		options,
		payloadLength: encryptedPayload.byteLength,
		salt,
		localPublicKey: localKeys.publicKey,
	});

	return { headers, body: encryptedPayload, endpoint: options.target.endpoint };
}

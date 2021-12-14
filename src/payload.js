/**
 * @typedef {import('./application-server-keys.js').ApplicationServerKeys} ApplicationServerKeys
 *
 * @typedef SerializedClientKeys
 * @property {string} p256
 * @property {string} auth
 *
 * @typedef PushTarget
 * @property {string} endpoint
 * @property {SerializedClientKeys} keys
 *
 * @typedef PushOptions
 * @property {string} payload
 * @property {ApplicationServerKeys} applicationServerKey
 * @property {PushTarget} target
 * @property {string} adminContact
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
		decodeBase64URL(keys.p256),
		{
			name: "ECDH",
			namedCurve: "P-256",
		},
		true,
		["deriveBits"]
	);

	return { auth, p256 };
}

/**
 *
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

	return crypto.subtle.importKey(
		"raw",
		sharedSecretBytes,
		{ name: "HKDF" },
		false,
		["deriveBits", "deriveKey"]
	);
}

/**
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
 *
 * @param {CryptoKey} clientPublicKey
 * @param {CryptoKey} localPublicKey
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
 *
 * @param {Uint8Array} payload
 */
function padPayload(payload) {
	// https://developers.google.com/web/updates/2016/03/web-push-encryption
	const MAX_PAYLOAD_SIZE = 4078;
	let paddingSize = Math.round(Math.random() * 100);
	// +2 here because we use 2 bytes to indicate padding length, that's also
	// included
	const payloadSizeWithPadding = payload.byteLength + 2 + paddingSize;

	if (payloadSizeWithPadding > MAX_PAYLOAD_SIZE) {
		paddingSize -= payloadSizeWithPadding - MAX_PAYLOAD_SIZE;
	}

	const paddingArray = new Uint8Array(2 + paddingSize);
	new DataView(paddingArray.buffer).setUint16(0, paddingSize);
	return concatTypedArrays([paddingArray, payload]);
}

/**
 * @typedef HeaderOptions
 * @property {PushOptions} options
 * @property {number} payloadLength
 * @property {ArrayBuffer} salt
 * @property {CryptoKey} localPublicKey

 * @param {HeaderOptions} options 
 * @returns 
 */
async function getHeaders({ options, payloadLength, salt, localPublicKey }) {
	const localPublicKeyBytes = await crypto.subtle.exportKey(
		"raw",
		localPublicKey
	);

	const appKey = await crypto.subtle.exportKey(
		"raw",
		options.applicationServerKey.publicKey
	);

	const localPublicKeyB64 = base64urlEncode(localPublicKeyBytes);
	const appKeyB64 = base64urlEncode(appKey);

	const endpointURL = new URL(options.target.endpoint);

	const jwt = await createJWT(options.applicationServerKey, {
		aud: endpointURL.origin,
		sub: options.adminContact,
	});

	return {
		Encryption: `salt=${base64urlEncode(salt)}`,
		"Crypto-Key": `dh=${localPublicKeyB64}; p256ecdsa=${appKeyB64}`,
		"Content-Length": payloadLength.toString(),
		"Content-Type": "application/octet-stream",
		"Content-Encoding": "aesgcm",
		/* Others */
		TTL: "60",
		Authorization: `WebPush ${jwt}`,
	};
}

/**
 *
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
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);

	const nonce = await deriveNonce(pseudoRandomKey, salt, context);

	const contentEncryptionKey = await deriveContentEncryptionKey(
		pseudoRandomKey,
		salt,
		context
	);

	const encodedPayload = new TextEncoder().encode(options.payload);
	const paddedPayload = padPayload(encodedPayload);

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

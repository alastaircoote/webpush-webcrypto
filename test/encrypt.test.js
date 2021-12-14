import { base64urlEncode } from "../src/util.js";
import crypto from "./stubs/webcrypto.js";

/**
 *
 * @param {(Uint8Array | Uint16Array)[]} arrays
 * @returns {Uint8Array}
 */
function concatTypedArrays(arrays) {
	const totalLength = arrays.reduce((prev, curr) => prev + curr.byteLength, 0);
	let index = 0;
	const targetArray = new Uint8Array(totalLength);
	for (const array of arrays) {
		targetArray.set(array, index);
		index += array.byteLength;
	}
	return targetArray;
}

describe("Encrypt", function () {
	it("test", async function () {
		const textEncoder = new TextEncoder();

		const dummyApplicationKey = await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveKey"]
		);

		const localKeys = await crypto.subtle.generateKey(
			{ name: "ECDH", namedCurve: "P-256" },
			true,
			["deriveBits"]
		);

		const sharedSecret = await crypto.subtle.deriveBits(
			{
				name: "ECDH",
				public: dummyApplicationKey.publicKey,
			},
			/** @type {any} */ (localKeys.privateKey),
			256
		);

		// 16 byte random auth
		const auth = crypto.getRandomValues(new Uint8Array(16));

		const authEncBuff = textEncoder.encode("Content-Encoding: auth\0");

		const sharedSecretAsKey = await crypto.subtle.importKey(
			"raw",
			sharedSecret,
			{ name: "HKDF" },
			false,
			["deriveBits", "deriveKey"]
		);

		const pseudoRandomKey = await crypto.subtle.deriveBits(
			{
				name: "HKDF",
				hash: "SHA-256",
				salt: auth,
				info: authEncBuff,
			},
			sharedSecretAsKey,
			256
		);

		const prkAsKey = await crypto.subtle.importKey(
			"raw",
			pseudoRandomKey,
			"HKDF",
			false,
			["deriveBits"]
		);

		// const pseudoRandomKey2 = await crypto.subtle.deriveKey(
		// 	{
		// 		name: "HKDF",
		// 		hash: "SHA-256",
		// 		salt: auth,
		// 		info: authEncBuff,
		// 	},
		// 	sharedSecretAsKey,
		// 	{
		// 		name: "HMAC",
		// 		hash: "SHA-256",
		// 		length: 256,
		// 	},
		// 	true,
		// 	["deriveBits"]
		// );

		// context

		const keyLabel = textEncoder.encode("P-256\0");

		// @ts-ignore
		const applicationPublicKeyExport = await crypto.subtle.exportKey(
			"raw",
			dummyApplicationKey.publicKey
		);

		// @ts-ignore
		const localKeysPublicKeyExport = await crypto.subtle.exportKey(
			"raw",
			localKeys.publicKey
		);

		const contextArray = concatTypedArrays([
			keyLabel,
			new Uint8Array([0, applicationPublicKeyExport.byteLength]),
			new Uint8Array(applicationPublicKeyExport),
			new Uint8Array([0, localKeysPublicKeyExport.byteLength]),
			new Uint8Array(localKeysPublicKeyExport),
		]);

		//key and nonce

		const nonceEncoding = textEncoder.encode("Content-Encoding: nonce\0");
		const cekEncoding = textEncoder.encode("Content-Encoding: aesgcm\0");

		const nonceInfo = concatTypedArrays([nonceEncoding, contextArray]);
		const cekInfo = concatTypedArrays([cekEncoding, contextArray]);

		const salt = crypto.getRandomValues(new Uint8Array(16));

		const nonce = await crypto.subtle.deriveBits(
			{
				name: "HKDF",
				hash: "SHA-256",
				salt: salt,
				info: nonceInfo,
			},
			prkAsKey,
			12 * 8
		);

		const contentEncryptionKey = await crypto.subtle.deriveBits(
			{
				name: "HKDF",
				hash: "SHA-256",
				salt: salt,
				info: cekInfo,
			},
			prkAsKey,
			16 * 8
		);

		const cek = await crypto.subtle.importKey(
			"raw",
			contentEncryptionKey,
			"AES-GCM",
			false,
			["encrypt"]
		);
		//hkdf(salt, prk, nonceInfo, 12);

		const paddingIndicator = new Uint16Array([0]);
		const test = textEncoder.encode("Hello");

		const payload = concatTypedArrays([paddingIndicator, test]);

		const encrypted = await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv: nonceInfo,
			},
			cek,
			payload
		);

		const base64Salt = base64urlEncode(salt);
		const base64dh = base64urlEncode(localKeysPublicKeyExport);
		const base64appserver = base64urlEncode(applicationPublicKeyExport);
		console.log(base64appserver);
		console.log(sharedSecret, sharedSecretAsKey, pseudoRandomKey);
	});
});

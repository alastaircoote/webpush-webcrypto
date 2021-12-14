import { base64urlEncode, decodeBase64URL, setWebCrypto } from "../src/util.js";
import crypto from "../test/stubs/webcrypto.js";
const textEncoder = new TextEncoder();

setWebCrypto(crypto);

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

const appKey =
	"BMf2aoDR-3RFmyZotqsvjDUQxxxqTXCsuI9RDQ-TQXxLCPO0myKSawoVcQApPsRSNgpKEf-kYgAu0oK6WwIpEXI";

const appPrivateKey =
	"MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnam-YxVQY8a4JimkVh6Y_Pwgup3nsNFaGbcIBJvdhPChRANCAATH9mqA0ft0RZsmaLarL4w1EMccak1wrLiPUQ0Pk0F8SwjztJsikmsKFXEAKT7EUjYKShH_pGIALtKCulsCKRFy";

const decodedAppKey = decodeBase64URL(appKey);
const decodedPrivateKey = decodeBase64URL(appPrivateKey);

const dummyApplicationKey = await crypto.subtle.importKey(
	"raw",
	decodedAppKey,
	{ name: "ECDH", namedCurve: "P-256" },
	true,
	["deriveKey"]
);

const dummyApplicationPrivateKey = await crypto.subtle.importKey(
	"pkcs8",
	decodedPrivateKey,
	{ name: "ECDSA", namedCurve: "P-256" },
	true,
	["sign"]
);

const localKeys = await crypto.subtle.generateKey(
	{ name: "ECDH", namedCurve: "P-256" },
	true,
	["deriveBits"]
);

const p256FromChrome =
	"BOVK4CvU7vyA2W48864kovYJvUnIAEhHqucsvx96k38yhnZfW3ROvq3URTC2Z7EH_ZGacFoEs84y3z15z71_S6c";
const sharedSecretPublicKey = decodeBase64URL(p256FromChrome);

const chromePublicKey = await crypto.subtle.importKey(
	"raw",
	sharedSecretPublicKey,
	{
		name: "ECDH",
		namedCurve: "P-256",
	},
	true,
	["deriveBits"]
);

const sharedSecret = await crypto.subtle.deriveBits(
	{
		name: "ECDH",
		public: chromePublicKey,
	},
	/** @type {any} */ (localKeys.privateKey),
	256
);

const authFromChrome = "vNUy0gBubi1_1dmrtDdQEQ";
const auth = decodeBase64URL(authFromChrome);
if (auth.byteLength !== 16) {
	throw new Error("incorrect auth length");
}
// 16 byte random auth
// const auth = crypto.getRandomValues(new Uint8Array(16));

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

// context

const keyLabel = textEncoder.encode("P-256\0");

// @ts-ignore
const subscriptionKeyExport = await crypto.subtle.exportKey(
	"raw",
	chromePublicKey
);

// @ts-ignore
const localKeysPublicKeyExport = await crypto.subtle.exportKey(
	"raw",
	localKeys.publicKey
);

const contextArray = concatTypedArrays([
	keyLabel,
	new Uint8Array([0, subscriptionKeyExport.byteLength]),
	new Uint8Array(subscriptionKeyExport),
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

/** @type ArrayBuffer */
const encryptedPayload = await crypto.subtle.encrypt(
	{
		name: "AES-GCM",
		iv: nonce,
	},
	cek,
	payload
);

const base64Salt = base64urlEncode(salt);
const base64dh = base64urlEncode(localKeysPublicKeyExport);

const endpoint =
	"https://fcm.googleapis.com/fcm/send/eWus6tq-mxA:APA91bF0TMrWteuIvFEK54pcGfImEP27IUe19RGNp6Hcc-4RXTrXJAtgmyvmXuzfrCWu1Ny75rrrOTnRrYHkKp5W5rBEBqCJaTnhoUnrvVnW4b55U1ziUiv1u3T2xeIGv3UROC_vbb8t";

import fetch from "node-fetch";
import { createJWT } from "../src/jwt.js";

const jwt = await createJWT(
	{ publicKey: dummyApplicationKey, privateKey: dummyApplicationPrivateKey },
	{
		aud: "https://fcm.googleapis.com/",
		sub: "mailto:hello@alastair.is",
	},
	crypto
);

console.log({
	Encryption: `salt=${base64Salt}`,
	"Crypto-Key": `dh=${base64dh}; p256ecdsa=${appKey}`,
	"Content-Length": encryptedPayload.byteLength.toString(),
	"Content-Type": "application/octet-stream",
	"Content-Encoding": "aesgcm",
	/* Others */
	TTL: "60",
	Authorization: `WebPush ${jwt}`,
});

console.log(base64urlEncode(encryptedPayload));

const response = await fetch(endpoint, {
	method: "POST",
	headers: {
		Encryption: `salt=${base64Salt}`,
		"Crypto-Key": `dh=${base64dh}; p256ecdsa=${appKey}`,
		"Content-Length": encryptedPayload.byteLength.toString(),
		"Content-Type": "application/octet-stream",
		"Content-Encoding": "aesgcm",
		/* Others */
		TTL: "60",
		Authorization: `WebPush ${jwt}`,
	},
	body: Buffer.from(encryptedPayload),
});
// console.log("status", response.status);
// console.log([...response.headers.keys()]);
// const txt = await response.text();
// console.log(txt);

// const base64appserver = base64urlEncode(applicationPublicKeyExport);
// console.log(base64appserver);
// console.log(sharedSecret, sharedSecretAsKey, pseudoRandomKey);

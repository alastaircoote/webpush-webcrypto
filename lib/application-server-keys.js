import { base64urlEncode, crypto, decodeBase64URL } from "./util.js";

/**
 * @typedef JSONSerializedKeys
 * @property {string} publicKey
 * @property {string} privateKey
 */

export class ApplicationServerKeys {
	/**
	 * You aren't likely to want to construct ApplicationServerKeys directly. Use generate()
	 * from fromJSON() instead.
	 * @param {CryptoKey} publicKey
	 * @param {CryptoKey} privateKey
	 */
	constructor(publicKey, privateKey) {
		this.publicKey = publicKey;
		this.privateKey = privateKey;
	}

	/**
	 * You'll need to use the same application server key whenever you want to send a message.
	 * This method provides an export of the keys that can you can more easily persist to storage
	 * (e.g. IndexedDB) more easily.
	 * @returns {Promise<JSONSerializedKeys>}
	 */
	async toJSON() {
		const publicKey = await crypto.subtle.exportKey("raw", this.publicKey);
		const privateKey = await crypto.subtle.exportKey("pkcs8", this.privateKey);

		return {
			publicKey: base64urlEncode(publicKey),
			privateKey: base64urlEncode(privateKey),
		};
	}

	/**
	 * Counterpart to toJSON(). This will take previously seralized application server keys and
	 * restore them into a form actually usable for encryption.
	 * @param {JSONSerializedKeys} keys
	 */
	static async fromJSON(keys) {
		const publicKey = await crypto.subtle.importKey(
			"raw",
			decodeBase64URL(keys.publicKey),
			{
				name: "ECDSA",
				namedCurve: "P-256",
			},
			true,
			[]
		);

		const privateKey = await crypto.subtle.importKey(
			"pkcs8",
			decodeBase64URL(keys.privateKey),
			{
				name: "ECDSA",
				namedCurve: "P-256",
			},
			true,
			["sign"]
		);

		return new ApplicationServerKeys(publicKey, privateKey);
	}

	static async generate() {
		const newApplicationKey = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign"]
		);
		console.log("got private?");
		if (!newApplicationKey.publicKey || !newApplicationKey.privateKey) {
			// No reason this will ever actually happen but the API shows that the keys
			// can be nullable so let's check and satisfy the type checker.
			throw new Error("Did not generate both public and private key somehow");
		}

		// I'm not too sure why the WebCrypto API makes me do this. But you can't sign with an
		// ECDH key and you can't deriveKey with an ECDSA one. So we generate our keys then
		// reimport the public one as an ECDH key.

		// const exportedPublic = await crypto.subtle.exportKey(
		// 	"raw",
		// 	newApplicationKey.publicKey
		// );

		// const reimportedPublic = await crypto.subtle.importKey(
		// 	"raw",
		// 	exportedPublic,
		// 	{
		// 		name: "ECDH",
		// 		namedCurve: "P-256",
		// 	},
		// 	true,
		// 	["deriveKey"]
		// );
		// console.log("got reimported?");
		return new ApplicationServerKeys(
			newApplicationKey.publicKey,
			newApplicationKey.privateKey
		);
	}
}

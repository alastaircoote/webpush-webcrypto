/**
 * Browsers don't have a built-in API for base64 URL encoding
 * so we need to provide one.
 * @param {ArrayBuffer | string} arrayBufferOrString
 * @returns {string}
 */
export function base64urlEncode(arrayBufferOrString) {
	let source = arrayBufferOrString;
	if (typeof source === "string") {
		source = new TextEncoder().encode(source);
	}

	let result = "";
	new Uint8Array(source).forEach((value) => {
		result += String.fromCharCode(value);
	});
	return btoa(result).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Similar to the encoder, there's no built in functionality for
 * base64 URL decoding, so we'll provide one.
 * @param {string} string
 * @returns {ArrayBuffer}
 */
export function decodeBase64URL(string) {
	let deURLed = string.replace(/\-/g, "+").replace(/_/g, "/");
	const pad = 4 - (deURLed.length % 4);
	if (pad !== 4) {
		for (let i = 0; i < pad; i++) {
			deURLed += "=";
		}
	}
	if (deURLed.length % 4 !== 0) {
		throw new Error("Decoded to incorrect length");
	}
	const decoded = atob(deURLed);
	const array = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; i++) {
		array[i] = decoded.charCodeAt(i);
	}
	return array.buffer;
}

/**
 * Node has Buffer.concat, browsers do not. So we'll use this.
 * @param {Uint8Array[]} arrays
 * @returns {Uint8Array}
 */
export function concatTypedArrays(arrays) {
	const totalLength = arrays.reduce((prev, curr) => prev + curr.byteLength, 0);
	let index = 0;
	const targetArray = new Uint8Array(totalLength);
	for (const array of arrays) {
		targetArray.set(array, index);
		index += array.byteLength;
	}
	return targetArray;
}

/** @type {Crypto | undefined} */
let cryptoInstance = undefined;

if (typeof self !== "undefined") {
	cryptoInstance = self.crypto;
}

export const crypto = {
	get subtle() {
		if (!cryptoInstance) {
			throw new Error(
				"Could not find global Crypto module. Please set it with the setCrypto method."
			);
		}
		return cryptoInstance.subtle;
	},
	/**
	 *
	 * @param {ArrayBufferView} target
	 * @returns
	 */
	getRandomValues(target) {
		if (!cryptoInstance) {
			throw new Error(
				"Could not find global Crypto module. Please set it with the setCrypto method."
			);
		}
		return cryptoInstance.getRandomValues(target);
	},
};

/**
 *
 * @param {Crypto} newCrypto
 */
export function setWebCrypto(newCrypto) {
	cryptoInstance = newCrypto;
}

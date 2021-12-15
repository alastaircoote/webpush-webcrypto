import { base64urlEncode, crypto } from "./util.js";

const JWT_INFO = {
	typ: "JWT",
	alg: "ES256",
};

/**
 * @param {{publicKey?: CryptoKey, privateKey?: CryptoKey}} keyPair
 * @param {{aud: string, sub: string}} data
 */
export async function createJWT(keyPair, data) {
	if (!keyPair.privateKey || !keyPair.publicKey) {
		throw new Error("Missing public or private key");
	}

	const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

	const dataWithExp = {
		aud: data.aud,
		exp: exp,
		sub: data.sub,
	};

	const base64Info = base64urlEncode(JSON.stringify(JWT_INFO));
	const base64Data = base64urlEncode(JSON.stringify(dataWithExp));

	const unsignedToken = base64Info + "." + base64Data;

	const signed = await crypto.subtle.sign(
		{
			name: "ECDSA",
			hash: {
				name: "SHA-256",
			},
		},
		keyPair.privateKey,
		new TextEncoder().encode(unsignedToken)
	);

	const sig = base64urlEncode(signed);

	return base64Info + "." + base64Data + "." + sig;
}

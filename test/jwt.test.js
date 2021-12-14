import { createJWT } from "../src/jwt.js";
import crypto from "./stubs/webcrypto.js";
import jwt from "jsonwebtoken";

describe("JWT", function () {
	it("creates a valid JWT token", async function () {
		const keyPair = await crypto.subtle.generateKey(
			{
				name: "ECDSA",
				namedCurve: "P-256",
			},
			true,
			["sign"]
		);

		const token = await createJWT(keyPair, {
			aud: "https://www.example.com",
			sub: "mailto:hello",
		});

		if (!keyPair.publicKey) {
			// this is just to silence type checking error below
			throw new Error("No public key?");
		}

		const exportedPublic = await crypto.subtle.exportKey(
			"spki",
			keyPair.publicKey
		);

		const publicKeyPEM = spkiToPEM(exportedPublic);

		// use existing JWT library to ensure we created a valid one
		jwt.verify(token, publicKeyPEM);
	});
});

// Shamelessly ripped from https://stackoverflow.com/a/40327542
// the node JWT library expects PEM-formatted keys, so we need to convert

// @ts-ignore
function spkiToPEM(keydata) {
	var keydataS = arrayBufferToString(keydata);
	var keydataB64 = btoa(keydataS);
	var keydataB64Pem = formatAsPem(keydataB64);
	return keydataB64Pem;
}

// @ts-ignore
function arrayBufferToString(buffer) {
	var binary = "";
	var bytes = new Uint8Array(buffer);
	var len = bytes.byteLength;
	for (var i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return binary;
}

// @ts-ignore
function formatAsPem(str) {
	var finalString = "-----BEGIN PUBLIC KEY-----\n";

	while (str.length > 0) {
		finalString += str.substring(0, 64) + "\n";
		str = str.substring(64);
	}

	finalString = finalString + "-----END PUBLIC KEY-----";

	return finalString;
}

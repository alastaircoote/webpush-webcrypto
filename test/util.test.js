import { expect } from "chai";
import { base64urlEncode, decodeBase64URL } from "../src/util.js";

describe("Base 64 encoding", function () {
	it("should encode and decode", function () {
		const encoded = base64urlEncode("TEST DATA");
		const arrayBuffer = decodeBase64URL(encoded);

		const decoded = new TextDecoder().decode(arrayBuffer);

		expect(decoded).to.eq("TEST DATA");
	});
});

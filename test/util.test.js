import { expect } from "chai";
import { base64urlEncode, decodeBase64URL } from "../lib/util.js";

describe("Base 64 encoding", function () {
	it("should encode", function () {
		const encoded = base64urlEncode("TEST DATA");
		const buff = Buffer.from(encoded, "base64url");
		const decoded = Buffer.from(buff).toString("utf-8");

		expect(decoded).to.eq("TEST DATA");
	});

	it("should decode", function () {
		const buff = Buffer.from("TEST DATA", "utf-8");
		const encoded = buff.toString("base64url");

		const decoded = decodeBase64URL(encoded);

		expect(new TextDecoder().decode(decoded)).to.eq("TEST DATA");
	});
});

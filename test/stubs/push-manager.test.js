import { expect } from "chai";
import { shouldThrow } from "../utils.js";
import { FakePushManager } from "./push-manager.js";
import { SubscriptionCoordinator } from "./subscription-coordinator.js";
import crypto from "./webcrypto.js";

describe("Fake Push Manager", function () {
	async function makePublicKey() {
		const keyPair = await crypto.subtle.generateKey(
			{
				name: "ECDSA",
				namedCurve: "P-256",
			},
			true,
			["sign"]
		);
		const exported = await crypto.subtle.exportKey(
			"raw",
			/** @type CryptoKey **/ (keyPair.publicKey)
		);

		return exported;
	}

	const coordinator = new SubscriptionCoordinator();
	const windowObject = new EventTarget();

	const makePushManager = () =>
		new FakePushManager(coordinator, null, windowObject, crypto);

	it("should subscribe with an array buffer key", async function () {
		const exported = await makePublicKey();

		const manager = makePushManager();

		await manager.subscribe({
			applicationServerKey: exported,
		});
	});

	it("should fail when trying to subscribe with invalid arraybuffer key", async function () {
		const manager = makePushManager();
		shouldThrow(async function () {
			await manager.subscribe({
				applicationServerKey: new Uint8Array(5).buffer,
			});
		});
	});

	it("should subscribe with base64 encoded key", async function () {
		const exported = await makePublicKey();
		const manager = makePushManager();
		const str = Buffer.from(exported).toString("base64");
		await manager.subscribe({
			applicationServerKey: str,
		});
	});

	it("should fail when trying to subscribe with invalid base64 value", async function () {
		const manager = makePushManager();
		shouldThrow(async function () {
			await manager.subscribe({
				applicationServerKey: "test",
			});
		});
	});

	it("should return null when there's no subscription", async function () {
		const manager = makePushManager();
		const sub = await manager.getSubscription();
		expect(sub).to.be.null;
	});

	it("should return subscription when it exists", async function () {
		const exported = await makePublicKey();
		const manager = makePushManager();

		const sub = await manager.subscribe({
			applicationServerKey: exported,
		});

		const getSub = await manager.getSubscription();
		expect(sub).to.equal(getSub);
	});

	it("test", async function () {
		const exported = await makePublicKey();
		const manager = makePushManager();
		const sub = await manager.subscribe({
			applicationServerKey: exported,
		});
	});
});

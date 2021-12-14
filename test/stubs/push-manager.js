import { FakePushSubscription } from "./push-subscription.js";
import { SubscriptionCoordinator } from "./subscription-coordinator.js";

/**
 * @typedef FakePushManagerState
 * @property {PushPermissionState} permissionState
 * @property {FakePushSubscription?} subscription
 *
 *
 * A mock PushManager that replicates the functions of a real one
 * @implements {PushManager}
 */
export class FakePushManager {
	#coordinator;
	#crypto;
	#windowObject;

	/**
	 * @constructor
	 * @param {SubscriptionCoordinator} coordinator
	 * @param {FakePushManagerState?} state
	 * @param {EventTarget} windowObject Where we'll dispatch push events
	 * @param {Crypto} crypto The WebCrypto API implementation we want to use
	 */
	constructor(coordinator, state, windowObject, crypto) {
		this._state = state || {
			permissionState: "prompt",
			subscription: null,
		};

		this.#crypto = crypto;
		this.#coordinator = coordinator;
		this.#windowObject = windowObject;
	}

	async permissionState() {
		return this._state.permissionState;
	}

	async getSubscription() {
		return this._state.subscription;
	}

	/**
	 * @param {PushSubscriptionOptionsInit} options
	 * @returns {Promise<PushSubscription>}
	 */
	async subscribe(options) {
		if (!options.applicationServerKey) {
			throw new Error("Must provide an application server key");
		}
		/** @type {ArrayBuffer} */
		let key;
		if (typeof options.applicationServerKey === "string") {
			// node only, maybe a problem at some point?
			const buffer = Buffer.from(options.applicationServerKey, "base64");
			const array = new Uint8Array(buffer.byteLength);
			buffer.copy(array);
			key = array.buffer;
		} else if (options.applicationServerKey instanceof ArrayBuffer) {
			key = options.applicationServerKey;
		} else {
			key = options.applicationServerKey.buffer;
		}

		const sub = await this.#coordinator.createSubscription(
			{
				applicationServerKey: key,
			},
			this.#windowObject,
			this.#crypto
		);

		this._state.subscription = sub;

		return sub;
	}
}

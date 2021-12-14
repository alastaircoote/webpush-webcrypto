import { SubscriptionCoordinator } from "./subscription-coordinator.js";
import crypto from "./webcrypto.js";

/**
 * @typedef FakePushSubscriptionOptions
 * @property {PushSubscriptionOptions} subscriptionOptions
 * @property {string} endpoint
 * @property {DOMHighResTimeStamp} expirationTime
 * @property {CryptoKey} publicKey
 * @property {ArrayBuffer} auth
 */

/**
 * @implements {PushSubscription}
 */
export class FakePushSubscription {
	#options;

	/**
	 *
	 * @param {FakePushSubscriptionOptions} options
	 */
	constructor({ endpoint, subscriptionOptions, expirationTime, ...options }) {
		this.endpoint = endpoint;
		this.options = subscriptionOptions;
		this.expirationTime = expirationTime;
		this.#options = options;
	}

	/**
	 * @param {string} name
	 * @returns {ArrayBuffer}
	 */
	getKey(name) {
		throw new Error("not ready yet");
		// return this._options.publicKey;
	}

	async unsubscribe() {
		throw new Error("not ready yet");
		return false;
	}

	toJSON() {
		return {
			endpoint: this.endpoint,
		};
	}
}

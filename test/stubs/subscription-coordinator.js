import { FakePushSubscription } from "./push-subscription.js";

export class SubscriptionCoordinator {
	/** @type {Record<string, EventTarget>} */
	#subscriptions;

	constructor() {
		this.#subscriptions = {};
	}

	/**
	 * Create a new push subscription
	 * @param {PushSubscriptionOptions} options
	 * @param {EventTarget} windowObject
	 * @param {Crypto} crypto
	 */
	async createSubscription(options, windowObject, crypto) {
		if (!options.applicationServerKey) {
			throw new Error("Must provide application key");
		}
		const publicKey = await crypto.subtle.importKey(
			"raw",
			options.applicationServerKey,
			{
				name: "ECDH",
				namedCurve: "P-256",
			},
			false,
			[]
		);
		const auth = crypto.getRandomValues(new Uint8Array(16));

		// TS DOM type definition doesn't think randomUUID exists? It does.
		// @ts-ignore
		const endpoint = "fake://endpoint/" + crypto.randomUUID();

		this.#subscriptions[endpoint] = windowObject;

		return new FakePushSubscription({
			subscriptionOptions: options,
			endpoint,
			publicKey,
			auth,
			expirationTime: 0,
		});
	}

	/**
	 *
	 * @param {string} endpoint
	 */
	send(endpoint) {
		if (!this.#subscriptions[endpoint]) {
			throw new Error("There is no subscription at " + endpoint);
		}

		const ev = new Event("push");

		this.#subscriptions[endpoint].dispatchEvent(ev);
	}
}

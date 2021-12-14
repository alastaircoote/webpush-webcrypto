import { FakePushManager } from "./push-manager.js";
import { SubscriptionCoordinator } from "./subscription-coordinator.js";
import crypto from "./webcrypto.js";

describe("Fake Subscription Coordinator", function () {
	const SUBSCRIPTION_KEY =
		"BJZbrWg34AdblxRV0eqeg2c5InYXjuQcByM1esEIRda/yKUm589BaVF+vHVQO97LeIUV+dOhTUSMlOuGXADNkSI=";

	it("Should fire push events", async function () {
		const coordinator = new SubscriptionCoordinator();
		const emitter = new EventTarget();
		const manager = new FakePushManager(coordinator, null, emitter, crypto);

		const sub = await manager.subscribe({
			applicationServerKey: SUBSCRIPTION_KEY,
		});

		const eventPromise = new Promise((fulfill) => {
			emitter.addEventListener("push", fulfill);
		});

		coordinator.send(sub.endpoint);

		await eventPromise;
	});
});

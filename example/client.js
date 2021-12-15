import {
	ApplicationServerKeys,
	generatePushHTTPRequest,
} from "./webpush/webpush.js";

const sendButton = /** @type Element */ (document.getElementById("send"));
const updates = /** @type Element */ (document.getElementById("updates"));

// Grab the keys we need to send web pushes. If we've already set up a subscription before now
// we should use the same keys again, so we'll store it in localStorage.

const cachedKeysText = localStorage.getItem("cached_application_keys");

/** @type ApplicationServerKeys */
let applicationServerKeys;
if (cachedKeysText) {
	applicationServerKeys = await ApplicationServerKeys.fromJSON(
		JSON.parse(cachedKeysText)
	);
} else {
	applicationServerKeys = await ApplicationServerKeys.generate();
	const forCaching = await applicationServerKeys.toJSON();
	localStorage.setItem("cached_application_keys", JSON.stringify(forCaching));
}

/**
 *
 * @param {string} text
 * @param {"none" | "warning" | "error"} severity
 */
function reportProgress(text, severity = "none") {
	const li = document.createElement("li");
	li.innerHTML = text;
	li.classList.add(severity);
	updates.appendChild(li);
}

function resetProgress() {
	updates.innerHTML = "";
}

sendButton.addEventListener("click", async function () {
	try {
		resetProgress();
		reportProgress("Requesting notification permission...");
		const permission = await Notification.requestPermission();
		if (permission === "granted") {
			reportProgress("Notification permission granted");
		} else {
			reportProgress(`Notification permission incorrect: ${permission}`);
			throw new Error("Can't continue without notification permission");
		}

		reportProgress("Registering service worker...");
		// in order to receive push events we need to register a service worker
		const reg = await navigator.serviceWorker.register("./worker.js");

		const stringifiedKey = (await applicationServerKeys.toJSON()).publicKey;

		reportProgress("Getting push subscription...");
		const subscription = await reg.pushManager.subscribe({
			applicationServerKey: stringifiedKey,
			userVisibleOnly: true,
		});

		reportProgress("Generating push notification...");
		const subJSON = subscription.toJSON();
		const { headers, body, endpoint } = await generatePushHTTPRequest({
			applicationServerKeys,
			payload: "TEST MESSAGE",
			target: {
				endpoint: subscription.endpoint,
				keys: /**@type any */ (subJSON.keys),
			},
			adminContact: "hello@example.com",
			ttl: 60,
		});

		reportProgress("Sending HTTP request");

		const res = await fetch(endpoint, {
			method: "POST",
			headers,
			body,
		});

		reportProgress(`HTTP Request successful, HTTP code ${res.status} received`);

		console.log(subscription);
	} catch (ex) {
		console.log(ex);
		reportProgress(/** @type Error */ (ex).message, "error");
		throw ex;
	}
});

sendButton.removeAttribute("disabled");

navigator.serviceWorker.addEventListener("message", function (e) {
	reportProgress(`Received push: ${e.data}`);
	reportProgress("It worked!");
});

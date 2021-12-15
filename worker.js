/// <reference lib="WebWorker" />

const workerSelf = /** @type ServiceWorkerGlobalScope */ (
	/** @type unknown */ (self)
);

workerSelf.addEventListener("install", function (e) {
	e.waitUntil(workerSelf.skipWaiting());
});

workerSelf.addEventListener("activate", function (e) {
	e.waitUntil(workerSelf.clients.claim());
});

workerSelf.addEventListener("push", async function (e) {
	console.log("received push event", e);
	if (!e.data) {
		throw new Error("Recevied push with no data");
	}
	const allClients = await workerSelf.clients.matchAll();
	for (const client of allClients) {
		client.postMessage(e.data.text());
	}
});

# webpush-webcrypto

## What is it?

This is a JavaScript module for sending [Web Push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) messsages to client browsers. It offers similar functionality to the [web-push](https://www.npmjs.com/package/web-push) Node module but with the following differences:

- It only has one dependency: the [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). This means it can run on more than just Node: most significantly it runs on [all major browsers](https://caniuse.com/cryptography), allowing you to send messages peer to peer (with [an important caveat](#the-big-caveat-with-peer-to-peer-pushes)). In theory it also runs in environments like [Deno](https://doc.deno.land/deno/stable/~/crypto) and [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto) but I haven't tried that yet.
- It doesn't have any of the legacy support that web-push does, like sending GCM messages to Chrome.

## How do I use it?

```
import {
	ApplicationServerKeys,
	generatePushHTTPRequest,
} from "webpush-webcrypto";

// you'll want to persist these keys as they are reused between
// requests. ApplicationServerKeys has toJSON and fromJSON
// methods allowing you to do that.

const keys = await ApplicationServerKeys.generate();

const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload: "TEST MESSAGE",
    target: {
        endpoint: "https://push-endpoint-origin/…",
        keys: {
            p256dh: "…",
            auth: "…"
        },
    },
    adminContact: "hello@example.com",
    ttl: 60,
    urgency: "low"
});

// bring your own fetch implementation if required

await fetch(endpoint, {
    method: "POST",
    headers,
    body
});
```

## Bring your own WebCrypto instance

By default the module will use the `crypto` variable in the global scope to access the WebCrypto API. Some platforms (e.g. Node) do not provide that global variable, so as an alternative you can use `setWebCrypto` before using any of the other functions:

```
import { setWebCrypto } from 'webpush-webcrypto';
import nodeCryptoModule from 'crypto';

setWebCrypto(nodeCryptoModule.webcrypto);
```

## Try it out locally

If you want you can try out this library locally relatively easily. Clone this repo then run

    npm install

(or `yarn` or whatever) to install the development dependencies. Run

    npm run example

and load `localhost:9080` in your browser. When you do you might experience the one big caveat with peer to peer pushes...

## The big caveat with peer to peer pushes

Sending a web push requires sending an HTTP request to a server run by the target browser organisation. Unfortunately they do not all support CORS, which is a requirement when sending requests from the browser.

As of December 2021 Firefox's push server is the only one that does support CORS. This means that anyone can send a message **to** a Firefox user but no-one (a Firefox user or not) will be able to send to a user of any other browser.

There is a [GitHub issue](https://github.com/w3c/push-api/issues/303) discussing this in the Push API repo. Fingers crossed this will change in the future.

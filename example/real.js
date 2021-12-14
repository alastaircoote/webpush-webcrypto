import {
	generatePushHTTPRequest,
	ApplicationServerKeys,
	setWebCrypto,
} from "../src/webpush.js";
import * as crypto from "crypto";

// @ts-ignore
setWebCrypto(crypto.webcrypto);

await ApplicationServerKeys.generate();

const keys = await ApplicationServerKeys.fromJSON({
	publicKey:
		"BMf2aoDR-3RFmyZotqsvjDUQxxxqTXCsuI9RDQ-TQXxLCPO0myKSawoVcQApPsRSNgpKEf-kYgAu0oK6WwIpEXI",
	privateKey:
		"MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnam-YxVQY8a4JimkVh6Y_Pwgup3nsNFaGbcIBJvdhPChRANCAATH9mqA0ft0RZsmaLarL4w1EMccak1wrLiPUQ0Pk0F8SwjztJsikmsKFXEAKT7EUjYKShH_pGIALtKCulsCKRFy",
});

const { headers, body, endpoint } = await generatePushHTTPRequest({
	applicationServerKey: keys,
	payload: "Hello",
	target: {
		endpoint:
			"https://fcm.googleapis.com/fcm/send/eWus6tq-mxA:APA91bF0TMrWteuIvFEK54pcGfImEP27IUe19RGNp6Hcc-4RXTrXJAtgmyvmXuzfrCWu1Ny75rrrOTnRrYHkKp5W5rBEBqCJaTnhoUnrvVnW4b55U1ziUiv1u3T2xeIGv3UROC_vbb8t",
		keys: {
			p256: "BOVK4CvU7vyA2W48864kovYJvUnIAEhHqucsvx96k38yhnZfW3ROvq3URTC2Z7EH_ZGacFoEs84y3z15z71_S6c",
			auth: "vNUy0gBubi1_1dmrtDdQEQ",
		},
	},
	adminContact: "hello@alastair.is",
});

console.log(headers, body);

import fetch from "node-fetch";

await fetch(endpoint, { method: "POST", headers, body: Buffer.from(body) });

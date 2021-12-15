const textEncoder = new TextEncoder();

export const AUTH_ENCODING_HEADER = textEncoder.encode(
	"Content-Encoding: auth\0"
);

export const CONTEXT_KEY_LABEL = textEncoder.encode("P-256\0");

export const NONCE_ENCODING_HEADER = textEncoder.encode(
	"Content-Encoding: nonce\0"
);

export const CONTENT_ENCRYPTION_KEY_HEADER = textEncoder.encode(
	"Content-Encoding: aesgcm\0"
);

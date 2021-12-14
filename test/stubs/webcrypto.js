import cryptoModule from "crypto";
// doing some stupid typecasting stuff here to get around incorrect TS types
const wc = /** @type {unknown} */ (cryptoModule.webcrypto);
const crypto = /** @type {Crypto} */ (wc);

export default crypto;

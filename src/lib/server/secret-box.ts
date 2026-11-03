import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

// AES-256-GCM, one HKDF key per purpose, each ciphertext bound to its context.
export class SecretBox {
	readonly #key: Buffer;

	constructor(secret: string, purpose: string) {
		this.#key = Buffer.from(hkdfSync("sha256", secret, "", purpose, 32));
	}

	seal(context: string, plaintext: string): string {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
		cipher.setAAD(Buffer.from(context));
		const body = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
	}

	// Throws on a wrong key, a wrong context, or any tampering.
	open(context: string, value: string): string {
		const raw = Buffer.from(value, "base64url");
		const decipher = createDecipheriv(
			"aes-256-gcm",
			this.#key,
			raw.subarray(0, IV_BYTES),
		);
		decipher.setAAD(Buffer.from(context));
		decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
		return Buffer.concat([
			decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
			decipher.final(),
		]).toString("utf8");
	}
}

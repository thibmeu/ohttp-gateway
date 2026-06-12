/**
 * Master seed handling for the OHTTP gateway.
 *
 * The gateway is stateless: it derives its entire key configuration
 * deterministically from a single master seed supplied as the
 * `OHTTP_KEY_SEED` environment variable (base64). The same seed produces the
 * same key configuration on every platform and every instance, which is what
 * lets a client fetch the key config from one edge node and send the encrypted
 * request to another.
 *
 * Generate a seed with `npm run keygen`.
 */

/** Minimum decoded seed length in bytes (also the length keygen emits). */
export const MIN_SEED_LENGTH = 32;

/** Decode a standard-base64 string to bytes (portable across Workers/Deno/Node/edge). */
export function base64Decode(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/** Encode bytes to a standard-base64 string. */
export function base64Encode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

/**
 * Resolve the master seed from an environment value.
 *
 * If `OHTTP_KEY_SEED` is set, it is decoded and validated. If it is missing, an
 * ephemeral random seed is generated so local development works without setup —
 * but such keys do not persist across restarts and will differ between
 * instances, so this path warns loudly and must not be used in production.
 */
export function seedFromEnv(value: string | undefined): Uint8Array {
	if (value !== undefined && value !== "") {
		const seed = base64Decode(value);
		if (seed.length < MIN_SEED_LENGTH) {
			throw new Error(
				`OHTTP_KEY_SEED must decode to at least ${MIN_SEED_LENGTH} bytes, got ${seed.length}`,
			);
		}
		return seed;
	}

	console.warn(
		"OHTTP_KEY_SEED is not set — generating an ephemeral seed. Keys will not " +
			"persist across restarts and will not match other instances. Run " +
			"`npm run keygen` and set OHTTP_KEY_SEED for production.",
	);
	const seed = new Uint8Array(MIN_SEED_LENGTH);
	crypto.getRandomValues(seed);
	return seed;
}

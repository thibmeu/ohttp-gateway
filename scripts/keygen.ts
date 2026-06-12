/**
 * Generate an OHTTP gateway master seed.
 *
 * Prints a base64 seed to set as the OHTTP_KEY_SEED secret on every platform.
 * The same seed deterministically produces the same key configuration
 * everywhere, so set the identical value on each deployment.
 *
 *   npm run keygen
 *
 * The resulting key IDs are printed for verification.
 */

import { deriveKeyConfigs } from "../src/keyConfig.ts";
import { base64Encode } from "../src/seed.ts";

const seed = new Uint8Array(32);
crypto.getRandomValues(seed);
const encoded = base64Encode(seed);

const { keyConfigs } = await deriveKeyConfigs(seed);

console.log("OHTTP gateway master seed (base64):\n");
console.log(`  ${encoded}\n`);
console.log("Set it as a secret on each platform, e.g.:\n");
console.log("  Cloudflare:  npx wrangler secret put OHTTP_KEY_SEED");
console.log("  Vercel:      npx vercel env add OHTTP_KEY_SEED");
console.log("  Netlify:     npx netlify env:set OHTTP_KEY_SEED <value>");
console.log("  Railway:     railway variables set OHTTP_KEY_SEED=<value>\n");
console.log("Derived key IDs (for verification):");
for (const config of keyConfigs) {
	console.log(
		`  keyId=${config.keyId} kemId=0x${config.kemId.toString(16).padStart(4, "0")}`,
	);
}

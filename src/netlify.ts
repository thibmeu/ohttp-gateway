/**
 * OHTTP Gateway — Netlify (Deno edge) Hono app
 */

import { createApp, defaults } from "./gateway.ts";
import { deriveKeyConfigs } from "./keyConfig.ts";
import { seedFromEnv } from "./seed.ts";

const seed = seedFromEnv(Deno.env.get("OHTTP_KEY_SEED"));
const { keyConfigs, serialized } = await deriveKeyConfigs(seed);

export default createApp({
	keyConfigs,
	serializedKeys: serialized,
	maxRequestSize: Number.parseInt(
		Deno.env.get("MAX_REQUEST_SIZE") ?? String(defaults.maxRequestSize),
		10,
	),
	corsOrigin: Deno.env.get("CORS_ORIGIN") ?? defaults.corsOrigin,
	targetUrl: Deno.env.get("TARGET_URL") ?? defaults.targetUrl,
});

/**
 * OHTTP Gateway — Vercel (Edge) Hono app
 */

import { createApp, defaults } from "./gateway.js";
import { deriveKeyConfigs } from "./keyConfig.js";
import { seedFromEnv } from "./seed.js";

const seed = seedFromEnv(process.env.OHTTP_KEY_SEED);
const { keyConfigs, serialized } = await deriveKeyConfigs(seed);

export default createApp({
	keyConfigs,
	serializedKeys: serialized,
	maxRequestSize: Number.parseInt(
		process.env.MAX_REQUEST_SIZE ?? String(defaults.maxRequestSize),
		10,
	),
	corsOrigin: process.env.CORS_ORIGIN ?? defaults.corsOrigin,
	targetUrl: process.env.TARGET_URL,
});

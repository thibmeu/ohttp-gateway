/**
 * OHTTP Gateway — Node.js server entry point (Railway / self-hosted)
 */

import { serve } from "@hono/node-server";
import { createApp, defaults } from "./gateway.ts";
import { deriveKeyConfigs } from "./keyConfig.ts";
import { seedFromEnv } from "./seed.ts";

const seed = seedFromEnv(process.env.OHTTP_KEY_SEED);
const { keyConfigs, serialized } = await deriveKeyConfigs(seed);

const app = createApp({
	keyConfigs,
	serializedKeys: serialized,
	maxRequestSize: Number.parseInt(
		process.env.MAX_REQUEST_SIZE ?? String(defaults.maxRequestSize),
		10,
	),
	corsOrigin: process.env.CORS_ORIGIN ?? defaults.corsOrigin,
	targetUrl: process.env.TARGET_URL ?? defaults.targetUrl,
});

serve(
	{
		fetch: app.fetch,
		port: Number.parseInt(process.env.PORT ?? "3000", 10),
		hostname: "0.0.0.0",
	},
	(info) => {
		console.log(`ohttp-gateway listening on port ${info.port}`);
	},
);

/// <reference types="@cloudflare/workers-types" />
/**
 * OHTTP Gateway — Cloudflare Workers entry point
 *
 * Derives the key configuration from the OHTTP_KEY_SEED secret once per
 * isolate, and optionally forwards to a co-located ohttp-target Worker via a
 * service binding.
 */

import type { Hono } from "hono";
import { createApp, defaults } from "./gateway";
import { deriveKeyConfigs } from "./keyConfig";
import { seedFromEnv } from "./seed";

interface Env {
	/** Base64 master seed; set via `wrangler secret put OHTTP_KEY_SEED`. */
	OHTTP_KEY_SEED?: string;
	/** Service binding to an ohttp-target Worker (optional). */
	TARGET?: Fetcher;
	/** Target base URL used when the TARGET service binding is not set. */
	TARGET_URL?: string;
	/** Maximum request body size in bytes. */
	MAX_REQUEST_SIZE?: string;
	/** CORS allowed origin. */
	CORS_ORIGIN?: string;
}

let appPromise: Promise<Hono> | undefined;

async function getApp(env: Env): Promise<Hono> {
	appPromise ??= (async () => {
		const seed = seedFromEnv(env.OHTTP_KEY_SEED);
		const { keyConfigs, serialized } = await deriveKeyConfigs(seed);
		return createApp({
			keyConfigs,
			serializedKeys: serialized,
			maxRequestSize: Number.parseInt(
				env.MAX_REQUEST_SIZE ?? String(defaults.maxRequestSize),
				10,
			),
			corsOrigin: env.CORS_ORIGIN ?? defaults.corsOrigin,
			targetUrl: env.TARGET_URL ?? defaults.targetUrl,
			...(env.TARGET && { fetcher: env.TARGET.fetch.bind(env.TARGET) }),
		});
	})();
	return appPromise;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const app = await getApp(env);
		return app.fetch(request);
	},
};

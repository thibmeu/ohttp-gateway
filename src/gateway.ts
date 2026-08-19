/**
 * OHTTP Gateway — platform-agnostic Hono app
 *
 * Implements RFC 9458 gateway functionality: publishes a key configuration,
 * decapsulates OHTTP requests, forwards the inner request to a target, and
 * encapsulates the response.
 *
 * Endpoints:
 * - GET  /health                     → Health check (gateway-local)
 * - GET  /.well-known/ohttp-gateway  → Key configuration (application/ohttp-keys)
 * - GET  /ohttp-config               → Alias of the key configuration
 * - POST /ohttp                      → OHTTP decapsulation, standard
 *                                      (message/ohttp-req) or chunked
 *                                      (message/ohttp-chunked-req)
 *
 * Key material is supplied pre-derived (see keyConfig.ts) so this module stays
 * free of any storage or platform dependency.
 */

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import {
	ChunkedOHTTPServer,
	Incremental,
	type KeyConfigWithPrivate,
	MediaType,
	OHTTPServer,
} from "ohttp-ts";
import {
	internalError,
	invalidMediaType,
	opaqueDecryptionError,
	requestTooLarge,
} from "./problem.ts";

export interface GatewayConfig {
	/** Key configs (with private keys) used to decapsulate requests. */
	keyConfigs: readonly KeyConfigWithPrivate[];
	/** Serialized public key configs for the `application/ohttp-keys` endpoint. */
	serializedKeys: Uint8Array;
	/** Maximum request body size in bytes. */
	maxRequestSize: number;
	/** CORS allowed origin. */
	corsOrigin: string;
	/**
	 * Base URL of the target the decapsulated request is forwarded to.
	 * Required unless a `fetcher` service binding is supplied.
	 */
	targetUrl?: string | undefined;
	/**
	 * Optional custom fetch implementation for reaching the target.
	 * Pass a Cloudflare service binding here for zero-latency target calls.
	 * Defaults to the global fetch.
	 */
	fetcher?: typeof fetch;
}

export const defaults = {
	maxRequestSize: 1_048_576,
	corsOrigin: "*",
} as const;

/** Request carrying Cloudflare's `cf` metadata, when running on Workers. */
type RequestWithCf = Request & {
	cf?: { country?: string; asOrganization?: string };
};

export function createApp(config: GatewayConfig): Hono {
	if (config.fetcher === undefined && !config.targetUrl) {
		throw new Error(
			"No target configured: set TARGET_URL or bind a TARGET service.",
		);
	}

	const app = new Hono();
	const fetcher = config.fetcher ?? fetch;
	const server = new OHTTPServer([...config.keyConfigs]);
	const chunkedServer = new ChunkedOHTTPServer([...config.keyConfigs]);

	app.use(
		"*",
		cors({
			origin: config.corsOrigin,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: [
				"Content-Type",
				Incremental.HEADER,
				"signature",
				"signature-agent",
				"signature-input",
			],
			exposeHeaders: [Incremental.HEADER],
			maxAge: 86400,
		}),
	);

	app.get("/health", (c) => c.text("OK", 200, { "Cache-Control": "no-store" }));

	// Key configuration: stable across the seed's lifetime, safe to cache.
	const keyConfigHandler = (_c: Context) =>
		new Response(config.serializedKeys, {
			status: 200,
			headers: {
				"Content-Type": MediaType.KEYS,
				"Cache-Control": "public, max-age=86400",
			},
		});
	app.get("/.well-known/ohttp-gateway", keyConfigHandler);
	app.get("/ohttp-config", keyConfigHandler);

	app.post("/ohttp", async (c) => {
		const contentType = c.req.header("Content-Type");
		try {
			if (contentType === MediaType.CHUNKED_REQUEST) {
				return await handleChunked(c.req.raw, config, chunkedServer, fetcher);
			}
			if (contentType === MediaType.REQUEST) {
				return await handleStandard(c.req.raw, config, server, fetcher);
			}
			return invalidMediaType(MediaType.REQUEST);
		} catch (error) {
			console.error("Gateway error:", error);
			return internalError();
		}
	});

	return app;
}

/** Standard OHTTP (RFC 9458): buffer, decapsulate, forward, encapsulate. */
async function handleStandard(
	request: Request,
	config: GatewayConfig,
	server: OHTTPServer,
	fetcher: typeof fetch,
): Promise<Response> {
	const contentLength = request.headers.get("Content-Length");
	if (contentLength !== null) {
		if (Number.parseInt(contentLength, 10) > config.maxRequestSize) {
			return requestTooLarge(config.maxRequestSize);
		}
	}

	let innerRequest: Request;
	let context: Awaited<ReturnType<typeof server.decapsulateRequest>>["context"];
	try {
		const result = await server.decapsulateRequest(request);
		innerRequest = result.request;
		context = result.context;
	} catch (e) {
		// All failures return an identical opaque error (RFC 9458 §6).
		console.error(e);
		return opaqueDecryptionError();
	}

	const targetResponse = await forwardToTarget(
		innerRequest,
		config,
		request,
		fetcher,
	);

	try {
		const encapsulated = await context.encapsulateResponse(targetResponse);
		return new Response(encapsulated.body, {
			status: 200,
			headers: { "Content-Type": MediaType.RESPONSE },
		});
	} catch (e) {
		console.error(e);
		return opaqueDecryptionError();
	}
}

/** Chunked OHTTP (draft-ietf-ohai-chunked-ohttp): stream without buffering. */
async function handleChunked(
	request: Request,
	config: GatewayConfig,
	server: ChunkedOHTTPServer,
	fetcher: typeof fetch,
): Promise<Response> {
	// No Content-Length check: streaming may not know the size upfront.
	let innerRequest: Request;
	let context: Awaited<ReturnType<typeof server.decapsulateRequest>>["context"];
	try {
		const result = await server.decapsulateRequest(request);
		innerRequest = result.request;
		context = result.context;
	} catch (e) {
		console.error(e);
		return opaqueDecryptionError();
	}

	const targetResponse = await forwardToTarget(
		innerRequest,
		config,
		request,
		fetcher,
	);

	try {
		const encapsulated = await context.encapsulateResponse(targetResponse);
		const headers = new Headers({ "Content-Type": MediaType.CHUNKED_RESPONSE });
		Incremental.set(headers, true);
		return new Response(encapsulated.body, { status: 200, headers });
	} catch (e) {
		console.error(e);
		return opaqueDecryptionError();
	}
}

/**
 * Forward the decapsulated request to the target.
 *
 * The gateway only ever sees the relay's identity (never the client's) — that
 * is OHTTP's privacy guarantee. We surface the relay's IP/country/ASN to the
 * target via X-Forwarded-* headers so the demo can display them.
 */
async function forwardToTarget(
	innerRequest: Request,
	config: GatewayConfig,
	outerRequest: Request,
	fetcher: typeof fetch,
): Promise<Response> {
	const headers = new Headers(innerRequest.headers);
	headers.set("X-OHTTP-Gateway", "true");

	const relayIp =
		outerRequest.headers.get("cf-connecting-ip") ??
		outerRequest.headers.get("x-forwarded-for");
	if (relayIp) headers.set("X-Forwarded-For", relayIp);
	const cf = (outerRequest as RequestWithCf).cf;
	if (cf?.country) headers.set("X-Forwarded-Country", cf.country);
	if (cf?.asOrganization) headers.set("X-Forwarded-ASN", cf.asOrganization);

	// When a fetcher (service binding) is supplied, the inner URL is used as-is.
	// Otherwise, rewrite the host to the configured target.
	const targetUrl = new URL(innerRequest.url);
	if (config.fetcher === undefined && config.targetUrl) {
		targetUrl.host = new URL(config.targetUrl).host;
	}

	return fetcher(
		new Request(targetUrl.toString(), {
			method: innerRequest.method,
			headers,
			body: innerRequest.body,
		}),
	);
}

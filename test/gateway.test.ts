import {
	AEAD_AES_128_GCM,
	CipherSuite,
	KDF_HKDF_SHA256,
	KEM_DHKEM_X25519_HKDF_SHA256,
} from "hpke";
import { KeyConfig, MediaType, OHTTPClient } from "ohttp-ts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/gateway.ts";
import { deriveKeyConfigs } from "../src/keyConfig.ts";

const KEM_X25519 = 0x20;
const seed = new Uint8Array(32).fill(9);

async function makeApp(fetcher?: typeof fetch) {
	const { keyConfigs, serialized } = await deriveKeyConfigs(seed);
	return createApp({
		keyConfigs,
		serializedKeys: serialized,
		maxRequestSize: 1_048_576,
		corsOrigin: "*",
		targetUrl: "https://target.example",
		...(fetcher && { fetcher }),
	});
}

describe("gateway", () => {
	it("serves a health check", async () => {
		const app = await makeApp();
		const res = await app.fetch(new Request("https://gw/health"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");
		expect(res.headers.get("cache-control")).toBe("no-store");
	});

	it("publishes the key configuration", async () => {
		const app = await makeApp();
		const res = await app.fetch(
			new Request("https://gw/.well-known/ohttp-gateway"),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(MediaType.KEYS);
		const body = new Uint8Array(await res.arrayBuffer());
		expect(KeyConfig.parseMultiple(body)).toHaveLength(2);
	});

	it("rejects an unknown content-type with 415", async () => {
		const app = await makeApp();
		const res = await app.fetch(
			new Request("https://gw/ohttp", {
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: "x",
			}),
		);
		expect(res.status).toBe(415);
	});

	it("completes a full OHTTP round-trip", async () => {
		// The mock target echoes a known body so we can assert on the decrypted result.
		const target: typeof fetch = async () =>
			new Response("hello from target", { status: 200 });
		const app = await makeApp(target);

		const { keyConfigs } = await deriveKeyConfigs(seed);
		const x25519 = keyConfigs.find((c) => c.kemId === KEM_X25519);
		if (!x25519) throw new Error("missing X25519 key config");
		const suite = new CipherSuite(
			KEM_DHKEM_X25519_HKDF_SHA256,
			KDF_HKDF_SHA256,
			AEAD_AES_128_GCM,
		);
		const client = new OHTTPClient(suite, x25519);
		const { init, context } = await client.encapsulateRequest(
			new Request("https://target.example/"),
		);

		const res = await app.fetch(new Request("https://gw/ohttp", init));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe(MediaType.RESPONSE);

		const inner = await context.decapsulateResponse(res);
		expect(inner.status).toBe(200);
		expect(await inner.text()).toBe("hello from target");
	});
});

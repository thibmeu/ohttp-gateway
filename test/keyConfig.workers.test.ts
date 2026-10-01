import {
	AEAD_AES_128_GCM,
	KDF_HKDF_SHA256,
	KEM_ML_KEM_768,
} from "@panva/hpke-noble";
import { CipherSuite } from "hpke";
import { KeyConfig, OHTTPClient } from "ohttp-ts";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/gateway.ts";
import { deriveKeyConfigs } from "../src/keyConfig.ts";

// Runs inside workerd, so this exercises the real Workers WebCrypto.
describe("workers backend in workerd", () => {
	const seed = new Uint8Array(32).fill(42);

	it("advertises the same keys as Noble", async () => {
		const workers = await deriveKeyConfigs(seed, "workers");
		const noble = await deriveKeyConfigs(seed);
		expect(workers.serialized).toEqual(noble.serialized);
	});

	it("decapsulates a Noble ML-KEM request", async () => {
		const { keyConfigs, serialized } = await deriveKeyConfigs(seed, "workers");
		const app = createApp({
			keyConfigs,
			serializedKeys: serialized,
			maxRequestSize: 1_048_576,
			corsOrigin: "*",
			targetUrl: "https://target.example",
			fetcher: async () => new Response("workerd PQ response"),
		});
		const config = KeyConfig.parseMultiple(serialized).find(
			(c) => c.kemId === 0x41,
		);
		if (!config) throw new Error("missing ML-KEM config");
		const client = new OHTTPClient(
			new CipherSuite(KEM_ML_KEM_768, KDF_HKDF_SHA256, AEAD_AES_128_GCM),
			config,
		);
		const { init, context } = await client.encapsulateRequest(
			new Request("https://target.example/"),
		);
		const response = await app.fetch(new Request("https://gw/ohttp", init));
		expect(response.status).toBe(200);
		const inner = await context.decapsulateResponse(response);
		expect(await inner.text()).toBe("workerd PQ response");
	});
});

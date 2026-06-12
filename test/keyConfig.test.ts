import { KeyConfig } from "ohttp-ts";
import { describe, expect, it } from "vitest";
import { deriveKeyConfigs } from "../src/keyConfig.ts";

const KEM_X25519 = 0x20;
const KEM_ML_KEM_768 = 0x41;

const seed = new Uint8Array(32).fill(42);

describe("deriveKeyConfigs", () => {
	it("derives a classical (X25519) and a post-quantum (ML-KEM-768) key", async () => {
		const { keyConfigs } = await deriveKeyConfigs(seed);
		expect(keyConfigs).toHaveLength(2);
		const kemIds = keyConfigs.map((c) => c.kemId).sort((a, b) => a - b);
		expect(kemIds).toEqual([KEM_X25519, KEM_ML_KEM_768]);
	});

	it("is deterministic for the same seed", async () => {
		const a = await deriveKeyConfigs(seed);
		const b = await deriveKeyConfigs(seed);
		expect(a.serialized).toEqual(b.serialized);
		expect(a.keyConfigs.map((c) => c.keyId)).toEqual(
			b.keyConfigs.map((c) => c.keyId),
		);
	});

	it("produces different keys for different seeds", async () => {
		const a = await deriveKeyConfigs(new Uint8Array(32).fill(1));
		const b = await deriveKeyConfigs(new Uint8Array(32).fill(2));
		expect(a.serialized).not.toEqual(b.serialized);
	});

	it("serializes to a parseable application/ohttp-keys config", async () => {
		const { serialized } = await deriveKeyConfigs(seed);
		expect(KeyConfig.parseMultiple(serialized)).toHaveLength(2);
	});
});

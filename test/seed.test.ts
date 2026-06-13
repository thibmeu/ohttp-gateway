import { describe, expect, it } from "vitest";
import {
	base64Decode,
	base64Encode,
	MIN_SEED_LENGTH,
	seedFromEnv,
} from "../src/seed.ts";

describe("base64", () => {
	it("round-trips bytes", () => {
		const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
		expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
	});
});

describe("seedFromEnv", () => {
	it("decodes a valid base64 seed", () => {
		const seed = new Uint8Array(MIN_SEED_LENGTH).fill(7);
		expect(seedFromEnv(base64Encode(seed))).toEqual(seed);
	});

	it("throws on a seed shorter than the minimum", () => {
		const short = base64Encode(new Uint8Array(8));
		expect(() => seedFromEnv(short)).toThrow();
	});

	it("throws when unset", () => {
		expect(() => seedFromEnv(undefined)).toThrow();
		expect(() => seedFromEnv("")).toThrow();
	});
});

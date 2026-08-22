/**
 * Key configuration for the OHTTP gateway.
 *
 * A single master seed deterministically produces one key configuration set
 * containing both a classical (X25519) and a post-quantum (ML-KEM-768) key.
 * For each suite, the master seed is HKDF-expanded into per-suite key-derivation
 * input keying material (IKM) using a domain-separation label, then handed to
 * HPKE's DeriveKeyPair via `ohttp-ts`'s `KeyConfig.derive`.
 *
 * Adding another suite later (e.g. a second classical key for rotation overlap)
 * is just another entry in `SUITES` — see the deferred rotation work.
 */

import {
	AEAD_AES_128_GCM as AEAD_AES_128_GCM_NOBLE,
	KDF_HKDF_SHA256 as KDF_HKDF_SHA256_NOBLE,
	KEM_ML_KEM_768,
} from "@panva/hpke-noble";
import {
	AEAD_AES_128_GCM,
	CipherSuite,
	KDF_HKDF_SHA256,
	KEM_DHKEM_X25519_HKDF_SHA256,
} from "hpke";
import { KeyConfig, type KeyConfigWithPrivate } from "ohttp-ts";

/** HPKE cipher suite: X25519, HKDF-SHA256, AES-128-GCM (classical). */
const X25519_SUITE = new CipherSuite(
	KEM_DHKEM_X25519_HKDF_SHA256,
	KDF_HKDF_SHA256,
	AEAD_AES_128_GCM,
);

/** HPKE cipher suite: ML-KEM-768, HKDF-SHA256, AES-128-GCM (post-quantum). */
const MLKEM_SUITE = new CipherSuite(
	KEM_ML_KEM_768,
	KDF_HKDF_SHA256_NOBLE,
	AEAD_AES_128_GCM_NOBLE,
);

/**
 * Suites that make up one key configuration set. The `label` provides HKDF
 * domain separation so each suite gets independent key material from the same
 * master seed; changing a label rotates that key.
 */
const SUITES = [
	{ suite: X25519_SUITE, label: "ohttp-info/key/x25519/v1" },
	{ suite: MLKEM_SUITE, label: "ohttp-info/key/ml-kem-768/v1" },
] as const;

/**
 * IKM length expanded per suite. 64 bytes satisfies both X25519 (Nsk = 32, IKM
 * may be longer) and ML-KEM-768 (64-byte d‖z seed).
 */
const IKM_LENGTH = 64;

/** Result of deriving the gateway's key configuration. */
export interface KeyConfigResult {
	/** All key configs (X25519 + ML-KEM), with private keys, for the OHTTP server. */
	keyConfigs: readonly KeyConfigWithPrivate[];
	/** Serialized public key configs for the `application/ohttp-keys` endpoint. */
	serialized: Uint8Array<ArrayBuffer>;
}

/** HKDF-SHA256 expand the master seed into per-suite IKM. */
async function expandSeed(
	masterSeed: Uint8Array,
	label: string,
	length: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", masterSeed, "HKDF", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode(label),
		},
		key,
		length * 8,
	);
	return new Uint8Array(bits);
}

/**
 * Derive the key ID from the public key (first byte of its SHA-256). The ID is
 * therefore deterministic and stable for a given seed, so the advertised config
 * and the decapsulating server always agree.
 */
async function deriveKeyId(publicKey: Uint8Array): Promise<number> {
	const hash = await crypto.subtle.digest("SHA-256", publicKey);
	return new Uint8Array(hash)[0] ?? 0;
}

/**
 * Deterministically derive the full key configuration from a master seed.
 */
export async function deriveKeyConfigs(
	masterSeed: Uint8Array,
): Promise<KeyConfigResult> {
	const keyConfigs = await Promise.all(
		SUITES.map(async ({ suite, label }) => {
			const ikm = await expandSeed(masterSeed, label, IKM_LENGTH);
			// Derive with a placeholder key ID, then set a stable ID from the
			// public key so it matches what clients see in the published config.
			const config = await KeyConfig.derive(suite, ikm, 0);
			const keyId = await deriveKeyId(config.publicKey);
			return { ...config, keyId };
		}),
	);

	const serialized = KeyConfig.serializeMultiple(keyConfigs);
	return { keyConfigs, serialized };
}

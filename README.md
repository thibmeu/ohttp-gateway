# ohttp-gateway

An [Oblivious HTTP (RFC 9458)](https://www.rfc-editor.org/rfc/rfc9458) gateway.

Decapsulates encrypted OHTTP requests, forwards the inner request to a target,
and returns the encapsulated response. The gateway learns *what* was requested
but never *who* requested it — that is OHTTP's privacy guarantee.

Keys are derived deterministically from a single master seed
(`OHTTP_KEY_SEED`), so the gateway is stateless and deploys the same way on
every platform: no database, no key storage. The same seed produces the same
key configuration on every instance and region.

## Table of Contents

- [Deploy](#deploy)
- [Keys](#keys)
- [Configuration](#configuration)
- [Protocol](#protocol)
- [Development](#development)
- [Architecture](#architecture)
- [Security considerations](#security-considerations)
- [License](#license)

## Deploy

OHTTP requires the gateway and [relay](https://github.com/thibmeu/ohttp-relay) be operated by different entities. We list several platforms so you can put each on a different provider: one provider operating both could attribute requests to clients.

| Platform | | Runtime |
|---|---|---|
| Cloudflare | [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/thibmeu/ohttp-gateway) | Workers |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fthibmeu%2Fohttp-gateway&env=OHTTP_KEY_SEED,TARGET_URL&envDescription=Master+seed+and+target+URL&envLink=https%3A%2F%2Fgithub.com%2Fthibmeu%2Fohttp-gateway%23configuration&project-name=ohttp-gateway&repository-name=ohttp-gateway) | Edge |
| Netlify | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/thibmeu/ohttp-gateway) | Edge (Deno) |
| Railway | [![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/9D143E) | Node.js |

After deploying, set `OHTTP_KEY_SEED` (see [Keys](#keys)). Cloudflare uses a
secret (`npx wrangler secret put OHTTP_KEY_SEED`); the others take an
environment variable. Netlify and Cloudflare deploy buttons do not prompt for
it, so set it in the dashboard afterwards.

## Keys

Generate a master seed once and use the **same value** on every deployment:

```bash
npm run keygen
```

This prints a base64 seed and the derived key IDs. From the seed the gateway
deterministically derives one key configuration containing two keys:

| Key | KEM |
|---|---|
| Classical | X25519 (DHKEM-X25519-HKDF-SHA256) |
| Post-quantum | ML-KEM-768 |

`OHTTP_KEY_SEED` is required on every platform, including local development.
Generate it with `npm run keygen`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OHTTP_KEY_SEED` | Required | Base64 master seed for key derivation |
| `TARGET_URL` | `https://target.ohttp.info` | Base URL the inner request is forwarded to |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `MAX_REQUEST_SIZE` | `1048576` | Maximum request body size (bytes) |
| `PORT` | `3000` | Listening port (Node.js only) |

On Cloudflare, an optional `TARGET` service binding to a co-located
`ohttp-target` Worker is used in place of `TARGET_URL` when present (see
`wrangler.toml`).

## Protocol

| Method | Path | Description |
|---|---|---|
| `GET` | `/.well-known/ohttp-gateway` | Key configuration (`application/ohttp-keys`) |
| `GET` | `/ohttp-config` | Alias of the above |
| `POST` | `/.well-known/ohttp-gateway` | OHTTP decapsulation (RFC 9540) |
| `POST` | `/ohttp` | Alias of the above |
| `GET` | `/health` | Health check |

The `Content-Type` of a POST request to either gateway route selects the variant:

| Content-Type | Description |
|---|---|
| `message/ohttp-req` | Standard OHTTP (RFC 9458) |
| `message/ohttp-chunked-req` | Chunked OHTTP (streaming) |

## Development

```bash
npm install

# Cloudflare Workers (wrangler dev)
npm run dev

# Node.js server
npm start

# Tests, types, lint
npm test
npm run typecheck
npm run lint
```

## Architecture

```
Client → Relay → Gateway → Target
                    ↑
             (this service)
```

The gateway decapsulates the OHTTP request, forwards the inner request to the target, then encapsulates the response. It learns *what* was requested but never *who* asked: the [relay](https://github.com/thibmeu/ohttp-relay) has already stripped the client's identity. Keys come from `OHTTP_KEY_SEED`, so there's no per-request state to keep. The same seed produces the same key configuration wherever you run it.

## Security considerations

This software has not been audited. Please use at your sole discretion.

The gateway's privacy and confidentiality guarantees rely on:

1. **Oblivious HTTP** ([RFC 9458](https://www.rfc-editor.org/rfc/rfc9458)) and its
   chunked extension
   ([draft-ietf-ohai-chunked-ohttp](https://datatracker.ietf.org/doc/draft-ietf-ohai-chunked-ohttp/)).
2. **HPKE** ([RFC 9180](https://www.rfc-editor.org/rfc/rfc9180)), as implemented by
   [`hpke`](https://www.npmjs.com/package/hpke). Node.js/Docker uses native
   WebCrypto for both suites. Workers uses native ML-KEM, HKDF, and AES-GCM
   with `webcrypto_modern_algorithms` enabled; only the SHAKE step in deterministic
   key derivation uses [`@panva/hpke-noble`](https://www.npmjs.com/package/@panva/hpke-noble).
   Vercel and Netlify retain the Noble ML-KEM suite. All backends derive identical
   public keys and key IDs from the same master seed.
3. The [`ohttp-ts`](https://github.com/thibmeu/ohttp-ts) implementation of OHTTP.
4. The underlying key-encapsulation mechanisms: X25519 (classical) and ML-KEM-768
   (post-quantum).

The privacy property only holds when the gateway and the
[relay](https://github.com/thibmeu/ohttp-relay) are operated by separate,
non-colluding parties: the relay hides the client's identity from the gateway,
and the gateway hides the request contents from the relay.

`OHTTP_KEY_SEED` is the gateway's most sensitive value — it deterministically
derives every private key, so anyone who learns it can decapsulate all traffic.
Store it as a platform secret, never in source control.

### Key rotation

Rotation is not automated yet. Because the published configuration can advertise
multiple keys and the server decapsulates by key ID, the intended approach is a
manual overlap: add a second seed-derived key, advertise both for at least the
24h configuration cache window, then drop the old one. Until then, changing
`OHTTP_KEY_SEED` rotates the keys immediately — clients holding a cached
configuration will fail to decapsulate until they refetch
(`Cache-Control: max-age=86400`).

## License

This project is licensed under the [MIT License](LICENSE).

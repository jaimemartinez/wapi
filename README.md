# wapi

A self-hosted WhatsApp REST API with a from-scratch, native implementation of the WhatsApp multi-device protocol — no browser, no third-party protocol library.

> ⚠️ **Terms of Service warning**
> wapi talks to WhatsApp through an **unofficial reimplementation** of its multi-device protocol. This **violates the WhatsApp Terms of Service** and **can get the phone number banned**. Use it entirely at your own risk, and **only with test numbers** you can afford to lose. Do not use it with personal, business, or production accounts.

## What it is

- **Native protocol, no browser.** wapi speaks the WhatsApp multi-device protocol directly: the Noise XX handshake, Signal/libsignal sessions (1:1 plus group sender keys), a custom binary node codec, WAProto protobufs, and App State Sync with LTHash. There is **no Puppeteer/Chromium and no Baileys** — the protocol core is written from scratch.
- **Lightweight.** Because there is no embedded browser, each session uses roughly **30–50 MB of RAM**.
- **Multi-session.** Run many WhatsApp accounts from a single process; each session persists its own credentials and keys to disk and is rehydrated on restart.
- **HTTP-first.** Everything is driven over a plain REST API, so you can call it from any language. A browsable OpenAPI explorer ships at `/docs`.

## Features

**Pairing**
- QR pairing — auto-refreshing PNG image at `/sessions/:id/qr.png` (also raw at `/sessions/:id/qr`)
- Phone **pairing code** — `POST /sessions/:id/pairing-code` returns an 8-character code to enter on the phone

**Messages**
- Text, media (image, audio, video, document, sticker)
- Rich content: reactions, quotes/replies, mentions, location, contacts
- Polls (including vote decryption)
- Edit, delete/revoke, forward

**Interactive messages**
- Buttons, lists, templates, and modern **native-flow** messages
- Product messages
- Pin / keep-in-chat

**Groups**
- Send and receive via sender keys
- Admin: create, manage participants, subject, description, invite links, leave
- **Ephemeral** (disappearing) messages
- **Join requests** (approve / reject) and add/approval mode
- **Communities** — create, link, and manage subgroups

**Privacy & contacts**
- Blocklist — block, unblock, list
- Profile, contacts, and privacy settings
- LID addressing — PN↔LID mapping, Signal session migration

**Presence & receipts**
- Delivery, read, **played** (voice note listened), and retry receipts
- Presence (online/typing/recording)

**Status & channels**
- Status / stories (publish text)
- Newsletters / channels

**Real-time delivery**
- **Webhooks** — push every event (`message`, `receipt`, `presence`, `call`, `status`) to a URL you register per session, with optional per-type filtering
- **SSE stream** — subscribe to live events over `GET /sessions/:id/events` (Server-Sent Events)

**State sync**
- **Bidirectional App State** — send *and* receive archive, pin, mute, mark-read, star, and delete, with version sync and LTHash verification
- Chat list via history sync

**Hardening**
- Optional API-key auth (header or query), per-client **rate limiting**, request-body validation, and atomic credential writes

**Calls**
- Detect and reject incoming calls (native audio/video is out of scope)

## Quick start

Requires **Node.js ≥ 18.17**.

```bash
git clone https://github.com/jaimemartinez/wapi.git
cd wapi
npm install
npm start
# API listening on http://127.0.0.1:4000  (OpenAPI explorer at /docs)
```

**1. Create a session**

```bash
curl -X POST http://127.0.0.1:4000/sessions \
  -H 'content-type: application/json' \
  -d '{"id":"me"}'
```

**2a. Pair by scanning a QR code**

Open the auto-refreshing QR image in a browser and scan it from the phone
(**WhatsApp → Linked devices → Link a device**):

```
http://127.0.0.1:4000/sessions/me/qr.png
```

**2b. …or pair with a phone-number code**

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/pairing-code \
  -H 'content-type: application/json' \
  -d '{"phone":"34600111222"}'
# -> { "code": "ABCD-1234", ... }  enter it on the phone:
# WhatsApp -> Linked devices -> Link with phone number instead
```

**3. Send a message**

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/messages \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","text":"hello from wapi"}'
```

Check session status at any time:

```bash
curl http://127.0.0.1:4000/sessions/me
```

## Authentication

The API is **unauthenticated by default** (it binds to `127.0.0.1`). To require a token, set `WAPI_KEY` and send it on every request via the `x-api-key` header:

```bash
WAPI_KEY=s3cret npm start
```

```bash
curl http://127.0.0.1:4000/sessions \
  -H 'x-api-key: s3cret'
```

Requests without a matching `x-api-key` receive `401 unauthorized`. The `/health`, `/docs`, and `/openapi.json` endpoints stay public.

## Documentation

- **OpenAPI explorer** — interactive Swagger UI at [`/docs`](http://127.0.0.1:4000/docs)
- **OpenAPI spec** — machine-readable JSON at [`/openapi.json`](http://127.0.0.1:4000/openapi.json)
- **Guides** (in [`docs/`](docs/)):
  - [`GETTING_STARTED.md`](docs/GETTING_STARTED.md) — install, run, and your first message
  - [`PAIRING.md`](docs/PAIRING.md) — QR vs. phone pairing-code flows
  - [`API.md`](docs/API.md) — full endpoint reference
  - [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) — protocol internals (Noise, Signal, codec, App State Sync)

## Configuration

All configuration is via environment variables — no config file, no container needed.

| Variable            | Default                   | Description                                                        |
| ------------------- | ------------------------- | ------------------------------------------------------------------ |
| `WAPI_HOST`         | `127.0.0.1`               | Host/interface the REST API binds to.                              |
| `WAPI_PORT`         | `4000`                    | Port the REST API listens on.                                      |
| `WAPI_KEY`          | *(empty)*                 | API token. If set, every request must send `x-api-key`. Empty = no auth. |
| `WAPI_SESSIONS_DIR` | `./sessions`              | Directory where each session's credentials and keys are persisted. |
| `WAPI_DEVICE_NAME`  | `wapi`                    | Device name announced to WhatsApp during the handshake.            |
| `WAPI_RATE_LIMIT`   | `300`                     | Max requests per client per window (`0` disables rate limiting).   |
| `WAPI_RATE_WINDOW_MS` | `60000`                 | Rate-limit window size in milliseconds.                            |

## Testing

```bash
npm test     # offline suite: crypto, binary codec, protobufs, and per-layer roundtrips
```

Continuous integration (GitHub Actions) runs the test suite on **Node 18, 20, and 22**, and verifies that the server boots and answers `/health`.

## Project status & limitations

This is an honest assessment — read it before relying on wapi.

- **The protocol core is solid.** The handshake, Signal sessions, group sender keys, media encryption, App State Sync / LTHash, and the binary node codec are **verified byte-for-byte against the official WhatsApp client**.
- **Most features are verified by offline tests only.** The high-level features above are covered by an offline test battery, but the majority have **not** been hardened by years of live, large-scale use the way mature libraries have.
- **Phone pairing-code is wired but not live-tested.** The flow is implemented end-to-end but requires an unlinked number to exercise; treat it as experimental.
- **No hosted / business accounts.** Only standard linked-device accounts are supported.
- **Edge-case robustness is limited.** Event buffering and some uncommon protocol paths are still rough.

**Verify each feature live with a disposable test number before trusting it for anything important.**

## License

[MIT](LICENSE)

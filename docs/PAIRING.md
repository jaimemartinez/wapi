# Linking a Device

This guide explains how to link a wapi session to a WhatsApp account. wapi connects as a **companion device** using the WhatsApp multi-device protocol — exactly like WhatsApp Web or a desktop app — so your phone remains the primary device and stays in control of the link.

There are two ways to link:

- **(A) QR code** — scan a rotating QR with your phone (recommended, fully validated).
- **(B) Phone pairing code** — type an 8-character code into your phone instead of scanning.

> **Honest caveat.** wapi is an unofficial, from-scratch implementation of the WhatsApp protocol. Linking a device this way **violates WhatsApp's Terms of Service** and carries a real risk of the account being banned. Use **test numbers only**, never a personal or business-critical account.

Throughout this guide, `{id}` is the session name you chose when creating the session, and the base URL is `http://127.0.0.1:4000` (configurable via `WAPI_PORT` / `WAPI_HOST`). If you set an API key (`WAPI_KEY`), send it as the `x-api-key` header on every request.

---

## Prerequisites

1. The wapi server is running and reachable at `http://127.0.0.1:4000`.
2. You have created a session. Creating a session immediately starts its connection:

   ```bash
   curl -X POST http://127.0.0.1:4000/sessions \
     -H 'content-type: application/json' \
     -d '{"id":"test1"}'
   # -> 201 { "id": "test1", "status": "..." }
   ```

A fresh, unlinked session performs the Noise handshake with WhatsApp's servers and then waits to be linked. You can poll its state at any time:

```bash
curl http://127.0.0.1:4000/sessions/test1
# -> { "id":"test1", "status":"qr", "hasQr":true, "me":null, ... }
```

The `status` field walks through these values while linking:

| `status`        | Meaning                                                            |
|-----------------|-------------------------------------------------------------------|
| `idle`          | Session object exists but not yet started.                        |
| `qr`            | A QR code is pending and waiting to be scanned.                   |
| `pairing_code`  | A phone pairing code was requested and is awaiting entry.         |
| `connected`     | Linked and logged in — ready to send and receive.                 |
| `closed`        | Socket closed (intentionally or after an error).                  |
| `logged_out`    | The device was unlinked / logged out remotely (credentials dead). |

---

## Method A — QR code

This is the standard multi-device **linked-devices** flow.

### 1. Fetch the QR

Two endpoints expose the same pending QR:

**JSON** — returns the raw QR string (a `https://wa.me/settings/linked_devices#…` reference payload):

```bash
curl http://127.0.0.1:4000/sessions/test1/qr
# -> 200 { "qr": "https://wa.me/settings/linked_devices#2@...,...,...,...,1", "status": "qr" }
```

If no QR is currently pending, this returns **409** with the current status (for example, the session may still be connecting, or it may already be linked).

**PNG image** — returns a ready-to-scan 360×360 PNG:

```
GET http://127.0.0.1:4000/sessions/test1/qr.png
```

Open `qr.png` directly in a browser. The response is sent with `cache-control: no-store` and an HTTP `refresh: 15` header, so the browser **auto-reloads the image every 15 seconds** and always shows the currently valid QR. This is the easiest way to link by hand.

### 2. The QR rotates (~every 20s)

When the server sends the pair node, it includes several refresh references (`<ref>` values). wapi shows the first one and **rotates to the next reference roughly every 20 seconds**, giving you multiple attempts within a single connection. Each rendered QR therefore changes periodically — always scan the most recent one (re-fetch `/qr` or let `qr.png` refresh itself). If all references are exhausted without a scan, the QR expires entirely; the session will produce a new batch on the next connection cycle.

### 3. Scan it on your phone

On the phone that owns the WhatsApp account:

1. Open **WhatsApp**.
2. Go to **Settings → Linked devices** (on Android: the **⋮** menu → **Linked devices**).
3. Tap **Link a device**.
4. Point the camera at the QR shown by wapi (`qr.png` in your browser, or a QR rendered from the `/qr` string).

The wapi server process also prints the QR as ASCII art to its console, which can be handy for quick local testing.

Once the phone accepts the scan, continue to [After linking](#after-linking-both-methods).

---

## Method B — Phone pairing code

Instead of scanning, you can link by typing an 8-character code into your phone. This is useful when you can't show a QR to the device.

> **Status: implemented and crypto-verified, but NOT yet validated against live servers.** The full `link_code_companion_reg` flow (`companion_hello` / `companion_finish`) is wired end-to-end, and its cryptography — the Crockford base-32 code, the PBKDF2-derived wrapping key, the ECDH key-bundle, and the `adv_secret` derivation — is verified by offline tests. It has **not** been confirmed against WhatsApp's production servers. Treat this path as experimental; the QR flow (Method A) is the validated one.

### 1. Request a code

`POST /sessions/{id}/pairing-code` with the phone number in **full international format, digits only** (no `+`, no spaces):

```bash
curl -X POST http://127.0.0.1:4000/sessions/test1/pairing-code \
  -H 'content-type: application/json' \
  -d '{"phone":"34600111222"}'
# -> 200 { "code": "ABCD1234", "status": "pairing_code" }
```

The response `code` is the **8-character** code (uppercase Crockford base-32) you'll type into the phone. The session `status` becomes `pairing_code`.

Requirements and notes:

- The session must already be **connected to the server** (handshake done) but **not yet registered/paired**. Requesting a code on an already-paired session returns **409** (`la sesión ya está emparejada`).
- A non-numeric or empty `phone` returns **400**.
- Requesting a pairing code is mutually exclusive with the QR flow for that connection — pick one method per link attempt.

### 2. Enter the code on your phone

1. Open **WhatsApp**.
2. Go to **Settings → Linked devices → Link a device**.
3. Tap **Link with phone number instead**.
4. Enter the 8-character code returned by the API.

When the primary device responds, wapi completes the `companion_finish` exchange, derives the shared secret, and proceeds to [After linking](#after-linking-both-methods).

---

## After linking (both methods)

Both methods converge on the same post-link sequence:

1. **Pair success.** The phone accepts the link. wapi verifies the signed device identity it receives — checking the HMAC against its `advSecretKey`, then verifying the **account's signature** over `(6,0 ‖ details ‖ identity)` — and only then generates its own **device signature** over `(6,1 ‖ details ‖ identity ‖ accountKey)`. If verification fails, the pairing is rejected as untrusted and the socket is closed. On success it records your account identity (`me`, including your JID) and the signed `account`.

   - QR path: this happens via the `pair-success` event.
   - Pairing-code path: the equivalent `companion_finish` registration completes and `registered` is set.

2. **Credentials are persisted.** The new credentials are written to disk **immediately**, so the link survives restarts (see [Where credentials live](#where-credentials-live)).

3. **Reconnect as login.** Right after pairing, WhatsApp **closes the stream** (stream-end, code `515`). This is expected. Because the credentials are now present (`me` is set), wapi automatically reconnects **once** — this time as a **login**, not a fresh pairing — without showing a new QR or code. After this reconnect, `status` becomes `connected` and the session announces itself as available.

4. **History sync.** Shortly after the first login, your phone sends a one-time **history sync** dump (recent chats, contact push-names). wapi ingests it so chats are populated without re-pairing.

At this point the session is fully linked. Confirm with:

```bash
curl http://127.0.0.1:4000/sessions/test1
# -> { "status": "connected", "me": { "id": "34600111222:NN@s.whatsapp.net", "name": "..." }, ... }
```

### Automatic reconnection and recovery

Once linked, wapi keeps the session alive on its own:

- **Keepalive** pings are sent every ~30 seconds.
- **Unexpected drops** (while still paired) trigger reconnection with exponential backoff (up to ~30s between attempts, giving up after ~6 tries).
- **Remote logout / unlink (401/403/405).** If your phone unlinks the device, or the credentials otherwise go dead, the session emits `logged_out`. wapi then **discards the dead credentials, regenerates a fresh device identity, and restarts to show a new QR automatically** — no manual cleanup needed. Watch for `status: logged_out` followed by a new `qr`.

---

## Where credentials live

Linked-device credentials are stored as JSON under the sessions directory, which defaults to `sessions/` in the project root (override with `WAPI_SESSIONS_DIR`):

- `sessions/{id}.json` — the auth state: identity keys, the device JID (`me`), the signed account identity, Signal sessions, app-state keys, and LID↔phone mappings. Binary values are base64-encoded. This is the file that makes the link persistent.
- `sessions/{id}.state.json` — cached chats, recent messages, and push-names (so history-synced data survives restarts).

> Treat `sessions/{id}.json` as a **secret**: anyone with this file can impersonate the linked device. Keep it out of version control and back it up only to trusted storage.

---

## Re-linking

To link the same session again — for example after a remote logout, or to attach it to a different account — simply trigger a fresh QR or pairing code:

- If the session auto-recovered after a `logged_out` event, a new QR is already being offered: fetch `/sessions/{id}/qr` or open `/sessions/{id}/qr.png` and scan again.
- If you deleted the session, recreate it with `POST /sessions` and start over from [Prerequisites](#prerequisites).

You cannot request a new QR or pairing code while a session is already paired and connected; log out or delete it first.

---

## Logout vs. delete

These two operations are different — choose deliberately:

### Logout — disconnect, keep credentials

```bash
curl -X POST http://127.0.0.1:4000/sessions/test1/logout
# -> 200 { "id": "test1", "status": "closed" }
```

This **closes the socket and suppresses auto-reconnect**, but **does not delete** `sessions/{id}.json`. The credentials remain on disk, so the device stays linked from WhatsApp's point of view. Restarting the server (or otherwise re-starting the session) logs back in **without re-scanning**. Use this to take a linked session offline temporarily.

> Note: this is a local disconnect. It does not unlink the device on the WhatsApp side — to remove the device entirely from the account, unlink it from the phone (**Settings → Linked devices → tap the device → Log out**), which will surface as a `logged_out` event in wapi.

### Delete — remove the session and its credentials

```bash
curl -X DELETE http://127.0.0.1:4000/sessions/test1
# -> 200 { "id": "test1", "deleted": true }
```

This destroys the session and **removes its credential files from disk**. The link is gone locally; to use that account again you must create a new session and **re-link from scratch** (Method A or B).

| Operation | Socket | Credentials on disk | Re-link needed? |
|-----------|--------|---------------------|-----------------|
| **Logout** (`POST /logout`) | Closed | Kept | No — logs back in automatically |
| **Delete** (`DELETE /sessions/{id}`) | Closed | Removed | Yes — scan/enter code again |

---

## Troubleshooting

- **`409 No hay QR pendiente` on `/qr`.** No QR is currently available. The session may still be connecting, already linked, or between QR batches — poll `/sessions/{id}` and retry when `status` is `qr`.
- **QR keeps changing.** Expected — references rotate ~every 20s and `qr.png` auto-refreshes every 15s. Always scan the latest.
- **`409 la sesión ya está emparejada` on `/pairing-code`.** The session is already paired. Log out or delete it before requesting a new code.
- **Phone says "couldn't link the device."** Ensure you scanned the most recent QR. The QR payload follows the exact official 5-field format; a stale or mis-rendered QR is the usual cause.
- **`status: logged_out`.** The device was unlinked remotely. wapi will regenerate credentials and present a new QR automatically — re-scan to re-link.

For interactive exploration of these endpoints, see the OpenAPI explorer at `/docs` (spec at `/openapi.json`).

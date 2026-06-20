# Getting Started

A hands-on tutorial that takes you from a fresh clone to sending and receiving
messages. Every example uses `curl` against the default `http://127.0.0.1:4000`.

> ⚠️ wapi is an unofficial reimplementation of the WhatsApp protocol. It violates
> WhatsApp's Terms of Service and can get a number banned. Use a disposable test
> number only.

## 1. Prerequisites

- **Node.js ≥ 18.17** (uses native `fetch`, WebCrypto, and ESM)
- A phone with WhatsApp installed, to link the device

## 2. Install and run

```bash
git clone https://github.com/jaimemartinez/wapi.git
cd wapi
npm install
npm start
# [wapi] API listening on http://127.0.0.1:4000
```

The server binds to `127.0.0.1:4000` by default. Override with environment
variables:

| Variable            | Default       | Description                                              |
| ------------------- | ------------- | -------------------------------------------------------- |
| `WAPI_HOST`         | `127.0.0.1`   | Interface to bind.                                       |
| `WAPI_PORT`         | `4000`        | Port to listen on.                                       |
| `WAPI_KEY`          | *(empty)*     | If set, every request must send `x-api-key`.             |
| `WAPI_SESSIONS_DIR` | `./sessions`  | Where each session's credentials/keys are persisted.     |

Check the server is alive:

```bash
curl http://127.0.0.1:4000/health
# {"ok":true,"name":"wapi","version":"0.1.0"}
```

## 3. Create a session

A *session* is one linked WhatsApp account. Give it any id you like.

```bash
curl -X POST http://127.0.0.1:4000/sessions \
  -H 'content-type: application/json' \
  -d '{"id":"me"}'
```

The session starts connecting in the background. Poll its status:

```bash
curl http://127.0.0.1:4000/sessions/me
```

### Session status values

| Status         | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `idle`         | Created, not yet connected.                                    |
| `qr`           | Waiting for you to scan a QR code.                             |
| `pairing_code` | Waiting for you to enter a phone pairing code.                |
| `connected`    | Linked and online — ready to send/receive.                    |
| `closed`       | Disconnected (will try to reconnect).                         |
| `logged_out`   | Unlinked from the phone; credentials are invalid.             |

## 4. Link your device

You have two options. See [PAIRING.md](PAIRING.md) for the full details.

### Option A — Scan a QR code

Open the auto-refreshing QR image in a browser and scan it from your phone
(**WhatsApp → Linked devices → Link a device**):

```
http://127.0.0.1:4000/sessions/me/qr.png
```

The image carries a `Refresh: 15` header so the browser reloads it as the QR
rotates (~every 20 s). If you embed it in your own page with `<img>`, append a
cache-busting query (`?t=${Date.now()}`) on each reload because `<img>` ignores
the `Refresh` header.

Prefer the raw payload? `GET /sessions/me/qr` returns `{ "qr": "...", "status": "qr" }`.

### Option B — Enter a phone pairing code

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/pairing-code \
  -H 'content-type: application/json' \
  -d '{"phone":"34600111222"}'
# { "code": "ABCD1234", "status": "pairing_code" }
```

Enter the code on the phone under **Linked devices → Link with phone number
instead**. (This path is implemented and crypto-verified but not yet validated
against live servers — treat it as experimental.)

When linking succeeds the status becomes `connected` and credentials are written
to `sessions/me.json`, so the session is restored automatically on restart.

## 5. Send your first messages

All send endpoints require the session to be `connected` (otherwise they return
`409 { "error": "no_conectada" }`). The `to` field accepts bare digits — they are
normalized to `<digits>@s.whatsapp.net` — or a full jid.

### Text

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/messages \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","text":"hello from wapi"}'
# { "ok": true, "id": "3EB0...", "to": "34600111222@s.whatsapp.net", "devices": 2 }
```

### Image (or any media)

Media is sent as base64. `type` is one of `image | audio | video | document | sticker`.

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/media \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","type":"image","base64":"<BASE64_JPEG>","caption":"hi"}'
```

For a voice note, send `type:"audio"` with `"ptt":true`. The request body cap is 8 MB.

### Reaction

Reactions reference the target message's `key`:

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/reactions \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","key":{"remoteJid":"34600111222@s.whatsapp.net","fromMe":false,"id":"3EB0..."},"emoji":"❤️"}'
```

### Poll

```bash
curl -X POST http://127.0.0.1:4000/sessions/me/polls \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","name":"Pizza tonight?","options":["Yes","No"],"selectableCount":1}'
```

## 6. Receive messages and chats

Inbound messages are decrypted and buffered in memory:

```bash
curl http://127.0.0.1:4000/sessions/me/messages   # decrypted inbound messages
curl http://127.0.0.1:4000/sessions/me/chats       # chat list from history sync
```

Download media from a received message:

```bash
curl http://127.0.0.1:4000/sessions/me/messages/<msgId>/media
# { "base64": "...", "mimetype": "image/jpeg" }
```

## 7. Receipts and presence

```bash
# Mark messages as read
curl -X POST http://127.0.0.1:4000/sessions/me/read \
  -H 'content-type: application/json' \
  -d '{"from":"34600111222@s.whatsapp.net","ids":["3EB0..."]}'

# Announce typing
curl -X POST http://127.0.0.1:4000/sessions/me/chatstate \
  -H 'content-type: application/json' \
  -d '{"to":"34600111222","state":"composing"}'
```

## 8. Call the API from code

### JavaScript (fetch)

```js
const API = "http://127.0.0.1:4000";

async function send(to, text) {
  const r = await fetch(`${API}/sessions/me/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, text }),
  });
  return r.json();
}

console.log(await send("34600111222", "hi from node"));
```

### Python (requests)

```python
import requests

API = "http://127.0.0.1:4000"

def send(to, text):
    r = requests.post(f"{API}/sessions/me/messages", json={"to": to, "text": text})
    return r.json()

print(send("34600111222", "hi from python"))
```

If `WAPI_KEY` is set, add the header `x-api-key: <your-key>` to every request.

## 9. Logout vs. delete

```bash
curl -X POST   http://127.0.0.1:4000/sessions/me/logout   # disconnect, keep credentials
curl -X DELETE http://127.0.0.1:4000/sessions/me          # disconnect + delete credentials
```

## Troubleshooting

| Symptom                                     | Cause / fix                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `409 { "error": "no_conectada" }`           | The session isn't `connected` yet — finish linking first.                  |
| `404 { "error": "no_existe" }`              | Unknown session id — create it with `POST /sessions`.                      |
| Phone says "couldn't link device"           | The QR expired — reload `/qr.png` to get a fresh one.                       |
| QR image won't scan from the terminal       | Use the PNG endpoint `/sessions/:id/qr.png`, not an ASCII QR.              |
| Messages stop arriving / random disconnects | You may be rate-limited or the number was flagged. Use a test number.      |
| `401 unauthorized`                          | `WAPI_KEY` is set but the request is missing a matching `x-api-key` header. |

Next: the full [API reference](API.md), the [pairing guide](PAIRING.md), and the
[architecture deep-dive](ARCHITECTURE.md).

# wapi — REST API Reference

Complete reference for every endpoint. Base URL `http://127.0.0.1:4000`. All session-scoped routes take the session `id` as a path parameter. Send the optional `x-api-key` header if `WAPI_KEY` is set.

## Sessions

A *session* is one WhatsApp account managed by wapi. All session-scoped routes are identified by the path parameter `id` (the session id you chose at creation). Authentication is optional: when the server is started with an API key, send it in the `x-api-key` header (the `/health` endpoint is always public).

Common errors:

- `404 {"error":"no_existe"}` — the session id is unknown.
- `409` — the session is not in the right state for the operation (e.g. no QR pending, or pairing not possible).
- `400` — a required body field is missing.

The session status object (returned by status/list endpoints) has this shape:

| field | type | description |
| --- | --- | --- |
| `id` | string | Session id. |
| `status` | string | One of `idle`, `qr`, `pairing_code`, `connected`, `closed`, `logged_out`. |
| `hasQr` | boolean | Whether a QR is currently pending to scan. |
| `me` | object \| null | Linked account `{ id, name }`, or `null` if not paired. |
| `calls` | number | Number of observed incoming-call events in memory. |
| `messages` | number | Number of buffered incoming messages in memory. |
| `chats` | number | Number of known chats (from history sync). |
| `lastError` | object \| null | Last observed error `{ message, at }` for diagnostics. |
| `closeReason` | object \| null | Last socket close `{ code, reason, at }`. |

---

### GET /health

Liveness probe. Requires no authentication and no session. Returns the service name and version.

**Path/query params:** none.

**Example**

```bash
curl http://127.0.0.1:4000/health
```

**Example response**

```json
{ "ok": true, "name": "wapi", "version": "0.1.0" }
```

---

### POST /sessions

Creates a new session with the given id (or reuses an existing one) and starts its connection in the background. After this, retrieve a QR or a pairing code to link a device.

**Body**

| field | type | required | description |
| --- | --- | --- | --- |
| `id` | string | yes | Unique session identifier (account name). Trimmed; must be non-empty. |

**Example**

```bash
curl -X POST http://127.0.0.1:4000/sessions \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"id":"mi-cuenta"}'
```

**Example response** (`201 Created`)

```json
{ "id": "mi-cuenta", "status": "idle" }
```

If `id` is missing the server responds `400 {"error":"falta_id","message":"Envía { \"id\": \"<nombre>\" }"}`.

---

### GET /sessions

Lists all known sessions with their current status snapshot.

**Path/query params:** none.

**Example**

```bash
curl http://127.0.0.1:4000/sessions -H 'x-api-key: YOUR_KEY'
```

**Example response**

```json
{
  "sessions": [
    {
      "id": "mi-cuenta",
      "status": "connected",
      "hasQr": false,
      "me": { "id": "34600123456:12@s.whatsapp.net", "name": "Jaime" },
      "calls": 0,
      "messages": 3,
      "chats": 12,
      "lastError": null,
      "closeReason": null
    }
  ]
}
```

---

### GET /sessions/{id}

Returns the current status object for a single session.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Example**

```bash
curl http://127.0.0.1:4000/sessions/mi-cuenta -H 'x-api-key: YOUR_KEY'
```

**Example response**

```json
{
  "id": "mi-cuenta",
  "status": "connected",
  "hasQr": false,
  "me": { "id": "34600123456:12@s.whatsapp.net", "name": "Jaime" },
  "calls": 0,
  "messages": 3,
  "chats": 12,
  "lastError": null,
  "closeReason": null
}
```

Responds `404 {"error":"no_existe"}` if the session id is unknown.

---

### GET /sessions/{id}/qr

Returns the raw QR string to render and scan in WhatsApp (Linked devices). The QR rotates roughly every 20 seconds while the session is in the login phase.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Example**

```bash
curl http://127.0.0.1:4000/sessions/mi-cuenta/qr -H 'x-api-key: YOUR_KEY'
```

**Example response**

```json
{ "qr": "2@abcd1234...,kqV3...,Hf9...,=", "status": "qr" }
```

If there is no QR pending (e.g. already connected), responds `409 {"status":"connected","message":"No hay QR pendiente"}`. Unknown id responds `404 {"error":"no_existe"}`.

---

### GET /sessions/{id}/qr.png

Returns the pending QR rendered as a scannable PNG image (`Content-Type: image/png`). The response includes a `Refresh: 15` header, so opening it in a browser auto-reloads the current QR as it rotates.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Example**

```bash
curl http://127.0.0.1:4000/sessions/mi-cuenta/qr.png -H 'x-api-key: YOUR_KEY' -o qr.png
```

**Example response:** binary PNG image. If no QR is pending, responds `409 {"status":"connected","message":"No hay QR pendiente"}`; unknown id responds `404 {"error":"no_existe"}`.

---

### POST /sessions/{id}/pairing-code

Requests an 8-character pairing code as an alternative to the QR. Enter it in WhatsApp under Linked devices > Link with phone number. The session must be connected to the server and not yet paired.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Body**

| field | type | required | description |
| --- | --- | --- | --- |
| `phone` | string | yes | Phone number in international format; non-digit characters are stripped. |

**Example**

```bash
curl -X POST http://127.0.0.1:4000/sessions/mi-cuenta/pairing-code \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"phone":"34600123456"}'
```

**Example response**

```json
{ "code": "ABCD1234", "status": "pairing_code" }
```

Missing `phone` responds `400 {"error":"falta_phone"}`. If pairing cannot proceed (e.g. the session is already paired) the server responds `409 {"error":"fallo","message":"la sesión ya está emparejada"}`. Unknown id responds `404 {"error":"no_existe"}`.

---

### POST /sessions/{id}/logout

Closes the WhatsApp connection without deleting the stored credentials, and disables automatic reconnection. The session keeps its credentials and can be started again later.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Example**

```bash
curl -X POST http://127.0.0.1:4000/sessions/mi-cuenta/logout -H 'x-api-key: YOUR_KEY'
```

**Example response**

```json
{ "id": "mi-cuenta", "status": "closed" }
```

Unknown id responds `404 {"error":"no_existe"}`.

---

### DELETE /sessions/{id}

Disconnects the session and permanently deletes its stored credentials from disk.

**Path params**

| name | type | description |
| --- | --- | --- |
| `id` | string | Session id. |

**Example**

```bash
curl -X DELETE http://127.0.0.1:4000/sessions/mi-cuenta -H 'x-api-key: YOUR_KEY'
```

**Example response**

```json
{ "id": "mi-cuenta", "deleted": true }
```

Unknown id responds `404 {"error":"no_existe"}`.

## Messaging

All endpoints below are scoped to a session via the `{id}` path parameter. Unless noted otherwise, send-style endpoints return `404 {"error":"no_existe"}` when the session id is unknown and `409 {"error":"no_conectada","status":<status>}` when the session exists but is not connected. The success payload for message-send endpoints comes from the relay layer and has the shape `{"ok":true,"id":"<messageId>","to":"<jid>","devices":<n>}`.

### POST /sessions/{id}/messages

Sends a plain text message. Quoting, mentions, and link preview can be supplied through `options`.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| text | string | yes | Message body (empty string allowed by the handler, but normally required). |
| options | object | no | Optional `quoted` message, `mentions`, and link `preview` settings. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"to":"34600123456","text":"Hello from wapi"}'
```

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

Errors: `400 {"error":"falta_to"}` when `to` is missing; `500 {"error":"envio_fallido","message":"..."}` on send failure.

### POST /sessions/{id}/reactions

Reacts to a target message with an emoji. Send an empty `emoji` to remove a reaction.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| key | object | yes | Target message key. |
| key.remoteJid | string | yes | Chat JID of the target message. |
| key.fromMe | boolean | yes | Whether the target message was sent by this account. |
| key.id | string | yes | Id of the target message. |
| key.participant | string | no | Sender JID inside a group. |
| emoji | string | yes | Emoji to apply; empty string removes the reaction. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/reactions \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","key":{"remoteJid":"34600123456@s.whatsapp.net","fromMe":false,"id":"3EB0A1B2C3D4E5F6"},"emoji":"👍"}'
```

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/location

Sends a geographic location.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| latitude | number | yes | Latitude in decimal degrees. |
| longitude | number | yes | Longitude in decimal degrees. |
| name | string | no | Place name. |
| address | string | no | Street address. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/location \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","latitude":40.4168,"longitude":-3.7038,"name":"Puerta del Sol","address":"Madrid"}'
```

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/contacts

Sends one or more contact cards (vCards). Provide a single contact object or an array.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| contacts | object \| array | yes | A contact `{displayName, vcard}` or an array of them. |
| contacts[].displayName | string | yes | Display name shown on the card. |
| contacts[].vcard | string | yes | Raw vCard text. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/contacts \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","contacts":{"displayName":"Alice","vcard":"BEGIN:VCARD\nVERSION:3.0\nFN:Alice\nTEL;type=CELL;waid=34600123456:+34 600 123 456\nEND:VCARD"}}'
```

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/polls

Creates and sends a poll. `selectableCount` defaults to 1 (single-choice).

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| name | string | yes | Poll question. |
| options | string[] | yes | List of answer options. |
| selectableCount | integer | no | Max selectable options. Defaults to 1. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/polls \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","name":"Lunch today?","options":["Pizza","Sushi","Salad"],"selectableCount":1}'
```

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/messages/edit

Edits the text of a message previously sent by this session.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Chat JID/number containing the message. |
| targetId | string | yes | Id of the original message to edit. |
| text | string | yes | New message text. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/edit \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","targetId":"3EB0A1B2C3D4E5F6","text":"Edited message text"}'
```

```json
{ "ok": true, "id": "3EB0NEWEDITID", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/messages/revoke

Revokes (deletes for everyone) a message. `key.fromMe` defaults to true when omitted.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Chat JID/number. |
| key | object | yes | Target message key. |
| key.id | string | yes | Id of the message to revoke. |
| key.fromMe | boolean | no | Whether the message is your own. Defaults to true. |
| key.participant | string | no | Sender JID inside a group (revoking others' messages). |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/revoke \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","key":{"id":"3EB0A1B2C3D4E5F6","fromMe":true}}'
```

```json
{ "ok": true, "id": "3EB0REVOKEID", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/messages/forward

Forwards a raw Message content object to another chat. The forwarding score and forwarded flag are set automatically.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | yes | Recipient phone number or JID. |
| message | object | yes | Raw Message content, e.g. `{conversation:"..."}` or `{imageMessage:{...}}`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/forward \
  -H 'Content-Type: application/json' \
  -d '{"to":"34600123456","message":{"conversation":"Take a look at this"}}'
```

```json
{ "ok": true, "id": "3EB0FWDID", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

### POST /sessions/{id}/messages/star

Stars or unstars a message via an app-state mutation synced across your devices. `starred` defaults to true.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jid | string | yes | Chat JID containing the message. |
| key | object | yes | Target message key. |
| key.id | string | yes | Id of the message. |
| key.fromMe | boolean | yes | Whether the message is your own. |
| starred | boolean | no | Star (true) or unstar (false). Defaults to true. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/star \
  -H 'Content-Type: application/json' \
  -d '{"jid":"34600123456@s.whatsapp.net","key":{"id":"3EB0A1B2C3D4E5F6","fromMe":true},"starred":true}'
```

```json
{ "ok": true, "version": 42 }
```

### POST /sessions/{id}/messages/deleteforme

Deletes a message only on this account (delete-for-me) via an app-state mutation. `timestamp` defaults to now.

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jid | string | yes | Chat JID containing the message. |
| key | object | yes | Target message key. |
| key.id | string | yes | Id of the message. |
| key.fromMe | boolean | yes | Whether the message is your own. |
| timestamp | integer | no | Message timestamp in ms. Defaults to now. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/deleteforme \
  -H 'Content-Type: application/json' \
  -d '{"jid":"34600123456@s.whatsapp.net","key":{"id":"3EB0A1B2C3D4E5F6","fromMe":false}}'
```

```json
{ "ok": true, "version": 43 }
```

### POST /sessions/{id}/read

Sends a read receipt for one or more messages. Use `type` `read` for blue ticks or `read-self` to mark read only on your own devices (any other value is treated as `read`).

Path params: `id` (string) — session id.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from | string | yes | Chat JID the messages belong to. |
| ids | string[] | yes | Message ids to mark as read (at least one). |
| type | string | no | `read` or `read-self`. Defaults to `read`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/read \
  -H 'Content-Type: application/json' \
  -d '{"from":"34600123456@s.whatsapp.net","ids":["3EB0A1B2C3D4E5F6"],"type":"read"}'
```

```json
{ "ok": true, "marked": 1 }
```

Errors: `400 {"error":"faltan_from_o_ids"}` when `from` is empty or `ids` is empty/missing.

### GET /sessions/{id}/messages

Returns the buffer of decrypted inbound messages (most recent first, capped at 200). Each entry includes `id`, `chat`, `from`, `at`, and a type-specific payload (`text`, `reaction`, `poll_vote`, `location`, `contact`, or media metadata under `media`).

Path params: `id` (string) — session id.

```bash
curl http://127.0.0.1:4000/sessions/main/messages
```

```json
{
  "messages": [
    { "id": "3EB0A1B2C3D4E5F6", "chat": "34600123456@s.whatsapp.net", "from": "34600123456@s.whatsapp.net", "at": "2026-06-20T10:00:00.000Z", "text": "Hello" }
  ]
}
```

### GET /sessions/{id}/chats

Returns the chats gathered from the history sync performed at link time, ordered by most recent activity. `count` is the total number of known chats.

Path params: `id` (string) — session id.

```bash
curl http://127.0.0.1:4000/sessions/main/chats
```

```json
{
  "count": 1,
  "chats": [
    { "id": "34600123456@s.whatsapp.net", "name": "Alice", "timestamp": 1718900000 }
  ]
}
```

## Messaging — Media & Rich Messages

These endpoints send media files and rich/interactive message types, download received media, and manage message-level state (pins, ephemeral keep, played receipts). All routes are session-scoped: the `{id}` path parameter is the session id.

Common errors for every endpoint below:
- `404 {"error":"no_existe"}` — the session id is unknown.
- `409 {"error":"no_conectada","status":"<status>"}` — the session exists but is not connected.
- `500 {"error":"envio_fallido","message":"..."}` — the send operation failed.

The send endpoints return the relay result `{ ok, id, to, devices }`, where `id` is the generated message id, `to` is the resolved recipient JID, and `devices` is the number of recipient devices the message was encrypted for.

Authentication: pass the optional `x-api-key` header if the server is configured with an API key.

---

### POST /sessions/{id}/media

Sends an image, audio, video, document or sticker to a contact. The file is sent inline as base64 (an optional `data:<mime>;base64,` prefix is stripped automatically). The server encrypts and uploads the file once, then relays the encrypted message to each of the recipient's devices.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Recipient phone number or JID. |
| type | string | yes | One of `image`, `audio`, `video`, `document`, `sticker`. |
| base64 | string | yes | File contents, base64-encoded. A leading `data:` URI prefix is accepted. |
| caption | string | no | Caption text. Applied only for `image`, `video`, `document`. |
| mimetype | string | no | Override MIME type. Defaults per type (e.g. `image/jpeg`, `audio/ogg; codecs=opus`, `application/pdf`, `video/mp4`, `image/webp`). |
| fileName | string | no | File name for `document` (defaults to `file`). |
| ptt | boolean | no | For `audio` only: send as a push-to-talk voice note. |

If `to`, `type` or `base64` is missing the endpoint returns `400 {"error":"faltan_to_type_base64"}`; an unsupported `type` returns `400 {"error":"tipo_invalido"}`.

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/media \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "type": "image",
    "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "caption": "Here is the photo"
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2, "type": "image" }
```

---

### GET /sessions/{id}/messages/{msgId}/media

Downloads and decrypts the media attached to a previously received message and returns it base64-encoded with its MIME type and (if present) file name.

Path params: `id` — session id; `msgId` — id of the received message carrying the media.

This endpoint takes no body or query params.

If the message is not found or its media cannot be downloaded the endpoint returns `404 {"error":"media_no_disponible","message":"..."}` (an unknown session id returns `404 {"error":"no_existe"}`).

Example:

```bash
curl http://127.0.0.1:4000/sessions/main/messages/3EB0A1B2C3D4E5F6/media \
  -H 'x-api-key: YOUR_KEY'
```

Example response:

```json
{ "mimetype": "image/jpeg", "fileName": null, "base64": "/9j/4AAQSkZJRgABAQAAAQABAAD..." }
```

---

### POST /sessions/{id}/messages/buttons

Sends a legacy quick-reply buttons message: body text, optional footer, and a set of tappable buttons.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Recipient phone number or JID. |
| text | string | yes | Body / content text shown above the buttons. |
| footer | string | no | Footer text. |
| buttons | array | yes | Quick-reply buttons. Each item is `{ id, text }`. |
| buttons[].id | string | yes | Button id returned when the user taps it. |
| buttons[].text | string | yes | Button label. |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/buttons \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "text": "Do you confirm your order?",
    "footer": "Reply within 24h",
    "buttons": [ { "id": "confirm", "text": "Confirm" }, { "id": "cancel", "text": "Cancel" } ]
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

---

### POST /sessions/{id}/messages/list

Sends a legacy list message: a button that opens a menu of sections, each containing selectable rows.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Recipient phone number or JID. |
| title | string | yes | List title. |
| description | string | yes | Body text shown above the list button. |
| buttonText | string | yes | Label of the button that opens the list. |
| footer | string | no | Footer text. |
| sections | array | yes | List sections. Each item is `{ title, rows }`. |
| sections[].title | string | no | Section title. |
| sections[].rows | array | no | Rows in the section, each `{ id, title, description }`. |
| sections[].rows[].id | string | no | Row id returned when the row is selected. |
| sections[].rows[].title | string | no | Row title. |
| sections[].rows[].description | string | no | Row description. |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/list \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "title": "Our menu",
    "description": "Pick a dish to order",
    "buttonText": "View menu",
    "footer": "Prices include VAT",
    "sections": [ { "title": "Starters", "rows": [ { "id": "row_salad", "title": "Salad", "description": "Fresh garden salad" } ] } ]
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

---

### POST /sessions/{id}/messages/interactive

Sends a modern interactive message built on the native-flow format. Each button declares a `name` (button type) and a `params` object that is JSON-encoded into the button payload.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Recipient phone number or JID. |
| title | string | no | Header title. |
| subtitle | string | no | Header subtitle. |
| body | string | no | Body text. |
| footer | string | no | Footer text. |
| buttons | array | yes | Native-flow buttons. Each item is `{ name, params }`. |
| buttons[].name | string | yes | Button type, e.g. `quick_reply`, `cta_url`, `cta_call`, `single_select`. |
| buttons[].params | object \| string | yes | Button parameters; serialized to JSON (a pre-serialized JSON string is also accepted). |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/interactive \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "title": "Special offer",
    "body": "Tap below to learn more",
    "footer": "Powered by wapi",
    "buttons": [ { "name": "cta_url", "params": { "display_text": "Visit site", "url": "https://example.com" } } ]
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F6", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

---

### POST /sessions/{id}/messages/pin

Pins or unpins a message in the chat with the given recipient. When pinning, an optional `seconds` controls how long the pin lasts (defaults to 86400, i.e. 24 hours).

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Chat phone number or JID. |
| key | object | yes | Key of the message to pin. |
| key.id | string | yes | Target message id. |
| key.fromMe | boolean | no | Whether the target message was sent by you. Defaults to `true`. |
| key.participant | string | no | In group chats, the JID of the message author. |
| pin | boolean | no | `true` to pin (default), `false` to unpin. |
| seconds | integer | no | Pin duration in seconds when pinning. Defaults to `86400`. |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/pin \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "key": { "id": "3EB0A1B2C3D4E5F6", "fromMe": false },
    "pin": true,
    "seconds": 604800
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F7", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

---

### POST /sessions/{id}/messages/keep

Marks an ephemeral (disappearing) message to be kept in the chat, or removes that mark, so it is preserved past its expiration.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Chat phone number or JID. |
| key | object | yes | Key of the ephemeral message. |
| key.id | string | yes | Target message id. |
| key.fromMe | boolean | no | Whether the target message was sent by you. Defaults to `true`. |
| key.participant | string | no | In group chats, the JID of the message author. |
| keep | boolean | no | `true` to keep (default), `false` to un-keep. |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/messages/keep \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "key": { "id": "3EB0A1B2C3D4E5F6", "fromMe": false },
    "keep": true
  }'
```

Example response:

```json
{ "ok": true, "id": "3EB0A1B2C3D4E5F8", "to": "34600123456@s.whatsapp.net", "devices": 2 }
```

---

### POST /sessions/{id}/receipts/played

Sends a 'played' receipt for one or more audio / voice-note (ptt) messages, signalling to the sender that they were listened to.

Path params: `id` — session id.

| Field | Type | Required | Description |
|---|---|---|---|
| to | string | yes | Sender / chat phone number or JID. |
| ids | array | yes | Ids of the played messages. |
| participant | string | no | In group chats, the JID of the message author. |

Example:

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/receipts/played \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{
    "to": "34600123456",
    "ids": [ "3EB0A1B2C3D4E5F6", "3EB0A1B2C3D4E5F7" ]
  }'
```

Example response:

```json
{ "ok": true, "type": "played", "ids": [ "3EB0A1B2C3D4E5F6", "3EB0A1B2C3D4E5F7" ] }
```

## Chats

Endpoints for managing chat state (archive, pin, mute, read), broadcasting your own presence and typing indicators, subscribing to contacts' presence, and reading the known-presence map.

All routes are session-scoped. The `id` path parameter is the session id. Unless noted, these endpoints require the session to be **connected**.

Common errors:

- `404 {"error":"no_existe"}` — the session id is unknown.
- `409 {"error":"no_conectada","status":"<status>"}` — the session exists but is not connected.
- `500 {"error":"envio_fallido","message":"<detail>"}` — the underlying send/patch failed.

The four chat-state endpoints (`archive`, `pin`, `mute`, `read`) are applied as app-state patches that sync across all linked devices, and on success return `{"ok":true,"version":<n>}` where `version` is the new app-state collection version.

---

### POST /sessions/{id}/chats/{jid}/archive

Archives or unarchives a chat.

Path params:

- `id` — session id.
- `jid` — chat JID (user or group), e.g. `34600123456@s.whatsapp.net`.

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| archived | boolean | no | `true` to archive (default), `false` to unarchive. If omitted, the chat is archived. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/chats/34600123456@s.whatsapp.net/archive \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'
```

```json
{ "ok": true, "version": 4 }
```

---

### POST /sessions/{id}/chats/{jid}/pin

Pins or unpins a chat in the chat list.

Path params:

- `id` — session id.
- `jid` — chat JID (user or group).

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| pinned | boolean | no | `true` to pin (default), `false` to unpin. If omitted, the chat is pinned. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/chats/34600123456@s.whatsapp.net/pin \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pinned": true}'
```

```json
{ "ok": true, "version": 7 }
```

---

### POST /sessions/{id}/chats/{jid}/mute

Mutes or unmutes a chat. The `until` value is a Unix timestamp in milliseconds marking when the mute ends.

Path params:

- `id` — session id.
- `jid` — chat JID (user or group).

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| until | integer \| null | no | Unix timestamp (ms) when the mute should end. Omit or send `null` to mute with no end time. Send `false` to unmute. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/chats/34600123456@s.whatsapp.net/mute \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"until": 1782000000000}'
```

```json
{ "ok": true, "version": 2 }
```

---

### POST /sessions/{id}/chats/{jid}/read

Marks the whole chat as read or unread.

Path params:

- `id` — session id.
- `jid` — chat JID (user or group).

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| read | boolean | no | `true` to mark as read (default), `false` to mark as unread. If omitted, the chat is marked as read. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/chats/34600123456@s.whatsapp.net/read \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"read": true}'
```

```json
{ "ok": true, "version": 9 }
```

---

### POST /sessions/{id}/presence

Broadcasts your own global presence to WhatsApp.

Path params:

- `id` — session id.

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| type | string | no | `available` (appear online) or `unavailable` (appear offline). Defaults to `available` when omitted. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/presence \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type": "available"}'
```

```json
{ "ok": true, "type": "available" }
```

---

### POST /sessions/{id}/chatstate

Sends a chat-state (typing) indicator to a contact. `recording` is delivered as a composing node tagged with audio media; `paused` clears the indicator.

Path params:

- `id` — session id.

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| to | string | yes | Recipient JID or phone number. |
| state | string | yes | One of `composing`, `recording`, `paused`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/chatstate \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to": "34600123456@s.whatsapp.net", "state": "composing"}'
```

```json
{ "ok": true, "to": "34600123456@s.whatsapp.net", "state": "composing" }
```

---

### POST /sessions/{id}/presence/subscribe

Subscribes to a contact's presence so the session begins receiving their online / last-seen / typing updates. You must subscribe before `GET /presence` will report data for that contact.

Path params:

- `id` — session id.

Body:

| field | type | required | description |
|-------|------|----------|-------------|
| to | string | yes | Contact JID or phone number to subscribe to. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/presence/subscribe \
  -H "x-api-key: SECRET" \
  -H "Content-Type: application/json" \
  -d '{"to": "34600123456@s.whatsapp.net"}'
```

```json
{ "ok": true, "to": "34600123456@s.whatsapp.net" }
```

---

### GET /sessions/{id}/presence

Returns the map of presences the session has received so far, keyed by contact/participant JID. Unlike the other endpoints in this group, it does **not** require the session to be connected — it simply reads the in-memory map (which is empty until you subscribe or receive chat-state updates).

Path params:

- `id` — session id.

Each entry may contain:

| field | type | description |
|-------|------|-------------|
| lastKnownPresence | string | `available`, `unavailable`, `composing`, or `recording`. |
| lastSeen | integer \| absent | Last-seen Unix timestamp (seconds), when shared by the contact. |
| groupOnlineCount | integer \| absent | Number of members online (for group presence). |
| at | string (ISO 8601) | When this presence was last updated locally. |

```bash
curl http://127.0.0.1:4000/sessions/main/presence \
  -H "x-api-key: SECRET"
```

```json
{
  "presences": {
    "34600123456@s.whatsapp.net": {
      "lastKnownPresence": "available",
      "lastSeen": 1781990000,
      "at": "2026-06-20T10:15:00.000Z"
    },
    "34600654321@s.whatsapp.net": {
      "lastKnownPresence": "recording",
      "at": "2026-06-20T10:16:42.000Z"
    }
  }
}
```

## Groups and Communities

All endpoints are session-scoped. The path parameter `id` is the session id, and `gid` is a group/community jid that **must be URL-encoded** in the path (for example `123456-789@g.us` becomes `123456-789%40g.us`). Authentication is via the optional `x-api-key` header.

Standard errors apply to every endpoint below:

- `404 {"error":"no_existe"}` — the session id is unknown.
- `409 {"error":"no_conectada","status":"<status>"}` — the session exists but is not connected.
- `400` — a required body field is missing.
- `500 {"error":"<code>","message":"<detail>"}` — the underlying WhatsApp query failed.

### GET /sessions/{id}/groups/{gid}

Fetches full metadata for a group: subject, owner, creation time, settings, ephemeral timer and participant list.

Path params: `id` (session id), `gid` (group jid, URL-encoded).

```bash
curl http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "id": "123456-789@g.us",
  "subject": "My Group",
  "creation": 1718000000,
  "owner": "34600123456@s.whatsapp.net",
  "addressingMode": "pn",
  "desc": "Group description",
  "descId": "3EB0ABCDEF0123456789",
  "restrict": false,
  "announce": false,
  "ephemeralDuration": 0,
  "memberAddMode": false,
  "joinApprovalMode": false,
  "isCommunity": false,
  "isCommunityAnnounce": false,
  "participants": [
    { "id": "34600123456@s.whatsapp.net", "admin": "superadmin" },
    { "id": "34600654321@s.whatsapp.net", "admin": null }
  ]
}
```

### POST /sessions/{id}/groups/{gid}/messages

Sends a plain text message to a group using sender keys.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | The message text. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/messages \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"text":"Hello group!"}'
```

```json
{ "ok": true, "id": "3EB0ABCDEF0123456789", "to": "123456-789@g.us", "devices": 4 }
```

Returns `400 {"error":"falta_text"}` if `text` is missing.

### POST /sessions/{id}/groups

Creates a new group with the given subject and initial participants. Returns the metadata of the new group.

Path params: `id`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | yes | The group name. |
| `participants` | string[] | no | Phone numbers or jids to add initially (defaults to empty). |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"My New Group","participants":["34600123456","34600654321"]}'
```

```json
{
  "ok": true,
  "id": "123456-789@g.us",
  "subject": "My New Group",
  "creation": 1718000000,
  "owner": "34600123456@s.whatsapp.net",
  "participants": [
    { "id": "34600123456@s.whatsapp.net", "admin": "superadmin" },
    { "id": "34600654321@s.whatsapp.net", "admin": null }
  ]
}
```

### POST /sessions/{id}/groups/{gid}/participants

Adds, removes, promotes or demotes participants. Returns a per-participant result where `status` is `"200"` on success or an error code otherwise.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `participants` | string[] | yes | Phone numbers or jids to act on. |
| `action` | string | yes | One of `add`, `remove`, `promote`, `demote`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/participants \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"participants":["34600123456","34600654321"],"action":"add"}'
```

```json
{
  "ok": true,
  "result": [
    { "jid": "34600123456@s.whatsapp.net", "status": "200" },
    { "jid": "34600654321@s.whatsapp.net", "status": "403" }
  ]
}
```

### POST /sessions/{id}/groups/{gid}/subject

Changes the group subject (name). Requires admin privileges.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | yes | The new group name. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/subject \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"Renamed Group"}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/groups/{gid}/description

Changes the group description. Omitting `description` or sending an empty string **deletes** the current description.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | no | The new description. Empty/omitted clears it. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/description \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"description":"Welcome to our group!"}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/groups/{gid}/setting

Toggles a group-wide setting. Use `announcement`/`not_announcement` to control whether only admins may send messages, and `locked`/`unlocked` to control whether only admins may edit group info.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `setting` | string | yes | One of `announcement`, `not_announcement`, `locked`, `unlocked`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/setting \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"setting":"announcement"}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/groups/{gid}/invite

Retrieves the current invite code and the corresponding invite link.

Path params: `id`, `gid`. No body.

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/invite \
  -H "x-api-key: YOUR_KEY"
```

```json
{ "ok": true, "code": "AbCdEfGh123", "link": "https://chat.whatsapp.com/AbCdEfGh123" }
```

### POST /sessions/{id}/groups/{gid}/invite/revoke

Revokes the current invite code and generates a new one, invalidating previously shared links. Returns the new code.

Path params: `id`, `gid`. No body.

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/invite/revoke \
  -H "x-api-key: YOUR_KEY"
```

```json
{ "ok": true, "code": "XyZ987newCode" }
```

### POST /sessions/{id}/groups/accept

Joins a group via an invite code (the token from a `chat.whatsapp.com` link). Returns the jid of the joined group.

Path params: `id`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | The invite code. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/accept \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"code":"AbCdEfGh123"}'
```

```json
{ "ok": true, "jid": "123456-789@g.us" }
```

### POST /sessions/{id}/groups/{gid}/leave

Removes the current session's account from the group.

Path params: `id`, `gid`. No body.

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/leave \
  -H "x-api-key: YOUR_KEY"
```

```json
{ "ok": true }
```

### POST /sessions/{id}/groups/{gid}/ephemeral

Sets the disappearing-message timer. Pass `seconds` as `0` (off), `86400` (24h), `604800` (7 days) or `7776000` (90 days).

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `seconds` | integer | yes | Timer in seconds: `0`, `86400`, `604800` or `7776000`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/ephemeral \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"seconds":604800}'
```

```json
{ "ok": true, "expiration": 604800 }
```

### POST /sessions/{id}/groups/{gid}/requests

Lists pending membership-approval (join) requests for a group with join approval enabled. Despite returning data, this endpoint uses **POST**.

Path params: `id`, `gid`. No body.

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/requests \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "ok": true,
  "requests": [
    { "jid": "34600123456@s.whatsapp.net", "request_method": "InviteLink", "request_time": "1718000000" }
  ]
}
```

### POST /sessions/{id}/groups/{gid}/requests/update

Approves or rejects pending join requests for the given participants. Returns a per-participant status result.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `participants` | string[] | yes | Phone numbers or jids to act on. |
| `action` | string | yes | Either `approve` or `reject`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/requests/update \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"participants":["34600123456"],"action":"approve"}'
```

```json
{ "ok": true, "result": [ { "jid": "34600123456@s.whatsapp.net", "status": "200" } ] }
```

### POST /sessions/{id}/groups/{gid}/addmode

Controls whether any member or only admins can add new members.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | yes | Either `all_member_add` or `admin_add`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/addmode \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"all_member_add"}'
```

```json
{ "ok": true, "mode": "all_member_add" }
```

### POST /sessions/{id}/groups/{gid}/approvalmode

Enables (`on`) or disables (`off`) the requirement that an admin approve new members before they join.

Path params: `id`, `gid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | yes | Either `on` or `off`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/groups/123456-789%40g.us/approvalmode \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"mode":"on"}'
```

```json
{ "ok": true, "mode": "on" }
```

### POST /sessions/{id}/communities

Creates a new community (a parent group) with the given subject and optional description body. Returns the metadata of the created community.

Path params: `id`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject` | string | yes | The community name. |
| `body` | string | no | The community description (defaults to empty). |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/communities \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"My Community","body":"A place for all our groups"}'
```

```json
{
  "ok": true,
  "id": "123000-111@g.us",
  "subject": "My Community",
  "creation": 1718000000,
  "owner": "34600123456@s.whatsapp.net",
  "isCommunity": true,
  "participants": [ { "id": "34600123456@s.whatsapp.net", "admin": "superadmin" } ]
}
```

### POST /sessions/{id}/communities/{gid}/link

Links an existing group as a sub-group of the community identified by `gid`.

Path params: `id`, `gid` (the community/parent jid).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `groupJid` | string | yes | The jid of the group to link. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/communities/123000-111%40g.us/link \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"groupJid":"123456-789@g.us"}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/communities/{gid}/unlink

Removes a sub-group from the community identified by `gid`.

Path params: `id`, `gid` (the community/parent jid).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `groupJid` | string | yes | The jid of the group to unlink. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/communities/123000-111%40g.us/unlink \
  -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"groupJid":"123456-789@g.us"}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/communities/{gid}/subgroups

Lists the sub-groups linked to a community. If `gid` is itself a sub-group jid, its parent community is resolved automatically. Despite returning data, this endpoint uses **POST**.

Path params: `id`, `gid` (community jid, or any sub-group jid).

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/communities/123000-111%40g.us/subgroups \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "ok": true,
  "subgroups": [
    { "id": "123456-789@g.us", "subject": "General", "creation": 1718000000, "owner": "34600123456@s.whatsapp.net", "size": 42 }
  ]
}
```

## Profile, Privacy, Blocklist and Status

All routes below are session-scoped and require a connected session. The path parameter `id` is the session id. Standard errors apply: `404 {"error":"no_existe"}` when the session id is unknown, `409 {"error":"no_conectada","status":"<status>"}` when the session is not connected, and `500 {"error":"fallo","message":"<detail>"}` on failure. Auth is via the optional `x-api-key` header. Base URL: `http://127.0.0.1:4000`.

### POST /sessions/{id}/onwhatsapp
Checks which of the given phone numbers are registered on WhatsApp (usync contact query).

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| numbers | string[] | yes | Phone numbers in international format (with or without `+`); non-digit characters are stripped. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/onwhatsapp \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: YOUR_KEY' \
  -d '{"numbers":["34600123456","34699888777"]}'
```

```json
{
  "results": [
    { "jid": "34600123456@s.whatsapp.net", "exists": true },
    { "jid": "34699888777@s.whatsapp.net", "exists": false }
  ]
}
```

### POST /sessions/{id}/status/query
Queries the about/status text of one or more contacts (usync status query).

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jids | string[] | yes | Contact JIDs to query. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/status/query \
  -H 'Content-Type: application/json' \
  -d '{"jids":["34600123456@s.whatsapp.net"]}'
```

```json
{
  "results": [
    { "jid": "34600123456@s.whatsapp.net", "status": "At the beach", "setAt": 1718800000 }
  ]
}
```

### GET /sessions/{id}/profile/{jid}/picture
Returns the profile picture URL for a JID. The handler always requests the low-resolution `preview` image; `url` is `null` when no picture exists.

Path params: `id` (session id), `jid` (target user or group JID).

```bash
curl http://127.0.0.1:4000/sessions/main/profile/34600123456@s.whatsapp.net/picture
```

```json
{ "url": "https://pps.whatsapp.net/v/t61.../preview.jpg" }
```

### POST /sessions/{id}/profile/picture
Sets the profile picture of the connected account from a base64-encoded JPEG.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| base64 | string | yes | Base64-encoded JPEG image bytes. An invalid or missing value yields a `500`. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/profile/picture \
  -H 'Content-Type: application/json' \
  -d '{"base64":"/9j/4AAQSkZJRgABAQAAAQABAAD..."}'
```

```json
{ "ok": true }
```

### POST /sessions/{id}/profile/picture/remove
Removes the profile picture of the connected account. No request body is required.

Path params: `id` (session id).

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/profile/picture/remove
```

```json
{ "ok": true }
```

### POST /sessions/{id}/profile/status
Updates the about/status text of the connected account.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | New about/status text. Defaults to an empty string if omitted. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/profile/status \
  -H 'Content-Type: application/json' \
  -d '{"text":"Working from home"}'
```

```json
{ "ok": true }
```

### GET /sessions/{id}/business/{jid}
Fetches the WhatsApp Business profile of a JID. Returns `null` when the JID has no business profile.

Path params: `id` (session id), `jid` (business account JID).

```bash
curl http://127.0.0.1:4000/sessions/main/business/34600123456@s.whatsapp.net
```

```json
{
  "wid": "34600123456@s.whatsapp.net",
  "address": "Calle Mayor 1, Madrid",
  "description": "Best coffee in town",
  "email": "hello@example.com",
  "website": ["https://example.com"],
  "category": "Food & Beverage"
}
```

### GET /sessions/{id}/privacy
Returns the current privacy settings as a map of category name to value.

Path params: `id` (session id).

```bash
curl http://127.0.0.1:4000/sessions/main/privacy
```

```json
{
  "last": "contacts",
  "online": "all",
  "profile": "contacts",
  "status": "contacts",
  "readreceipts": "all",
  "groupadd": "contacts"
}
```

### POST /sessions/{id}/privacy
Updates a single privacy category.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Privacy category: `last`, `online`, `profile`, `status`, `readreceipts`, `groupadd`, etc. |
| value | string | yes | New value for the category (for example `all`, `contacts`, `contact_blacklist`, `none`). |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/privacy \
  -H 'Content-Type: application/json' \
  -d '{"name":"last","value":"contacts"}'
```

```json
{ "ok": true }
```

### GET /sessions/{id}/blocklist
Returns the list of JIDs blocked by the connected account.

Path params: `id` (session id).

```bash
curl http://127.0.0.1:4000/sessions/main/blocklist
```

```json
{ "blocklist": ["34699888777@s.whatsapp.net"] }
```

### POST /sessions/{id}/block
Blocks a contact.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jid | string | yes | JID of the contact to block. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/block \
  -H 'Content-Type: application/json' \
  -d '{"jid":"34699888777@s.whatsapp.net"}'
```

```json
{ "ok": true, "jid": "34699888777@s.whatsapp.net", "action": "block" }
```

### POST /sessions/{id}/unblock
Unblocks a contact.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jid | string | yes | JID of the contact to unblock. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/unblock \
  -H 'Content-Type: application/json' \
  -d '{"jid":"34699888777@s.whatsapp.net"}'
```

```json
{ "ok": true, "jid": "34699888777@s.whatsapp.net", "action": "unblock" }
```

### POST /sessions/{id}/status
Publishes a text status/story to a list of recipient JIDs. Supplying `font` or `backgroundArgb` produces a styled status (extended text message); otherwise a plain text status is sent. The response is the underlying send result.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | Status text. Defaults to an empty string if omitted. |
| statusJidList | string[] | yes | Recipient JIDs that will receive the status update. |
| font | integer | no | Font id for a styled status. |
| backgroundArgb | integer | no | Background color as a 32-bit ARGB integer. |
| textArgb | integer | no | Text color as a 32-bit ARGB integer. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/status \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello from wapi!","statusJidList":["34600123456@s.whatsapp.net","34699888777@s.whatsapp.net"]}'
```

```json
{ "id": "3EB0XXXXXXXXXXXXXXXX" }
```

## Newsletters

Newsletter management uses the `w:mex` GraphQL API; sending is plaintext (no end-to-end encryption). All routes are session-scoped and require a connected session. The `gid` path parameter is the newsletter JID (`...@newsletter`). Management/send/mute/follow operations are wrapped with an `ok: true` flag merged into the underlying result; the metadata GET returns the raw object.

### POST /sessions/{id}/newsletters
Creates a newsletter/channel.

Path params: `id` (session id).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Display name of the newsletter. |
| description | string | no | Description of the newsletter. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/newsletters \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Channel","description":"News and updates"}'
```

```json
{
  "ok": true,
  "id": "123456789012345678@newsletter",
  "thread_metadata": {
    "name": { "text": "My Channel" },
    "description": { "text": "News and updates" }
  }
}
```

### POST /sessions/{id}/newsletters/{gid}/follow
Subscribes the connected account to a newsletter.

Path params: `id` (session id), `gid` (newsletter JID).

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/newsletters/123456789012345678@newsletter/follow
```

```json
{ "ok": true }
```

### POST /sessions/{id}/newsletters/{gid}/unfollow
Unsubscribes the connected account from a newsletter.

Path params: `id` (session id), `gid` (newsletter JID).

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/newsletters/123456789012345678@newsletter/unfollow
```

```json
{ "ok": true }
```

### POST /sessions/{id}/newsletters/{gid}/messages
Publishes a plaintext message to a newsletter. Returns the generated message id and target JID.

Path params: `id` (session id), `gid` (newsletter JID).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| text | string | yes | Message text to publish. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/newsletters/123456789012345678@newsletter/messages \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello subscribers!"}'
```

```json
{ "ok": true, "id": "3EB0XXXXXXXXXXXXXXXX", "to": "123456789012345678@newsletter" }
```

### POST /sessions/{id}/newsletters/{gid}/mute
Mutes or unmutes a newsletter. The `mute` flag defaults to `true`; only an explicit `false` unmutes.

Path params: `id` (session id), `gid` (newsletter JID).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mute | boolean | no | `true` (default) mutes; `false` unmutes. |

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/newsletters/123456789012345678@newsletter/mute \
  -H 'Content-Type: application/json' \
  -d '{"mute":true}'
```

```json
{ "ok": true }
```

### GET /sessions/{id}/newsletters/{gid}
Fetches newsletter metadata (creation time, full image and viewer metadata).

Path params: `id` (session id), `gid` (newsletter JID).

```bash
curl http://127.0.0.1:4000/sessions/main/newsletters/123456789012345678@newsletter
```

```json
{
  "id": "123456789012345678@newsletter",
  "thread_metadata": {
    "name": { "text": "My Channel" },
    "description": { "text": "News and updates" },
    "subscribers_count": "42",
    "creation_time": "1718800000"
  },
  "viewer_metadata": { "mute": "OFF", "role": "OWNER" }
}
```

## Calls

The engine only detects incoming calls (the `call` event) and lets you reject them; there is no audio support. Routes are session-scoped. Note that these two endpoints do not return a `409` when disconnected: the list is served directly, and reject failures return `501`.

### GET /sessions/{id}/calls
Returns the call events observed by the session (up to the 100 most recent, newest first).

Path params: `id` (session id).

```bash
curl http://127.0.0.1:4000/sessions/main/calls
```

```json
{
  "calls": [
    {
      "id": "CALL12345",
      "from": "34600123456@s.whatsapp.net",
      "at": "2026-06-20T10:00:00.000Z",
      "type": "offer",
      "raw": { "call-id": "CALL12345" }
    }
  ]
}
```

### POST /sessions/{id}/calls/{callId}/reject
Rejects a previously detected incoming call by its call id. The call must still be present in the session's call list.

Path params: `id` (session id), `callId` (id of the detected call to reject).

```bash
curl -X POST http://127.0.0.1:4000/sessions/main/calls/CALL12345/reject
```

```json
{ "ok": true }
```

On failure (call not found or not yet implemented) the response is `501`:

```json
{ "error": "no_implementado_aun", "message": "..." }
```


## Real-time events (Webhooks & SSE)

Instead of polling `GET /sessions/:id/messages`, you can receive events as they
happen. Every event has the shape:

```json
{ "session": "me", "type": "message", "at": "2026-01-01T12:00:00.000Z", "data": { } }
```

Event types: `message` (inbound message/reaction/poll-vote/media/location/contact),
`receipt` (delivery/read/played), `presence`, `call`, and `status` (connection changes).

### Webhooks

Register a URL that receives an HTTP `POST` for each event. Optionally filter by type.

```bash
# Set (optionally filter to certain types)
curl -X POST http://127.0.0.1:4000/sessions/me/webhook \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/hook","events":["message","receipt"]}'

# Inspect
curl http://127.0.0.1:4000/sessions/me/webhook

# Remove
curl -X DELETE http://127.0.0.1:4000/sessions/me/webhook
```

Delivery is fire-and-forget with a 5 s timeout and one retry. The webhook config
persists across restarts.

### SSE stream

Subscribe to a live stream with `GET /sessions/:id/events` (Server-Sent Events).
Because `EventSource` cannot send custom headers, pass the API key (when set) via
`?apikey=`.

```js
const es = new EventSource("http://127.0.0.1:4000/sessions/me/events");
es.addEventListener("message", (e) => console.log("message", JSON.parse(e.data)));
es.addEventListener("receipt", (e) => console.log("receipt", JSON.parse(e.data)));
es.addEventListener("status",  (e) => console.log("status",  JSON.parse(e.data)));
```

```bash
curl -N http://127.0.0.1:4000/sessions/me/events
# event: ready
# data: {"session":"me","status":"connected"}
#
# event: message
# data: {"session":"me","type":"message","at":"...","data":{"id":"3EB0...","text":"hi"}}
```

## Rate limiting

When `WAPI_RATE_LIMIT` > 0 (default 300 per 60 s), each client (by API key, or IP
when unauthenticated) is limited per fixed window. Exceeding it returns
`429 { "error": "rate_limited", "retryAfterMs": <n> }` with a `Retry-After` header.
The SSE stream endpoint is exempt.

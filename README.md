# wapi

API REST autohospedada para WhatsApp, con una **implementación nativa propia** del
protocolo multi-device (Noise + Signal + códec binario) — **sin navegador** y sin
librerías de terceros para el protocolo.

> ⚠️ **Aviso**: usa una reimplementación no oficial del protocolo de WhatsApp.
> Va contra los Términos de Servicio de WhatsApp y puede provocar el baneo del
> número. Úsalo bajo tu responsabilidad y solo con cuentas de prueba.

## Qué es

- **API REST + explorador OpenAPI** (`/docs`): la llamas por HTTP desde cualquier lenguaje.
- **Protocolo nativo**: handshake Noise XX, sesiones Signal (1:1 y sender keys de grupo),
  códec binario y WAProto propios. No usa Puppeteer/Chromium ni Baileys.
- **Ligero**: ~30–50 MB por sesión (sin navegador), multi-sesión.

## Funcionalidades

- Emparejamiento por **QR** (imagen PNG auto-refrescante en `/sessions/:id/qr.png`)
- **Mensajes**: texto, media (imagen/audio/vídeo/documento/sticker), reacciones,
  citas, menciones, ubicación, contactos, encuestas (con descifrado de votos),
  editar, borrar/revocar, reenviar
- **Grupos**: enviar/recibir (sender keys) + admin (crear, participantes, asunto,
  descripción, invitaciones, salir)
- **Recibos** (entrega/lectura/retry), **presencia**, **perfil/contactos/privacidad**
- **Lista de chats** vía history sync, **newsletters/canales**
- **App State** (archivar/fijar/silenciar/marcar leído/estrella/borrar para mí)
- **Llamadas**: detección y rechazo (el audio/vídeo no es posible de forma nativa)

## Arranque

```bash
npm install
npm start            # API en http://127.0.0.1:4000  (docs en /docs)
```

Crear una sesión y emparejar:

```bash
curl -X POST http://127.0.0.1:4000/sessions -H 'content-type: application/json' -d '{"id":"yo"}'
# abre http://127.0.0.1:4000/sessions/yo/qr.png en el navegador y escanéalo
```

Enviar un mensaje:

```bash
curl -X POST http://127.0.0.1:4000/sessions/yo/messages \
  -H 'content-type: application/json' -d '{"to":"34600111222","text":"hola"}'
```

Configurable por entorno: `WAPI_PORT` (4000), `WAPI_HOST`, `WAPI_KEY` (cabecera `x-api-key`).

## Estado y límites (honesto)

El **núcleo del protocolo** (handshake, Signal, sender keys, media, LTHash, códec)
está verificado byte a byte contra el cliente oficial. **No** es equivalente al 100% a
librerías maduras: el direccionamiento LID es parcial, la **recepción** de App State
Sync (snapshots entrantes) no está, el emparejamiento por código no está cableado, y
faltan cuentas hosted/business y algo de robustez de casos límite. La mayoría de
funciones están verificadas con tests offline; pruébalas en vivo antes de confiar.

## Tests

```bash
npm test     # batería offline: cripto, códec, proto y roundtrips por capa
```

El CI (GitHub Actions) ejecuta los tests en Node 18/20/22 y comprueba que el servidor arranca.

## Licencia

MIT

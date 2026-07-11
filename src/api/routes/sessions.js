// Rutas de gestión de sesiones (una "sesión" = una cuenta de WhatsApp).
import QRCode from 'qrcode';

export function registerSessionRoutes(router, manager) {
  // Crea (o recupera) una sesión y arranca su conexión.
  router.post('/sessions', async ({ body, send }) => {
    const id = String(body.id || '').trim();
    if (!id) return send(400, { error: 'falta_id', message: 'Envía { "id": "<nombre>" }' });
    const session = await manager.create(id);
    send(201, { id, status: session.status });
  });

  // Lista todas las sesiones conocidas.
  router.get('/sessions', async ({ send }) => {
    send(200, { sessions: manager.list() });
  });

  // Estado de una sesión.
  router.get('/sessions/:id', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, s.info());
  });

  // QR pendiente de escanear (si está en fase de login).
  router.get('/sessions/:id/qr', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (!s.qr) return send(409, { status: s.status, message: 'No hay QR pendiente' });
    send(200, { qr: s.qr, status: s.status });
  });

  // QR como imagen PNG escaneable. Ábrelo en el navegador y recarga para
  // obtener el QR vigente (rota cada ~20s). Auto-refresca con la cabecera.
  router.get('/sessions/:id/qr.png', async ({ params, res, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (!s.qr) return send(409, { status: s.status, message: 'No hay QR pendiente' });
    const png = await QRCode.toBuffer(s.qr, { margin: 2, width: 360, errorCorrectionLevel: 'M' });
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', refresh: '15' });
    res.end(png);
  });

  // Emparejamiento por CÓDIGO (alternativa al QR).  POST { phone:"34600111222" }
  // Devuelve el código de 8 caracteres a teclear en el móvil
  // (WhatsApp > Dispositivos vinculados > Vincular con número de teléfono).
  router.post('/sessions/:id/pairing-code', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    const phone = String(body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return send(400, { error: 'falta_phone' });
    try { send(200, { code: await s.requestPairingCode(phone), status: s.status }); }
    catch (err) { send(409, { error: 'fallo', message: String(err?.message || err) }); }
  });

  // Cierra la sesión (sin borrar credenciales).
  router.post('/sessions/:id/logout', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    await s.disconnect();
    send(200, { id: params.id, status: s.status });
  });

  // Elimina la sesión y sus credenciales del disco.
  router.delete('/sessions/:id', async ({ params, send }) => {
    if (!manager.get(params.id)) return send(404, { error: 'no_existe' });
    await manager.destroy(params.id);
    send(200, { id: params.id, deleted: true });
  });

  // ---- Eventos en tiempo real ----

  // Stream SSE de eventos (message/receipt/presence/call/status). Mantiene la
  // conexión abierta y empuja cada evento como `data: <json>`. Con auth, pasa la
  // clave por query `?apikey=` (EventSource no admite cabeceras).
  router.get('/sessions/:id/events', async ({ params, req, res, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ session: params.id, status: s.status })}\n\n`);
    const unsubscribe = s.subscribe((event) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });
    // Latido cada 25s para que proxies no cierren la conexión.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    const cleanup = () => { clearInterval(heartbeat); unsubscribe(); };
    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  // Configura el webhook saliente.  POST { url, events?: [...] }
  router.post('/sessions/:id/webhook', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (!body.url || !/^https?:\/\//i.test(body.url)) return send(400, { error: 'url_invalida', message: 'Send { "url": "https://..." }' });
    send(200, { ok: true, webhook: s.setWebhook(body.url, body.events) });
  });

  // Consulta el webhook actual.  GET
  router.get('/sessions/:id/webhook', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, { webhook: s.webhook || null });
  });

  // Elimina el webhook.  DELETE
  router.delete('/sessions/:id/webhook', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    s.setWebhook(null);
    send(200, { ok: true, webhook: null });
  });
}

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
}

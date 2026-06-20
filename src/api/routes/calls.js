// Rutas de llamadas. Por ahora el motor solo DETECTA llamadas entrantes
// (evento 'call') y permite rechazarlas; no hay audio (eso requiere la API
// oficial de Meta). Los endpoints quedan listos para crecer.
export function registerCallRoutes(router, manager) {
  // Historial de eventos de llamada observados por la sesión.
  router.get('/sessions/:id/calls', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, { calls: s.calls });
  });

  // Rechazar una llamada entrante por su id.
  //   POST /sessions/:id/calls/:callId/reject
  router.post('/sessions/:id/calls/:callId/reject', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    try {
      await s.rejectCall(params.callId);
      send(200, { ok: true });
    } catch (err) {
      send(501, { error: 'no_implementado_aun', message: String(err?.message || err) });
    }
  });
}

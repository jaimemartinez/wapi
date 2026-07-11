// Rutas de perfil, contactos y privacidad.
export function registerProfileRoutes(router, manager) {
  const ok = (s) => s && s.status === 'connected';

  const action = (method, path, fn) => router[method](path, async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (!ok(s)) return send(409, { error: 'no_conectada', status: s.status });
    try { send(200, await fn(s, body, params)); }
    catch (err) { send(err.status || 500, { error: err.code || 'fallo', message: String(err?.message || err) }); }
  });

  // ¿Está en WhatsApp?  POST { numbers:["+34600...", ...] }
  action('post', '/sessions/:id/onwhatsapp', (s, b) => s.onWhatsApp(b.numbers || []).then((r) => ({ results: r })));
  // Status/recado de contactos.  POST { jids:[...] }
  action('post', '/sessions/:id/status/query', (s, b) => s.fetchStatus(b.jids || []).then((r) => ({ results: r })));
  // Foto de perfil de un jid.  GET ?type=preview|image
  action('get', '/sessions/:id/profile/:jid/picture', (s, b, p) => s.profilePicture(p.jid, 'preview'));
  // Poner mi foto de perfil.  POST { base64 }
  action('post', '/sessions/:id/profile/picture', (s, b) => s.setProfilePicture(Buffer.from(b.base64, 'base64')));
  // Quitar mi foto.  POST {}
  action('post', '/sessions/:id/profile/picture/remove', (s) => s.removeProfilePicture());
  // Poner mi status/recado.  POST { text }
  action('post', '/sessions/:id/profile/status', (s, b) => s.setStatus(b.text || ''));
  // Business profile de un jid.  GET
  action('get', '/sessions/:id/business/:jid', (s, b, p) => s.businessProfile(p.jid));
  // Ajustes de privacidad.  GET
  action('get', '/sessions/:id/privacy', (s) => s.privacySettings());
  // Cambiar privacidad.  POST { name, value }
  action('post', '/sessions/:id/privacy', (s, b) => s.setPrivacy(b.name, b.value));

  // Lista de bloqueados.  GET
  action('get', '/sessions/:id/blocklist', (s) => s.blocklist().then((r) => ({ blocklist: r })));
  // Bloquear.  POST { jid }
  action('post', '/sessions/:id/block', (s, b) => s.blockUser(b.jid));
  // Desbloquear.  POST { jid }
  action('post', '/sessions/:id/unblock', (s, b) => s.unblockUser(b.jid));
  // Publicar estado/historia de texto.  POST { text, statusJidList:[...], font?, backgroundArgb?, textArgb? }
  action('post', '/sessions/:id/status', (s, b) => s.setTextStatus(b.text || '', b.statusJidList || [], b));
}

// Rutas de mensajería.
import { requireFields, requireEnum, requireArray } from '../validate.js';

export function registerMessageRoutes(router, manager) {
  // Enviar un mensaje de texto.
  //   POST /sessions/:id/messages  { "to": "34600...", "text": "hola" }
  router.post('/sessions/:id/messages', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') {
      return send(409, { error: 'no_conectada', status: s.status });
    }
    const to = String(body.to || '').trim();
    if (!to) return send(400, { error: 'falta_to' });

    try {
      const result = await s.sendText(to, body.text ?? '', body.options ?? {});
      send(200, { ok: true, ...result });
    } catch (err) {
      send(500, { error: 'envio_fallido', message: String(err?.message || err) });
    }
  });

  // Helper: valida sesión conectada y ejecuta una acción de envío.
  const sendAction = (path, fn) => router.post(path, async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    try { send(200, { ok: true, ...(await fn(s, body, params)) }); }
    catch (err) { send(err.status || 500, { error: err.code || 'envio_fallido', message: String(err?.message || err) }); }
  });

  // Reacción a un mensaje.  { to, key:{remoteJid,fromMe,id,participant}, emoji }
  sendAction('/sessions/:id/reactions', (s, b) => { requireFields(b, ['to', 'key']); return s.sendReaction(b.to, b.key, b.emoji); });
  // Ubicación.  { to, latitude, longitude, name?, address? }
  sendAction('/sessions/:id/location', (s, b) => { requireFields(b, ['to', 'latitude', 'longitude']); return s.sendLocation(b.to, b, b.options || {}); });
  // Contacto(s).  { to, contacts: {displayName,vcard} | [...] }
  sendAction('/sessions/:id/contacts', (s, b) => { requireFields(b, ['to', 'contacts']); return s.sendContact(b.to, b.contacts, b.options || {}); });
  // Encuesta.  { to, name, options:[...], selectableCount? }
  sendAction('/sessions/:id/polls', (s, b) => { requireFields(b, ['to', 'name']); requireArray(b, 'options'); return s.sendPoll(b.to, { name: b.name, options: b.options, selectableCount: b.selectableCount }, b.options2 || {}); });
  // Editar un mensaje propio.  { to, targetId, text }
  sendAction('/sessions/:id/messages/edit', (s, b) => s.editMessage(b.to, b.targetId, b.text, b.options || {}));
  // Borrar/revocar para todos.  { to, key:{id,fromMe,participant?} }
  sendAction('/sessions/:id/messages/revoke', (s, b) => s.revokeMessage(b.to, b.key));
  // Reenviar.  { to, message:{conversation|imageMessage|...} }
  sendAction('/sessions/:id/messages/forward', (s, b) => s.forwardMessage(b.to, b.message, b.options || {}));
  // Estrella.  { jid, key:{id,fromMe}, starred }
  sendAction('/sessions/:id/messages/star', (s, b) => s.starMessage(b.jid, b.key, b.starred !== false));
  // Borrar para mí.  { jid, key:{id,fromMe}, timestamp? }
  sendAction('/sessions/:id/messages/deleteforme', (s, b) => s.deleteMessageForMe(b.jid, b.key, b.timestamp));

  // Botones (legacy).  { to, text, footer?, buttons:[{id,text}] }
  sendAction('/sessions/:id/messages/buttons', (s, b) => s.sendButtons(b.to, b, b.options || {}));
  // Lista (legacy).  { to, title, description, buttonText, footer?, sections:[{title,rows:[{id,title,description}]}] }
  sendAction('/sessions/:id/messages/list', (s, b) => s.sendList(b.to, b, b.options || {}));
  // Interactivo moderno (native flow).  { to, title?, body?, footer?, buttons:[{name,params}] }
  sendAction('/sessions/:id/messages/interactive', (s, b) => s.sendInteractive(b.to, b, b.options || {}));
  // Fijar/desfijar mensaje en el chat.  { to, key:{id,fromMe,participant?}, pin?, seconds? }
  sendAction('/sessions/:id/messages/pin', (s, b) => s.pinMessage(b.to, b.key, b.pin !== false, b.seconds));
  // Mantener/no-mantener mensaje efímero.  { to, key, keep? }
  sendAction('/sessions/:id/messages/keep', (s, b) => s.keepMessage(b.to, b.key, b.keep !== false));
  // Recibo 'played' (audio/ptt escuchado).  { to, ids:[...], participant? }
  sendAction('/sessions/:id/receipts/played', (s, b) => s.sendPlayedReceipt(b.to, b.ids, b.participant));

  // App state de chats.  { archived?/pinned?/read?/until? }
  sendAction('/sessions/:id/chats/:jid/archive', (s, b, p) => s.archiveChat(p.jid, b.archived !== false));
  sendAction('/sessions/:id/chats/:jid/pin', (s, b, p) => s.pinChat(p.jid, b.pinned !== false));
  sendAction('/sessions/:id/chats/:jid/mute', (s, b, p) => s.muteChat(p.jid, b.until ?? null));
  sendAction('/sessions/:id/chats/:jid/read', (s, b, p) => s.markChatRead(p.jid, b.read !== false));

  // Presencia propia.  { type: "available" | "unavailable" }
  sendAction('/sessions/:id/presence', (s, b) => s.sendPresence(b.type || 'available').then(() => ({ type: b.type })));
  // Estado de chat.  { to, state: "composing" | "recording" | "paused" }
  sendAction('/sessions/:id/chatstate', (s, b) => s.sendChatState(b.to, b.state).then(() => ({ to: b.to, state: b.state })));
  // Suscribirse a la presencia de un contacto.  { to }
  sendAction('/sessions/:id/presence/subscribe', (s, b) => s.subscribePresence(b.to).then(() => ({ to: b.to })));
  // Consultar presencias conocidas.
  router.get('/sessions/:id/presence', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, { presences: s.presences });
  });

  // Listar los mensajes entrantes ya descifrados.
  //   GET /sessions/:id/messages
  router.get('/sessions/:id/messages', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, { messages: s.messages });
  });

  // Listar los chats (obtenidos del history sync al vincular).
  //   GET /sessions/:id/chats
  router.get('/sessions/:id/chats', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    send(200, { count: s.chats.size, chats: s.listChats() });
  });

  // Enviar media (imagen/audio/documento/vídeo/sticker) en base64.
  //   POST /sessions/:id/media { "to":"34600...", "type":"image", "base64":"...", "caption":"hola" }
  router.post('/sessions/:id/media', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    const to = String(body.to || '').trim();
    const type = String(body.type || '').trim();
    const b64 = String(body.base64 || '');
    if (!to || !type || !b64) return send(400, { error: 'faltan_to_type_base64' });
    if (!['image', 'audio', 'document', 'video', 'sticker'].includes(type)) return send(400, { error: 'tipo_invalido' });
    try {
      const buf = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      const r = await s.sendMedia(to, type, buf, { mimetype: body.mimetype, caption: body.caption, fileName: body.fileName, ptt: body.ptt });
      send(200, { ok: true, ...r });
    } catch (err) {
      send(500, { error: 'envio_fallido', message: String(err?.message || err) });
    }
  });

  // Descargar el media de un mensaje recibido (devuelve base64).
  //   GET /sessions/:id/messages/:msgId/media
  router.get('/sessions/:id/messages/:msgId/media', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    try {
      const { buffer, mimetype, fileName } = await s.downloadMessageMedia(params.msgId);
      send(200, { mimetype, fileName: fileName || null, base64: buffer.toString('base64') });
    } catch (err) {
      send(404, { error: 'media_no_disponible', message: String(err?.message || err) });
    }
  });

  // Info de un grupo (participantes, asunto). gid = jid del grupo url-encoded.
  //   GET /sessions/:id/groups/:gid
  router.get('/sessions/:id/groups/:gid', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    try { send(200, await s.groupInfo(params.gid)); }
    catch (err) { send(500, { error: 'fallo', message: String(err?.message || err) }); }
  });

  // Enviar texto a un grupo (sender keys).
  //   POST /sessions/:id/groups/:gid/messages  { "text": "hola grupo" }
  router.post('/sessions/:id/groups/:gid/messages', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    if (!body.text) return send(400, { error: 'falta_text' });
    try { send(200, { ok: true, ...(await s.sendGroupText(params.gid, body.text)) }); }
    catch (err) { send(500, { error: 'envio_fallido', message: String(err?.message || err) }); }
  });

  // Administración de grupos.
  const groupAction = (path, fn) => router.post(path, async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    try { send(200, { ok: true, ...(await fn(s, params, body)) }); }
    catch (err) { send(err.status || 500, { error: err.code || 'fallo', message: String(err?.message || err) }); }
  });
  // Crear grupo.  { subject, participants:[...] }
  groupAction('/sessions/:id/groups', (s, p, b) => { requireFields(b, ['subject']); requireArray(b, 'participants'); return s.groupCreate(b.subject, b.participants); });
  // Participantes.  POST .../participants { participants:[...], action:"add|remove|promote|demote" }
  groupAction('/sessions/:id/groups/:gid/participants', (s, p, b) => { requireArray(b, 'participants'); requireEnum(b, 'action', ['add', 'remove', 'promote', 'demote']); return s.groupParticipants(p.gid, b.participants, b.action).then((r) => ({ result: r })); });
  // Asunto.  { subject }
  groupAction('/sessions/:id/groups/:gid/subject', (s, p, b) => s.groupSubject(p.gid, b.subject));
  // Descripción.  { description } (vacío/omitido = borrar)
  groupAction('/sessions/:id/groups/:gid/description', (s, p, b) => s.groupDescription(p.gid, b.description || null));
  // Ajuste.  { setting:"announcement|not_announcement|locked|unlocked" }
  groupAction('/sessions/:id/groups/:gid/setting', (s, p, b) => s.groupSetting(p.gid, b.setting));
  // Invitación: obtener / revocar.
  groupAction('/sessions/:id/groups/:gid/invite', (s, p) => s.groupInvite(p.gid));
  groupAction('/sessions/:id/groups/:gid/invite/revoke', (s, p) => s.groupRevokeInvite(p.gid));
  // Aceptar invitación por código.  { code }
  groupAction('/sessions/:id/groups/accept', (s, p, b) => s.groupAcceptInvite(b.code));
  // Salir del grupo.
  groupAction('/sessions/:id/groups/:gid/leave', (s, p) => s.groupLeave(p.gid));
  // Mensajes efímeros.  { seconds:0|86400|604800|7776000 }
  groupAction('/sessions/:id/groups/:gid/ephemeral', (s, p, b) => s.groupEphemeral(p.gid, b.seconds));
  // Solicitudes de unión: listar / aprobar-rechazar { participants, action:"approve|reject" }
  groupAction('/sessions/:id/groups/:gid/requests', (s, p) => s.groupJoinRequests(p.gid).then((r) => ({ requests: r })));
  groupAction('/sessions/:id/groups/:gid/requests/update', (s, p, b) => s.groupJoinRequestsUpdate(p.gid, b.participants || [], b.action).then((r) => ({ result: r })));
  // Modo de añadir miembros { mode:"all_member_add|admin_add" } y de aprobación { mode:"on|off" }.
  groupAction('/sessions/:id/groups/:gid/addmode', (s, p, b) => s.groupAddMode(p.gid, b.mode));
  groupAction('/sessions/:id/groups/:gid/approvalmode', (s, p, b) => s.groupApprovalMode(p.gid, b.mode));
  // Comunidades.
  groupAction('/sessions/:id/communities', (s, p, b) => s.communityCreate(b.subject, b.body || ''));               // crear { subject, body? }
  groupAction('/sessions/:id/communities/:gid/link', (s, p, b) => s.communityLink(p.gid, b.groupJid));             // enlazar sub-grupo
  groupAction('/sessions/:id/communities/:gid/unlink', (s, p, b) => s.communityUnlink(p.gid, b.groupJid));
  groupAction('/sessions/:id/communities/:gid/subgroups', (s, p) => s.communitySubgroups(p.gid).then((r) => ({ subgroups: r })));

  // Newsletters / Canales.
  groupAction('/sessions/:id/newsletters', (s, p, b) => s.newsletterCreate(b.name, b.description));               // crear { name, description? }
  groupAction('/sessions/:id/newsletters/:gid/follow', (s, p) => s.newsletterFollow(p.gid));
  groupAction('/sessions/:id/newsletters/:gid/unfollow', (s, p) => s.newsletterUnfollow(p.gid));
  groupAction('/sessions/:id/newsletters/:gid/messages', (s, p, b) => s.sendNewsletterText(p.gid, b.text));        // enviar { text }
  groupAction('/sessions/:id/newsletters/:gid/mute', (s, p, b) => s.newsletterMute(p.gid, b.mute !== false));
  router.get('/sessions/:id/newsletters/:gid', async ({ params, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    try { send(200, await s.newsletterInfo(params.gid)); }
    catch (err) { send(500, { error: 'fallo', message: String(err?.message || err) }); }
  });

  // Marcar mensajes como leídos.
  //   POST /sessions/:id/read  { "from": "34600...@s.whatsapp.net", "ids": ["MID1"], "type": "read" }
  router.post('/sessions/:id/read', async ({ params, body, send }) => {
    const s = manager.get(params.id);
    if (!s) return send(404, { error: 'no_existe' });
    if (s.status !== 'connected') return send(409, { error: 'no_conectada', status: s.status });
    const from = String(body.from || '').trim();
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!from || !ids.length) return send(400, { error: 'faltan_from_o_ids' });
    try {
      const r = await s.readMessages(from, ids, body.type === 'read-self' ? 'read-self' : 'read');
      send(200, r);
    } catch (err) {
      send(500, { error: 'fallo', message: String(err?.message || err) });
    }
  });
}

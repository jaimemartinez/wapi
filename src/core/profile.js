// Perfil, contactos y privacidad (IQ a s.whatsapp.net). Sin cripto propia.
import { child } from './pairing.js';
import { S_WHATSAPP_NET, jidNormalizedUser } from '../protocol/binary/jid.js';

function children(node, tag) {
  return Array.isArray(node?.content) ? node.content.filter((n) => n.tag === tag) : [];
}

// Comprueba qué números están en WhatsApp. numbers = ['+34600...', ...] o dígitos.
export async function onWhatsApp(client, numbers) {
  const users = numbers.map((n) => {
    const phone = `+${String(n).replace(/[^0-9]/g, '')}`;
    return { tag: 'user', attrs: {}, content: [{ tag: 'contact', attrs: {}, content: Buffer.from(phone, 'utf-8') }] };
  });
  const res = await client.sendIq({
    tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'usync', id: client.nextId() },
    content: [{ tag: 'usync', attrs: { sid: client.nextId(), mode: 'query', last: 'true', index: '0', context: 'interactive' },
      content: [{ tag: 'query', attrs: {}, content: [{ tag: 'contact', attrs: {}, content: undefined }] }, { tag: 'list', attrs: {}, content: users }] }],
  });
  const list = child(child(res, 'usync'), 'list');
  return children(list, 'user').map((u) => ({ jid: u.attrs.jid, exists: child(u, 'contact')?.attrs?.type === 'in' }));
}

// Consulta el 'recado'/status de varios contactos por jid.
export async function fetchStatus(client, jids) {
  const users = jids.map((j) => ({ tag: 'user', attrs: { jid: jidNormalizedUser(j) }, content: undefined }));
  const res = await client.sendIq({
    tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'usync', id: client.nextId() },
    content: [{ tag: 'usync', attrs: { sid: client.nextId(), mode: 'query', last: 'true', index: '0', context: 'interactive' },
      content: [{ tag: 'query', attrs: {}, content: [{ tag: 'status', attrs: {}, content: undefined }] }, { tag: 'list', attrs: {}, content: users }] }],
  });
  const list = child(child(res, 'usync'), 'list');
  return children(list, 'user').map((u) => {
    const st = child(u, 'status');
    return { jid: u.attrs.jid, status: st?.content ? Buffer.from(st.content).toString('utf8') : '', setAt: st?.attrs?.t ? Number(st.attrs.t) : undefined };
  });
}

// URL de la foto de perfil (propia o de otro). type: 'preview' | 'image'.
export async function profilePictureUrl(client, jid, type = 'preview') {
  const res = await client.sendIq({
    tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'w:profile:picture', target: jidNormalizedUser(jid), id: client.nextId() },
    content: [{ tag: 'picture', attrs: { type, query: 'url' }, content: undefined }],
  });
  return { url: child(res, 'picture')?.attrs?.url || null };
}

// Pone la foto de perfil (jid=null para la propia; jid de grupo para el grupo).
export async function updateProfilePicture(client, jid, jpegBuffer) {
  const attrs = { to: S_WHATSAPP_NET, type: 'set', xmlns: 'w:profile:picture', id: client.nextId() };
  if (jid) attrs.target = jidNormalizedUser(jid);
  await client.sendIq({ tag: 'iq', attrs, content: [{ tag: 'picture', attrs: { type: 'image' }, content: jpegBuffer }] });
  return { ok: true };
}

export async function removeProfilePicture(client, jid) {
  const attrs = { to: S_WHATSAPP_NET, type: 'set', xmlns: 'w:profile:picture', id: client.nextId() };
  if (jid) attrs.target = jidNormalizedUser(jid);
  await client.sendIq({ tag: 'iq', attrs, content: undefined });
  return { ok: true };
}

// Pone mi 'recado'/status.
export async function updateProfileStatus(client, text) {
  await client.sendIq({ tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'status', id: client.nextId() },
    content: [{ tag: 'status', attrs: {}, content: Buffer.from(text, 'utf-8') }] });
  return { ok: true };
}

// Perfil de empresa (business).
export async function getBusinessProfile(client, jid) {
  const res = await client.sendIq({
    tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'w:biz', id: client.nextId() },
    content: [{ tag: 'business_profile', attrs: { v: '244' }, content: [{ tag: 'profile', attrs: { jid: jidNormalizedUser(jid) }, content: undefined }] }],
  });
  const profile = child(child(res, 'business_profile'), 'profile');
  if (!profile) return null;
  const txt = (t) => child(profile, t)?.content?.toString('utf8');
  return {
    wid: profile.attrs.jid,
    address: txt('address'), description: txt('description') || '', email: txt('email'),
    website: children(profile, 'website').map((w) => w.content?.toString('utf8')),
    category: child(child(profile, 'categories'), 'category')?.content?.toString('utf8'),
  };
}

// Lee los ajustes de privacidad.
export async function fetchPrivacySettings(client) {
  const res = await client.sendIq({ tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'privacy', id: client.nextId() },
    content: [{ tag: 'privacy', attrs: {}, content: undefined }] });
  const priv = child(res, 'privacy');
  const out = {};
  for (const c of children(priv, 'category')) out[c.attrs.name] = c.attrs.value || c.attrs.config_value;
  return out;
}

// Cambia un ajuste de privacidad (name=last|online|profile|status|readreceipts|groupadd|...).
export async function updatePrivacySetting(client, name, value) {
  await client.sendIq({ tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'privacy', id: client.nextId() },
    content: [{ tag: 'privacy', attrs: {}, content: [{ tag: 'category', attrs: { name, value }, content: undefined }] }] });
  return { ok: true };
}

// Lista de contactos bloqueados.
export async function fetchBlocklist(client) {
  const res = await client.sendIq({ tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'blocklist', id: client.nextId() }, content: undefined });
  return children(child(res, 'list'), 'item').map((i) => i.attrs.jid);
}

// Bloquea o desbloquea un contacto. action: 'block' | 'unblock'.
export async function updateBlockStatus(client, jid, action) {
  await client.sendIq({ tag: 'iq', attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'blocklist', id: client.nextId() },
    content: [{ tag: 'item', attrs: { action, jid: jidNormalizedUser(jid) }, content: undefined }] });
  return { ok: true, jid, action };
}

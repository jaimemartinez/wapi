// Administración de grupos (IQ xmlns="w:g2"): metadatos, crear, participantes,
// asunto, descripción, ajustes, invitaciones y salir. Sin cripto propia (la
// confidencialidad la da Noise). Equivalente nativo de lib/Socket/groups.js.
import { createHash } from 'node:crypto';
import { child } from './pairing.js';
import { randomBytes } from '../protocol/crypto.js';
import { jidDecode, S_WHATSAPP_NET } from '../protocol/binary/jid.js';

const GROUP_HOST = '@g.us';

// Hijos de un nodo con un tag dado.
function children(node, tag) {
  return Array.isArray(node?.content) ? node.content.filter((n) => n.tag === tag) : [];
}

// Id estilo WhatsApp v2 (para key de create / id de description).
export function generateMessageIDV2(userId) {
  const data = Buffer.alloc(8 + 20 + 16);
  data.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const user = (jidDecode(userId)?.user || '') + '@c.us';
  data.write(user, 8);
  randomBytes(16).copy(data, 28);
  return '3EB0' + createHash('sha256').update(data).digest('hex').toUpperCase().slice(0, 18);
}

// IQ genérico w:g2.
async function groupQuery(client, jid, type, content) {
  return client.sendIq({
    tag: 'iq',
    attrs: { to: jid, type, xmlns: 'w:g2', id: client.nextId() },
    content,
  });
}

// Parsea un <group> a metadatos (incluye descId para editar descripción).
export function extractGroupMetadata(res) {
  const group = child(res, 'group');
  if (!group) {
    const err = child(res, 'error');
    throw new Error(`grupo: ${err?.attrs?.code || 500} ${err?.attrs?.text || 'sin <group>'}`);
  }
  const descNode = child(group, 'description');
  const ephemeral = child(group, 'ephemeral');
  return {
    id: group.attrs.id ? `${group.attrs.id}@g.us` : undefined,
    subject: group.attrs.subject || '',
    creation: group.attrs.creation ? Number(group.attrs.creation) : undefined,
    owner: group.attrs.creator || undefined,
    addressingMode: group.attrs.addressing_mode || 'pn',
    desc: descNode ? (child(descNode, 'body')?.content?.toString('utf8') || '') : undefined,
    descId: descNode?.attrs?.id,
    restrict: Boolean(child(group, 'locked')),
    announce: Boolean(child(group, 'announcement')),
    ephemeralDuration: ephemeral ? Number(ephemeral.attrs.expiration) : 0,
    memberAddMode: child(group, 'member_add_mode')?.content?.toString('utf8') === 'all_member_add',
    joinApprovalMode: Boolean(child(group, 'membership_approval_mode')),
    linkedParent: child(group, 'linked_parent')?.attrs?.jid || undefined,
    isCommunity: Boolean(child(group, 'parent')),
    isCommunityAnnounce: Boolean(child(group, 'default_sub_group')),
    participants: children(group, 'participant').map((p) => ({ id: p.attrs.jid, admin: p.attrs.type || null })),
  };
}

export async function groupMetadata(client, jid) {
  const res = await groupQuery(client, jid, 'get', [{ tag: 'query', attrs: { request: 'interactive' }, content: undefined }]);
  return extractGroupMetadata(res);
}

export async function groupCreate(client, subject, participants) {
  const res = await groupQuery(client, GROUP_HOST, 'set', [{
    tag: 'create',
    attrs: { subject, key: generateMessageIDV2(client.auth.me.id) },
    content: participants.map((jid) => ({ tag: 'participant', attrs: { jid }, content: undefined })),
  }]);
  return extractGroupMetadata(res);
}

// action: 'add' | 'remove' | 'promote' | 'demote'.
export async function groupParticipantsUpdate(client, jid, participants, action) {
  const res = await groupQuery(client, jid, 'set', [{
    tag: action, attrs: {},
    content: participants.map((j) => ({ tag: 'participant', attrs: { jid: j }, content: undefined })),
  }]);
  const node = child(res, action);
  return children(node, 'participant').map((p) => ({ jid: p.attrs.jid, status: p.attrs.error || '200' }));
}

export async function groupUpdateSubject(client, jid, subject) {
  await groupQuery(client, jid, 'set', [{ tag: 'subject', attrs: {}, content: Buffer.from(subject, 'utf-8') }]);
  return { ok: true };
}

export async function groupUpdateDescription(client, jid, description) {
  const meta = await groupMetadata(client, jid);
  const prev = meta.descId || undefined;
  let node;
  if (description) {
    node = { tag: 'description', attrs: { id: generateMessageIDV2(client.auth.me.id), ...(prev ? { prev } : {}) }, content: [{ tag: 'body', attrs: {}, content: Buffer.from(description, 'utf-8') }] };
  } else {
    node = { tag: 'description', attrs: { delete: 'true', ...(prev ? { prev } : {}) }, content: undefined };
  }
  await groupQuery(client, jid, 'set', [node]);
  return { ok: true };
}

// setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'.
export async function groupSettingUpdate(client, jid, setting) {
  await groupQuery(client, jid, 'set', [{ tag: setting, attrs: {}, content: undefined }]);
  return { ok: true };
}

export async function groupInviteCode(client, jid) {
  const res = await groupQuery(client, jid, 'get', [{ tag: 'invite', attrs: {}, content: undefined }]);
  const code = child(res, 'invite')?.attrs?.code;
  return { code, link: code ? `https://chat.whatsapp.com/${code}` : undefined };
}

export async function groupRevokeInvite(client, jid) {
  const res = await groupQuery(client, jid, 'set', [{ tag: 'invite', attrs: {}, content: undefined }]);
  return { code: child(res, 'invite')?.attrs?.code };
}

export async function groupAcceptInvite(client, code) {
  const res = await groupQuery(client, GROUP_HOST, 'set', [{ tag: 'invite', attrs: { code }, content: undefined }]);
  return { jid: child(res, 'group')?.attrs?.jid };
}

export async function groupGetInviteInfo(client, code) {
  const res = await groupQuery(client, GROUP_HOST, 'get', [{ tag: 'invite', attrs: { code }, content: undefined }]);
  return extractGroupMetadata(res);
}

export async function groupLeave(client, jid) {
  await groupQuery(client, GROUP_HOST, 'set', [{ tag: 'leave', attrs: {}, content: [{ tag: 'group', attrs: { id: jid }, content: undefined }] }]);
  return { ok: true };
}

// ---- Extras de grupo ----

// Activa/desactiva mensajes efímeros. expiration en segundos (0 = desactivar).
export async function groupToggleEphemeral(client, jid, expiration) {
  const node = expiration > 0
    ? { tag: 'ephemeral', attrs: { expiration: String(expiration) }, content: undefined }
    : { tag: 'not_ephemeral', attrs: {}, content: undefined };
  await groupQuery(client, jid, 'set', [node]);
  return { ok: true, expiration: expiration > 0 ? expiration : 0 };
}

// Lista de solicitudes de unión pendientes (cuando hay aprobación).
export async function groupRequestParticipantsList(client, jid) {
  const res = await groupQuery(client, jid, 'get', [{ tag: 'membership_approval_requests', attrs: {}, content: undefined }]);
  return children(child(res, 'membership_approval_requests'), 'membership_approval_request').map((n) => n.attrs);
}

// Aprueba o rechaza solicitudes. action: 'approve' | 'reject'.
export async function groupRequestParticipantsUpdate(client, jid, participants, action) {
  const res = await groupQuery(client, jid, 'set', [{ tag: 'membership_requests_action', attrs: {}, content: [{
    tag: action, attrs: {}, content: participants.map((j) => ({ tag: 'participant', attrs: { jid: j }, content: undefined })),
  }] }]);
  const node = child(child(res, 'membership_requests_action'), action);
  return children(node, 'participant').map((p) => ({ jid: p.attrs.jid, status: p.attrs.error || '200' }));
}

// Quién puede añadir miembros. mode: 'all_member_add' | 'admin_add'.
export async function groupMemberAddMode(client, jid, mode) {
  await groupQuery(client, jid, 'set', [{ tag: 'member_add_mode', attrs: {}, content: mode }]);
  return { ok: true, mode };
}

// Exigir aprobación para unirse. mode: 'on' | 'off'.
export async function groupJoinApprovalMode(client, jid, mode) {
  await groupQuery(client, jid, 'set', [{ tag: 'membership_approval_mode', attrs: {}, content: [{ tag: 'group_join', attrs: { state: mode }, content: undefined }] }]);
  return { ok: true, mode };
}

// ---- Comunidades (mismo IQ w:g2) ----

export async function communityCreate(client, subject, body = '') {
  const res = await groupQuery(client, GROUP_HOST, 'set', [{ tag: 'create', attrs: { subject }, content: [
    { tag: 'description', attrs: { id: generateMessageIDV2(client.auth.me.id).slice(0, 12) }, content: [{ tag: 'body', attrs: {}, content: Buffer.from(body, 'utf-8') }] },
    { tag: 'parent', attrs: { default_membership_approval_mode: 'request_required' }, content: undefined },
    { tag: 'allow_non_admin_sub_group_creation', attrs: {}, content: undefined },
    { tag: 'create_general_chat', attrs: {}, content: undefined },
  ] }]);
  return extractGroupMetadata(res);
}

export async function communityLinkGroup(client, parentJid, groupJid) {
  await groupQuery(client, parentJid, 'set', [{ tag: 'links', attrs: {}, content: [{ tag: 'link', attrs: { link_type: 'sub_group' }, content: [{ tag: 'group', attrs: { jid: groupJid }, content: undefined }] }] }]);
  return { ok: true };
}

export async function communityUnlinkGroup(client, parentJid, groupJid) {
  await groupQuery(client, parentJid, 'set', [{ tag: 'unlink', attrs: { unlink_type: 'sub_group' }, content: [{ tag: 'group', attrs: { jid: groupJid }, content: undefined }] }]);
  return { ok: true };
}

// Sub-grupos de una comunidad (resuelve el padre si jid es un sub-grupo).
export async function getSubgroups(client, jid) {
  let communityJid = jid;
  const meta = await groupMetadata(client, jid).catch(() => null);
  if (meta?.linkedParent) communityJid = meta.linkedParent;
  const res = await groupQuery(client, communityJid, 'get', [{ tag: 'sub_groups', attrs: {}, content: undefined }]);
  return children(child(res, 'sub_groups'), 'group').map((g) => ({ id: `${g.attrs.id}@g.us`, subject: g.attrs.subject, creation: g.attrs.creation ? Number(g.attrs.creation) : undefined, owner: g.attrs.creator, size: g.attrs.size ? Number(g.attrs.size) : undefined }));
}

export { S_WHATSAPP_NET };

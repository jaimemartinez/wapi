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

export { S_WHATSAPP_NET };

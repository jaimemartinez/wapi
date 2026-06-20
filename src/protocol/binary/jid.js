// Helpers para los JID de WhatsApp (p.ej. "34600123456@s.whatsapp.net",
// "1234-5678@g.us", o jids multi-device "user_agent:device@server").
export const S_WHATSAPP_NET = 's.whatsapp.net';
export const GROUP = 'g.us';
export const BROADCAST = 'broadcast';

// domainType (byte de AD_JID) -> server. 0=whatsapp, 1=lid, 128=hosted, 129=hosted.lid.
export function getServerFromDomainType(initialServer, domainType) {
  switch (domainType) {
    case 1: return 'lid';
    case 128: return 'hosted';
    case 129: return 'hosted.lid';
    default: return initialServer;
  }
}

// El separador de agent es '_' (no '.'); el de device es ':'.
export function jidEncode(user, server, device, agent) {
  return `${user || ''}${agent ? `_${agent}` : ''}${device ? `:${device}` : ''}@${server}`;
}

export function jidDecode(jid) {
  const sep = typeof jid === 'string' ? jid.indexOf('@') : -1;
  if (sep < 0) return undefined;
  const server = jid.slice(sep + 1);
  const userCombined = jid.slice(0, sep);
  const [userAgent, device] = userCombined.split(':');
  const [user, agent] = userAgent.split('_');
  let domainType = 0;
  if (server === 'lid') domainType = 1;
  else if (server === 'hosted') domainType = 128;
  else if (server === 'hosted.lid') domainType = 129;
  else if (agent) domainType = parseInt(agent, 10);
  return {
    server,
    user,
    agent: agent ? Number(agent) : undefined,
    domainType,
    device: device ? Number(device) : undefined,
  };
}

// Quita dispositivo/agente: "user:12@server" -> "user@server".
export function jidNormalizedUser(jid) {
  const d = jidDecode(jid);
  if (!d) return jid;
  return jidEncode(d.user, d.server === 'c.us' ? S_WHATSAPP_NET : d.server);
}

export function isJidGroup(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isLidUser(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}
export function isPnUser(jid) {
  return typeof jid === 'string' && jid.endsWith(`@${S_WHATSAPP_NET}`);
}

// Reconstruye el JID LID device-specific de un PN dado su lidUser. El device se
// COPIA del PN; device 99 => dominio hosted.lid.
export function pnToLidJid(pn, lidUser) {
  const d = jidDecode(pn);
  if (!d || !lidUser) return undefined;
  const server = d.server === 'hosted' || d.device === 99 ? 'hosted.lid' : 'lid';
  return jidEncode(lidUser, server, d.device);
}

// Reconstruye el JID PN device-specific de un LID dado su pnUser. El device se
// COPIA del LID; hosted.lid (domainType 129) => dominio hosted.
export function lidToPnJid(lid, pnUser) {
  const d = jidDecode(lid);
  if (!d || !pnUser) return undefined;
  const server = d.domainType === 129 ? 'hosted' : S_WHATSAPP_NET;
  return jidEncode(pnUser, server, d.device);
}

// Normaliza un número/identificador del usuario a un JID de WhatsApp.
export function toWhatsAppJid(input) {
  if (typeof input !== 'string') throw new Error('jid inválido');
  if (input.includes('@')) return input;
  const digits = input.replace(/[^0-9]/g, '');
  if (!digits) throw new Error(`no se pudo derivar un JID de "${input}"`);
  return `${digits}@${S_WHATSAPP_NET}`;
}

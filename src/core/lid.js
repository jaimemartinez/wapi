// Mapeo LID <-> PN (Linked ID). WhatsApp está migrando el direccionamiento de
// número de teléfono (PN, @s.whatsapp.net) a un identificador opaco (LID, @lid).
// El mapping se guarda SOLO a nivel de usuario (sin device); el device se
// re-aplica al construir el jid concreto. Equivale a lib/Signal/lid-mapping.js.
import { jidDecode, isLidUser, isPnUser, pnToLidJid, lidToPnJid } from '../protocol/binary/jid.js';

// Garantiza la estructura del store en el auth (persistido).
function store(auth) {
  if (!auth.lidMapping) auth.lidMapping = { pnToLid: {}, lidToPn: {} };
  return auth.lidMapping;
}

// Valida y normaliza un par a { pnUser, lidUser } (acepta cualquier orden).
function normalizePair(a, b) {
  let pn; let lid;
  if (isLidUser(a) && isPnUser(b)) { lid = a; pn = b; }
  else if (isPnUser(a) && isLidUser(b)) { pn = a; lid = b; }
  else return null; // pares (PN,PN) o (LID,LID) se descartan
  const pnUser = jidDecode(pn)?.user;
  const lidUser = jidDecode(lid)?.user;
  if (!pnUser || !lidUser) return null;
  return { pnUser, lidUser };
}

// Guarda uno o varios pares LID<->PN. pairs: [{ lid, pn }, ...] o un par suelto.
export function storeLIDPNMappings(auth, pairs) {
  const s = store(auth);
  const arr = Array.isArray(pairs) ? pairs : [pairs];
  let added = 0;
  for (const p of arr) {
    const np = normalizePair(p.lid, p.pn);
    if (!np) continue;
    if (s.pnToLid[np.pnUser] === np.lidUser) continue; // ya existe idéntico
    s.pnToLid[np.pnUser] = np.lidUser;
    s.lidToPn[np.lidUser] = np.pnUser; // clave inversa
    added++;
  }
  return added;
}

// Devuelve el LID device-specific para un PN (o undefined si no hay mapping).
export function getLIDForPN(auth, pn) {
  const user = jidDecode(pn)?.user;
  const lidUser = user && store(auth).pnToLid[user];
  return lidUser ? pnToLidJid(pn, lidUser) : undefined;
}

// Devuelve el PN device-specific para un LID (nunca dispara red, solo local).
export function getPNForLID(auth, lid) {
  const user = jidDecode(lid)?.user;
  const pnUser = user && store(auth).lidToPn[user];
  return pnUser ? lidToPnJid(lid, pnUser) : undefined;
}

// Migra la sesión Signal del address de origen al de destino (copia el record,
// keyed por `${user}.${device}`). Sin esto el doble-ratchet sigue en el viejo.
export function migrateSession(auth, fromJid, toJid) {
  const a = jidDecode(fromJid); const b = jidDecode(toJid);
  if (!a || !b) return false;
  const fromAddr = `${a.user}.${a.device || 0}`;
  const toAddr = `${b.user}.${b.device || 0}`;
  if (auth.sessions[fromAddr] && !auth.sessions[toAddr]) {
    auth.sessions[toAddr] = auth.sessions[fromAddr];
    return true;
  }
  return false;
}

// Extrae el contexto de direccionamiento de un stanza entrante. Devuelve
// { addressingMode, senderAlt, recipientAlt } donde *Alt es el jid alternativo.
export function extractAddressingContext(attrs, sender) {
  const mode = attrs.addressing_mode || (isLidUser(sender) ? 'lid' : 'pn');
  if (mode === 'lid') {
    return { addressingMode: 'lid', senderAlt: attrs.participant_pn || attrs.sender_pn || attrs.peer_recipient_pn, recipientAlt: attrs.recipient_pn };
  }
  return { addressingMode: 'pn', senderAlt: attrs.participant_lid || attrs.sender_lid || attrs.peer_recipient_lid, recipientAlt: attrs.recipient_lid };
}

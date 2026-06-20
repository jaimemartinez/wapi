// Recibos (receipts) de WhatsApp: entrega, lectura y reintento (retry).
//
// Tres flujos:
//  - ENTREGA: al recibir y descifrar un <message>, confirmamos al remitente.
//  - LECTURA: marcamos mensajes como leídos (read / read-self).
//  - RETRY: si un <enc> no descifra, pedimos reenvío; y si OTRO nos pide retry
//    sobre algo que enviamos, reenviamos el mensaje cifrado de nuevo.
import { child } from './pairing.js';

// Entero big-endian en `n` bytes (registrationId=4, ids de prekey=3).
export function encodeBigEndian(value, bytes = 4) {
  const b = Buffer.alloc(bytes);
  b.writeUIntBE(value, 0, bytes);
  return b;
}

const KEY_TYPE = Buffer.from([5]);

// Construye el bloque <keys> con nuestro material Signal (para el retry). Si se
// pasan `extras` incluye también una one-time prekey y el <device-identity>,
// como hace el cliente oficial, para que el remitente pueda recrear la sesión.
export function buildKeysNode(auth, extras = {}) {
  const spk = auth.signedPreKey;
  const content = [
    { tag: 'type', attrs: {}, content: KEY_TYPE },
    { tag: 'identity', attrs: {}, content: auth.signedIdentityKey.public },
  ];
  if (extras.prekey) {
    content.push({ tag: 'key', attrs: {}, content: [
      { tag: 'id', attrs: {}, content: encodeBigEndian(extras.prekey.keyId, 3) },
      { tag: 'value', attrs: {}, content: extras.prekey.pub },
    ] });
  }
  content.push({ tag: 'skey', attrs: {}, content: [
    { tag: 'id', attrs: {}, content: encodeBigEndian(spk.keyId, 3) },
    { tag: 'value', attrs: {}, content: spk.keyPair.public },
    { tag: 'signature', attrs: {}, content: spk.signature },
  ] });
  if (extras.deviceIdentity) content.push({ tag: 'device-identity', attrs: {}, content: extras.deviceIdentity });
  return { tag: 'keys', attrs: {}, content };
}

// <receipt type="retry"> que enviamos cuando NO podemos descifrar un mensaje.
export function buildRetryReceipt(node, auth, count, extras = {}) {
  const a = node.attrs;
  const attrs = { id: a.id, type: 'retry', to: a.from };
  if (a.recipient) attrs.recipient = a.recipient;
  if (a.participant) attrs.participant = a.participant;
  const content = [
    { tag: 'retry', attrs: { count: String(count), id: a.id, t: a.t || '0', v: '1', error: '0' }, content: undefined },
    { tag: 'registration', attrs: {}, content: encodeBigEndian(auth.registrationId, 4) },
  ];
  if (count > 1) content.push(buildKeysNode(auth, extras)); // claves completas a partir del 2º intento
  return { tag: 'receipt', attrs, content };
}

// Extrae el bundle Signal del <keys> de un retry receipt entrante (o null).
export function parseRetryKeys(node) {
  const keys = child(node, 'keys');
  if (!keys) return null;
  const identity = child(keys, 'identity')?.content;
  const skey = child(keys, 'skey');
  const key = child(keys, 'key');
  const reg = child(node, 'registration')?.content;
  if (!identity || !skey) return null;
  const readId = (n) => n && Buffer.from(n.content).readUIntBE(0, n.content.length);
  return {
    registrationId: reg ? Buffer.from(reg).readUInt32BE(0) : 0,
    identityKey: Buffer.from(identity),
    signedPreKey: {
      keyId: readId(child(skey, 'id')),
      publicKey: Buffer.from(child(skey, 'value').content),
      signature: Buffer.from(child(skey, 'signature').content),
    },
    preKey: key && child(key, 'value') ? {
      keyId: readId(child(key, 'id')),
      publicKey: Buffer.from(child(key, 'value').content),
    } : undefined,
  };
}

// Contador de reintentos en memoria (clave `${id}:${participant}`), con tope.
export class RetryCounter {
  constructor(max = 5) { this.max = max; this.map = new Map(); }
  next(id, participant) {
    const k = `${id}:${participant || ''}`;
    const n = (this.map.get(k) || 0) + 1;
    this.map.set(k, n);
    return n;
  }
  exceeded(id, participant) {
    return (this.map.get(`${id}:${participant || ''}`) || 0) >= this.max;
  }
}

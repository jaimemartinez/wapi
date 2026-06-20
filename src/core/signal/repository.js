// Operaciones Signal de alto nivel: establecer sesión desde un bundle de
// pre-keys, cifrar y descifrar mensajes. Envuelve SessionBuilder/SessionCipher
// de `libsignal` con nuestro SignalStore.
//
// El cuerpo del mensaje viaja con el "padding aleatorio máx-16" de WhatsApp:
// se añaden N bytes de valor N (N entre 1 y 15) antes de cifrar.
import libsignal from 'libsignal';
import { randomBytes } from '../../protocol/crypto.js';
import { jidDecode } from '../../protocol/binary/jid.js';
import { GroupSessionBuilder } from './group/group-session-builder.js';
import { GroupCipher } from './group/group_cipher.js';
import { SenderKeyName } from './group/sender-key-name.js';
import { SenderKeyDistributionMessage } from './group/sender-key-distribution-message.js';

const { SessionBuilder, SessionCipher, ProtocolAddress } = libsignal;

const KEY_PREFIX = Buffer.from([5]);
function pref(pub) { return pub.length === 33 ? Buffer.from(pub) : Buffer.concat([KEY_PREFIX, pub]); }

// jid de WhatsApp -> ProtocolAddress de Signal ("user.device", agente aparte).
export function jidToAddr(jid) {
  const { user, device = 0 } = jidDecode(jid) || {};
  return new ProtocolAddress(user, device);
}

// Padding/quitado de padding al estilo WhatsApp.
export function padRandomMax16(data) {
  const pad = randomBytes(1);
  pad[0] &= 0x0f;
  if (pad[0] === 0) pad[0] = 0x0f;
  return Buffer.concat([Buffer.from(data), Buffer.alloc(pad[0], pad[0])]);
}

export function unpadRandomMax16(data) {
  const buf = Buffer.from(data);
  const n = buf[buf.length - 1];
  if (n < 1 || n > buf.length) throw new Error('padding inválido');
  return buf.subarray(0, buf.length - n);
}

// Crea una sesión saliente a partir del bundle publicado por el destinatario.
//   bundle = { registrationId, identityKey(32/33B), signedPreKey:{keyId,publicKey,signature}, preKey?:{keyId,publicKey} }
export async function processPreKeyBundle(store, jid, bundle) {
  const addr = jidToAddr(jid);
  const builder = new SessionBuilder(store, addr);
  await builder.initOutgoing({
    registrationId: bundle.registrationId,
    identityKey: pref(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: pref(bundle.signedPreKey.publicKey),
      signature: Buffer.from(bundle.signedPreKey.signature),
    },
    preKey: bundle.preKey && {
      keyId: bundle.preKey.keyId,
      publicKey: pref(bundle.preKey.publicKey),
    },
  });
}

// Cifra un buffer ya serializado (Message proto) hacia un jid con sesión activa.
// Devuelve { type: 'pkmsg'|'msg', ciphertext: Buffer }.
export async function encryptSignalMessage(store, jid, plaintext) {
  const cipher = new SessionCipher(store, jidToAddr(jid));
  const { type, body } = await cipher.encrypt(padRandomMax16(plaintext));
  return { type: type === 3 ? 'pkmsg' : 'msg', ciphertext: Buffer.from(body) };
}

// Descifra un nodo <enc> recibido. `encType` es 'pkmsg' o 'msg'.
export async function decryptSignalMessage(store, jid, encType, ciphertext) {
  const cipher = new SessionCipher(store, jidToAddr(jid));
  const plain = encType === 'pkmsg'
    ? await cipher.decryptPreKeyWhisperMessage(Buffer.from(ciphertext))
    : await cipher.decryptWhisperMessage(Buffer.from(ciphertext));
  return unpadRandomMax16(plain);
}

// ---- Grupos (sender keys) ----

// SenderKeyName del (grupo, remitente) = clave del almacén de sender keys.
function senderKeyName(group, jid) {
  return new SenderKeyName(group, jidToAddr(jid));
}

// Cifra el cuerpo de un mensaje de grupo con la sender key del emisor (meId).
// Devuelve { ciphertext (skmsg serializado), skdm (SKDM serializada) }.
export async function encryptGroupMessage(store, group, meId, plaintext) {
  const name = senderKeyName(group, meId);
  const skdm = await new GroupSessionBuilder(store).create(name);
  const ciphertext = await new GroupCipher(store, name).encrypt(padRandomMax16(plaintext));
  return { ciphertext: Buffer.from(ciphertext), skdm: Buffer.from(skdm.serialize()) };
}

// Instala la sender key de un autor a partir de su SKDM (axolotl serializada).
export async function processSenderKeyDistributionMessage(store, group, authorJid, axolotlBytes) {
  const name = senderKeyName(group, authorJid);
  await new GroupSessionBuilder(store).process(name, new SenderKeyDistributionMessage(null, null, null, null, Buffer.from(axolotlBytes)));
}

// Descifra un <enc type="skmsg"> de grupo usando la sender key del autor.
export async function decryptGroupMessage(store, group, authorJid, skmsgBytes) {
  const name = senderKeyName(group, authorJid);
  const plain = await new GroupCipher(store, name).decrypt(Buffer.from(skmsgBytes));
  return unpadRandomMax16(plain);
}

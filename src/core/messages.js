// Ensamblado y parseo de stanzas <message> de texto 1:1.
//
// Estructura de un mensaje de texto saliente (un dispositivo destino):
//   <message id type="text" to="JID">
//     <enc v="2" type="pkmsg|msg">CIFRADO</enc>
//   </message>
import { child } from './pairing.js';

const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

// Detecta media en un Message ya decodificado. Devuelve { type, info } o null.
export function detectMedia(msg) {
  for (const k of MEDIA_KEYS) {
    if (msg[k]) return { type: k.replace('Message', '').toLowerCase(), info: msg[k] };
  }
  return null;
}

// Construye la stanza a partir del resultado de encryptSignalMessage.
export function buildTextStanza(id, toJid, enc) {
  return {
    tag: 'message',
    attrs: { id, type: 'text', to: toJid },
    content: [
      { tag: 'enc', attrs: { v: '2', type: enc.type }, content: enc.ciphertext },
    ],
  };
}

// Extrae { from, id, encType, ciphertext, participant } de un <message> entrante.
export function parseMessageStanza(node) {
  const enc = child(node, 'enc');
  if (!enc) return null;
  return {
    from: node.attrs.from,
    id: node.attrs.id,
    encType: enc.attrs.type, // 'pkmsg' | 'msg' | 'skmsg'
    ciphertext: enc.content,
    participant: node.attrs.participant, // autor real en grupos
  };
}

// Convierte un nodo <user> de la respuesta de pre-keys en { jid, bundle }.
function bundleFromUser(userNode) {
  const jid = userNode.attrs.jid;
  const registration = child(userNode, 'registration')?.content;
  const identity = child(userNode, 'identity')?.content;
  const skey = child(userNode, 'skey');
  const key = child(userNode, 'key');
  if (!registration || !identity || !skey) throw new Error(`bundle de pre-keys incompleto para ${jid}`);

  const readId = (n) => n && Buffer.from(n.content).readUIntBE(0, n.content.length);

  return {
    jid,
    bundle: {
      registrationId: Buffer.from(registration).readUInt32BE(0),
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
    },
  };
}

// Parsea la respuesta del IQ de pre-keys para UN usuario.
export function parsePreKeyBundle(iq) {
  const list = child(iq, 'list');
  const userNode = list ? child(list, 'user') : child(iq, 'user');
  if (!userNode) throw new Error('respuesta de pre-keys sin <user>');
  return bundleFromUser(userNode);
}

// Parsea la respuesta para VARIOS dispositivos a la vez (un <user> por device).
export function parsePreKeyBundles(iq) {
  const list = child(iq, 'list');
  const users = (list?.content || []).filter((n) => n.tag === 'user');
  return users.map(bundleFromUser);
}

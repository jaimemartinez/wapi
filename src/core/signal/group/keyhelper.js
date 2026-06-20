// Portado de Baileys. Generadores de clave/id de sender key.
import nodeCrypto from 'node:crypto';
import curve from 'libsignal/src/curve.js';

const { generateKeyPair } = curve;

export function generateSenderKey() {
  return nodeCrypto.randomBytes(32);
}

export function generateSenderKeyId() {
  return nodeCrypto.randomInt(2147483647);
}

export function generateSenderSigningKey(key) {
  if (!key) key = generateKeyPair();
  return { public: Buffer.from(key.pubKey), private: Buffer.from(key.privKey) };
}

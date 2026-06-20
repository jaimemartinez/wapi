// Primitivas criptográficas sobre node:crypto. Sin dependencias externas para
// la parte de Noise: X25519 (ECDH), AES-256-GCM, HKDF-SHA256, SHA-256.
//
// Nota: las FIRMAS de Curve25519 (XEdDSA) que exige el registro/pre-keys NO
// están en node:crypto; eso se resuelve en la capa de auth con la dep `libsignal`.
import crypto from 'node:crypto';

// Prefijos DER para envolver claves X25519 "crudas" (32 bytes) e importarlas
// como KeyObject. Son constantes del estándar (OID 1.3.101.110).
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

export function generateX25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return {
    public: publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
    private: privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32),
  };
}

export function importPrivateX25519(raw) {
  return crypto.createPrivateKey({
    key: Buffer.concat([X25519_PKCS8_PREFIX, Buffer.from(raw)]),
    format: 'der', type: 'pkcs8',
  });
}

export function importPublicX25519(raw) {
  return crypto.createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, Buffer.from(raw)]),
    format: 'der', type: 'spki',
  });
}

// Diffie-Hellman X25519 -> secreto compartido de 32 bytes.
export function sharedKey(privateRaw, publicRaw) {
  return crypto.diffieHellman({
    privateKey: importPrivateX25519(privateRaw),
    publicKey: importPublicX25519(publicRaw),
  });
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest();
}

export function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function hkdf(ikm, length, { salt = Buffer.alloc(32), info = Buffer.alloc(0) } = {}) {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

// IV de 12 bytes: 4 bytes a cero + contador de 8 bytes big-endian.
export function gcmIv(counter) {
  const iv = Buffer.alloc(12);
  iv.writeBigUInt64BE(BigInt(counter), 4);
  return iv;
}

export function aesGcmEncrypt(plaintext, key, iv, aad) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad?.length) cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([enc, cipher.getAuthTag()]);
}

export function aesGcmDecrypt(ciphertext, key, iv, aad) {
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad?.length) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function randomBytes(n) { return crypto.randomBytes(n); }

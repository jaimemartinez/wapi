// Estado de autenticación de una sesión: las claves de larga vida que definen
// el "dispositivo" ante WhatsApp multi-device, más su persistencia en disco.
//
// Qué se guarda:
//   - noiseKey:            par X25519 usado como clave ESTÁTICA del handshake Noise.
//   - signedIdentityKey:   par Curve25519 (identidad Signal del dispositivo).
//   - signedPreKey:        pre-clave firmada por la identidad (la exige el registro).
//   - registrationId:      id aleatorio de 14 bits del dispositivo.
//   - advSecretKey:        secreto de 32B que entra en el QR y firma el pairing.
//   - me / account:        se rellenan tras el pair-success (jid del dispositivo).
//
// Las firmas Curve25519 (XEdDSA) no están en node:crypto; las hace `libsignal`.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import libsignal from 'libsignal';
import { generateX25519KeyPair, randomBytes } from '../protocol/crypto.js';

const { curve } = libsignal;

// libsignal devuelve claves públicas con prefijo de tipo 0x05 (33 bytes).
// Para Curve25519 "crudo" (32B) lo quitamos al guardar y lo reponemos al firmar.
function stripKeyType(pub) {
  return pub.length === 33 ? pub.subarray(1) : pub;
}

function generateSignalKeyPair() {
  const { pubKey, privKey } = curve.generateKeyPair();
  return { public: stripKeyType(pubKey), private: Buffer.from(privKey) };
}

// Antepone el prefijo de tipo 0x05 a una clave pública Curve25519 cruda (32B).
function withKeyType(pub) {
  return pub.length === 33 ? Buffer.from(pub) : Buffer.concat([Buffer.from([5]), pub]);
}

// Firma cruda de `message` con una clave privada Curve25519 (sin envolver).
export function curveSign(privateKey, message) {
  return curve.calculateSignature(Buffer.from(privateKey), Buffer.from(message));
}

// Verifica una firma Curve25519. `publicKey` puede venir cruda (32B) o con
// prefijo 0x05 (33B). Devuelve true/false sin lanzar.
export function curveVerify(publicKey, message, signature) {
  const pub = publicKey.length === 32 ? Buffer.concat([Buffer.from([5]), publicKey]) : Buffer.from(publicKey);
  try {
    // libsignal lanza si la firma es inválida; algunas versiones devuelven bool.
    const res = curve.verifySignature(pub, Buffer.from(message), Buffer.from(signature));
    return res !== false;
  } catch {
    return false;
  }
}

// Genera credenciales nuevas para un dispositivo recién creado.
export function newAuthState() {
  const signedIdentityKey = generateSignalKeyPair();
  const signedPreKey = generateSignalKeyPair();
  const keyId = 1;
  // Firma de la identidad sobre (0x05 ‖ signedPreKey.public), tal y como lo
  // verifican tanto libsignal como el registro de WhatsApp (eSkeySig).
  const signature = curveSign(signedIdentityKey.private, withKeyType(signedPreKey.public));

  return {
    noiseKey: generateX25519KeyPair(),
    signedIdentityKey,
    signedPreKey: { keyId, keyPair: signedPreKey, signature },
    registrationId: (randomBytes(2).readUInt16BE(0) & 0x3fff) + 1,
    advSecretKey: randomBytes(32),
    me: null,        // { id, name } tras el emparejamiento
    account: null,   // ADVSignedDeviceIdentity devuelto por el servidor

    // ---- Estado Signal (mensajería e2e) ----
    nextPreKeyId: 1,
    preKeys: {},     // keyId -> { public, private } (one-time pre-keys)
    sessions: {},    // fqAddr -> SessionRecord serializado
    identities: {},  // fqAddr -> clave de identidad confiada (TOFU)
    senderKeys: {},  // "grupo::user::device" -> SenderKeyRecord serializado (grupos)
    appStateSyncKeys: {}, // base64(keyId) -> base64(keyData 32B) (app state)
    myAppStateKeyId: null,
    appStateVersions: {}, // colección -> { version, hash(base64), indexValueMap }

    // ---- Emparejamiento por código (alternativa al QR) ----
    pairingEphemeral: generateX25519KeyPair(), // efímera; persiste entre hello y finish
    pairingCode: null,    // código de 8 chars activo
    registered: false,    // true tras companion_finish (decide login vs registro)
    lidMapping: { pnToLid: {}, lidToPn: {} }, // mapeo LID<->PN a nivel usuario
  };
}

// Genera `count` one-time pre-keys nuevas, las guarda en el estado y las
// devuelve en el formato que espera el servidor al subirlas.
export function generatePreKeys(auth, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const keyId = auth.nextPreKeyId++;
    const pair = generateSignalKeyPair();
    auth.preKeys[keyId] = pair;
    out.push({ keyId, keyPair: pair });
  }
  return out;
}

// ---- Persistencia (JSON con buffers en base64) ----

const BUFFER_KEYS = new Set(['public', 'private', 'signature', 'advSecretKey']);

function replacer(key, value) {
  if (Buffer.isBuffer(value)) return { __buf: value.toString('base64') };
  if (value?.type === 'Buffer' && Array.isArray(value.data)) {
    return { __buf: Buffer.from(value.data).toString('base64') };
  }
  return value;
}

function reviver(key, value) {
  if (value && typeof value === 'object' && typeof value.__buf === 'string') {
    return Buffer.from(value.__buf, 'base64');
  }
  return value;
}

function fileFor(dir, id) {
  return join(dir, `${id}.json`);
}

export async function saveAuthState(dir, id, state) {
  await mkdir(dir, { recursive: true });
  await writeFile(fileFor(dir, id), JSON.stringify(state, replacer, 2), 'utf8');
}

export async function loadAuthState(dir, id) {
  try {
    const raw = await readFile(fileFor(dir, id), 'utf8');
    return JSON.parse(raw, reviver);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function deleteAuthState(dir, id) {
  await rm(fileFor(dir, id), { force: true });
}

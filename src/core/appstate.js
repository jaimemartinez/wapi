// App State Sync: cifrado de mutaciones (archivar, fijar, silenciar, estrella,
// marcar leído, borrar para mí) con LTHash anti-tampering. Lado de ENVÍO.
import { createHmac, createCipheriv } from 'node:crypto';
import { hkdf, randomBytes, hmacSha256 } from '../protocol/crypto.js';
import { encode as protoEncode } from './proto.js';

// Deriva las 5 sub-claves de una app-state-sync-key (32 bytes).
export function mutationKeys(keyData) {
  const e = hkdf(Buffer.from(keyData), 160, { info: Buffer.from('WhatsApp Mutation Keys', 'utf-8') });
  return {
    indexKey: e.subarray(0, 32),
    valueEncryptionKey: e.subarray(32, 64),
    valueMacKey: e.subarray(64, 96),
    snapshotMacKey: e.subarray(96, 128),
    patchMacKey: e.subarray(128, 160),
  };
}

function to64BitBE(n) { const b = Buffer.alloc(8); b.writeUInt32BE(Number(n), 4); return b; }

// MAC del valor (HMAC-SHA512 truncado a 32).
function generateMac(operation, encValue, keyId, valueMacKey) {
  const opByte = operation === 0 ? 0x01 : 0x02; // SET=0->0x01, REMOVE=1->0x02
  const keyData = Buffer.concat([Buffer.from([opByte]), Buffer.from(keyId)]);
  const last = Buffer.alloc(8); last[7] = keyData.length;
  const total = Buffer.concat([keyData, encValue, last]);
  return createHmac('sha512', valueMacKey).update(total).digest().subarray(0, 32);
}

function generateSnapshotMac(hash, version, name, key) {
  return hmacSha256(key, Buffer.concat([hash, to64BitBE(version), Buffer.from(name, 'utf-8')]));
}
function generatePatchMac(snapshotMac, valueMacs, version, name, key) {
  return hmacSha256(key, Buffer.concat([snapshotMac, ...valueMacs, to64BitBE(version), Buffer.from(name, 'utf-8')]));
}

// ---- LTHash ----
function macToBuffer(mac) { return hkdf(Buffer.from(mac), 128, { info: Buffer.alloc(0) }); }

function pointwise(base, buffers, sign) {
  for (const buf of buffers) {
    const exp = macToBuffer(buf);
    for (let i = 0; i < 64; i++) {
      const off = i * 2;
      const v = base.readUInt16LE(off) + sign * exp.readUInt16LE(off);
      base.writeUInt16LE(((v % 65536) + 65536) % 65536, off);
    }
  }
}

// hash' = base - Σsubs + Σadds (por componente uint16 LE, mod 2^16).
export function subtractThenAdd(base, adds, subs) {
  const out = Buffer.from(base);
  pointwise(out, subs, -1);
  pointwise(out, adds, 1);
  return out;
}

export function newLTHashState() { return { version: 0, hash: Buffer.alloc(128), indexValueMap: {} }; }

function makeLtHashGenerator(state) {
  const indexValueMap = { ...state.indexValueMap };
  const addBuffs = []; const subBuffs = [];
  return {
    mix({ indexMac, valueMac, operation }) {
      const k = Buffer.from(indexMac).toString('base64');
      const prev = indexValueMap[k];
      if (operation === 1) { // REMOVE
        if (prev) { subBuffs.push(Buffer.from(prev.valueMac, 'base64')); delete indexValueMap[k]; }
      } else { // SET
        if (prev) subBuffs.push(Buffer.from(prev.valueMac, 'base64'));
        addBuffs.push(Buffer.from(valueMac));
        indexValueMap[k] = { valueMac: Buffer.from(valueMac).toString('base64') };
      }
    },
    finish() {
      return { hash: subtractThenAdd(Buffer.from(state.hash), addBuffs, subBuffs), indexValueMap };
    },
  };
}

// Cifra una mutación y devuelve { patch (objeto SyncdPatch), state nuevo }.
// mutation = { index:[...strings], value: objeto SyncActionValue, operation: 0|1, apiVersion }.
export function encodeSyncdPatch(state, name, keyIdB64, keyData, mutation) {
  const keys = mutationKeys(keyData);
  const encKeyId = Buffer.from(keyIdB64, 'base64');
  const indexBuffer = Buffer.from(JSON.stringify(mutation.index), 'utf-8');
  const indexMac = hmacSha256(keys.indexKey, indexBuffer);

  const sad = protoEncode('SyncActionData', { index: indexBuffer, value: mutation.value, padding: Buffer.alloc(0), version: mutation.apiVersion });
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', keys.valueEncryptionKey, iv);
  const encValue = Buffer.concat([iv, cipher.update(sad), cipher.final()]);
  const valueMac = generateMac(mutation.operation, encValue, encKeyId, keys.valueMacKey);

  const lt = makeLtHashGenerator(state);
  lt.mix({ indexMac, valueMac, operation: mutation.operation });
  const { hash, indexValueMap } = lt.finish();

  const version = state.version + 1;
  const snapshotMac = generateSnapshotMac(hash, version, name, keys.snapshotMacKey);
  const patchMac = generatePatchMac(snapshotMac, [valueMac], version, name, keys.patchMacKey);

  const patch = {
    version: { version },
    mutations: [{
      operation: mutation.operation,
      record: { index: { blob: indexMac }, value: { blob: Buffer.concat([encValue, valueMac]) }, keyId: { id: encKeyId } },
    }],
    snapshotMac, patchMac, keyId: { id: encKeyId },
  };
  return { patch, state: { version, hash, indexValueMap } };
}

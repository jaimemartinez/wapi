// App State Sync: cifrado de mutaciones (archivar, fijar, silenciar, estrella,
// marcar leído, borrar para mí) con LTHash anti-tampering. Lado de ENVÍO.
import { createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { hkdf, randomBytes, hmacSha256 } from '../protocol/crypto.js';
import { encode as protoEncode, decode as protoDecode } from './proto.js';
import { child } from './pairing.js';
import { downloadEncryptedMedia } from './media.js';

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

// ---- Lado de RECEPCIÓN (decodificar cambios entrantes) ----

// Normaliza un content de nodo binario (puede llegar como objeto {0:..,1:..}).
function buf(content) { return Buffer.isBuffer(content) ? content : Buffer.from(Object.values(content || {})); }

// Descifra el valor de un record: encContent = IV(16) || ciphertext, value.blob = encContent || valueMac(32).
function decryptValue(valueEncryptionKey, blob) {
  const content = buf(blob);
  const encContent = content.subarray(0, content.length - 32);
  const iv = encContent.subarray(0, 16);
  const ct = encContent.subarray(16);
  const d = createDecipheriv('aes-256-cbc', valueEncryptionKey, iv);
  return Buffer.concat([d.update(ct), d.final()]);
}

// Aplica una lista de records (mutaciones o snapshot) al LTHash y extrae las
// SyncActionData. getKeyData(b64KeyId) -> Buffer(32) de la app-state-sync-key.
function applyRecords(records, ops, state, getKeyData, onMutation) {
  const lt = makeLtHashGenerator(state);
  records.forEach((record, i) => {
    const rec = record.record || record; // SyncdMutation.record o SyncdRecord directo
    const operation = ops ? ops[i] : (record.operation || 0);
    try {
      const keyId = Buffer.from(rec.keyId.id).toString('base64');
      const keyData = getKeyData(keyId);
      if (!keyData) { const e = new Error('app-state-sync-key ausente'); e.isMissingKey = true; throw e; }
      const keys = mutationKeys(keyData);
      const plain = decryptValue(keys.valueEncryptionKey, rec.value.blob);
      const sad = protoDecode('SyncActionData', plain);
      const index = JSON.parse(Buffer.from(sad.index).toString('utf-8'));
      const valueMac = buf(rec.value.blob).subarray(buf(rec.value.blob).length - 32);
      lt.mix({ indexMac: rec.index.blob, valueMac, operation });
      onMutation({ syncAction: sad, index, operation });
    } catch (e) {
      if (e.isMissingKey) throw e; // parkear la colección
      // descifrado/decode fallido de un record: lo saltamos (no abortamos)
    }
  });
  return lt.finish();
}

// Decodifica un snapshot completo (arranca un estado nuevo desde su versión).
async function decodeSnapshot(snapshot, getKeyData, onMutation) {
  const version = Number(snapshot.version?.version || 0);
  const state = { version, hash: Buffer.alloc(128), indexValueMap: {} };
  const { hash, indexValueMap } = applyRecords(snapshot.records || [], null, state, getKeyData, onMutation);
  return { version, hash, indexValueMap };
}

// Decodifica una lista de patches sobre un estado base.
async function decodePatches(patches, baseState, getKeyData, onMutation) {
  let state = baseState;
  for (const patch of patches) {
    // Mutaciones externas: descargar el blob y concatenarlas.
    let mutations = patch.mutations || [];
    if (patch.externalMutations?.directPath && patch.externalMutations.mediaKey) {
      try {
        const blob = await downloadEncryptedMedia({ directPath: patch.externalMutations.directPath, mediaKey: patch.externalMutations.mediaKey }, 'md-app-state');
        const ext = protoDecode('SyncdMutations', blob);
        mutations = [...mutations, ...(ext.mutations || [])];
      } catch { /* sin blob externo: usamos solo las inline */ }
    }
    const version = Number(patch.version?.version || (state.version + 1));
    const ops = mutations.map((m) => m.operation || 0);
    const { hash, indexValueMap } = applyRecords(mutations, ops, state, getKeyData, onMutation);
    state = { version, hash, indexValueMap };
  }
  return state;
}

// Parsea la respuesta del IQ de fetch en colecciones {name, version, hasMore, snapshot, patches}.
export function extractSyncdPatches(iqResult) {
  const sync = child(iqResult, 'sync');
  const out = [];
  for (const col of (sync?.content || [])) {
    if (col.tag !== 'collection') continue;
    const snapNode = child(col, 'snapshot');
    const patchesNode = child(col, 'patches');
    out.push({
      name: col.attrs.name,
      version: Number(col.attrs.version || 0),
      hasMorePatches: col.attrs.has_more_patches === 'true',
      snapshotRef: snapNode?.content ? protoDecode('ExternalBlobReference', buf(snapNode.content)) : null,
      patches: ((patchesNode?.content) || []).filter((n) => n.tag === 'patch').map((p) => protoDecode('SyncdPatch', buf(p.content))),
    });
  }
  return out;
}

// Decodifica una colección completa (snapshot externo + patches) sobre el estado
// previo. Devuelve { state, mutations } (las mutaciones para procesarlas).
export async function decodeCollection(col, prevState, getKeyData) {
  const mutations = [];
  const onMutation = (m) => mutations.push(m);
  let state = prevState || newLTHashState();
  if (col.snapshotRef) {
    const blob = await downloadEncryptedMedia({ directPath: col.snapshotRef.directPath, mediaKey: col.snapshotRef.mediaKey }, 'md-app-state');
    const snapshot = protoDecode('SyncdSnapshot', blob);
    state = await decodeSnapshot(snapshot, getKeyData, onMutation);
  }
  if (col.patches.length) state = await decodePatches(col.patches, state, getKeyData, onMutation);
  return { state, mutations };
}

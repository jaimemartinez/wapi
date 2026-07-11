// Batería de tests offline (sin red): cripto, códec, proto y roundtrips de cada
// capa. Es lo que ejecuta el CI. Sale con código !=0 si algo falla.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';

const TMP = tmpdir(); // los tests que crean Session no deben escribir en el repo

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

const { loadProto, encode, decode, type } = await import('../src/core/proto.js');
await loadProto();

console.log('# proto + módulos');
await test('todos los módulos del core importan', async () => {
  for (const m of [
    'auth', 'payload', 'pairing', 'pairing-code', 'WhatsAppClient', 'SessionManager', 'Session',
    'devices', 'messages', 'receipts', 'media', 'history', 'groups', 'profile', 'newsletters', 'appstate',
    'signal/store', 'signal/repository', 'signal/group/group_cipher',
  ]) await import(`../src/core/${m}.js`);
  for (const m of ['encode', 'decode', 'tokens', 'jid']) await import(`../src/protocol/binary/${m}.js`);
});

console.log('# crypto');
await test('X25519 simétrico y compatible con libsignal', async () => {
  const { generateX25519KeyPair, sharedKey } = await import('../src/protocol/crypto.js');
  const a = generateX25519KeyPair(); const b = generateX25519KeyPair();
  assert.equal(Buffer.compare(sharedKey(a.private, b.public), sharedKey(b.private, a.public)), 0);
  const libsignal = (await import('libsignal')).default;
  const ls = libsignal.curve.calculateAgreement(Buffer.concat([Buffer.from([5]), b.public]), a.private);
  assert.equal(Buffer.compare(sharedKey(a.private, b.public), Buffer.from(ls)), 0);
});
await test('HKDF cumple RFC 5869 (test case 1)', async () => {
  const { hkdf } = await import('../src/protocol/crypto.js');
  const out = hkdf(Buffer.alloc(22, 0x0b), 42, { salt: Buffer.from('000102030405060708090a0b0c', 'hex'), info: Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex') });
  assert.equal(out.toString('hex'), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
});

console.log('# códec binario');
await test('roundtrip nibble (impar/par) + tokens', async () => {
  const { encodeBinaryNode } = await import('../src/protocol/binary/encode.js');
  const { decodeBinaryNode } = await import('../src/protocol/binary/decode.js');
  for (const id of ['1781925865572.1', '1781925865572.12', '12345', '.1', '99-88']) {
    const rt = decodeBinaryNode(encodeBinaryNode({ tag: 'iq', attrs: { id }, content: undefined }));
    assert.equal(rt.attrs.id, id, `id ${id}`);
  }
});
await test('AD_JID: LID/hosted/whatsapp roundtrip correcto', async () => {
  const { encodeBinaryNode } = await import('../src/protocol/binary/encode.js');
  const { decodeBinaryNode } = await import('../src/protocol/binary/decode.js');
  for (const jid of ['573014333576:65@s.whatsapp.net', '123456:5@lid', '111:3@hosted', '222:7@hosted.lid']) {
    const rt = decodeBinaryNode(encodeBinaryNode({ tag: 'to', attrs: { jid }, content: undefined }));
    assert.equal(rt.attrs.jid, jid);
  }
});

console.log('# Signal 1:1');
await test('encrypt/decrypt 1:1 roundtrip', async () => {
  const { newAuthState, generatePreKeys } = await import('../src/core/auth.js');
  const { SignalStore } = await import('../src/core/signal/store.js');
  const { processPreKeyBundle, encryptSignalMessage, decryptSignalMessage } = await import('../src/core/signal/repository.js');
  const aA = newAuthState(); aA.me = { id: '111:0@s.whatsapp.net' };
  const bA = newAuthState(); bA.me = { id: '222:0@s.whatsapp.net' };
  const aS = new SignalStore(aA); const bS = new SignalStore(bA);
  const [bp] = generatePreKeys(bA, 1);
  await processPreKeyBundle(aS, bA.me.id, { registrationId: bA.registrationId, identityKey: bA.signedIdentityKey.public,
    signedPreKey: { keyId: bA.signedPreKey.keyId, publicKey: bA.signedPreKey.keyPair.public, signature: bA.signedPreKey.signature },
    preKey: { keyId: bp.keyId, publicKey: bp.keyPair.public } });
  const enc = await encryptSignalMessage(aS, bA.me.id, encode('Message', { conversation: 'hola' }));
  const dec = decode('Message', await decryptSignalMessage(bS, aA.me.id, enc.type, enc.ciphertext));
  assert.equal(dec.conversation, 'hola');
});

console.log('# sender keys (grupos)');
await test('cifrado de grupo roundtrip', async () => {
  const { GroupSessionBuilder } = await import('../src/core/signal/group/group-session-builder.js');
  const { GroupCipher } = await import('../src/core/signal/group/group_cipher.js');
  const { SenderKeyName } = await import('../src/core/signal/group/sender-key-name.js');
  const { SenderKeyRecord } = await import('../src/core/signal/group/sender-key-record.js');
  const { SenderKeyDistributionMessage } = await import('../src/core/signal/group/sender-key-distribution-message.js');
  const mk = () => { const m = new Map(); return { async loadSenderKey(n) { return new SenderKeyRecord(m.get(n.toString())); }, async storeSenderKey(n, r) { m.set(n.toString(), r.serialize()); } }; };
  const name = new SenderKeyName('g@g.us', { id: '111', deviceId: 0, toString() { return '111.0'; } });
  const s = mk(); const skdm = await new GroupSessionBuilder(s).create(name);
  const r = mk(); await new GroupSessionBuilder(r).process(name, new SenderKeyDistributionMessage(null, null, null, null, skdm.serialize()));
  const ct = await new GroupCipher(s, name).encrypt(Buffer.from('hola grupo'));
  assert.equal(Buffer.from(await new GroupCipher(r, name).decrypt(Buffer.from(ct))).toString(), 'hola grupo');
});

console.log('# media');
await test('cifrado de media + MAC', async () => {
  const { encryptMedia, getMediaKeys } = await import('../src/core/media.js');
  const plain = Buffer.from('contenido '.repeat(30));
  const enc = encryptMedia(plain, 'image');
  const { iv, cipherKey, macKey } = getMediaKeys(enc.mediaKey, 'image');
  const ct = enc.body.subarray(0, enc.body.length - 10);
  const mac = enc.body.subarray(enc.body.length - 10);
  assert.equal(Buffer.compare(mac, crypto.createHmac('sha256', macKey).update(Buffer.concat([iv, ct])).digest().subarray(0, 10)), 0);
  const d = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  assert.equal(Buffer.compare(Buffer.concat([d.update(ct), d.final()]), plain), 0);
});

console.log('# tipos ricos + votos de encuesta');
await test('protos de mensajes ricos encodean', async () => {
  for (const o of [
    { reactionMessage: { key: { id: 'X' }, text: '❤️' } },
    { locationMessage: { degreesLatitude: 40, degreesLongitude: -3 } },
    { pollCreationMessageV3: { name: 'C?', options: [{ optionName: 'A' }] } },
    { extendedTextMessage: { text: 'x', contextInfo: { mentionedJid: ['9@s.whatsapp.net'] } } },
  ]) { const T = type('Message'); assert.ok(T.decode(encode('Message', o))); }
});
await test('descifrado de voto de encuesta', async () => {
  const { hmacSha256, aesGcmEncrypt, sha256, randomBytes } = await import('../src/protocol/crypto.js');
  const { newAuthState } = await import('../src/core/auth.js');
  const { Session } = await import('../src/core/Session.js');
  const secret = randomBytes(32); const pollId = 'P1'; const creator = '111@s.whatsapp.net'; const voter = '222@s.whatsapp.net';
  const sel = sha256(Buffer.from('Azul'));
  const sign = Buffer.concat([Buffer.from(pollId), Buffer.from(creator), Buffer.from(voter), Buffer.from('Poll Vote'), Buffer.from([1])]);
  const decKey = hmacSha256(hmacSha256(Buffer.alloc(32), secret), sign);
  const iv = randomBytes(12);
  const enc = aesGcmEncrypt(encode('PollVoteMessage', { selectedOptions: [sel] }), decKey, iv, Buffer.from(`${pollId}\0${voter}`));
  const a = newAuthState(); a.me = { id: '111:1@s.whatsapp.net' };
  const sess = new Session('t', a, { sessionsDir: TMP }); sess.polls.set(pollId, { secret, options: ['Rojo', 'Azul'], creator: a.me.id });
  const out = await sess.decryptPollVote({ pollCreationMessageKey: { id: pollId }, vote: { encPayload: enc, encIv: iv } }, voter);
  assert.deepEqual(out, ['Azul']);
});

console.log('# LID (mapeo + conversión)');
await test('mapeo PN<->LID con device + migración de sesión', async () => {
  const { storeLIDPNMappings, getLIDForPN, getPNForLID, migrateSession, extractAddressingContext } = await import('../src/core/lid.js');
  const auth = { lidMapping: { pnToLid: {}, lidToPn: {} }, sessions: {} };
  assert.equal(storeLIDPNMappings(auth, [{ lid: '888@lid', pn: '34600111222@s.whatsapp.net' }]), 1);
  assert.equal(storeLIDPNMappings(auth, [{ lid: '888@lid', pn: '34600111222@s.whatsapp.net' }]), 0); // duplicado
  assert.equal(getLIDForPN(auth, '34600111222:5@s.whatsapp.net'), '888:5@lid'); // device transportado
  assert.equal(getPNForLID(auth, '888:7@lid'), '34600111222:7@s.whatsapp.net');
  assert.equal(storeLIDPNMappings(auth, [{ lid: '1@s.whatsapp.net', pn: '2@s.whatsapp.net' }]), 0); // (PN,PN) inválido
  auth.sessions['34600111222.5'] = 'REC';
  assert.ok(migrateSession(auth, '34600111222:5@s.whatsapp.net', '888:5@lid'));
  assert.equal(auth.sessions['888.5'], 'REC'); // record migrado al address LID
  const ctx = extractAddressingContext({ addressing_mode: 'lid', participant_pn: '34600111222@s.whatsapp.net' }, '888@lid');
  assert.equal(ctx.addressingMode, 'lid'); assert.equal(ctx.senderAlt, '34600111222@s.whatsapp.net');
});

console.log('# app state (LTHash)');
await test('LTHash add/sub identidad + SyncdPatch válido', async () => {
  const { subtractThenAdd, newLTHashState, encodeSyncdPatch } = await import('../src/core/appstate.js');
  const { randomBytes } = await import('../src/protocol/crypto.js');
  const base = Buffer.alloc(128); const mac = randomBytes(32);
  assert.equal(Buffer.compare(subtractThenAdd(subtractThenAdd(base, [mac], []), [], [mac]), base), 0);
  const { patch } = encodeSyncdPatch(newLTHashState(), 'regular_low', randomBytes(18).toString('base64'), randomBytes(32),
    { index: ['star', '1@s.whatsapp.net', 'M1', '0', '0'], value: { starAction: { starred: true } }, operation: 0, apiVersion: 2 });
  assert.ok(type('SyncdPatch').decode(encode('SyncdPatch', patch)));
});
await test('App State recepción: encode patch -> decode mutación (roundtrip)', async () => {
  const { encodeSyncdPatch, newLTHashState, extractSyncdPatches, decodeCollection } = await import('../src/core/appstate.js');
  const { randomBytes } = await import('../src/protocol/crypto.js');
  const keyId = randomBytes(18).toString('base64'); const keyData = randomBytes(32);
  const { patch } = encodeSyncdPatch(newLTHashState(), 'regular_low', keyId, keyData,
    { index: ['archive', '1@s.whatsapp.net'], value: { archiveChatAction: { archived: true } }, operation: 0, apiVersion: 3 });
  const iq = { tag: 'iq', attrs: {}, content: [{ tag: 'sync', attrs: {}, content: [
    { tag: 'collection', attrs: { name: 'regular_low', version: '1', has_more_patches: 'false' }, content: [
      { tag: 'patches', attrs: {}, content: [{ tag: 'patch', attrs: {}, content: encode('SyncdPatch', patch) }] }] }] }] };
  const col = extractSyncdPatches(iq).find((c) => c.name === 'regular_low');
  const { mutations } = await decodeCollection(col, newLTHashState(), (b) => (b === keyId ? keyData : null));
  assert.deepEqual(mutations[0].index, ['archive', '1@s.whatsapp.net']);
  assert.equal(mutations[0].syncAction.value.archiveChatAction.archived, true);
});

console.log('# mensajes interactivos');
await test('botones/lista/interactivo/pin/keep encodean', async () => {
  const cases = {
    buttonsMessage: { contentText: 'Hi', buttons: [{ buttonId: 'b', buttonText: { displayText: 'Sí' }, type: 1 }] },
    listMessage: { title: 'T', buttonText: 'Ver', listType: 1, sections: [{ title: 'S', rows: [{ title: 'r', rowId: '1' }] }] },
    interactiveMessage: { body: { text: 'b' }, nativeFlowMessage: { messageVersion: 1, buttons: [{ name: 'quick_reply', buttonParamsJson: '{}' }] } },
    pinInChatMessage: { key: { id: 'M' }, type: 1 },
    keepInChatMessage: { key: { id: 'M' }, keepType: 1 },
  };
  for (const [k, v] of Object.entries(cases)) assert.ok(type('Message').decode(encode('Message', { [k]: v }))[k] != null, k);
});

console.log('# API: eventos, validación, rate limiting');
await test('bus de eventos: subscribe/emit/unsubscribe', async () => {
  const { Session } = await import('../src/core/Session.js');
  const { newAuthState } = await import('../src/core/auth.js');
  const s = new Session('t2', newAuthState(), { sessionsDir: TMP });
  const got = [];
  const unsub = s.subscribe((e) => got.push(e));
  s.emitEvent('message', { id: 'M1', text: 'hi' });
  s.emitEvent('receipt', { id: 'M1', type: 'read' });
  unsub();
  s.emitEvent('message', { id: 'M2' }); // ya no debe llegar
  assert.equal(got.length, 2);
  assert.equal(got[0].type, 'message'); assert.equal(got[0].data.text, 'hi'); assert.equal(got[0].session, 't2');
});
await test('setWebhook filtra por tipo', async () => {
  const { Session } = await import('../src/core/Session.js');
  const { newAuthState } = await import('../src/core/auth.js');
  const s = new Session('t3', newAuthState(), { sessionsDir: TMP });
  assert.deepEqual(s.setWebhook('https://x/h', ['message']), { url: 'https://x/h', events: ['message'] });
  assert.equal(s.setWebhook(null), null);
});
await test('validación: requireFields/requireEnum/requireArray -> 400', async () => {
  const { requireFields, requireEnum, requireArray, BadRequest } = await import('../src/api/validate.js');
  assert.throws(() => requireFields({ a: 1 }, ['a', 'b']), (e) => e instanceof BadRequest && e.status === 400);
  assert.throws(() => requireEnum({ x: 'z' }, 'x', ['a', 'b']), (e) => e.status === 400);
  assert.throws(() => requireArray({ l: [] }, 'l'), (e) => e.status === 400);
  requireFields({ a: 1, b: 2 }, ['a', 'b']); requireArray({ l: [1] }, 'l'); // no lanzan
});
await test('rate limiter: ventana fija', async () => {
  const { Router } = await import('../src/api/router.js');
  const { config } = await import('../src/config.js');
  const r = new Router();
  const prev = config.rateLimit; config.rateLimit = 3; config.rateWindowMs = 1000;
  const now = 5000;
  assert.ok(r.checkRate('k', now).ok); assert.ok(r.checkRate('k', now).ok); assert.ok(r.checkRate('k', now).ok);
  assert.equal(r.checkRate('k', now).ok, false); // 4ª supera el límite
  assert.ok(r.checkRate('k', now + 1001).ok); // nueva ventana
  config.rateLimit = prev;
});

console.log(`\n${passed} tests OK${process.exitCode ? ' (con fallos)' : ''}`);

// Procesa el nodo <pair-success> que llega tras escanear el QR. Reproduce el
// "configureSuccessfulPairing" del cliente oficial:
//   1. Verifica el HMAC de la identidad firmada con nuestro advSecretKey.
//   2. Verifica la firma de la CUENTA sobre (6,0 ‖ details ‖ identidad).
//   3. Genera la firma del DISPOSITIVO sobre (6,1 ‖ details ‖ identidad ‖ accKey).
//   4. Devuelve el nodo <iq> de respuesta y los datos a persistir (me, account).
import { createHmac } from 'node:crypto';
import { encode as protoEncode, decode as protoDecode } from './proto.js';
import { curveSign, curveVerify } from './auth.js';

// Helpers de navegación de nodos binarios { tag, attrs, content }.
export function child(node, tag) {
  return Array.isArray(node?.content) ? node.content.find((n) => n.tag === tag) : undefined;
}

export function configureSuccessfulPairing(stanza, auth) {
  const pairSuccess = child(stanza, 'pair-success');
  if (!pairSuccess) throw new Error('pair-success sin contenido');

  const deviceIdentityNode = child(pairSuccess, 'device-identity');
  const deviceNode = child(pairSuccess, 'device');
  const bizNode = child(pairSuccess, 'biz');
  if (!deviceIdentityNode || !deviceNode?.attrs?.jid) {
    throw new Error('pair-success incompleto (falta device-identity o device.jid)');
  }

  // 1) HMAC sobre la identidad firmada.
  const hmacIdentity = protoDecode('ADVSignedDeviceIdentityHMAC', deviceIdentityNode.content);
  const advSign = createHmac('sha256', auth.advSecretKey).update(hmacIdentity.details).digest();
  if (Buffer.compare(advSign, Buffer.from(hmacIdentity.hmac)) !== 0) {
    throw new Error('HMAC de la identidad del dispositivo inválido');
  }

  // 2) Firma de la cuenta.
  const account = protoDecode('ADVSignedDeviceIdentity', hmacIdentity.details);
  const accountKey = Buffer.from(account.accountSignatureKey);
  const details = Buffer.from(account.details);
  const identityPub = auth.signedIdentityKey.public;

  const accountMsg = Buffer.concat([Buffer.from([6, 0]), details, identityPub]);
  if (!curveVerify(accountKey, accountMsg, Buffer.from(account.accountSignature))) {
    throw new Error('firma de la cuenta inválida: el emparejamiento no es de confianza');
  }

  // 3) Firma del dispositivo (la nuestra).
  const deviceMsg = Buffer.concat([Buffer.from([6, 1]), details, identityPub, accountKey]);
  const deviceSignature = curveSign(auth.signedIdentityKey.private, deviceMsg);

  // 4) Respuesta: se devuelve la identidad firmada SIN la accountSignatureKey.
  const reencoded = protoEncode('ADVSignedDeviceIdentity', {
    details,
    accountSignature: Buffer.from(account.accountSignature),
    deviceSignature,
  });
  const keyIndex = protoDecode('ADVDeviceIdentity', details).keyIndex;

  const reply = {
    tag: 'iq',
    attrs: { to: 's.whatsapp.net', type: 'result', id: stanza.attrs.id },
    content: [{
      tag: 'pair-device-sign',
      attrs: {},
      content: [{
        tag: 'device-identity',
        attrs: { 'key-index': String(keyIndex) },
        content: reencoded,
      }],
    }],
  };

  return {
    reply,
    me: { id: deviceNode.attrs.jid, name: bizNode?.attrs?.name },
    account: {
      details,
      accountSignatureKey: accountKey,
      accountSignature: Buffer.from(account.accountSignature),
      deviceSignature,
    },
  };
}

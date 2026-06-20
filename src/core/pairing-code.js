// Emparejamiento por CÓDIGO de teléfono (alternativa al QR): el usuario teclea
// un código de 8 caracteres en su móvil en vez de escanear. Cripto exacta del
// flujo link_code_companion_reg de WhatsApp (companion_hello / companion_finish).
import { pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { randomBytes, sharedKey, hkdf, gcmIv, aesGcmEncrypt } from '../protocol/crypto.js';

const CROCKFORD = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';

// Código de 8 caracteres (Crockford base32).
export function generatePairingCode() {
  const b = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += CROCKFORD[b[i] % 32];
  return code;
}

// Clave derivada del código (PBKDF2-HMAC-SHA256, 2^17 iteraciones).
function deriveKey(code, salt) {
  return pbkdf2Sync(code, salt, 131072, 32, 'sha256');
}

// Envuelve nuestra efímera pública con el código (wrapped = salt32||iv16||ct32).
export function wrapEphemeralPublic(code, ephPublic) {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = deriveKey(code, salt);
  const cipher = createCipheriv('aes-256-ctr', key, iv);
  const ct = Buffer.concat([cipher.update(ephPublic), cipher.final()]);
  return Buffer.concat([salt, iv, ct]); // 80 bytes
}

// Desenvuelve la efímera pública del dispositivo primario (del server).
export function unwrapEphemeralPublic(code, wrapped) {
  const salt = wrapped.subarray(0, 32);
  const iv = wrapped.subarray(32, 48);
  const payload = wrapped.subarray(48, 80);
  const key = deriveKey(code, salt);
  const decipher = createDecipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([decipher.update(payload), decipher.final()]); // 32 bytes
}

// Genera el key-bundle cifrado del companion_finish y deriva el advSecretKey.
// auth: necesita noiseKey, signedIdentityKey, pairingEphemeral (par efímero).
export function buildFinishBundle(auth, code, primaryIdentityPub, wrappedPrimaryEph) {
  const primaryEphPub = unwrapEphemeralPublic(code, wrappedPrimaryEph);
  const companionShared = sharedKey(auth.pairingEphemeral.private, primaryEphPub);
  const random = randomBytes(32);
  const linkCodeSalt = randomBytes(32);
  const expanded = hkdf(companionShared, 32, { salt: linkCodeSalt, info: Buffer.from('link_code_pairing_key_bundle_encryption_key') });

  const payload = Buffer.concat([auth.signedIdentityKey.public, primaryIdentityPub, random]);
  const iv12 = randomBytes(12);
  const encrypted = aesGcmEncrypt(payload, expanded, iv12, Buffer.alloc(0));
  const wrappedKeyBundle = Buffer.concat([linkCodeSalt, iv12, encrypted]);

  const identityShared = sharedKey(auth.signedIdentityKey.private, primaryIdentityPub);
  const identityPayload = Buffer.concat([companionShared, identityShared, random]);
  const advSecretKey = hkdf(identityPayload, 32, { info: Buffer.from('adv_secret') });

  return { wrappedKeyBundle, advSecretKey };
}

// Nodo <link_code_companion_reg stage="companion_hello"> para iniciar.
export function buildHelloNode(auth, phone, code) {
  return {
    tag: 'iq',
    attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'md', id: undefined },
    content: [{
      tag: 'link_code_companion_reg',
      attrs: { jid: `${phone}@s.whatsapp.net`, stage: 'companion_hello', should_show_push_notification: 'true' },
      content: [
        { tag: 'link_code_pairing_wrapped_companion_ephemeral_pub', attrs: {}, content: wrapEphemeralPublic(code, auth.pairingEphemeral.public) },
        { tag: 'companion_server_auth_key_pub', attrs: {}, content: auth.noiseKey.public },
        { tag: 'companion_platform_id', attrs: {}, content: '1' },
        { tag: 'companion_platform_display', attrs: {}, content: 'Chrome (Linux)' },
        { tag: 'link_code_pairing_nonce', attrs: {}, content: '0' },
      ],
    }],
  };
}

// Nodo <link_code_companion_reg stage="companion_finish"> con el key-bundle.
export function buildFinishNode(auth, ref, wrappedKeyBundle) {
  return {
    tag: 'iq',
    attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'md', id: undefined },
    content: [{
      tag: 'link_code_companion_reg',
      attrs: { jid: auth.me.id, stage: 'companion_finish' },
      content: [
        { tag: 'link_code_pairing_wrapped_key_bundle', attrs: {}, content: wrappedKeyBundle },
        { tag: 'companion_identity_public', attrs: {}, content: auth.signedIdentityKey.public },
        { tag: 'link_code_pairing_ref', attrs: {}, content: ref },
      ],
    }],
  };
}

void gcmIv; // (reservado: el IV de GCM aquí es aleatorio de 12B, no por contador)

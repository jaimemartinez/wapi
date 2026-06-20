// Descarga y descifrado de media cifrada de WhatsApp (imágenes, audio, y —lo
// que usamos aquí— el blob de history sync). El esquema es idéntico para todos:
//   1. HKDF(mediaKey, 112, info="WhatsApp <Tipo> Keys") -> iv|cipherKey|macKey
//   2. Descargar de https://mmg.whatsapp.net<directPath>
//   3. El fichero = ciphertext ‖ mac(10 bytes). Verificar y AES-256-CBC.
import { createCipheriv, createDecipheriv, createHmac, createHash } from 'node:crypto';
import { hkdf, randomBytes } from '../protocol/crypto.js';
import { S_WHATSAPP_NET } from '../protocol/binary/jid.js';

const MEDIA_HOST = 'mmg.whatsapp.net';

// Mapa tipo -> palabra del "app info" del HKDF (debe coincidir con WhatsApp).
// OJO: sticker usa 'Image' y ptt/gif reutilizan Audio/Video.
const HKDF_INFO = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  ptt: 'Audio',
  gif: 'Video',
  sticker: 'Image',
  document: 'Document',
  history: 'History',     // el blob de history sync
  'md-app-state': 'App State',
};

// Ruta de subida por tipo (POST a /mms/<path>/...).
const UPLOAD_PATH = { image: 'image', video: 'video', audio: 'audio', ptt: 'audio', document: 'document', sticker: 'image' };

function sha256(b) { return createHash('sha256').update(b).digest(); }

// Deriva iv/cipherKey/macKey a partir de la mediaKey (32 bytes).
export function getMediaKeys(mediaKey, type) {
  const info = `WhatsApp ${HKDF_INFO[type]} Keys`;
  const expanded = hkdf(Buffer.from(mediaKey), 112, { info: Buffer.from(info, 'utf-8') });
  return {
    iv: expanded.subarray(0, 16),
    cipherKey: expanded.subarray(16, 48),
    macKey: expanded.subarray(48, 80),
  };
}

// Descarga el blob cifrado y devuelve el contenido en claro.
export async function downloadEncryptedMedia({ directPath, url, mediaKey }, type) {
  const downloadUrl = directPath ? `https://${MEDIA_HOST}${directPath}` : url;
  if (!downloadUrl) throw new Error('media sin directPath ni url');

  const res = await fetch(downloadUrl, { headers: { Origin: 'https://web.whatsapp.com' } });
  if (!res.ok) throw new Error(`descarga de media falló: HTTP ${res.status}`);
  const file = Buffer.from(await res.arrayBuffer());

  const { iv, cipherKey, macKey } = getMediaKeys(mediaKey, type);

  // El fichero termina en un MAC de 10 bytes sobre (iv ‖ ciphertext).
  const ciphertext = file.subarray(0, file.length - 10);
  const mac = file.subarray(file.length - 10);
  const expectedMac = createHmac('sha256', macKey).update(Buffer.concat([iv, ciphertext])).digest().subarray(0, 10);
  if (Buffer.compare(mac, expectedMac) !== 0) {
    throw new Error('MAC de media inválido: el blob no es de confianza');
  }

  const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---- ENVÍO de media ----

// Cifra un fichero en claro: AES-256-CBC + MAC(10) appended. Devuelve el blob a
// subir y los hashes/clave que irán en el proto del mensaje.
export function encryptMedia(plaintext, type) {
  const mediaKey = randomBytes(32);
  const { iv, cipherKey, macKey } = getMediaKeys(mediaKey, type);
  const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = createHmac('sha256', macKey).update(Buffer.concat([iv, enc])).digest().subarray(0, 10);
  const body = Buffer.concat([enc, mac]);
  return {
    mediaKey,
    fileSha256: sha256(plaintext),
    fileEncSha256: sha256(body),
    fileLength: plaintext.length,
    body,
    type,
  };
}

// Pide credenciales de subida al servidor (IQ xmlns="w:m").
export async function getMediaConn(client) {
  const res = await client.sendIq({
    tag: 'iq',
    attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'w:m', id: client.nextId() },
    content: [{ tag: 'media_conn', attrs: {}, content: undefined }],
  });
  const mc = (res.content || []).find((n) => n.tag === 'media_conn');
  if (!mc) throw new Error('media_conn no recibido');
  const hosts = (mc.content || []).filter((n) => n.tag === 'host').map((h) => h.attrs.hostname);
  return { auth: mc.attrs.auth, ttl: Number(mc.attrs.ttl || 0), hosts };
}

// Sube el blob cifrado por HTTP(S) (no por el socket Noise) y devuelve la URL.
export async function uploadMedia(client, { body, fileEncSha256, type }) {
  const { auth, hosts } = await getMediaConn(client);
  const b64url = fileEncSha256.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const path = UPLOAD_PATH[type] || 'image';
  let lastErr;
  for (const host of (hosts.length ? hosts : [MEDIA_HOST])) {
    const url = `https://${host}/mms/${path}/${encodeURIComponent(b64url)}?auth=${encodeURIComponent(auth)}&token=${b64url}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', Origin: 'https://web.whatsapp.com' },
        body,
      });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const json = await res.json();
      if (json.url || json.direct_path) return { url: json.url, directPath: json.direct_path };
      lastErr = new Error('respuesta de subida sin url');
    } catch (e) { lastErr = e; }
  }
  throw new Error(`subida de media falló: ${lastErr?.message || 'sin hosts'}`);
}

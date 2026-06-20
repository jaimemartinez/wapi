// Máquina de estados del handshake Noise_XX_25519_AESGCM_SHA256 tal y como lo
// usa WhatsApp multi-device, más el "framing" (longitud de 3 bytes) del socket.
//
// Patrón XX:   -> e            (clientHello)
//              <- e, ee, s, es (serverHello)
//              -> s, se        (clientFinish)
//
// La orquestación (qué protobuf va en cada paso) vive en WhatsAppClient; aquí
// están las primitivas de estado: authenticate / mixIntoKey / encrypt / decrypt.
import {
  sha256, hkdf, gcmIv, aesGcmEncrypt, aesGcmDecrypt, sharedKey,
} from './crypto.js';

// Nombre del protocolo Noise. WhatsApp lo rellena con ceros a 32 bytes; como
// mide exactamente 32, el hash inicial es ESTA cadena tal cual (sin sha256),
// según la regla de Noise (protocolos de <=32 bytes se rellenan, no se hashean).
const NOISE_MODE = 'Noise_XX_25519_AESGCM_SHA256\0\0\0\0';
// Cabecera (prólogo) que precede al primer frame: "WA" + edge + DICT_VERSION.
// El último byte es la versión del diccionario de tokens vigente (3).
const NOISE_HEADER = Buffer.from([87, 65, 6, 3]); // 'W','A',6,DICT_VERSION

export class NoiseHandler {
  constructor(ephemeralKeyPair) {
    this.ephemeral = ephemeralKeyPair; // { public, private } X25519 crudo
    const data = Buffer.from(NOISE_MODE, 'utf-8');
    this.hash = data.length === 32 ? data : sha256(data);
    this.salt = this.hash;
    this.encKey = this.hash;
    this.decKey = this.hash;
    this.readCounter = 0;
    this.writeCounter = 0;
    this.isFinished = false;
    this.sentIntro = false;
    this.inBuffer = Buffer.alloc(0);

    this.authenticate(NOISE_HEADER);
    this.authenticate(this.ephemeral.public);
  }

  authenticate(data) {
    if (!this.isFinished) this.hash = sha256(Buffer.concat([this.hash, data]));
  }

  mixIntoKey(data) {
    const key = hkdf(data, 64, { salt: this.salt, info: Buffer.alloc(0) });
    this.salt = key.subarray(0, 32);
    this.encKey = key.subarray(32);
    this.decKey = key.subarray(32);
    this.readCounter = 0;
    this.writeCounter = 0;
  }

  encrypt(plaintext) {
    const out = aesGcmEncrypt(plaintext, this.encKey, gcmIv(this.writeCounter), this.hash);
    this.writeCounter += 1;
    this.authenticate(out);
    return out;
  }

  decrypt(ciphertext) {
    const iv = gcmIv(this.isFinished ? this.readCounter : this.writeCounter);
    const out = aesGcmDecrypt(ciphertext, this.decKey, iv, this.hash);
    if (this.isFinished) this.readCounter += 1; else this.writeCounter += 1;
    this.authenticate(ciphertext);
    return out;
  }

  // ECDH del par efímero/estático con una clave pública del servidor.
  mixDH(privateRaw, serverPublicRaw) {
    this.mixIntoKey(sharedKey(privateRaw, serverPublicRaw));
  }

  // Cierre del handshake: split final, se descarta el hash y se reinician keys.
  finish() {
    const key = hkdf(Buffer.alloc(0), 64, { salt: this.salt, info: Buffer.alloc(0) });
    this.encKey = key.subarray(0, 32);
    this.decKey = key.subarray(32);
    this.hash = Buffer.alloc(0);
    this.readCounter = 0;
    this.writeCounter = 0;
    this.isFinished = true;
  }

  // ---- Framing del WebSocket ----

  // Envuelve un payload en un frame (cabecera intro la 1ª vez + longitud 3B).
  encodeFrame(data) {
    if (this.isFinished) data = this.encrypt(data);
    const introSize = this.sentIntro ? 0 : NOISE_HEADER.length;
    const frame = Buffer.alloc(introSize + 3 + data.length);
    if (!this.sentIntro) { NOISE_HEADER.copy(frame, 0); this.sentIntro = true; }
    frame.writeUInt8((data.length >> 16) & 0xff, introSize);
    frame.writeUInt16BE(data.length & 0xffff, introSize + 1);
    Buffer.from(data).copy(frame, introSize + 3);
    return frame;
  }

  // Acumula bytes entrantes y devuelve los frames completos (descifrados si ya
  // terminó el handshake).
  decodeFrames(newData) {
    this.inBuffer = Buffer.concat([this.inBuffer, Buffer.from(newData)]);
    const frames = [];
    while (this.inBuffer.length >= 3) {
      const size = (this.inBuffer[0] << 16) | (this.inBuffer[1] << 8) | this.inBuffer[2];
      if (this.inBuffer.length < 3 + size) break;
      let payload = this.inBuffer.subarray(3, 3 + size);
      this.inBuffer = this.inBuffer.subarray(3 + size);
      if (this.isFinished) payload = this.decrypt(payload);
      frames.push(payload);
    }
    return frames;
  }
}

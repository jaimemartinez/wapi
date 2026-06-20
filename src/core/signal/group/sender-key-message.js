// Portado de Baileys. Cuerpo skmsg serializado: [version][proto][firma 64B].
import curve from 'libsignal/src/curve.js';
import { proto } from './proto.js';
import { CiphertextMessage } from './ciphertext-message.js';

const { calculateSignature, verifySignature } = curve;

export class SenderKeyMessage extends CiphertextMessage {
  constructor(keyId, iteration, ciphertext, signatureKey, serialized) {
    super();
    this.SIGNATURE_LENGTH = 64;
    if (serialized) {
      const version = serialized[0];
      const message = serialized.slice(1, serialized.length - this.SIGNATURE_LENGTH);
      const signature = serialized.slice(-this.SIGNATURE_LENGTH);
      const skm = proto.SenderKeyMessage.decode(message).toJSON();
      this.serialized = serialized;
      this.messageVersion = (version & 0xff) >> 4;
      this.keyId = skm.id;
      this.iteration = skm.iteration;
      this.ciphertext = typeof skm.ciphertext === 'string' ? Buffer.from(skm.ciphertext, 'base64') : skm.ciphertext;
      this.signature = signature;
    } else {
      const version = (((this.CURRENT_VERSION << 4) | this.CURRENT_VERSION) & 0xff) % 256;
      const ciphertextBuffer = Buffer.from(ciphertext);
      const message = proto.SenderKeyMessage.encode(proto.SenderKeyMessage.create({
        id: keyId, iteration, ciphertext: ciphertextBuffer,
      })).finish();
      const signature = this.getSignature(signatureKey, Buffer.concat([Buffer.from([version]), message]));
      this.serialized = Buffer.concat([Buffer.from([version]), message, Buffer.from(signature)]);
      this.messageVersion = this.CURRENT_VERSION;
      this.keyId = keyId;
      this.iteration = iteration;
      this.ciphertext = ciphertextBuffer;
      this.signature = signature;
    }
  }

  getKeyId() { return this.keyId; }
  getIteration() { return this.iteration; }
  getCipherText() { return this.ciphertext; }

  verifySignature(signatureKey) {
    const part1 = this.serialized.slice(0, this.serialized.length - this.SIGNATURE_LENGTH);
    const part2 = this.serialized.slice(-this.SIGNATURE_LENGTH);
    // Nuestro libsignal LANZA si la firma es inválida y devuelve undefined si es
    // válida (no true), así que basta con llamarlo y dejar que propague el error.
    verifySignature(signatureKey, part1, part2);
  }
  getSignature(signatureKey, serialized) {
    return Buffer.from(calculateSignature(signatureKey, serialized));
  }
  serialize() { return this.serialized; }
  getType() { return 4; }
}

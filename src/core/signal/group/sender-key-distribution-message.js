// Portado de Baileys. SKDM serializada: [version][proto{id,iteration,chainKey,signingKey}].
import { proto } from './proto.js';
import { CiphertextMessage } from './ciphertext-message.js';

export class SenderKeyDistributionMessage extends CiphertextMessage {
  constructor(id, iteration, chainKey, signatureKey, serialized) {
    super();
    if (serialized) {
      const message = serialized.slice(1);
      const dm = proto.SenderKeyDistributionMessage.decode(message).toJSON();
      this.serialized = serialized;
      this.id = dm.id;
      this.iteration = dm.iteration;
      this.chainKey = typeof dm.chainKey === 'string' ? Buffer.from(dm.chainKey, 'base64') : dm.chainKey;
      this.signatureKey = typeof dm.signingKey === 'string' ? Buffer.from(dm.signingKey, 'base64') : dm.signingKey;
    } else {
      const version = this.intsToByteHighAndLow(this.CURRENT_VERSION, this.CURRENT_VERSION);
      this.id = id;
      this.iteration = iteration;
      this.chainKey = chainKey;
      this.signatureKey = signatureKey;
      const message = proto.SenderKeyDistributionMessage.encode(proto.SenderKeyDistributionMessage.create({
        id, iteration, chainKey, signingKey: signatureKey,
      })).finish();
      this.serialized = Buffer.concat([Buffer.from([version]), message]);
    }
  }

  intsToByteHighAndLow(hi, lo) { return (((hi << 4) | lo) & 0xff) % 256; }
  serialize() { return this.serialized; }
  getType() { return this.SENDERKEY_DISTRIBUTION_TYPE; }
  getIteration() { return this.iteration; }
  getChainKey() { return this.chainKey; }
  getSignatureKey() { return this.signatureKey; }
  getId() { return this.id; }
}

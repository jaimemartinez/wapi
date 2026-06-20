// Portado de Baileys. Estado de una sender key (cadena + clave de firma + keys).
import { SenderChainKey } from './sender-chain-key.js';
import { SenderMessageKey } from './sender-message-key.js';

export class SenderKeyState {
  constructor(id, iteration, chainKey, signatureKeyPair, signatureKeyPublic, signatureKeyPrivate, structure) {
    this.MAX_MESSAGE_KEYS = 2000;
    if (structure) {
      this.senderKeyStateStructure = {
        ...structure,
        senderMessageKeys: Array.isArray(structure.senderMessageKeys) ? structure.senderMessageKeys : [],
      };
    } else {
      if (signatureKeyPair) {
        signatureKeyPublic = signatureKeyPair.public;
        signatureKeyPrivate = signatureKeyPair.private;
      }
      this.senderKeyStateStructure = {
        senderKeyId: id || 0,
        senderChainKey: { iteration: iteration || 0, seed: Buffer.from(chainKey || []) },
        senderSigningKey: { public: Buffer.from(signatureKeyPublic || []), private: Buffer.from(signatureKeyPrivate || []) },
        senderMessageKeys: [],
      };
    }
  }

  getKeyId() { return this.senderKeyStateStructure.senderKeyId; }
  getSenderChainKey() {
    const c = this.senderKeyStateStructure.senderChainKey;
    return new SenderChainKey(c.iteration, c.seed);
  }
  setSenderChainKey(chainKey) {
    this.senderKeyStateStructure.senderChainKey = { iteration: chainKey.getIteration(), seed: chainKey.getSeed() };
  }
  getSigningKeyPublic() {
    const pub = Buffer.from(this.senderKeyStateStructure.senderSigningKey.public);
    if (pub.length === 32) { const fixed = Buffer.alloc(33); fixed[0] = 0x05; pub.copy(fixed, 1); return fixed; }
    return pub;
  }
  getSigningKeyPrivate() { return Buffer.from(this.senderKeyStateStructure.senderSigningKey.private || []); }
  hasSenderMessageKey(iteration) {
    return this.senderKeyStateStructure.senderMessageKeys.some((k) => k.iteration === iteration);
  }
  addSenderMessageKey(k) {
    this.senderKeyStateStructure.senderMessageKeys.push({ iteration: k.getIteration(), seed: k.getSeed() });
    if (this.senderKeyStateStructure.senderMessageKeys.length > this.MAX_MESSAGE_KEYS) {
      this.senderKeyStateStructure.senderMessageKeys.shift();
    }
  }
  removeSenderMessageKey(iteration) {
    const i = this.senderKeyStateStructure.senderMessageKeys.findIndex((k) => k.iteration === iteration);
    if (i !== -1) {
      const mk = this.senderKeyStateStructure.senderMessageKeys.splice(i, 1)[0];
      return new SenderMessageKey(mk.iteration, mk.seed);
    }
    return null;
  }
  getStructure() { return this.senderKeyStateStructure; }
}

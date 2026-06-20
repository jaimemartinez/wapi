// Portado de Baileys. Cifra/descifra el cuerpo de un mensaje de grupo (skmsg).
import crypto from 'libsignal/src/crypto.js';
import { SenderKeyMessage } from './sender-key-message.js';

const { decrypt, encrypt } = crypto;

export class GroupCipher {
  constructor(senderKeyStore, senderKeyName) {
    this.senderKeyStore = senderKeyStore;
    this.senderKeyName = senderKeyName;
  }

  async encrypt(paddedPlaintext) {
    const record = await this.senderKeyStore.loadSenderKey(this.senderKeyName);
    if (!record) throw new Error('No SenderKeyRecord for encryption');
    const state = record.getSenderKeyState();
    if (!state) throw new Error('No session to encrypt message');
    const iteration = state.getSenderChainKey().getIteration();
    const senderKey = this.getSenderKey(state, iteration === 0 ? 0 : iteration + 1);
    const ciphertext = await this.getCipherText(senderKey.getIv(), senderKey.getCipherKey(), paddedPlaintext);
    const skm = new SenderKeyMessage(state.getKeyId(), senderKey.getIteration(), ciphertext, state.getSigningKeyPrivate());
    await this.senderKeyStore.storeSenderKey(this.senderKeyName, record);
    return skm.serialize();
  }

  async decrypt(senderKeyMessageBytes) {
    const record = await this.senderKeyStore.loadSenderKey(this.senderKeyName);
    if (!record) throw new Error('No SenderKeyRecord for decryption');
    const skm = new SenderKeyMessage(null, null, null, null, senderKeyMessageBytes);
    const state = record.getSenderKeyState(skm.getKeyId());
    if (!state) throw new Error('No session found to decrypt message');
    skm.verifySignature(state.getSigningKeyPublic());
    const senderKey = this.getSenderKey(state, skm.getIteration());
    const plaintext = await this.getPlainText(senderKey.getIv(), senderKey.getCipherKey(), skm.getCipherText());
    await this.senderKeyStore.storeSenderKey(this.senderKeyName, record);
    return plaintext;
  }

  getSenderKey(state, iteration) {
    let chainKey = state.getSenderChainKey();
    if (chainKey.getIteration() > iteration) {
      if (state.hasSenderMessageKey(iteration)) {
        const mk = state.removeSenderMessageKey(iteration);
        if (!mk) throw new Error('No sender message key for iteration');
        return mk;
      }
      throw new Error(`Received message with old counter: ${chainKey.getIteration()}, ${iteration}`);
    }
    if (iteration - chainKey.getIteration() > 2000) throw new Error('Over 2000 messages into the future!');
    while (chainKey.getIteration() < iteration) {
      state.addSenderMessageKey(chainKey.getSenderMessageKey());
      chainKey = chainKey.getNext();
    }
    state.setSenderChainKey(chainKey.getNext());
    return chainKey.getSenderMessageKey();
  }

  async getPlainText(iv, key, ciphertext) {
    try { return decrypt(key, ciphertext, iv); } catch { throw new Error('InvalidMessageException'); }
  }
  async getCipherText(iv, key, plaintext) {
    try { return encrypt(key, plaintext, iv); } catch { throw new Error('InvalidMessageException'); }
  }
}

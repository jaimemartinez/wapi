// Portado de Baileys. Crea/procesa el estado de sender key del grupo.
import * as keyhelper from './keyhelper.js';
import { SenderKeyDistributionMessage } from './sender-key-distribution-message.js';

export class GroupSessionBuilder {
  constructor(senderKeyStore) { this.senderKeyStore = senderKeyStore; }

  async process(senderKeyName, skdm) {
    const record = await this.senderKeyStore.loadSenderKey(senderKeyName);
    record.addSenderKeyState(skdm.getId(), skdm.getIteration(), skdm.getChainKey(), skdm.getSignatureKey());
    await this.senderKeyStore.storeSenderKey(senderKeyName, record);
  }

  async create(senderKeyName) {
    const record = await this.senderKeyStore.loadSenderKey(senderKeyName);
    if (record.isEmpty()) {
      const keyId = keyhelper.generateSenderKeyId();
      const senderKey = keyhelper.generateSenderKey();
      const signingKey = keyhelper.generateSenderSigningKey();
      record.setSenderKeyState(keyId, 0, senderKey, signingKey);
      await this.senderKeyStore.storeSenderKey(senderKeyName, record);
    }
    const state = record.getSenderKeyState();
    if (!state) throw new Error('No session state available');
    return new SenderKeyDistributionMessage(
      state.getKeyId(), state.getSenderChainKey().getIteration(),
      state.getSenderChainKey().getSeed(), state.getSigningKeyPublic(),
    );
  }
}

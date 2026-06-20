// Almacén de claves compatible con la interfaz que esperan SessionBuilder y
// SessionCipher de `libsignal`, respaldado por el estado de auth de la sesión.
//
// libsignal trabaja con claves públicas PREFIJADAS con 0x05 (33 bytes); nuestro
// estado las guarda crudas (32 bytes). Aquí se convierte en cada frontera.
import libsignal from 'libsignal';
import { SenderKeyRecord } from './group/sender-key-record.js';

const { SessionRecord } = libsignal;

const KEY_PREFIX = Buffer.from([5]);
function pref(pub) { return pub.length === 33 ? Buffer.from(pub) : Buffer.concat([KEY_PREFIX, pub]); }

export class SignalStore {
  // `onChange` se invoca cuando cambian sesiones/identidades para persistir.
  constructor(auth, onChange = () => {}) {
    this.auth = auth;
    this.onChange = onChange;
  }

  async getOurRegistrationId() {
    return this.auth.registrationId;
  }

  async getOurIdentity() {
    return {
      pubKey: pref(this.auth.signedIdentityKey.public),
      privKey: Buffer.from(this.auth.signedIdentityKey.private),
    };
  }

  // TOFU: confiamos en la primera identidad vista para un addr y la fijamos.
  async isTrustedIdentity(identifier, identityKey) {
    const known = this.auth.identities[identifier];
    if (!known) return true;
    return Buffer.compare(Buffer.from(known, 'base64'), pref(identityKey)) === 0;
  }

  async saveIdentity(identifier, identityKey) {
    this.auth.identities[identifier] = pref(identityKey).toString('base64');
    this.onChange();
  }

  async loadPreKey(keyId) {
    const k = this.auth.preKeys[keyId];
    if (!k) return undefined;
    return { pubKey: pref(k.public), privKey: Buffer.from(k.private) };
  }

  async removePreKey(keyId) {
    delete this.auth.preKeys[keyId];
    this.onChange();
  }

  async loadSignedPreKey(keyId) {
    const spk = this.auth.signedPreKey;
    if (!spk || spk.keyId !== keyId) return undefined;
    return { pubKey: pref(spk.keyPair.public), privKey: Buffer.from(spk.keyPair.private) };
  }

  async loadSession(fqAddr) {
    const data = this.auth.sessions[fqAddr];
    if (!data) return undefined;
    return SessionRecord.deserialize(data);
  }

  async storeSession(fqAddr, record) {
    this.auth.sessions[fqAddr] = record.serialize();
    this.onChange();
  }

  // ---- Sender keys (grupos) ----
  async loadSenderKey(senderKeyName) {
    const data = this.auth.senderKeys[senderKeyName.toString()];
    return new SenderKeyRecord(data); // data undefined => registro vacío
  }

  async storeSenderKey(senderKeyName, record) {
    this.auth.senderKeys[senderKeyName.toString()] = record.serialize();
    this.onChange();
  }
}

// Portado de Baileys. Identificador de una sender key: grupo + remitente.
// serialize() => "groupId::user::device" es la CLAVE del almacén.
export class SenderKeyName {
  constructor(groupId, sender) {
    this.groupId = groupId;
    this.sender = sender; // { id, deviceId, toString() }
  }

  getGroupId() { return this.groupId; }
  getSender() { return this.sender; }
  serialize() { return `${this.groupId}::${this.sender.id}::${this.sender.deviceId}`; }
  toString() { return this.serialize(); }
  equals(other) {
    if (!other) return false;
    return this.groupId === other.groupId && this.sender.toString() === other.sender.toString();
  }
}

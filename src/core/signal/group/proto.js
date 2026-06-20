// Carga el proto serializado de sender keys (group.proto) y expone los tipos
// como `proto.SenderKeyMessage` / `proto.SenderKeyDistributionMessage`, igual
// que la API que esperan los módulos portados desde Baileys.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = protobuf.loadSync(join(__dirname, 'group.proto'));

export const proto = {
  SenderKeyMessage: root.lookupType('SenderKeyMessage'),
  SenderKeyDistributionMessage: root.lookupType('SenderKeyDistributionMessage'),
};

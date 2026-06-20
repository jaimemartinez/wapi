// Carga el esquema WAProto (subconjunto en src/protocol/proto/wa.proto) con
// protobufjs y expone los tipos que usa el resto del core. Es la única forma de
// (de)serializar los mensajes del handshake y el ClientPayload de login.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import protobuf from 'protobufjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = join(__dirname, '..', 'protocol', 'proto', 'wa.proto');

let root = null;

// Carga perezosa y cacheada del .proto.
export async function loadProto() {
  if (root) return root;
  root = await protobuf.load(PROTO_PATH);
  return root;
}

// Devuelve un tipo por nombre (p.ej. 'HandshakeMessage', 'ClientPayload').
export function type(name) {
  if (!root) throw new Error('proto no cargado: llama a loadProto() primero');
  return root.lookupType(name);
}

// Helpers de (de)serialización con verificación previa.
export function encode(name, obj) {
  const T = type(name);
  const err = T.verify(obj);
  if (err) throw new Error(`proto ${name} inválido: ${err}`);
  return Buffer.from(T.encode(T.create(obj)).finish());
}

export function decode(name, buffer) {
  return type(name).decode(buffer);
}

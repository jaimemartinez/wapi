// Extractor de tablas de tokens del códec binario multi-device.
//
// Las tablas SINGLE_BYTE_TOKENS / DOUBLE_BYTE_TOKENS son DATOS del protocolo
// (no lógica) y deben coincidir con el build de WhatsApp en uso. WhatsApp las
// publica embebidas en el bundle de WhatsApp Web; el proyecto Baileys las
// mantiene sincronizadas en un fichero limpio, que es la fuente que usamos aquí.
//
// Uso:
//   node tools/extract-tokens.mjs            # descarga y regenera tokens.js
//   node tools/extract-tokens.mjs <archivo>  # usa un constants.ts local
//
// Esto SOBRESCRIBE src/protocol/binary/tokens.js (preservando TAGS y mapas).
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_URL = 'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/WABinary/constants.ts';
const OUT = join(__dirname, '..', 'src', 'protocol', 'binary', 'tokens.js');

async function getSource(localPath) {
  if (localPath) return readFile(localPath, 'utf8');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`descarga falló: HTTP ${res.status}`);
  return res.text();
}

// Convierte el constants.ts en un módulo JS evaluable: nos quedamos con TAGS,
// SINGLE_BYTE_TOKENS y DOUBLE_BYTE_TOKENS (literales válidos en JS) y
// descartamos TOKEN_MAP (lleva anotaciones de tipo TypeScript).
async function evalTables(tsSource) {
  const cut = tsSource.indexOf('export const TOKEN_MAP');
  const head = cut >= 0 ? tsSource.slice(0, cut) : tsSource;
  const js = head
    .replace(/export const/g, 'const')
    .replace(/\bas const\b/g, '') // quita los casts de TypeScript
    + '\nexport { TAGS, SINGLE_BYTE_TOKENS, DOUBLE_BYTE_TOKENS };\n';
  const tmp = join(tmpdir(), `wa-tables-${process.pid}.mjs`);
  await writeFile(tmp, js, 'utf8');
  return import(pathToFileURL(tmp).href);
}

function render(single, dbl) {
  const fmtArr = (arr) => JSON.stringify(arr)
    .replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]').replace(/","/g, '", "');
  const fmtDbl = (dd) => '[\n' + dd.map((d) => '  ' + JSON.stringify(d)).join(',\n') + ',\n]';

  return `// Diccionarios de tokens del códec binario multi-device de WhatsApp.
//
// GENERADO por tools/extract-tokens.mjs — no editar a mano. Estas tablas son
// DATOS del protocolo y deben coincidir con el build de WhatsApp en uso; si el
// servidor envía un índice desconocido, el decoder lo indicará y habrá que
// regenerar este fichero (vuelve a ejecutar el extractor).

export const SINGLE_BYTE_TOKENS = ${fmtArr(single)};

export const DOUBLE_BYTE_TOKENS = ${fmtDbl(dbl)};

// Etiquetas de control del flujo binario.
export const TAGS = {
  LIST_EMPTY: 0,
  DICTIONARY_0: 236,
  DICTIONARY_1: 237,
  DICTIONARY_2: 238,
  DICTIONARY_3: 239,
  INTEROP_JID: 245,
  FB_JID: 246,
  AD_JID: 247,
  LIST_8: 248,
  LIST_16: 249,
  JID_PAIR: 250,
  HEX_8: 251,
  BINARY_8: 252,
  BINARY_20: 253,
  BINARY_32: 254,
  NIBBLE_8: 255,
};

// Mapas para empaquetado nibble/hex. El nibble cubre dígitos, '-' y '.'.
export const NIBBLE_MAP = '0123456789-.';
export const HEX_MAP = '0123456789ABCDEF';

// Índice inverso para encode (token -> índice de un byte).
export const SINGLE_BYTE_INDEX = new Map();
SINGLE_BYTE_TOKENS.forEach((tok, i) => {
  if (tok && !SINGLE_BYTE_INDEX.has(tok)) SINGLE_BYTE_INDEX.set(tok, i);
});
`;
}

async function main() {
  const local = process.argv[2];
  const src = await getSource(local);
  const { SINGLE_BYTE_TOKENS, DOUBLE_BYTE_TOKENS } = await evalTables(src);

  if (!Array.isArray(SINGLE_BYTE_TOKENS) || SINGLE_BYTE_TOKENS.length < 200) {
    throw new Error(`SINGLE_BYTE_TOKENS inesperado (${SINGLE_BYTE_TOKENS?.length})`);
  }
  await writeFile(OUT, render(SINGLE_BYTE_TOKENS, DOUBLE_BYTE_TOKENS), 'utf8');
  console.log(`tokens.js regenerado: ${SINGLE_BYTE_TOKENS.length} single-byte, `
    + `${DOUBLE_BYTE_TOKENS.length} diccionarios dobles `
    + `(${DOUBLE_BYTE_TOKENS.reduce((a, d) => a + d.length, 0)} tokens)`);
}

main().catch((e) => { console.error('extractor falló:', e.message); process.exit(1); });

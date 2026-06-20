// Decodifica el formato binario de WhatsApp de vuelta a { tag, attrs, content }.
import {
  SINGLE_BYTE_TOKENS, DOUBLE_BYTE_TOKENS, TAGS, NIBBLE_MAP, HEX_MAP,
} from './tokens.js';
import { jidEncode, getServerFromDomainType } from './jid.js';

export function decodeBinaryNode(buffer) {
  const dec = new Decoder(buffer);
  return dec.readNode();
}

class Decoder {
  constructor(buffer) { this.buf = buffer; this.i = 0; }

  readByte() {
    if (this.i >= this.buf.length) throw new Error('fin de buffer inesperado');
    return this.buf[this.i++];
  }
  readBytes(n) { const out = this.buf.subarray(this.i, this.i + n); this.i += n; return out; }
  readInt(n) { let v = 0; for (let k = 0; k < n; k++) v = (v << 8) | this.readByte(); return v; }
  readInt20() {
    const a = this.readByte(), b = this.readByte(), c = this.readByte();
    return ((a & 0x0f) << 16) | (b << 8) | c;
  }

  readListSize(tag) {
    if (tag === TAGS.LIST_EMPTY) return 0;
    if (tag === TAGS.LIST_8) return this.readByte();
    if (tag === TAGS.LIST_16) return this.readInt(2);
    throw new Error(`tag de lista inválido: ${tag}`);
  }

  readPacked(tag) {
    const startByte = this.readByte();
    const odd = (startByte & 0x80) !== 0;
    const numBytes = startByte & 0x7f;
    const map = tag === TAGS.NIBBLE_8 ? NIBBLE_MAP : HEX_MAP;
    // El nibble 15 (0xF) es el relleno de longitud impar de WhatsApp; lo
    // representamos como '\0' para que el slice final lo retire (y NO un carácter
    // real). Sin esto, los ids con padding 0xF del servidor pierden un carácter.
    const ch = (v) => (map[v] !== undefined ? map[v] : '\0');
    let str = '';
    for (let k = 0; k < numBytes; k++) {
      const b = this.readByte();
      str += ch((b & 0xf0) >> 4);
      str += ch(b & 0x0f);
    }
    return odd ? str.slice(0, -1) : str;
  }

  readStringFromChars(len) { return this.readBytes(len).toString('utf-8'); }

  readString(tag) {
    if (tag > 0 && tag < TAGS.DICTIONARY_0) {
      const token = SINGLE_BYTE_TOKENS[tag];
      if (token == null) {
        throw new Error(`token de un byte desconocido (${tag}): sincroniza tokens.js con el build de WhatsApp Web`);
      }
      return token;
    }
    switch (tag) {
      case TAGS.LIST_EMPTY: return '';
      case TAGS.DICTIONARY_0:
      case TAGS.DICTIONARY_1:
      case TAGS.DICTIONARY_2:
      case TAGS.DICTIONARY_3: {
        const idx = this.readByte();
        const dict = DOUBLE_BYTE_TOKENS[tag - TAGS.DICTIONARY_0];
        const token = dict?.[idx];
        if (token == null) throw new Error(`token de dos bytes desconocido (${tag},${idx}): sincroniza tokens.js`);
        return token;
      }
      case TAGS.BINARY_8: return this.readStringFromChars(this.readByte());
      case TAGS.BINARY_20: return this.readStringFromChars(this.readInt20());
      case TAGS.BINARY_32: return this.readStringFromChars(this.readInt(4));
      case TAGS.JID_PAIR: {
        const user = this.readString(this.readByte());
        const server = this.readString(this.readByte());
        return user ? `${user}@${server}` : `@${server}`;
      }
      case TAGS.AD_JID: {
        // [domainType][device][user]. El primer byte elige el server; NO es un
        // agent del user (mapear 1->lid, 128->hosted, 129->hosted.lid).
        const domainType = this.readByte();
        const device = this.readByte();
        const user = this.readString(this.readByte());
        const server = getServerFromDomainType('s.whatsapp.net', domainType);
        return jidEncode(user, server, device || undefined);
      }
      case TAGS.NIBBLE_8:
      case TAGS.HEX_8: return this.readPacked(tag);
      default:
        throw new Error(`tag de string inválido: ${tag}`);
    }
  }

  readAttributes(count) {
    const attrs = {};
    for (let k = 0; k < count; k++) {
      const key = this.readString(this.readByte());
      attrs[key] = this.readString(this.readByte());
    }
    return attrs;
  }

  readContent(tag) {
    switch (tag) {
      case TAGS.BINARY_8: return this.readBytes(this.readByte());
      case TAGS.BINARY_20: return this.readBytes(this.readInt20());
      case TAGS.BINARY_32: return this.readBytes(this.readInt(4));
      case TAGS.LIST_EMPTY:
      case TAGS.LIST_8:
      case TAGS.LIST_16: {
        const size = this.readListSize(tag);
        const list = [];
        for (let k = 0; k < size; k++) list.push(this.readNode());
        return list;
      }
      default: return this.readString(tag);
    }
  }

  readNode() {
    const listSize = this.readListSize(this.readByte());
    if (listSize === 0) throw new Error('nodo vacío');
    const tag = this.readString(this.readByte());
    // attrs ocupa pares: (listSize - 1 - (hayContenido?1:0)) / 2
    const attrCount = Math.floor((listSize - 1) / 2);
    const attrs = this.readAttributes(attrCount);
    const hasContent = (listSize % 2) === 0;
    const content = hasContent ? this.readContent(this.readByte()) : undefined;
    return { tag, attrs, content };
  }
}

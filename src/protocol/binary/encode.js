// Codifica un "nodo" de WhatsApp { tag, attrs, content } al formato binario
// que viaja por el WebSocket. Algoritmo estándar del protocolo multi-device.
import {
  SINGLE_BYTE_INDEX, DOUBLE_BYTE_TOKENS, TAGS, NIBBLE_MAP, HEX_MAP,
} from './tokens.js';
import { jidDecode } from './jid.js';

const NIBBLE_SET = new Set(NIBBLE_MAP.split(''));
const HEX_SET = new Set(HEX_MAP.split(''));

export function encodeBinaryNode(node) {
  const enc = new Encoder();
  enc.writeNode(node);
  return enc.toBuffer();
}

class Encoder {
  constructor() { this.bytes = []; }

  toBuffer() { return Buffer.from(this.bytes); }
  push(b) { this.bytes.push(b & 0xff); }
  pushBytes(buf) { for (const b of buf) this.bytes.push(b & 0xff); }

  pushInt(value, n) {
    for (let i = n - 1; i >= 0; i--) this.push((value >> (i * 8)) & 0xff);
  }
  pushInt20(value) {
    this.push((value >> 16) & 0x0f);
    this.push((value >> 8) & 0xff);
    this.push(value & 0xff);
  }

  writeByteLength(len) {
    if (len >= 1 << 20) { this.push(TAGS.BINARY_32); this.pushInt(len, 4); }
    else if (len >= 256) { this.push(TAGS.BINARY_20); this.pushInt20(len); }
    else { this.push(TAGS.BINARY_8); this.push(len); }
  }

  writeListStart(size) {
    if (size === 0) this.push(TAGS.LIST_EMPTY);
    else if (size < 256) { this.push(TAGS.LIST_8); this.push(size); }
    else { this.push(TAGS.LIST_16); this.pushInt(size, 2); }
  }

  writeStringRaw(str) {
    const buf = Buffer.from(str, 'utf-8');
    this.writeByteLength(buf.length);
    this.pushBytes(buf);
  }

  packed(str, map, tag) {
    this.push(tag);
    const numBytes = Math.ceil(str.length / 2);
    this.push((str.length % 2 !== 0 ? 0x80 : 0) | numBytes);
    for (let i = 0; i < numBytes; i++) {
      const hi = map.indexOf(str[2 * i]);
      // Relleno de longitud impar = nibble 15 (0xF), como hace WhatsApp.
      const lo = 2 * i + 1 < str.length ? map.indexOf(str[2 * i + 1]) : 0x0f;
      this.push((hi << 4) | lo);
    }
  }

  writeJid(jid) {
    const dec = jidDecode(jid);
    if (!dec) return this.writeStringRaw(jid);
    if (dec.device != null) {
      // AD_JID: [domainType][device][user]. El primer byte es el domainType
      // (0=whatsapp, 1=lid, 128=hosted, 129=hosted.lid), derivado del server.
      this.push(TAGS.AD_JID);
      this.push(dec.domainType || 0);
      this.push(dec.device || 0);
      this.writeString(dec.user || '');
    } else {
      this.push(TAGS.JID_PAIR);
      if (dec.user && dec.user.length) this.writeString(dec.user);
      else this.push(TAGS.LIST_EMPTY);
      this.writeString(dec.server);
    }
  }

  writeString(str) {
    const tokenIndex = SINGLE_BYTE_INDEX.get(str);
    if (tokenIndex !== undefined) { this.push(tokenIndex); return; }

    for (let i = 0; i < DOUBLE_BYTE_TOKENS.length; i++) {
      const idx = DOUBLE_BYTE_TOKENS[i].indexOf(str);
      if (idx >= 0) { this.push(TAGS.DICTIONARY_0 + i); this.push(idx); return; }
    }

    if (typeof str === 'string' && str.includes('@')) { this.writeJid(str); return; }

    if (str.length && [...str].every((c) => NIBBLE_SET.has(c))) {
      this.packed(str, NIBBLE_MAP, TAGS.NIBBLE_8); return;
    }
    if (str.length && [...str].every((c) => HEX_SET.has(c))) {
      this.packed(str, HEX_MAP, TAGS.HEX_8); return;
    }
    this.writeStringRaw(str);
  }

  writeAttributes(attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      this.writeString(key);
      this.writeString(String(value));
    }
  }

  writeContent(content) {
    if (content === undefined || content === null) return;
    if (typeof content === 'string') this.writeString(content);
    else if (Buffer.isBuffer(content) || content instanceof Uint8Array) {
      this.writeByteLength(content.length);
      this.pushBytes(content);
    } else if (Array.isArray(content)) {
      this.writeListStart(content.length);
      for (const child of content) this.writeNode(child);
    } else {
      throw new Error(`contenido de nodo no soportado: ${typeof content}`);
    }
  }

  writeNode(node) {
    const attrs = node.attrs || {};
    const validAttrs = Object.values(attrs).filter((v) => v !== undefined && v !== null).length;
    const hasContent = node.content !== undefined && node.content !== null;
    // tamaño de la lista = 1 (tag) + 2*attrs + (content ? 1 : 0)
    this.writeListStart(2 * validAttrs + 1 + (hasContent ? 1 : 0));
    this.writeString(node.tag);
    this.writeAttributes(attrs);
    if (hasContent) this.writeContent(node.content);
  }
}

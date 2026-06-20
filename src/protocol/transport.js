// Transporte WebSocket hacia WhatsApp. Único uso de la dep `ws` (neutral): no
// reimplementamos el protocolo WebSocket, pero todo lo que viaja por encima
// (Noise, códec binario, WAProto) es código nuestro.
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

const WA_WS_URL = 'wss://web.whatsapp.com/ws/chat';
const WA_ORIGIN = 'https://web.whatsapp.com';

export class Transport extends EventEmitter {
  constructor(url = WA_WS_URL) {
    super();
    this.url = url;
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Sin User-Agent propio: igualamos a los clientes oficiales (solo origin).
      // WhatsApp puede responder distinto a cabeceras inesperadas.
      this.ws = new WebSocket(this.url, {
        origin: WA_ORIGIN,
        handshakeTimeout: 20000,
      });
      this.ws.on('open', () => { this.emit('open'); resolve(); });
      this.ws.on('message', (data) => this.emit('data', data));
      this.ws.on('error', (err) => { this.emit('error', err); reject(err); });
      this.ws.on('close', (code, reason) => this.emit('close', code, reason?.toString()));
    });
  }

  send(buffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket no está abierto');
    }
    this.ws.send(buffer);
  }

  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}

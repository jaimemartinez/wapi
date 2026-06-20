// Cliente de una cuenta de WhatsApp. Orquesta el handshake Noise sobre el
// Transport, gestiona el emparejamiento por QR y procesa los nodos binarios
// entrantes (mensajes, llamadas, recibos). Emite eventos para la capa Session.
//
// Estados: 'connecting' -> 'qr' (esperando escaneo) -> 'connected' | 'closed'.
import { EventEmitter } from 'node:events';
import { inflateSync } from 'node:zlib';
import qrcode from 'qrcode-terminal';
import { Transport } from '../protocol/transport.js';
import { NoiseHandler } from '../protocol/noise.js';
import { generateX25519KeyPair, randomBytes } from '../protocol/crypto.js';
import { encodeBinaryNode } from '../protocol/binary/encode.js';
import { decodeBinaryNode } from '../protocol/binary/decode.js';
import { loadProto, encode as protoEncode, decode as protoDecode } from './proto.js';
import { registrationPayload, loginPayload } from './payload.js';
import { configureSuccessfulPairing, child } from './pairing.js';
import { generatePreKeys } from './auth.js';
import { storeLIDPNMappings, migrateSession } from './lid.js';
import { generatePairingCode, buildHelloNode, buildFinishBundle, buildFinishNode } from './pairing-code.js';
import { jidEncode, jidDecode } from '../protocol/binary/jid.js';
import { encodeBigEndian } from './receipts.js';

export class WhatsAppClient extends EventEmitter {
  constructor(auth, config) {
    super();
    this.auth = auth;
    this.config = config;
    this.status = 'idle';
    this.qr = null;          // string del QR pendiente, si lo hay
    this.transport = null;
    this.noise = null;
    this.handshakeDone = false;
    this.msgCounter = 0;
    this.pendingIqs = new Map(); // id -> { resolve, reject }
  }

  // ---- Arranque ----

  async connect() {
    await loadProto();
    this.status = 'connecting';

    const ephemeral = generateX25519KeyPair();
    this.noise = new NoiseHandler(ephemeral);
    this.ephemeral = ephemeral;

    this.transport = new Transport();
    this.transport.on('data', (d) => this.onData(d));
    this.transport.on('close', (code, reason) => this.onClose(code, reason));
    this.transport.on('error', (err) => this.emit('error', err));

    await this.transport.connect();
    await this.sendClientHello();
  }

  // Paso 1 del XX: -> e
  async sendClientHello() {
    const hello = protoEncode('HandshakeMessage', {
      clientHello: { ephemeral: this.ephemeral.public },
    });
    this.transport.send(this.noise.encodeFrame(hello));
  }

  // ---- Recepción ----

  onData(raw) {
    let frames;
    try {
      frames = this.noise.decodeFrames(raw);
    } catch (err) {
      this.emit('error', new Error(`fallo al desencuadrar: ${err.message}`));
      return;
    }
    for (const frame of frames) {
      if (!this.handshakeDone) { this.onHandshakeFrame(frame); continue; }
      try {
        this.onNode(decodeBinaryNode(this.decompress(frame)));
      } catch (err) {
        this.emit('error', new Error(`fallo al decodificar nodo: ${err.message}`));
      }
    }
  }

  // Cada frame post-handshake lleva un byte de flags: bit 1 (valor 2) indica
  // compresión zlib; en cualquier caso el primer byte se descarta del nodo.
  decompress(frame) {
    if (!frame.length) return frame;
    const flag = frame[0];
    const body = frame.subarray(1);
    return (flag & 2) ? inflateSync(body) : body;
  }

  // Paso 2+3 del XX: <- e, ee, s, es   y luego  -> s, se + ClientPayload.
  onHandshakeFrame(frame) {
    try {
      const { serverHello } = protoDecode('HandshakeMessage', frame);
      if (!serverHello) throw new Error('se esperaba server_hello');

      const serverEph = Buffer.from(serverHello.ephemeral);
      this.noise.authenticate(serverEph);
      this.noise.mixDH(this.ephemeral.private, serverEph);

      const serverStatic = this.noise.decrypt(Buffer.from(serverHello.static));
      this.noise.mixDH(this.ephemeral.private, serverStatic);

      // El payload es el NoiseCertificate del servidor (no lo verificamos aquí).
      this.noise.decrypt(Buffer.from(serverHello.payload));

      // -> s (nuestra noiseKey estática, cifrada) + se
      const encStatic = this.noise.encrypt(this.auth.noiseKey.public);
      this.noise.mixDH(this.auth.noiseKey.private, serverEph);

      // ClientPayload: login si ya estamos registrados, registro si no. Usamos
      // `registered`/`account` (no `me`), porque el flujo por código pre-rellena
      // me.id antes del finish y aún debe enviar registrationPayload.
      const payload = (this.auth.registered || this.auth.account) ? loginPayload(this.auth) : registrationPayload(this.auth, this.config.client.name);
      const encPayload = this.noise.encrypt(payload);

      const finish = protoEncode('HandshakeMessage', {
        clientFinish: { static: encStatic, payload: encPayload },
      });
      this.transport.send(this.noise.encodeFrame(finish));

      this.noise.finish();
      this.handshakeDone = true;
      this.status = this.auth.me ? 'connecting' : 'qr';
      this.emit('handshake');
    } catch (err) {
      this.emit('error', new Error(`handshake falló: ${err.message}`));
      this.disconnect();
    }
  }

  // Router de nodos binarios ya descifrados.
  onNode(node) {
    this.emit('node', node);
    switch (node.tag) {
      case 'success': return this.onLoginSuccess(node);
      case 'call': return this.emit('call', node);
      case 'message': return this.emit('message', node);
      case 'receipt': return this.emit('receipt', node);
      case 'presence': return this.emit('presence', node);
      case 'chatstate': return this.emit('presence', node);
      case 'notification': return this.onNotification(node).catch((e) => this.emit('error', e));
      case 'failure': return this.onFailure(node);
      case 'iq': return this.onIq(node);
      default: /* otros nodos: stream:features, ib, etc. */ return;
    }
  }

  // Ack de protocolo al servidor por un nodo recibido (message/receipt/etc).
  // Para class='message' WhatsApp Web incluye SIEMPRE from=meId; lo replicamos.
  async ack(node, errorCode) {
    if (!node.attrs?.id) return;
    const a = node.attrs;
    const attrs = { id: a.id, to: a.from, class: node.tag };
    if (errorCode != null) attrs.error = String(errorCode);
    if (a.participant) attrs.participant = a.participant;
    if (a.recipient) attrs.recipient = a.recipient;
    if (a.type) attrs.type = a.type;
    if (node.tag === 'message' && this.auth.me) attrs.from = this.auth.me.id;
    this.sendNode({ tag: 'ack', attrs, content: undefined });
  }

  // Envía un <receipt> (entrega/lectura) — distinto del ack de protocolo.
  sendReceipt(attrs, items) {
    const node = { tag: 'receipt', attrs, content: undefined };
    if (items && items.length) {
      node.content = [{ tag: 'list', attrs: {}, content: items.map((id) => ({ tag: 'item', attrs: { id }, content: undefined })) }];
    }
    this.sendNode(node);
  }

  // ---- Emparejamiento (registro) ----

  // Solicita un código de 8 caracteres para teclear en el móvil (alternativa al
  // QR). phone = número en formato internacional sin '+'. Devuelve el código.
  async requestPairingCode(phone, customCode) {
    if (customCode && customCode.length !== 8) throw new Error('el código debe tener 8 caracteres');
    const code = (customCode || generatePairingCode()).toUpperCase();
    this.auth.pairingCode = code;
    // Pre-fijamos me.id (provisional); el pair-success posterior lo sobrescribe.
    this.auth.me = { id: jidEncode(String(phone).replace(/[^0-9]/g, ''), 's.whatsapp.net'), name: '~' };
    const hello = buildHelloNode(this.auth, String(phone).replace(/[^0-9]/g, ''), code);
    hello.attrs.id = this.nextId();
    await this.sendIq(hello);
    this.emit('creds');
    return code;
  }

  onPairDevice(iq, pairDevice) {
    // <pair-device> contiene uno o varios <ref>…</ref>. El QR usa el primero;
    // los demás sirven para refrescarlo cuando caduca (~20s).
    const refs = (pairDevice.content || []).filter((n) => n.tag === 'ref');
    if (!refs.length) return;
    this.ack(iq);
    this.pendingRefs = refs.map((r) => r.content.toString('utf8'));
    this.emitQr();
  }

  emitQr() {
    clearTimeout(this.qrTimer);
    if (!this.pendingRefs?.length) {
      // Se agotaron los refs sin escanear: el QR ha expirado del todo.
      this.qr = null;
      this.emit('qr-timeout');
      return;
    }
    const ref = this.pendingRefs.shift();
    const noiseB64 = this.auth.noiseKey.public.toString('base64');
    const identB64 = this.auth.signedIdentityKey.public.toString('base64');
    const advB64 = this.auth.advSecretKey.toString('base64');
    // Formato EXACTO del cliente oficial: URL + 5 campos (el último es el id de
    // plataforma del companion; '1' = cliente web Chrome). Sin esto el teléfono
    // parsea mal el QR y muestra "no es posible iniciar sesión".
    const platformId = '1';
    this.qr = 'https://wa.me/settings/linked_devices#'
      + [ref, noiseB64, identB64, advB64, platformId].join(',');
    this.status = 'qr';
    qrcode.generate(this.qr, { small: true });
    this.emit('qr', this.qr);
    // Cada ref caduca (~20s); pasamos al siguiente para dar más intentos.
    this.qrTimer = setTimeout(() => this.emitQr(), 20000);
  }

  onPairSuccess(iq) {
    // El teléfono ha aceptado: verificamos la identidad firmada (HMAC + firma de
    // cuenta), generamos nuestra firma de dispositivo y respondemos. Tras esto
    // el servidor cierra el stream y hay que reconectar ya como LOGIN.
    try {
      const { reply, me, account } = configureSuccessfulPairing(iq, this.auth);
      this.auth.me = me;
      this.auth.account = account;
      this.sendNode(reply);
      clearTimeout(this.qrTimer);
      this.qr = null;
      this.pendingRefs = [];
      this.emit('pair-success', { me, account });
    } catch (err) {
      this.emit('error', new Error(`pair-success falló: ${err.message}`));
      this.disconnect();
    }
  }

  onLoginSuccess(node) {
    this.status = 'connected';
    this.qr = null;
    // me.lid llega en el <success lid="...@lid">: registramos nuestro propio
    // mapeo PN<->LID y migramos la sesión Signal al address LID.
    if (node.attrs?.lid && this.auth?.me) {
      this.auth.me.lid = node.attrs.lid;
      storeLIDPNMappings(this.auth, [{ lid: node.attrs.lid, pn: this.auth.me.id }]);
      migrateSession(this.auth, this.auth.me.id, node.attrs.lid);
    }
    this.startKeepalive();
    this.emit('open');
    // Inicialización post-login: subir pre-keys y marcar la sesión activa. Sin
    // esto el teléfono no empuja el history sync ni los mensajes offline.
    this.postLoginInit().catch((e) => this.emit('error', new Error(`post-login: ${e.message}`)));
  }

  async postLoginInit() {
    // 1. Subir pre-keys según las que le falten al servidor (812 si arranca a 0).
    const server = await this.getServerPreKeyCount().catch(() => 0);
    await this.uploadPreKeys(server === 0 ? 812 : Math.max(0, 5 - server) || 5).catch(() => {});
    // 2. Marcar la conexión como activa (xmlns="passive").
    this.sendNode({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'passive', id: this.nextId() }, content: [{ tag: 'active', attrs: {}, content: undefined }] });
  }

  // Cuántas one-time pre-keys nos quedan en el servidor.
  async getServerPreKeyCount() {
    const res = await this.sendIq({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'encrypt', id: this.nextId() }, content: [{ tag: 'count', attrs: {}, content: undefined }] });
    return Number(child(res, 'count')?.attrs?.value || 0);
  }

  // Genera y sube `count` one-time pre-keys nuevas.
  async uploadPreKeys(count = 5) {
    const fresh = generatePreKeys(this.auth, count);
    const spk = this.auth.signedPreKey;
    await this.sendIq({
      tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'encrypt', id: this.nextId() },
      content: [
        { tag: 'registration', attrs: {}, content: encodeBigEndian(this.auth.registrationId, 4) },
        { tag: 'type', attrs: {}, content: Buffer.from([5]) },
        { tag: 'identity', attrs: {}, content: this.auth.signedIdentityKey.public },
        { tag: 'list', attrs: {}, content: fresh.map((p) => ({
          tag: 'key', attrs: {},
          content: [{ tag: 'id', attrs: {}, content: encodeBigEndian(p.keyId, 3) }, { tag: 'value', attrs: {}, content: p.keyPair.public }],
        })) },
        { tag: 'skey', attrs: {}, content: [
          { tag: 'id', attrs: {}, content: encodeBigEndian(spk.keyId, 3) },
          { tag: 'value', attrs: {}, content: spk.keyPair.public },
          { tag: 'signature', attrs: {}, content: spk.signature },
        ] },
      ],
    });
    this.emit('creds'); // persistir las nuevas pre-keys
  }

  // Procesa una <notification> y SIEMPRE la ack-ea (si no, el server reintenta
  // y puede cerrar el stream). 'encrypt' con count bajo dispara subir pre-keys.
  async onNotification(node) {
    try {
      if (node.attrs.type === 'encrypt' && node.attrs.from === 's.whatsapp.net') {
        const count = Number(child(node, 'count')?.attrs?.value || 0);
        if (count < 5 && !this.uploadingPreKeys) {
          this.uploadingPreKeys = true;
          await this.uploadPreKeys(20).catch(() => {}).finally(() => { this.uploadingPreKeys = false; });
        }
      }
      // Finalización del emparejamiento por código: el primario respondió.
      if (node.attrs.type === 'companion_reg' || child(node, 'link_code_companion_reg')) {
        await this.onCompanionReg(node).catch((e) => console.error(`[client] companion_reg:`, e.message));
      }
      // Cambio en la lista de dispositivos de un usuario: limpiamos sesiones
      // Signal de los que se retiran (no cacheamos device-list, re-fetcheamos).
      if (node.attrs.type === 'devices') this.onDevicesNotification(node);
      this.emit('notification', node);
    } finally {
      this.ack(node);
    }
  }

  // Maneja <notification type="devices">: si un usuario retira dispositivos,
  // borramos sus sesiones Signal muertas. No cacheamos device-list (cada envío
  // re-consulta USync), así que add/update no requieren acción.
  onDevicesNotification(node) {
    const change = (node.content || []).find((n) => ['add', 'remove', 'update'].includes(n.tag));
    if (!change || change.tag !== 'remove') return;
    for (const d of (child(change, 'device-list')?.content || change.content || [])) {
      const jid = d.attrs?.jid;
      if (!jid) continue;
      const dec = jidDecode(jid);
      if (dec) delete this.auth.sessions[`${dec.user}.${dec.device || 0}`];
    }
  }

  // Maneja <notification><link_code_companion_reg stage="companion_finish">.
  async onCompanionReg(node) {
    const reg = child(node, 'link_code_companion_reg');
    if (!reg || !this.auth.pairingCode) return;
    const ref = child(reg, 'link_code_pairing_ref')?.content;
    const primaryIdentityPub = child(reg, 'primary_identity_pub')?.content;
    const wrappedPrimaryEph = child(reg, 'link_code_pairing_wrapped_primary_ephemeral_pub')?.content;
    if (!primaryIdentityPub || !wrappedPrimaryEph) return;
    const { wrappedKeyBundle, advSecretKey } = buildFinishBundle(this.auth, this.auth.pairingCode, Buffer.from(primaryIdentityPub), Buffer.from(wrappedPrimaryEph));
    await this.sendIq(buildFinishNode(this.auth, ref, wrappedKeyBundle));
    this.auth.advSecretKey = advSecretKey; // Buffer crudo (pairing.js hace HMAC con él)
    this.auth.registered = true;
    this.emit('pairing-registered');
  }

  // Ping periódico al servidor para mantener viva la sesión (cada 30s).
  startKeepalive() {
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = setInterval(() => {
      this.sendIq({
        tag: 'iq',
        attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:p', id: this.nextId() },
        content: [{ tag: 'ping', attrs: {}, content: undefined }],
      }, 15000).catch(() => { /* si falla, el cierre del socket lo gestionará */ });
    }, 30000);
  }

  onFailure(node) {
    const reason = node.attrs?.reason;
    // 401 (y 403/405) = credenciales inválidas: el dispositivo fue deslogueado
    // o desvinculado. No tiene sentido reintentar; hay que re-vincular.
    if (['401', '403', '405'].includes(reason)) {
      this.emit('logged-out', { reason, location: node.attrs?.location });
      this.disconnect();
      return;
    }
    this.emit('error', new Error(`failure: ${JSON.stringify(node.attrs)}`));
  }

  onIq(node) {
    // El emparejamiento viaja dentro de <iq>: <pair-device> (genera QR) y
    // <pair-success> (confirma el escaneo).
    const pairDevice = child(node, 'pair-device');
    if (pairDevice) return this.onPairDevice(node, pairDevice);
    if (child(node, 'pair-success')) return this.onPairSuccess(node);

    // El servidor hace ping periódico: hay que responder con un result o cierra.
    if (node.attrs?.xmlns === 'urn:xmpp:ping' && node.attrs.type === 'get') {
      return this.sendNode({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'result', id: node.attrs.id }, content: undefined });
    }

    // ¿Es la respuesta a una petición que hicimos? Resolvemos su promesa.
    const pending = node.attrs?.id && this.pendingIqs.get(node.attrs.id);
    if (pending) {
      this.pendingIqs.delete(node.attrs.id);
      if (node.attrs.type === 'error') pending.reject(new Error(`iq error: ${JSON.stringify(node.attrs)}`));
      else pending.resolve(node);
      return;
    }
    this.emit('iq', node);
  }

  // Envía un <iq> y espera su respuesta correlacionada por id.
  sendIq(node, timeoutMs = 20000) {
    const id = node.attrs.id || this.nextId();
    node.attrs.id = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIqs.delete(id);
        reject(new Error(`timeout esperando respuesta al iq ${id}`));
      }, timeoutMs);
      this.pendingIqs.set(id, {
        resolve: (n) => { clearTimeout(timer); resolve(n); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.sendNode(node);
    });
  }

  // Pide al servidor el bundle de pre-keys de uno o varios destinatarios.
  async fetchPreKeys(jids) {
    const users = jids.map((jid) => ({ tag: 'user', attrs: { jid }, content: undefined }));
    return this.sendIq({
      tag: 'iq',
      attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'encrypt', id: this.nextId() },
      content: [{ tag: 'key', attrs: {}, content: users }],
    });
  }

  // ---- Envío ----

  // Envía un nodo binario por el socket (ya cifrado por la capa Noise). Se
  // antepone el byte de flags 0x00 (sin compresión) que exige el protocolo.
  sendNode(node) {
    const buf = Buffer.concat([Buffer.from([0]), encodeBinaryNode(node)]);
    this.transport.send(this.noise.encodeFrame(buf));
  }

  nextId() {
    this.msgCounter += 1;
    return `${Date.now()}.${this.msgCounter}`;
  }

  // Id de mensaje con el formato que espera WhatsApp (hex en mayúsculas).
  generateMessageId() {
    return '3EB0' + randomBytes(8).toString('hex').toUpperCase();
  }

  // Rechaza una llamada entrante reenviando un nodo <call><reject/></call>.
  async rejectCall(callId, from) {
    if (this.status !== 'connected') throw new Error('sesión no conectada');
    this.sendNode({
      tag: 'call',
      attrs: { to: from, id: this.nextId() },
      content: [{ tag: 'reject', attrs: { 'call-id': callId, 'call-creator': from, count: '0' }, content: undefined }],
    });
  }

  async disconnect() {
    this.status = 'closed';
    clearTimeout(this.qrTimer);
    clearInterval(this.keepaliveTimer);
    try { this.transport?.close(); } catch { /* ignore */ }
  }

  onClose(code, reason) {
    if (this.status !== 'closed') this.status = 'closed';
    // Detener temporizadores: si no, el QR sigue rotando y el keepalive sigue
    // pinchando un socket muerto tras un cierre inesperado.
    clearTimeout(this.qrTimer);
    clearInterval(this.keepaliveTimer);
    this.emit('close', { code, reason });
  }
}

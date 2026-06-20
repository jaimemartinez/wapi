// Una Session = una cuenta de WhatsApp vista desde la API. Envuelve a un
// WhatsAppClient, mantiene su estado observable (status, qr, historial de
// llamadas) y persiste las credenciales cuando cambian.
import { WhatsAppClient } from './WhatsAppClient.js';
import { saveAuthState, newAuthState, generatePreKeys } from './auth.js';
import { SignalStore } from './signal/store.js';
import { processPreKeyBundle, encryptSignalMessage, decryptSignalMessage, jidToAddr,
  encryptGroupMessage, decryptGroupMessage, processSenderKeyDistributionMessage } from './signal/repository.js';
import { groupMetadata, groupCreate, groupParticipantsUpdate, groupUpdateSubject, groupUpdateDescription,
  groupSettingUpdate, groupInviteCode, groupRevokeInvite, groupAcceptInvite, groupGetInviteInfo, groupLeave,
  groupToggleEphemeral, groupRequestParticipantsList, groupRequestParticipantsUpdate, groupMemberAddMode,
  groupJoinApprovalMode, communityCreate, communityLinkGroup, communityUnlinkGroup, getSubgroups } from './groups.js';
import { onWhatsApp, fetchStatus, profilePictureUrl, updateProfilePicture, removeProfilePicture,
  updateProfileStatus, getBusinessProfile, fetchPrivacySettings, updatePrivacySetting,
  fetchBlocklist, updateBlockStatus } from './profile.js';
import { newsletterCreate, newsletterFollow, newsletterUnfollow, newsletterMetadata,
  newsletterMute, newsletterUnmute, newsletterDelete, newsletterUpdate } from './newsletters.js';
import { child } from './pairing.js';
import { encodeSyncdPatch, newLTHashState, extractSyncdPatches, decodeCollection } from './appstate.js';

const APP_STATE_COLLECTIONS = ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular'];
import { parseMessageStanza, parsePreKeyBundles, detectMedia } from './messages.js';
import { processHistorySync } from './history.js';
import { encryptMedia, uploadMedia, downloadEncryptedMedia } from './media.js';
import { randomBytes as signalRandom, hmacSha256, aesGcmDecrypt, sha256 } from '../protocol/crypto.js';
import { usyncDevices } from './devices.js';
import { buildRetryReceipt, parseRetryKeys, RetryCounter } from './receipts.js';
import { toWhatsAppJid, jidDecode, jidNormalizedUser, isJidGroup, isLidUser } from '../protocol/binary/jid.js';
import { storeLIDPNMappings, getLIDForPN, getPNForLID, migrateSession, extractAddressingContext } from './lid.js';
import { loadProto, encode as protoEncode, decode as protoDecode } from './proto.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Tipo de stanza según el contenido del Message (como getMessageType de Baileys).
function messageType(m) {
  const inner = m.ephemeralMessage?.message || m.viewOnceMessageV2?.message || m;
  if (inner.reactionMessage) return 'reaction';
  if (inner.pollCreationMessage || inner.pollCreationMessageV2 || inner.pollCreationMessageV3 || inner.pollUpdateMessage) return 'poll';
  if (inner.imageMessage || inner.videoMessage || inner.audioMessage || inner.documentMessage || inner.stickerMessage) return 'media';
  return 'text';
}

// Serializa la identidad firmada del dispositivo para el nodo <device-identity>
// (incluye la accountSignatureKey, como hace el cliente oficial al enviar).
function encodeAccount(account) {
  return protoEncode('ADVSignedDeviceIdentity', {
    details: account.details,
    accountSignatureKey: account.accountSignatureKey,
    accountSignature: account.accountSignature,
    deviceSignature: account.deviceSignature,
  });
}

export class Session {
  constructor(id, auth, config) {
    this.id = id;
    this.auth = auth;
    this.config = config;
    this.status = 'idle';
    this.qr = null;
    this.calls = []; // historial de eventos de llamada observados
    this.messages = []; // historial de mensajes entrantes descifrados
    this.chats = new Map();   // id de chat -> { id, name, unread, timestamp, archived }
    this.pushnames = {};      // jid -> nombre público
    this.retryCounter = new RetryCounter();
    this.recentSent = new Map(); // id -> { jid, message } para responder a retries
    this.polls = new Map();      // pollMsgId -> { secret, options, creator } para descifrar votos
    this.presences = {};         // jid -> { lastKnownPresence, lastSeen?, groupOnlineCount? }
    this.client = null;
    this.lastError = null;   // último error observado (diagnóstico)
    this.closeReason = null; // motivo del último cierre del socket
    this.stateFile = join(config.sessionsDir, `${id}.state.json`);
    this.saveStateTimer = null;
    // Almacén Signal: persiste el estado cuando cambia (sesiones, identidades).
    this.signal = new SignalStore(auth, () => { this.persist().catch(() => {}); });
  }

  // Carga chats/mensajes/pushnames persistidos (sobreviven reinicios; el
  // history sync solo llega una vez, así que sin esto se perderían).
  async loadState() {
    try {
      const data = JSON.parse(await readFile(this.stateFile, 'utf8'));
      this.chats = new Map((data.chats || []).map((c) => [c.id, c]));
      this.messages = data.messages || [];
      this.pushnames = data.pushnames || {};
    } catch { /* sin estado previo: empezamos vacíos */ }
  }

  // Guardado con debounce (las ráfagas de history sync no machacan el disco).
  scheduleSaveState() {
    if (this.saveStateTimer) return;
    this.saveStateTimer = setTimeout(() => {
      this.saveStateTimer = null;
      const data = { chats: [...this.chats.values()], messages: this.messages, pushnames: this.pushnames };
      writeFile(this.stateFile, JSON.stringify(data), 'utf8').catch(() => {});
    }, 1000);
  }

  async start() {
    await loadProto();
    await this.loadState();
    this.loggedOut = false;
    this.stopped = false;
    // El almacén Signal debe apuntar a las credenciales vigentes (pueden haberse
    // regenerado tras un deslogueo).
    this.signal = new SignalStore(this.auth, () => { this.persist().catch(() => {}); });
    this.client = new WhatsAppClient(this.auth, this.config);

    this.client.on('qr', (qr) => { this.qr = qr; this.status = 'qr'; });
    this.client.on('open', () => { this.qr = null; this.status = 'connected'; this.retries = 0; });
    this.client.on('creds', () => { this.persist().catch(() => {}); });
    this.client.on('close', ({ code, reason } = {}) => {
      this.status = this.loggedOut ? 'logged_out' : 'closed';
      this.closeReason = { code, reason: reason || null, at: new Date().toISOString() };
      console.error(`[session ${this.id}] close code=${code} reason=${reason || ''}`);
      // No reconectar si las credenciales están muertas (401) o si se cerró a
      // propósito (logout/destroy): sería un bucle.
      if (this.loggedOut || this.stopped) return;
      // Tras emparejar, WhatsApp cierra el stream (code 515): reconectamos una
      // vez, ya como LOGIN (auth.me está puesto), sin re-escanear el QR.
      if (this.reconnectAfterPair) {
        this.reconnectAfterPair = false;
        console.error(`[session ${this.id}] emparejado; reconectando como login…`);
        setTimeout(() => this.start().catch((e) => console.error(`[session ${this.id}] relogin:`, e.message)), 1500);
        return;
      }
      // Caída inesperada estando emparejado: reconexión con backoff exponencial.
      if (this.auth.me) {
        this.retries = (this.retries || 0) + 1;
        if (this.retries > 6) { console.error(`[session ${this.id}] demasiados reintentos; me rindo`); return; }
        const delay = Math.min(30000, 2000 * 2 ** (this.retries - 1));
        console.error(`[session ${this.id}] reconectando en ${delay / 1000}s (intento ${this.retries})…`);
        setTimeout(() => this.start().catch((e) => console.error(`[session ${this.id}] reconexión:`, e.message)), delay);
      }
    });

    // Dispositivo deslogueado/desvinculado (401): credenciales inservibles.
    // Recuperación automática: generamos credenciales nuevas y volvemos a
    // arrancar para mostrar un QR nuevo, sin intervención manual.
    this.client.on('logged-out', async ({ reason, location }) => {
      this.loggedOut = true; // evita que el handler de 'close' reconecte como login
      this.reconnectAfterPair = false;
      this.lastError = { message: `logged_out (${reason}/${location})`, at: new Date().toISOString() };
      console.error(`[session ${this.id}] DESLOGUEADO (${reason}/${location}): regenerando credenciales y QR nuevo…`);
      await this.resetCredentials();
      // Re-arranca como dispositivo nuevo (genera QR). start() pone loggedOut=false.
      setTimeout(() => this.start().catch((e) => console.error(`[session ${this.id}] re-registro:`, e.message)), 1500);
    });
    this.client.on('error', (err) => {
      this.lastError = { message: err.message, at: new Date().toISOString() };
      console.error(`[session ${this.id}]`, err.message);
    });

    // Traza de diagnóstico: todos los nodos entrantes (tag + atributos clave).
    this.client.on('node', (n) => {
      const a = n.attrs || {};
      console.error(`[session ${this.id}] <- ${n.tag} ${a.type || ''} ${a.xmlns || ''} ${a.from || ''}`.trimEnd());
    });

    this.client.on('pair-success', async ({ me }) => {
      console.error(`[session ${this.id}] ✅ PAIR-SUCCESS recibido: ${me.id}`);
      // El cliente ya verificó la identidad y rellenó auth.me/auth.account.
      // Persistimos para poder reconectar como login sin re-escanear el QR.
      this.me = me;
      this.reconnectAfterPair = true;
      await this.persist();
    });

    // Emparejamiento por código completado (companion_finish): el servidor
    // cerrará el stream (515); reconectamos como login (igual que el QR).
    this.client.on('pairing-registered', async () => {
      console.error(`[session ${this.id}] ✅ pairing-code registrado; reconectando como login`);
      this.pairingCode = null;
      this.reconnectAfterPair = true;
      await this.persist();
    });

    // Registro de llamadas entrantes (detección; el audio no está soportado).
    this.client.on('call', (node) => {
      const offer = (node.content || []).find((n) => n.tag === 'offer') || node;
      this.calls.unshift({
        id: offer.attrs?.['call-id'] || node.attrs?.id,
        from: node.attrs?.from,
        at: new Date().toISOString(),
        type: offer.tag === 'offer' ? 'offer' : node.attrs?.type || 'unknown',
        raw: node.attrs,
      });
      this.calls = this.calls.slice(0, 100);
    });

    // Mensajes entrantes: descifrar el <enc> con Signal y guardar el texto.
    this.client.on('message', (node) => this.onIncomingMessage(node).catch(
      (e) => console.error(`[session ${this.id}] descifrado:`, e.message),
    ));
    // Recibos entrantes (entrega/lectura/retry de otros).
    this.client.on('receipt', (node) => this.onReceipt(node).catch(
      (e) => console.error(`[session ${this.id}] receipt:`, e.message),
    ));
    // Presencia/chatstate de otros contactos.
    this.client.on('presence', (node) => this.onPresence(node));
    // Notificaciones (newsletters entrantes, etc.).
    this.client.on('notification', (node) => this.onNewsletterNotification(node));
    // Al conectar, anunciarse como disponible.
    this.client.on('open', () => { this.sendPresence('available').catch(() => {}); });

    await this.client.connect();
  }

  async onIncomingMessage(node) {
    const parsed = parseMessageStanza(node);
    if (!parsed) return;
    // Ack de protocolo al servidor por cada mensaje.
    this.client.ack(node);

    const isGroup = isJidGroup(parsed.from);
    const author = parsed.participant || parsed.from; // autor real (grupos)

    // Ingesta de mapeo LID<->PN del contexto de direccionamiento del stanza.
    const addr = extractAddressingContext(node.attrs, author);
    if (addr.senderAlt) {
      const pair = addr.addressingMode === 'lid' ? { lid: author, pn: addr.senderAlt } : { lid: addr.senderAlt, pn: author };
      if (storeLIDPNMappings(this.auth, [pair])) {
        const lidJid = isLidUser(author) ? author : addr.senderAlt;
        const pnJid = isLidUser(author) ? addr.senderAlt : author;
        migrateSession(this.auth, pnJid, lidJid); // doble-ratchet sigue al LID
        this.scheduleSaveState();
      }
    }

    // Descifrar (skmsg de grupo o 1:1); si falla, pedir reenvío (retry) y salir.
    let plain;
    try {
      if (parsed.encType === 'skmsg') {
        plain = await decryptGroupMessage(this.signal, parsed.from, author, parsed.ciphertext);
      } else {
        plain = await decryptSignalMessage(this.signal, author, parsed.encType, parsed.ciphertext);
      }
    } catch (e) {
      const count = this.retryCounter.next(parsed.id, author);
      if (!this.retryCounter.exceeded(parsed.id, author)) {
        console.error(`[session ${this.id}] descifrado falló (${e.message}); pido retry #${count}`);
        // A partir del 2º intento incluimos una prekey nueva + device-identity
        // para que el remitente pueda recrear la sesión desde cero.
        let extras = {};
        if (count > 1 && this.auth.account) {
          const [pk] = generatePreKeys(this.auth, 1);
          extras = { prekey: { keyId: pk.keyId, pub: pk.keyPair.public }, deviceIdentity: encodeAccount(this.auth.account) };
          await this.persist();
        }
        this.client.sendNode(buildRetryReceipt(node, this.auth, count, extras));
      }
      return;
    }
    const msg = protoDecode('Message', plain);

    // Si trae una SKDM (distribución de sender key del autor), instalarla ANTES
    // de procesar el contenido — habilita descifrar sus skmsg de grupo.
    const skd = msg.senderKeyDistributionMessage;
    if (skd?.groupId && skd.axolotlSenderKeyDistributionMessage) {
      try { await processSenderKeyDistributionMessage(this.signal, skd.groupId, author, skd.axolotlSenderKeyDistributionMessage); }
      catch (e) { console.error(`[session ${this.id}] SKDM:`, e.message); }
    }

    // Claves de app state (type=6): habilitan archivar/fijar/silenciar/etc.
    const keyShare = msg.protocolMessage?.appStateSyncKeyShare;
    if (keyShare?.keys?.length) {
      for (const k of keyShare.keys) {
        const id = Buffer.from(k.keyId.keyId).toString('base64');
        this.auth.appStateSyncKeys[id] = Buffer.from(k.keyData.keyData).toString('base64');
        this.auth.myAppStateKeyId = id;
      }
      await this.persist();
      console.error(`[session ${this.id}] app-state keys recibidas (${keyShare.keys.length}); sincronizando…`);
      // Ya podemos descodificar: sincronizamos todas las colecciones una vez.
      if (!this.appStateSynced) { this.appStateSynced = true; this.resyncAppState(APP_STATE_COLLECTIONS, true).catch((e) => console.error(`[session ${this.id}] resync inicial:`, e.message)); }
    }

    // Recibo de ENTREGA al remitente (doble check gris).
    const receiptAttrs = { id: parsed.id, to: parsed.from };
    if (parsed.participant) receiptAttrs.participant = parsed.participant;
    this.client.sendReceipt(receiptAttrs);

    // ¿Es la notificación de history sync (volcado de chats al vincular)?
    const hsn = msg.protocolMessage?.historySyncNotification;
    if (hsn) {
      this.client.sendReceipt({ id: parsed.id, to: jidNormalizedUser(parsed.from), type: 'hist_sync' });
      try {
        const { chats, pushnames } = await processHistorySync(hsn);
        for (const c of chats) {
          // Completamos el nombre con el pushname si la conversación no lo trae.
          if (!c.name && pushnames[c.id]) c.name = pushnames[c.id];
          this.chats.set(c.id, { ...this.chats.get(c.id), ...c });
        }
        Object.assign(this.pushnames, pushnames);
        this.scheduleSaveState();
        console.error(`[session ${this.id}] history sync: +${chats.length} chats (total ${this.chats.size})`);
      } catch (e) {
        console.error(`[session ${this.id}] history sync falló:`, e.message);
      }
      return;
    }

    // Desenvolver DSM (copia de otro dispositivo nuestro) y wrappers ephemeral/
    // view-once para llegar al contenido real.
    let inner = msg.deviceSentMessage?.message || msg;
    inner = inner.ephemeralMessage?.message || inner.viewOnceMessageV2?.message || inner.viewOnceMessage?.message || inner;

    // En grupos, 'chat' es el grupo y 'author' el remitente real.
    const chat = isGroup ? parsed.from : author;

    const push = (extra) => {
      this.messages.unshift({ id: parsed.id, chat, from: author, at: new Date().toISOString(), ...extra });
      this.messages = this.messages.slice(0, 200);
      this.scheduleSaveState();
    };

    // Reacción entrante.
    if (inner.reactionMessage) {
      push({ type: 'reaction', reaction: inner.reactionMessage.text || '', target: inner.reactionMessage.key?.id });
      return;
    }
    // Voto de encuesta entrante (descifrar).
    if (inner.pollUpdateMessage) {
      try {
        const vote = await this.decryptPollVote(inner.pollUpdateMessage, author);
        push({ type: 'poll_vote', poll: inner.pollUpdateMessage.pollCreationMessageKey?.id, options: vote });
      } catch (e) { console.error(`[session ${this.id}] voto:`, e.message); }
      return;
    }
    // Ubicación / contacto entrantes.
    if (inner.locationMessage) { const l = inner.locationMessage; push({ type: 'location', location: { latitude: l.degreesLatitude, longitude: l.degreesLongitude, name: l.name, address: l.address } }); return; }
    if (inner.contactMessage) { push({ type: 'contact', contact: { displayName: inner.contactMessage.displayName, vcard: inner.contactMessage.vcard } }); return; }

    // ¿Media? Guardamos los metadatos para descarga perezosa por /media.
    const media = detectMedia(inner);
    if (media) {
      const m = media.info;
      this.messages.unshift({
        id: parsed.id, chat, from: author, at: new Date().toISOString(),
        type: media.type,
        caption: m.caption || m.title || '',
        media: {
          type: media.type,
          mediaKey: Buffer.from(m.mediaKey).toString('base64'),
          directPath: m.directPath, url: m.url,
          mimetype: m.mimetype, fileLength: Number(m.fileLength || 0), fileName: m.fileName,
        },
      });
      this.messages = this.messages.slice(0, 200);
      this.scheduleSaveState();
      return;
    }

    const text = inner.conversation || inner.extendedTextMessage?.text || '';
    if (text) push({ text });
  }

  // Descifra un voto de encuesta entrante (PollUpdateMessage). Necesita el
  // secreto de la encuesta original (cacheado al crearla en this.polls).
  async decryptPollVote(pollUpdate, voterJid) {
    const pollId = pollUpdate.pollCreationMessageKey?.id;
    const cached = this.polls.get(pollId);
    if (!cached) throw new Error(`encuesta ${pollId} no en caché`);
    const enc = pollUpdate.vote;
    const pollMsgId = pollId;
    const creator = jidNormalizedUser(cached.creator);
    const voter = jidNormalizedUser(voterJid);
    // Derivación de la clave (ver spec): key0 = HMAC(0^32, secret); decKey = HMAC(key0, sign).
    const sign = Buffer.concat([Buffer.from(pollMsgId), Buffer.from(creator), Buffer.from(voter), Buffer.from('Poll Vote'), Buffer.from([1])]);
    const key0 = hmacSha256(Buffer.alloc(32), Buffer.from(cached.secret));
    const decKey = hmacSha256(key0, sign);
    const aad = Buffer.from(`${pollMsgId}\0${voter}`);
    const plain = aesGcmDecrypt(Buffer.from(enc.encPayload), decKey, Buffer.from(enc.encIv), aad);
    const vote = protoDecode('PollVoteMessage', plain);
    // Mapear cada hash SHA-256 a su optionName.
    const hashes = (vote.selectedOptions || []).map((b) => Buffer.from(b).toString('hex'));
    return cached.options.filter((o) => hashes.includes(sha256(Buffer.from(o)).toString('hex')));
  }

  // Descarga (perezosa) el media de un mensaje recibido por su id.
  async downloadMessageMedia(messageId) {
    const m = this.messages.find((x) => x.id === messageId && x.media);
    if (!m) throw new Error('mensaje con media no encontrado');
    const buffer = await downloadEncryptedMedia({
      directPath: m.media.directPath, url: m.media.url, mediaKey: Buffer.from(m.media.mediaKey, 'base64'),
    }, m.media.type);
    return { buffer, mimetype: m.media.mimetype, fileName: m.media.fileName };
  }

  // Envía media (image/audio/document/video/sticker) a un contacto: cifra y sube
  // el fichero una vez, luego cifra el mensaje por dispositivo (igual que texto).
  async sendMedia(to, type, buffer, opts = {}) {
    if (!this.auth.me) throw new Error('sesión no emparejada');
    const recipientJid = toWhatsAppJid(to);
    const meUser = jidDecode(this.auth.me.id).user;
    const recipUser = jidDecode(recipientJid).user;

    // 1. Cifrar + subir el fichero (una sola vez).
    const enc = encryptMedia(buffer, type);
    const up = await uploadMedia(this.client, enc);
    const ts = Math.floor(Date.now() / 1000);
    const common = {
      url: up.url, directPath: up.directPath, mediaKey: enc.mediaKey,
      fileEncSha256: enc.fileEncSha256, fileSha256: enc.fileSha256, fileLength: enc.fileLength,
      mediaKeyTimestamp: ts,
    };
    const field = { image: 'imageMessage', audio: 'audioMessage', document: 'documentMessage', video: 'videoMessage', sticker: 'stickerMessage' }[type];
    const defMime = { image: 'image/jpeg', audio: 'audio/ogg; codecs=opus', document: 'application/pdf', video: 'video/mp4', sticker: 'image/webp' }[type];
    const info = { ...common, mimetype: opts.mimetype || defMime };
    if (opts.caption && (type === 'image' || type === 'video' || type === 'document')) info.caption = opts.caption;
    if (type === 'audio' && opts.ptt) info.ptt = true;
    if (type === 'document') info.fileName = opts.fileName || 'file';
    const mediaMsgObj = { [field]: info };
    const mediatype = type === 'audio' ? (opts.ptt ? 'ptt' : 'audio') : type;
    this.attachContext(mediaMsgObj, recipientJid, opts);

    // 2. Cifrar y enviar (mismo núcleo que el texto, con type=media + mediatype).
    const res = await this.relayMessage(recipientJid, mediaMsgObj, { type: 'media', mediatype });
    return { ...res, type };
  }

  // Recibo entrante: si es 'retry' sobre algo que enviamos, reenviamos; el resto
  // (entrega/lectura) lo registramos. Siempre se ack-ea al final.
  async onReceipt(node) {
    const a = node.attrs;
    try {
      const retry = (node.content || []).find((n) => n.tag === 'retry');
      if (a.type === 'retry' && retry) await this.handleRetry(node);
      else if (a.type) this.lastReceipt = { id: a.id, from: a.from, type: a.type, at: new Date().toISOString() };
    } finally {
      this.client.ack(node);
    }
  }

  // Otro dispositivo no pudo descifrar un mensaje nuestro: reenviamos el <enc>.
  async handleRetry(node) {
    const a = node.attrs;
    const participant = a.participant || a.from;
    const cached = this.recentSent.get(a.id);
    if (!cached) { console.error(`[session ${this.id}] retry de ${a.id} sin caché; no puedo reenviar`); return; }

    // Si el retry trae claves, recreamos la sesión Signal con ese dispositivo.
    const bundle = parseRetryKeys(node);
    if (bundle) {
      try { await processPreKeyBundle(this.signal, participant, bundle); }
      catch (e) { console.error(`[session ${this.id}] retry bundle:`, e.message); }
    }
    const count = Number((node.content.find((n) => n.tag === 'retry')?.attrs.count) || 1);
    const enc = await encryptSignalMessage(this.signal, participant, cached.message);
    const content = [{ tag: 'enc', attrs: { v: '2', type: enc.type, count: String(count) }, content: enc.ciphertext }];
    if (enc.type === 'pkmsg') content.push({ tag: 'device-identity', attrs: {}, content: encodeAccount(this.auth.account) });
    this.client.sendNode({ tag: 'message', attrs: { id: a.id, to: participant, type: 'text' }, content });
    console.error(`[session ${this.id}] reenviado ${a.id} a ${participant} (retry #${count})`);
  }

  // Marca mensajes como leídos. type: 'read' (avisa al remitente) o 'read-self'.
  async readMessages(from, ids, type = 'read') {
    const t = Math.floor(Date.now() / 1000).toString();
    this.client.sendReceipt({ id: ids[0], to: from, type, t }, ids.slice(1));
    return { ok: true, marked: ids.length };
  }

  async persist() {
    await saveAuthState(this.config.sessionsDir, this.id, this.auth);
  }

  // Descarta las credenciales muertas y genera unas nuevas (dispositivo nuevo).
  async resetCredentials() {
    this.auth = newAuthState();
    this.chats.clear();
    this.messages = [];
    this.pushnames = {};
    this.me = null;
    await this.persist();
    await writeFile(this.stateFile, JSON.stringify({ chats: [], messages: [], pushnames: {} }), 'utf8').catch(() => {});
  }

  // Envía un mensaje de texto cifrándolo para TODOS los dispositivos del
  // destinatario y los tuyos (los propios reciben una copia DSM para que el
  // mensaje aparezca también en tu teléfono).
  // Núcleo de envío 1:1: descubre dispositivos, cifra el Message por cada uno
  // (DSM a los míos) y ensambla la stanza. Lo usan todos los send* de texto/ricos.
  async relayMessage(recipientJid, messageObj, opts = {}) {
    if (!this.auth.me) throw new Error('sesión no emparejada');
    const meUser = jidDecode(this.auth.me.id).user;
    const recipUser = jidDecode(recipientJid).user;
    const base = (u) => `${u}@s.whatsapp.net`;
    const devices = await usyncDevices(this.client, [...new Set([base(meUser), base(recipUser)])]);
    if (devices.lidPairs?.length) storeLIDPNMappings(this.auth, devices.lidPairs);
    const targets = devices.map((d) => d.jid).filter((j) => j !== this.auth.me.id);
    if (!targets.length) throw new Error('sin dispositivos destino');

    const need = targets.filter((j) => !this.auth.sessions[this.signalAddr(j)]);
    if (need.length) {
      const iq = await this.client.fetchPreKeys(need);
      for (const { jid, bundle } of parsePreKeyBundles(iq)) {
        try { await processPreKeyBundle(this.signal, jid, bundle); }
        catch (e) { console.error(`[session ${this.id}] prekey ${jid}:`, e.message); }
      }
    }

    const plain = protoEncode('Message', messageObj);
    const dsm = protoEncode('Message', { deviceSentMessage: { destinationJid: recipientJid, message: messageObj } });
    const participants = [];
    let includeDeviceIdentity = false;
    const encExtra = opts.mediatype ? { mediatype: opts.mediatype } : {};
    for (const jid of targets) {
      if (!this.auth.sessions[this.signalAddr(jid)]) continue;
      const data = jidDecode(jid).user === meUser ? dsm : plain;
      const enc = await encryptSignalMessage(this.signal, jid, data);
      if (enc.type === 'pkmsg') includeDeviceIdentity = true;
      participants.push({ tag: 'to', attrs: { jid }, content: [{ tag: 'enc', attrs: { v: '2', type: enc.type, ...encExtra }, content: enc.ciphertext }] });
    }
    if (!participants.length) throw new Error('no se pudo cifrar para ningún dispositivo');

    const id = opts.messageId || this.client.generateMessageId();
    const content = [{ tag: 'participants', attrs: {}, content: participants }];
    if (includeDeviceIdentity) content.push({ tag: 'device-identity', attrs: {}, content: encodeAccount(this.auth.account) });
    if (opts.extraNodes) content.push(...opts.extraNodes);
    // El type de la stanza se deriva del contenido (reaction/poll/media/text).
    const attrs = { id, to: recipientJid, type: opts.type || messageType(messageObj) };
    if (opts.edit) attrs.edit = opts.edit;
    this.client.sendNode({ tag: 'message', attrs, content });

    this.recentSent.set(id, { jid: recipientJid, message: plain });
    if (this.recentSent.size > 200) this.recentSent.delete(this.recentSent.keys().next().value);
    return { id, to: recipientJid, devices: participants.length };
  }

  // Construye el contextInfo (cita + menciones + expiración) de un mensaje.
  buildContextInfo(chatJid, opts = {}) {
    const ctx = {};
    if (opts.mentions?.length) ctx.mentionedJid = opts.mentions.map((m) => toWhatsAppJid(m));
    if (opts.expiration) ctx.expiration = opts.expiration;
    if (opts.quoted?.id && opts.quoted.message) {
      const q = opts.quoted;
      ctx.stanzaId = q.id;
      ctx.participant = q.participant || q.from;
      const qm = { ...q.message };
      const t = Object.keys(qm)[0];
      if (qm[t] && typeof qm[t] === 'object') { qm[t] = { ...qm[t] }; delete qm[t].contextInfo; }
      ctx.quotedMessage = qm;
      if (q.remoteJid && q.remoteJid !== chatJid) ctx.remoteJid = q.remoteJid;
    }
    return Object.keys(ctx).length ? ctx : null;
  }

  // Inyecta el contextInfo en el (único) sub-mensaje de m.
  attachContext(m, chatJid, opts) {
    const ctx = this.buildContextInfo(chatJid, opts);
    if (!ctx) return;
    const t = Object.keys(m)[0];
    m[t].contextInfo = { ...(m[t].contextInfo || {}), ...ctx };
  }

  // Texto (con cita/menciones/preview opcionales). conversation no admite
  // contextInfo, así que migramos a extendedTextMessage cuando hace falta.
  async sendText(to, text, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    let m;
    if (opts.quoted || opts.mentions || opts.preview) {
      m = { extendedTextMessage: { text, ...(opts.preview || {}) } };
    } else {
      m = { conversation: text };
    }
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m, { type: 'text' });
  }

  // Reacción a un mensaje (emoji vacío '' = quitarla). targetKey = MessageKey.
  async sendReaction(to, targetKey, emoji) {
    const recipientJid = toWhatsAppJid(to);
    const m = { reactionMessage: { key: targetKey, text: emoji || '', senderTimestampMs: Date.now() } };
    return this.relayMessage(recipientJid, m); // type 'reaction' derivado
  }

  // Ubicación.
  async sendLocation(to, loc, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const m = { locationMessage: { degreesLatitude: loc.latitude, degreesLongitude: loc.longitude, name: loc.name, address: loc.address } };
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m, { type: 'text' });
  }

  // Tarjeta(s) de contacto (uno o varios vcards).
  async sendContact(to, contacts, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const arr = Array.isArray(contacts) ? contacts : [contacts];
    const m = arr.length === 1
      ? { contactMessage: { displayName: arr[0].displayName, vcard: arr[0].vcard } }
      : { contactsArrayMessage: { displayName: `${arr.length} contactos`, contacts: arr.map((c) => ({ displayName: c.displayName, vcard: c.vcard })) } };
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m, { type: 'text' });
  }

  // Encuesta. Genera el messageSecret (clave de cifrado de votos) y elige el
  // campo correcto según el nº de opciones seleccionables.
  async sendPoll(to, { name, options, selectableCount = 1 }, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const poll = { name, selectableOptionsCount: selectableCount, options: options.map((o) => ({ optionName: o })) };
    const field = selectableCount === 1 ? 'pollCreationMessageV3' : 'pollCreationMessage';
    const m = { messageContextInfo: { messageSecret: signalRandom(32) }, [field]: poll };
    this.attachContext(m, recipientJid, opts);
    // type 'poll' derivado + nodo <meta polltype="creation"> como el cliente oficial.
    const res = await this.relayMessage(recipientJid, m, { extraNodes: [{ tag: 'meta', attrs: { polltype: 'creation' }, content: undefined }] });
    this.polls.set(res.id, { secret: m.messageContextInfo.messageSecret, options, creator: this.auth.me.id });
    return res;
  }

  // Edita un mensaje propio. targetId = id del mensaje original.
  async editMessage(to, targetId, newText, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const key = { remoteJid: recipientJid, fromMe: true, id: targetId };
    if (opts.participant) key.participant = opts.participant;
    const m = { protocolMessage: { key, type: 14, editedMessage: { extendedTextMessage: { text: newText } }, timestampMs: Date.now() } };
    return this.relayMessage(recipientJid, m, { type: 'text', edit: '1' });
  }

  // Borra/revoca un mensaje para todos. targetKey = { id, fromMe, participant? }.
  async revokeMessage(to, targetKey) {
    const recipientJid = toWhatsAppJid(to);
    const fromMe = targetKey.fromMe !== false;
    const key = { remoteJid: recipientJid, fromMe, id: targetKey.id };
    if (targetKey.participant) key.participant = targetKey.participant;
    const editAttr = (isJidGroup(recipientJid) && !fromMe) ? '8' : '7';
    const m = { protocolMessage: { key, type: 0 } };
    return this.relayMessage(recipientJid, m, { type: 'text', edit: editAttr });
  }

  // Reenvía un mensaje (objeto Message: {conversation} o {imageMessage} etc.).
  async forwardMessage(to, messageObj, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    let m = { ...messageObj };
    if (m.conversation != null) m = { extendedTextMessage: { text: m.conversation } };
    const t = Object.keys(m)[0];
    const prevScore = m[t].contextInfo?.forwardingScore || 0;
    const score = prevScore + (opts.fromMe ? 0 : 1);
    m[t] = { ...m[t], contextInfo: { ...(m[t].contextInfo || {}), forwardingScore: score, isForwarded: true } };
    const type = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(t) ? 'media' : 'text';
    return this.relayMessage(recipientJid, m, { type });
  }

  // ---- Mensajes interactivos (botones/listas/plantillas/nativos) ----

  // Botones de respuesta rápida (legacy). buttons: [{ id, text }].
  async sendButtons(to, { text, footer, buttons = [], header }, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const m = { buttonsMessage: {
      contentText: text, footerText: footer, headerType: header ? 2 : 1,
      ...(header ? { contentText: text } : {}),
      buttons: buttons.map((b) => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 })),
    } };
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m);
  }

  // Lista desplegable (legacy). sections: [{ title, rows:[{ id, title, description }] }].
  async sendList(to, { title, description, buttonText, footer, sections = [] }, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const m = { listMessage: {
      title, description, buttonText, footerText: footer, listType: 1,
      sections: sections.map((s) => ({ title: s.title, rows: (s.rows || []).map((r) => ({ title: r.title, description: r.description, rowId: r.id })) })),
    } };
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m);
  }

  // Mensaje interactivo moderno (native flow). buttons: [{ name, params }] donde
  // name ∈ 'quick_reply'|'cta_url'|'cta_call'|'single_select' y params es objeto.
  async sendInteractive(to, { title, subtitle, body, footer, buttons = [] }, opts = {}) {
    const recipientJid = toWhatsAppJid(to);
    const m = { interactiveMessage: {
      header: title || subtitle ? { title, subtitle, hasMediaAttachment: false } : undefined,
      body: body ? { text: body } : undefined,
      footer: footer ? { text: footer } : undefined,
      nativeFlowMessage: { messageVersion: 1, buttons: buttons.map((b) => ({ name: b.name, buttonParamsJson: typeof b.params === 'string' ? b.params : JSON.stringify(b.params || {}) })) },
    } };
    this.attachContext(m, recipientJid, opts);
    return this.relayMessage(recipientJid, m);
  }

  // Fija/desfija un mensaje en el chat. key={ id, fromMe, participant? }. pin=true fija.
  async pinMessage(to, key, pin = true, seconds = 86400) {
    const recipientJid = toWhatsAppJid(to);
    const mk = { remoteJid: recipientJid, fromMe: key.fromMe !== false, id: key.id };
    if (key.participant) mk.participant = key.participant;
    const m = {
      pinInChatMessage: { key: mk, type: pin ? 1 : 2, senderTimestampMs: Date.now() },
      messageContextInfo: { messageAddOnDurationInSecs: pin ? seconds : 0 },
    };
    return this.relayMessage(recipientJid, m);
  }

  // Mantiene/deja de mantener un mensaje efímero. keep=true para guardar.
  async keepMessage(to, key, keep = true) {
    const recipientJid = toWhatsAppJid(to);
    const mk = { remoteJid: recipientJid, fromMe: key.fromMe !== false, id: key.id };
    if (key.participant) mk.participant = key.participant;
    const m = { keepInChatMessage: { key: mk, keepType: keep ? 1 : 2, timestampMs: Date.now() } };
    return this.relayMessage(recipientJid, m);
  }

  // Recibo 'played' (audio/ptt escuchado). ids = [msgId, ...]. participant en grupo.
  async sendPlayedReceipt(to, ids, participant) {
    const toJid = toWhatsAppJid(to);
    const list = Array.isArray(ids) ? ids : [ids];
    const attrs = { id: list[0], to: toJid, type: 'played' };
    if (participant) attrs.participant = participant;
    this.client.sendReceipt(attrs, list.slice(1));
    return { ok: true, type: 'played', ids: list };
  }

  // ---- Presencia ----

  // Anuncia presencia propia: 'available' | 'unavailable'.
  async sendPresence(type) {
    const name = (this.auth.me?.name || this.config.client?.name || 'wapi').replace(/@/g, '');
    this.client.sendNode({ tag: 'presence', attrs: { name, type }, content: undefined });
  }

  // Estado de chat hacia un contacto: 'composing' | 'recording' | 'paused'.
  async sendChatState(to, state) {
    const toJid = toWhatsAppJid(to);
    const tag = state === 'recording' ? 'composing' : state;
    const attrs = state === 'recording' ? { media: 'audio' } : {};
    this.client.sendNode({ tag: 'chatstate', attrs: { from: this.auth.me.id, to: toJid }, content: [{ tag, attrs, content: undefined }] });
  }

  // Suscribirse a la presencia de un contacto (para empezar a recibirla).
  async subscribePresence(to) {
    const toJid = toWhatsAppJid(to);
    this.client.sendNode({ tag: 'presence', attrs: { to: toJid, id: this.client.nextId(), type: 'subscribe' }, content: undefined });
  }

  // Recepción de <presence>/<chatstate> de otros.
  onPresence(node) {
    const a = node.attrs || {};
    const jid = a.participant || a.from;
    if (!jid) return;
    if (node.tag === 'chatstate') {
      const first = (node.content || [])[0];
      let type = first?.tag || 'paused';
      if (type === 'paused') type = 'available';
      if (first?.attrs?.media === 'audio') type = 'recording';
      this.presences[jid] = { lastKnownPresence: type, at: new Date().toISOString() };
    } else {
      this.presences[jid] = {
        lastKnownPresence: a.type === 'unavailable' ? 'unavailable' : 'available',
        lastSeen: (a.last && a.last !== 'deny') ? Number(a.last) : undefined,
        groupOnlineCount: a.count ? Number(a.count) : undefined,
        at: new Date().toISOString(),
      };
    }
  }

  // Envía un mensaje de texto a un GRUPO usando sender keys: el cuerpo va una vez
  // cifrado con sender key (<enc skmsg>) y la SKDM se reparte 1:1 a cada device.
  async sendGroupText(groupJid, text) {
    if (!this.auth.me) throw new Error('sesión no emparejada');
    const meId = this.auth.me.id;
    const meUser = jidDecode(meId).user;

    // 1. Participantes del grupo + sus dispositivos (y los míos).
    const meta = await groupMetadata(this.client, groupJid);
    const base = (j) => `${jidDecode(j).user}@s.whatsapp.net`;
    const baseJids = [...new Set([base(meId), ...meta.participants.map((p) => base(p.id))])];
    const devices = await usyncDevices(this.client, baseJids);
    if (devices.lidPairs?.length) storeLIDPNMappings(this.auth, devices.lidPairs);
    const targets = devices.map((d) => d.jid).filter((j) => j !== meId);

    // 2. Cifrar el cuerpo con la sender key del grupo (y obtener la SKDM).
    const body = protoEncode('Message', { conversation: text });
    const { ciphertext, skdm } = await encryptGroupMessage(this.signal, groupJid, meId, body);

    // 3. Repartir la SKDM a cada dispositivo (sesión 1:1; X3DH si falta).
    const need = targets.filter((j) => !this.auth.sessions[this.signalAddr(j)]);
    if (need.length) {
      const iq = await this.client.fetchPreKeys(need);
      for (const { jid, bundle } of parsePreKeyBundles(iq)) {
        try { await processPreKeyBundle(this.signal, jid, bundle); } catch (e) { console.error(`[session ${this.id}] prekey ${jid}:`, e.message); }
      }
    }
    const skdMsg = protoEncode('Message', { senderKeyDistributionMessage: { groupId: groupJid, axolotlSenderKeyDistributionMessage: skdm } });
    const participants = [];
    let includeDeviceIdentity = false;
    for (const jid of targets) {
      if (!this.auth.sessions[this.signalAddr(jid)]) continue;
      const e = await encryptSignalMessage(this.signal, jid, skdMsg);
      if (e.type === 'pkmsg') includeDeviceIdentity = true;
      participants.push({ tag: 'to', attrs: { jid }, content: [{ tag: 'enc', attrs: { v: '2', type: e.type }, content: e.ciphertext }] });
    }

    // 4. Stanza: <enc skmsg> (cuerpo) + <participants> (reparto SKDM) [+ device-identity].
    const id = this.client.generateMessageId();
    const content = [
      { tag: 'enc', attrs: { v: '2', type: 'skmsg' }, content: ciphertext },
      { tag: 'participants', attrs: {}, content: participants },
    ];
    if (includeDeviceIdentity) content.push({ tag: 'device-identity', attrs: {}, content: encodeAccount(this.auth.account) });
    this.client.sendNode({ tag: 'message', attrs: { id, to: groupJid, type: 'text', addressing_mode: meta.addressingMode }, content });
    void meUser;
    return { id, to: groupJid, devices: participants.length };
  }

  // Publica un estado/historia (status@broadcast). Igual que un grupo pero la
  // audiencia es statusJidList (los contactos que verán el estado), no un grupo.
  // messageObj: objeto Message ya armado (texto/media). statusJidList: string[].
  async sendStatus(messageObj, statusJidList = []) {
    if (!this.auth.me) throw new Error('sesión no emparejada');
    const STATUS = 'status@broadcast';
    const meId = this.auth.me.id;
    const base = (j) => `${jidDecode(j).user}@s.whatsapp.net`;
    const audience = [...new Set([base(meId), ...statusJidList.map(base)])];
    const devices = await usyncDevices(this.client, audience);
    if (devices.lidPairs?.length) storeLIDPNMappings(this.auth, devices.lidPairs);
    const targets = devices.map((d) => d.jid).filter((j) => j !== meId);

    const body = protoEncode('Message', messageObj);
    const { ciphertext, skdm } = await encryptGroupMessage(this.signal, STATUS, meId, body);

    const need = targets.filter((j) => !this.auth.sessions[this.signalAddr(j)]);
    if (need.length) {
      const iq = await this.client.fetchPreKeys(need);
      for (const { jid, bundle } of parsePreKeyBundles(iq)) {
        try { await processPreKeyBundle(this.signal, jid, bundle); } catch (e) { console.error(`[session ${this.id}] prekey ${jid}:`, e.message); }
      }
    }
    const skdMsg = protoEncode('Message', { senderKeyDistributionMessage: { groupId: STATUS, axolotlSenderKeyDistributionMessage: skdm } });
    const participants = [];
    let includeDeviceIdentity = false;
    for (const jid of targets) {
      if (!this.auth.sessions[this.signalAddr(jid)]) continue;
      const e = await encryptSignalMessage(this.signal, jid, skdMsg);
      if (e.type === 'pkmsg') includeDeviceIdentity = true;
      participants.push({ tag: 'to', attrs: { jid }, content: [{ tag: 'enc', attrs: { v: '2', type: e.type }, content: e.ciphertext }] });
    }
    const id = this.client.generateMessageId();
    const content = [
      { tag: 'enc', attrs: { v: '2', type: 'skmsg' }, content: ciphertext },
      { tag: 'participants', attrs: {}, content: participants },
    ];
    if (includeDeviceIdentity) content.push({ tag: 'device-identity', attrs: {}, content: encodeAccount(this.auth.account) });
    this.client.sendNode({ tag: 'message', attrs: { id, to: STATUS, type: messageType(messageObj) }, content });
    return { id, to: STATUS, audience: participants.length };
  }

  // ---- App State (archivar/fijar/silenciar/leer/estrella/borrar para mí) ----

  // Sincroniza colecciones de app state desde el servidor (decodifica snapshots/
  // patches y aplica los cambios a this.chats). isInitial: tras history sync.
  async resyncAppState(names = APP_STATE_COLLECTIONS, isInitial = false) {
    const getKeyData = (b64) => (this.auth.appStateSyncKeys[b64] ? Buffer.from(this.auth.appStateSyncKeys[b64], 'base64') : null);
    for (const name of names) {
      const raw = this.auth.appStateVersions[name];
      let state = raw ? { version: raw.version, hash: Buffer.from(raw.hash, 'base64'), indexValueMap: raw.indexValueMap || {} } : newLTHashState();
      let hasMore = true; let guard = 0;
      while (hasMore && guard++ < 10) {
        const returnSnapshot = state.version === 0;
        let res;
        try {
          res = await this.client.sendIq({ tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'w:sync:app:state', id: this.client.nextId() },
            content: [{ tag: 'sync', attrs: {}, content: [{ tag: 'collection', attrs: { name, version: String(state.version), return_snapshot: returnSnapshot ? 'true' : 'false' }, content: undefined }] }] });
        } catch (e) { console.error(`[session ${this.id}] resync ${name}:`, e.message); break; }
        const col = extractSyncdPatches(res).find((c) => c.name === name);
        if (!col) break;
        hasMore = col.hasMorePatches;
        try {
          const { state: ns, mutations } = await decodeCollection(col, state, getKeyData);
          state = ns;
          for (const m of mutations) this.processSyncAction(m, isInitial);
        } catch (e) {
          if (e.isMissingKey) { console.error(`[session ${this.id}] ${name}: falta app-state-key, parkeada`); break; }
          console.error(`[session ${this.id}] decode ${name}:`, e.message); break;
        }
      }
      this.auth.appStateVersions[name] = { version: state.version, hash: state.hash.toString('base64'), indexValueMap: state.indexValueMap };
    }
    await this.persist();
    this.scheduleSaveState();
  }

  // Aplica una mutación decodificada a la vista de chats.
  processSyncAction({ index, syncAction }, isInitial = false) {
    const [type, jid] = index;
    const v = syncAction.value || {};
    if (type === 'deleteChat') { if (!isInitial) this.chats.delete(jid); return; }
    if (type === 'setting_pushName' || type === 'pushName') { if (v.pushNameSetting?.name && this.auth.me) this.auth.me.name = v.pushNameSetting.name; return; }
    if (type === 'contact') { if (v.contactAction) this.pushnames[jid] = v.contactAction.fullName || v.contactAction.firstName || this.pushnames[jid]; return; }
    if (type === 'star' || type === 'deleteMessageForMe') return; // a nivel de mensaje
    const chat = this.chats.get(jid) || { id: jid };
    if (type === 'mute') chat.muteEndTime = v.muteAction?.muted ? Number(v.muteAction.muteEndTimestamp || 0) : null;
    else if (type === 'pin_v1') chat.pinned = !!v.pinAction?.pinned;
    else if (type === 'archive') chat.archived = !!v.archiveChatAction?.archived;
    else if (type === 'markChatAsRead') chat.unread = v.markChatAsReadAction?.read ? 0 : -1;
    else return;
    this.chats.set(jid, chat);
    this.scheduleSaveState();
  }

  // Envía una mutación de app state (cifrada con LTHash) por IQ w:sync:app:state.
  async sendAppStatePatch(name, mutation) {
    const keyId = this.auth.myAppStateKeyId;
    if (!keyId || !this.auth.appStateSyncKeys[keyId]) throw new Error('sin app-state-sync-key (re-vincula y espera el sync)');
    // Sincronizar la versión base con el servidor antes de enviar (evita rechazo).
    await this.resyncAppState([name]).catch(() => {});
    const keyData = Buffer.from(this.auth.appStateSyncKeys[keyId], 'base64');
    const raw = this.auth.appStateVersions[name];
    const state = raw
      ? { version: raw.version, hash: Buffer.from(raw.hash, 'base64'), indexValueMap: raw.indexValueMap || {} }
      : newLTHashState();
    mutation.value.timestamp = mutation.value.timestamp || Date.now();
    const { patch, state: ns } = encodeSyncdPatch(state, name, keyId, keyData, mutation);
    await this.client.sendIq({
      tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'w:sync:app:state', id: this.client.nextId() },
      content: [{ tag: 'sync', attrs: {}, content: [{ tag: 'collection', attrs: { name, version: String(ns.version - 1), return_snapshot: 'false' },
        content: [{ tag: 'patch', attrs: {}, content: protoEncode('SyncdPatch', patch) }] }] }],
    });
    this.auth.appStateVersions[name] = { version: ns.version, hash: ns.hash.toString('base64'), indexValueMap: ns.indexValueMap };
    await this.persist();
    return { ok: true, version: ns.version };
  }

  async archiveChat(jid, archived = true) {
    return this.sendAppStatePatch('regular_low', { index: ['archive', toWhatsAppJid(jid)], value: { archiveChatAction: { archived } }, operation: 0, apiVersion: 3 });
  }
  async pinChat(jid, pinned = true) {
    return this.sendAppStatePatch('regular_low', { index: ['pin_v1', toWhatsAppJid(jid)], value: { pinAction: { pinned } }, operation: 0, apiVersion: 5 });
  }
  async muteChat(jid, muteEndTimestamp = null) {
    const muted = muteEndTimestamp !== false;
    return this.sendAppStatePatch('regular_high', { index: ['mute', toWhatsAppJid(jid)], value: { muteAction: { muted, muteEndTimestamp: muteEndTimestamp || undefined } }, operation: 0, apiVersion: 2 });
  }
  async markChatRead(jid, read = true) {
    return this.sendAppStatePatch('regular_low', { index: ['markChatAsRead', toWhatsAppJid(jid)], value: { markChatAsReadAction: { read } }, operation: 0, apiVersion: 3 });
  }
  async starMessage(jid, key, starred = true) {
    return this.sendAppStatePatch('regular_low', { index: ['star', toWhatsAppJid(jid), key.id, key.fromMe ? '1' : '0', '0'], value: { starAction: { starred } }, operation: 0, apiVersion: 2 });
  }
  async deleteMessageForMe(jid, key, timestamp) {
    return this.sendAppStatePatch('regular_high', { index: ['deleteMessageForMe', toWhatsAppJid(jid), key.id, key.fromMe ? '1' : '0', '0'], value: { deleteMessageForMeAction: { deleteMedia: false, messageTimestamp: timestamp || Date.now() } }, operation: 0, apiVersion: 3 });
  }

  // Metadatos de un grupo (participantes, asunto, etc.).
  async groupInfo(groupJid) {
    return groupMetadata(this.client, groupJid);
  }

  // ---- Administración de grupos ----
  async groupCreate(subject, participants) { return groupCreate(this.client, subject, participants.map((p) => toWhatsAppJid(p))); }
  async groupParticipants(groupJid, participants, action) { return groupParticipantsUpdate(this.client, groupJid, participants.map((p) => toWhatsAppJid(p)), action); }
  async groupSubject(groupJid, subject) { return groupUpdateSubject(this.client, groupJid, subject); }
  async groupDescription(groupJid, description) { return groupUpdateDescription(this.client, groupJid, description); }
  async groupSetting(groupJid, setting) { return groupSettingUpdate(this.client, groupJid, setting); }
  async groupInvite(groupJid) { return groupInviteCode(this.client, groupJid); }
  async groupRevokeInvite(groupJid) { return groupRevokeInvite(this.client, groupJid); }
  async groupAcceptInvite(code) { return groupAcceptInvite(this.client, code); }
  async groupInviteInfo(code) { return groupGetInviteInfo(this.client, code); }
  async groupLeave(groupJid) { return groupLeave(this.client, groupJid); }
  async groupEphemeral(groupJid, seconds) { return groupToggleEphemeral(this.client, groupJid, Number(seconds) || 0); }
  async groupJoinRequests(groupJid) { return groupRequestParticipantsList(this.client, groupJid); }
  async groupJoinRequestsUpdate(groupJid, participants, action) { return groupRequestParticipantsUpdate(this.client, groupJid, participants.map((p) => toWhatsAppJid(p)), action); }
  async groupAddMode(groupJid, mode) { return groupMemberAddMode(this.client, groupJid, mode); }
  async groupApprovalMode(groupJid, mode) { return groupJoinApprovalMode(this.client, groupJid, mode); }
  async communityCreate(subject, body) { return communityCreate(this.client, subject, body); }
  async communityLink(parentJid, groupJid) { return communityLinkGroup(this.client, parentJid, groupJid); }
  async communityUnlink(parentJid, groupJid) { return communityUnlinkGroup(this.client, parentJid, groupJid); }
  async communitySubgroups(jid) { return getSubgroups(this.client, jid); }

  // ---- Perfil, contactos y privacidad ----
  async onWhatsApp(numbers) { return onWhatsApp(this.client, numbers); }
  async fetchStatus(jids) { return fetchStatus(this.client, Array.isArray(jids) ? jids : [jids]); }
  async profilePicture(jid, type) { return profilePictureUrl(this.client, jid, type); }
  async setProfilePicture(jpegBuffer, jid = null) { return updateProfilePicture(this.client, jid, jpegBuffer); }
  async removeProfilePicture(jid = null) { return removeProfilePicture(this.client, jid); }
  async setStatus(text) { return updateProfileStatus(this.client, text); }
  async businessProfile(jid) { return getBusinessProfile(this.client, jid); }
  async privacySettings() { return fetchPrivacySettings(this.client); }
  async setPrivacy(name, value) { return updatePrivacySetting(this.client, name, value); }

  // ---- Emparejamiento por código (alternativa al QR) ----
  // Solicita un código de 8 caracteres para teclear en el móvil. Requiere que la
  // sesión esté conectada al servidor (handshake hecho) y aún no registrada.
  async requestPairingCode(phone) {
    if (!this.client) throw new Error('sesión no iniciada');
    if (this.auth.registered || this.auth.account) throw new Error('la sesión ya está emparejada');
    const code = await this.client.requestPairingCode(phone);
    this.pairingCode = code;
    this.status = 'pairing_code';
    await this.persist();
    return code;
  }

  // ---- LID (Linked ID) ----
  lidForPn(pn) { return getLIDForPN(this.auth, pn); }
  pnForLid(lid) { return getPNForLID(this.auth, lid); }

  // ---- Bloqueos y estados/historias ----
  async blocklist() { return fetchBlocklist(this.client); }
  async blockUser(jid) { return updateBlockStatus(this.client, jid, 'block'); }
  async unblockUser(jid) { return updateBlockStatus(this.client, jid, 'unblock'); }
  // Publica un estado de texto. statusJidList = contactos que lo verán.
  async setTextStatus(text, statusJidList = [], opts = {}) {
    const m = opts.font || opts.backgroundArgb
      ? { extendedTextMessage: { text, font: opts.font, backgroundArgb: opts.backgroundArgb, textArgb: opts.textArgb } }
      : { conversation: text };
    return this.sendStatus(m, statusJidList);
  }

  // ---- Newsletters / Canales ----
  async newsletterCreate(name, description) { return newsletterCreate(this.client, name, description); }
  async newsletterFollow(jid) { return newsletterFollow(this.client, jid); }
  async newsletterUnfollow(jid) { return newsletterUnfollow(this.client, jid); }
  async newsletterInfo(key, type) { return newsletterMetadata(this.client, key, type); }
  async newsletterMute(jid, mute = true) { return mute ? newsletterMute(this.client, jid) : newsletterUnmute(this.client, jid); }
  async newsletterDelete(jid) { return newsletterDelete(this.client, jid); }
  async newsletterUpdate(jid, updates) { return newsletterUpdate(this.client, jid, updates); }

  // Envía texto a un newsletter (plaintext, sin cifrado e2e).
  async sendNewsletterText(jid, text) {
    const id = this.client.generateMessageId();
    this.client.sendNode({ tag: 'message', attrs: { to: jid, id, type: 'text' }, content: [{ tag: 'plaintext', attrs: {}, content: protoEncode('Message', { conversation: text }) }] });
    return { id, to: jid };
  }

  // Recepción de mensajes de newsletter (llegan como <notification type=newsletter>).
  onNewsletterNotification(node) {
    if (node.attrs?.type !== 'newsletter') return;
    const msgNode = child(node, 'message');
    const pt = msgNode && child(msgNode, 'plaintext');
    if (!pt?.content) return;
    try {
      const m = protoDecode('Message', Buffer.from(pt.content));
      this.messages.unshift({ id: msgNode.attrs.message_id, chat: node.attrs.from, from: node.attrs.from, text: m.conversation || m.extendedTextMessage?.text || '', at: new Date().toISOString(), newsletter: true });
      this.messages = this.messages.slice(0, 200);
      this.scheduleSaveState();
    } catch { /* contenido no decodificable */ }
  }

  // Clave del mapa de sesiones (coincide con ProtocolAddress.toString()).
  signalAddr(jid) {
    return jidToAddr(jid).toString();
  }

  // Lista de chats obtenida del history sync, ordenada por actividad reciente.
  listChats() {
    return [...this.chats.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  async rejectCall(callId) {
    const call = this.calls.find((c) => c.id === callId);
    if (!call) throw new Error(`llamada ${callId} no encontrada en el historial`);
    await this.client.rejectCall(callId, call.from);
    call.rejectedAt = new Date().toISOString();
  }

  async disconnect() {
    this.stopped = true; // evita la reconexión automática
    await this.client?.disconnect();
    this.status = 'closed';
  }

  info() {
    return {
      id: this.id,
      status: this.status,
      hasQr: Boolean(this.qr),
      me: this.auth.me || null,
      calls: this.calls.length,
      messages: this.messages.length,
      chats: this.chats.size,
      lastError: this.lastError,
      closeReason: this.closeReason,
    };
  }
}

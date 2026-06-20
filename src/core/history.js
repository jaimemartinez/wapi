// Procesa una HistorySyncNotification: descarga el blob cifrado, lo descomprime
// y extrae la lista de conversaciones (chats) y los nombres de contacto.
import { inflateSync } from 'node:zlib';
import { downloadEncryptedMedia } from './media.js';
import { decode as protoDecode, type as protoType } from './proto.js';

// notification = HistorySyncNotification ya decodificado del ProtocolMessage.
export async function processHistorySync(notification) {
  const enc = await downloadEncryptedMedia(
    { directPath: notification.directPath, mediaKey: notification.mediaKey },
    'history',
  );
  // El contenido en claro va comprimido con zlib.
  const raw = inflateSync(enc);
  const sync = protoDecode('HistorySync', raw);

  const T = protoType('HistorySync');
  const obj = T.toObject(sync, { defaults: true, longs: Number });

  const chats = (obj.conversations || []).map((c) => ({
    id: c.id,
    name: c.name || null,
    unread: c.unreadCount || 0,
    timestamp: c.conversationTimestamp || c.lastMsgTimestamp || 0,
    archived: Boolean(c.archived),
  }));

  const pushnames = {};
  for (const p of obj.pushnames || []) if (p.id) pushnames[p.id] = p.pushname;

  return { syncType: obj.syncType, chats, pushnames };
}

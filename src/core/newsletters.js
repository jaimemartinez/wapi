// Newsletters/Canales. La gestión va por w:mex (GraphQL sobre IQ); el envío es
// plaintext (sin e2e). Equivalente nativo de lib/Socket/newsletter.js de Baileys.
import { child } from './pairing.js';

const Q = {
  create: '8823471724422422', follow: '24404358912487870', unfollow: '9767147403369991',
  metadata: '6563316087068696', mute: '29766401636284406', unmute: '9864994326891137',
  update: '24250201037901610', del: '30062808666639665',
};
const PATH = {
  create: 'xwa2_newsletter_create', follow: 'xwa2_newsletter_join_v2', unfollow: 'xwa2_newsletter_leave_v2',
  metadata: 'xwa2_newsletter', mute: 'xwa2_newsletter_mute_v2', unmute: 'xwa2_newsletter_unmute_v2',
  update: 'xwa2_newsletter_update', del: 'xwa2_newsletter_delete_v2',
};

// Ejecuta una operación GraphQL (w:mex) y devuelve data[dataPath].
async function mex(client, queryId, variables, dataPath) {
  const res = await client.sendIq({
    tag: 'iq', attrs: { to: 's.whatsapp.net', type: 'get', xmlns: 'w:mex', id: client.nextId() },
    content: [{ tag: 'query', attrs: { query_id: queryId }, content: Buffer.from(JSON.stringify({ variables }), 'utf8') }],
  });
  const result = child(res, 'result');
  const json = JSON.parse(Buffer.from(result.content).toString('utf8'));
  if (json.errors) throw new Error(json.errors[0]?.message || 'error w:mex');
  return json.data?.[dataPath];
}

export const newsletterCreate = (client, name, description = null) =>
  mex(client, Q.create, { input: { name, description } }, PATH.create);

export const newsletterFollow = (client, jid) =>
  mex(client, Q.follow, { newsletter_id: jid }, PATH.follow);

export const newsletterUnfollow = (client, jid) =>
  mex(client, Q.unfollow, { newsletter_id: jid }, PATH.unfollow);

export const newsletterMetadata = (client, key, type = 'JID') =>
  mex(client, Q.metadata, { fetch_creation_time: true, fetch_full_image: true, fetch_viewer_metadata: true, input: { key, type } }, PATH.metadata);

export const newsletterMute = (client, jid) => mex(client, Q.mute, { newsletter_id: jid }, PATH.mute);
export const newsletterUnmute = (client, jid) => mex(client, Q.unmute, { newsletter_id: jid }, PATH.unmute);
export const newsletterDelete = (client, jid) => mex(client, Q.del, { newsletter_id: jid }, PATH.del);
export const newsletterUpdate = (client, jid, updates) =>
  mex(client, Q.update, { newsletter_id: jid, updates: { settings: null, ...updates } }, PATH.update);

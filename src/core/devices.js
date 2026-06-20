// Descubrimiento de dispositivos (USync). Para enviar un mensaje, WhatsApp exige
// cifrarlo para TODOS los dispositivos del destinatario y los tuyos. Esta query
// pide la lista de dispositivos (device-list) de uno o varios usuarios.
import { child } from './pairing.js';
import { jidDecode, jidEncode, S_WHATSAPP_NET } from '../protocol/binary/jid.js';

// jids = lista de jids BASE (usuario@s.whatsapp.net, sin dispositivo).
// Devuelve [{ user, device, jid }] con un jid por dispositivo.
export async function usyncDevices(client, jids) {
  const userNodes = jids.map((jid) => ({ tag: 'user', attrs: { jid }, content: undefined }));
  const res = await client.sendIq({
    tag: 'iq',
    attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'usync', id: client.nextId() },
    content: [{
      tag: 'usync',
      attrs: { context: 'message', mode: 'query', sid: client.nextId(), last: 'true', index: '0' },
      content: [
        { tag: 'query', attrs: {}, content: [{ tag: 'devices', attrs: { version: '2' }, content: undefined }] },
        { tag: 'list', attrs: {}, content: userNodes },
      ],
    }],
  });

  const usync = child(res, 'usync');
  const list = usync && child(usync, 'list');
  const out = [];
  for (const userNode of (list?.content || [])) {
    if (userNode.tag !== 'user') continue;
    const user = jidDecode(userNode.attrs.jid)?.user;
    const devices = child(userNode, 'devices');
    const deviceList = devices && child(devices, 'device-list');
    for (const d of (deviceList?.content || [])) {
      if (d.tag !== 'device') continue;
      const device = Number(d.attrs.id);
      out.push({ user, device, jid: jidEncode(user, S_WHATSAPP_NET, device || undefined) });
    }
  }
  return out;
}

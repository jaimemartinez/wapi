// Construye el ClientPayload que viaja (cifrado) en el ClientFinish del
// handshake. Dos variantes: REGISTRO (primer login, genera QR) y LOGIN
// (reconexión con credenciales ya emparejadas).
import { createHash } from 'node:crypto';
import { encode } from './proto.js';
import { jidDecode } from '../protocol/binary/jid.js';

// Versión de WhatsApp Web que anunciamos. Mantenla cercana a la del bundle real;
// una versión demasiado vieja hace que el servidor rechace la conexión.
const WA_VERSION = [2, 3000, 1035194821];

function int3(n) {
  const b = Buffer.alloc(3);
  b.writeUIntBE(n, 0, 3);
  return b;
}

// UserAgent EXACTO que envía el cliente oficial (verificado contra Baileys);
// valores como platform=14 y osVersion='0.1' son los que el servidor acepta.
function userAgent() {
  return {
    platform: 14, // WEB
    appVersion: { primary: WA_VERSION[0], secondary: WA_VERSION[1], tertiary: WA_VERSION[2] },
    mcc: '000',
    mnc: '000',
    osVersion: '0.1',
    device: 'Desktop',
    osBuildNumber: '0.1',
    releaseChannel: 0, // RELEASE
    localeLanguageIso_639_1: 'en',
    localeCountryIso_3166_1Alpha_2: 'US',
  };
}

function webInfo() {
  return { webSubPlatform: 0 }; // WEB_BROWSER
}

// Props del dispositivo. Usamos el blob exacto del cliente oficial (os 'Mac OS',
// features estándar) que el servidor acepta; el nombre real del dispositivo se
// fija con DeviceProps.os si se quiere personalizar más adelante.
const DEVICE_PROPS_B64 = 'CgZNYWMgT1MSBggKEA8YBxgBIAEqFxiAUCABMAA4AUABSAFQAVgBYAFwAXgA';
function deviceProps() {
  return Buffer.from(DEVICE_PROPS_B64, 'base64');
}

// Hash de build que espera el registro (md5 de la versión textual).
function buildHash() {
  return createHash('md5').update(WA_VERSION.join('.')).digest();
}

// Payload de REGISTRO: incluye las claves del dispositivo para que el teléfono,
// al escanear el QR, pueda emparejar y firmar la identidad.
export function registrationPayload(auth) {
  return encode('ClientPayload', {
    connectReason: 1, // USER_ACTIVATED
    connectType: 1, // WIFI_UNKNOWN
    passive: false,
    userAgent: userAgent(),
    webInfo: webInfo(),
    devicePairingData: {
      eRegid: (() => { const b = Buffer.alloc(4); b.writeUInt32BE(auth.registrationId); return b; })(),
      eKeytype: Buffer.from([5]),
      eIdent: auth.signedIdentityKey.public,
      eSkeyId: int3(auth.signedPreKey.keyId),
      eSkeyVal: auth.signedPreKey.keyPair.public,
      eSkeySig: auth.signedPreKey.signature,
      buildHash: buildHash(),
      deviceProps: deviceProps(),
    },
  });
}

// Payload de LOGIN: reconexión con un dispositivo ya emparejado.
export function loginPayload(auth) {
  const { user, device } = jidDecode(auth.me.id); // p.ej. "12345:6@s.whatsapp.net"
  return encode('ClientPayload', {
    connectReason: 1,
    connectType: 1,
    passive: true,
    userAgent: userAgent(),
    webInfo: webInfo(),
    username: Number(user),
    device: device || 0,
  });
}

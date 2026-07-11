// Configuración central. Todo por variables de entorno para mantenerlo
// containerless: se arranca con `node src/index.js` sin nada más.
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

export const config = {
  // Servidor HTTP de la API REST.
  host: process.env.WAPI_HOST || '127.0.0.1',
  port: Number(process.env.WAPI_PORT || 4000),

  // Token simple para proteger la API (cabecera `x-api-key`). Vacío = sin auth.
  apiKey: process.env.WAPI_KEY || '',

  // Rate limiting por cliente (API key o IP), ventana fija. 0 = desactivado.
  rateLimit: Number(process.env.WAPI_RATE_LIMIT || 300), // peticiones por ventana
  rateWindowMs: Number(process.env.WAPI_RATE_WINDOW_MS || 60000), // tamaño de ventana

  // Carpeta donde se persisten credenciales/claves de cada sesión.
  sessionsDir: process.env.WAPI_SESSIONS_DIR || join(ROOT, 'sessions'),

  // Parámetros del cliente que se anuncian a WhatsApp en el handshake.
  client: {
    name: process.env.WAPI_DEVICE_NAME || 'wapi',
    browser: ['wapi', 'Chrome', '120.0.0'], // [os, navegador, versión]
  },

  root: ROOT,
};

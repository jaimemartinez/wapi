// Punto de entrada. Arranca la API REST y rehidrata las sesiones guardadas.
import { createServer } from './api/server.js';
import { SessionManager } from './core/SessionManager.js';
import { config } from './config.js';

// Red de seguridad: un error no capturado en un handler de socket/sesión NO
// debe tumbar todo el servidor. Lo registramos (con stack) y seguimos vivos.
process.on('uncaughtException', (err) => {
  console.error('[wapi] uncaughtException:', err?.stack || err);
});
process.on('unhandledRejection', (err) => {
  console.error('[wapi] unhandledRejection:', err?.stack || err);
});

async function main() {
  const manager = new SessionManager(config);
  await manager.init(); // rehidrata sesiones persistidas en disco

  const { listen } = createServer(manager);
  await listen();

  const shutdown = async () => {
    console.log('\n[wapi] cerrando…');
    await manager.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[wapi] fallo al arrancar:', err);
  process.exit(1);
});

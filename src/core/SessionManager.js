// Gestiona el ciclo de vida de todas las sesiones: creación, recuperación,
// listado, persistencia y rehidratación al arrancar.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Session } from './Session.js';
import {
  newAuthState, loadAuthState, saveAuthState, deleteAuthState,
} from './auth.js';

export class SessionManager {
  constructor(config) {
    this.config = config;
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
  }

  // Rehidrata las sesiones cuyas credenciales hay guardadas en disco.
  async init() {
    let files = [];
    try {
      files = await readdir(this.config.sessionsDir);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      if (file.endsWith('.state.json') || file.endsWith('.json.tmp')) continue; // no son ficheros de credenciales
      const id = file.slice(0, -5);
      const auth = await loadAuthState(this.config.sessionsDir, id);
      if (!auth) continue;
      const session = new Session(id, auth, this.config);
      this.sessions.set(id, session);
      // Solo reconectamos automáticamente las que ya estaban emparejadas.
      if (auth.me) session.start().catch((e) => console.error(`[wapi] rehidratar ${id}:`, e.message));
    }
    console.log(`[wapi] ${this.sessions.size} sesión(es) rehidratada(s)`);
  }

  async create(id) {
    let session = this.sessions.get(id);
    if (!session) {
      let auth = await loadAuthState(this.config.sessionsDir, id);
      if (!auth) {
        auth = newAuthState();
        await saveAuthState(this.config.sessionsDir, id, auth);
      }
      session = new Session(id, auth, this.config);
      this.sessions.set(id, session);
    }
    if (session.status === 'idle' || session.status === 'closed') {
      session.start().catch((e) => console.error(`[wapi] start ${id}:`, e.message));
    }
    return session;
  }

  get(id) { return this.sessions.get(id); }

  list() {
    return [...this.sessions.values()].map((s) => s.info());
  }

  async destroy(id) {
    const session = this.sessions.get(id);
    if (session) await session.disconnect();
    this.sessions.delete(id);
    await deleteAuthState(this.config.sessionsDir, id);
  }

  async shutdown() {
    for (const session of this.sessions.values()) {
      await session.disconnect().catch(() => {});
    }
  }
}

// Router mínimo sobre node:http. Sin Express: soporta rutas con parámetros
// (`:id`), parseo de JSON en el body y envío de respuestas JSON.
import { config } from '../config.js';

export class Router {
  constructor() {
    /** @type {{method:string, parts:string[], handler:Function}[]} */
    this.routes = [];
  }

  add(method, path, handler) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler });
    return this;
  }

  get(path, h) { return this.add('GET', path, h); }
  post(path, h) { return this.add('POST', path, h); }
  delete(path, h) { return this.add('DELETE', path, h); }

  // Empareja una URL contra una ruta registrada, extrayendo `:params`.
  match(method, url) {
    const reqParts = url.split('?')[0].split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.parts.length !== reqParts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i++) {
        const rp = route.parts[i];
        if (rp.startsWith(':')) params[rp.slice(1)] = decodeURIComponent(reqParts[i]);
        else if (rp !== reqParts[i]) { ok = false; break; }
      }
      if (ok) return { handler: route.handler, params };
    }
    return null;
  }

  // Devuelve el handler de node:http.
  handler() {
    return async (req, res) => {
      try {
        // Auth opcional por API key (las rutas públicas quedan exentas).
        const publicPath = ['/health', '/docs', '/openapi.json'].includes(req.url.split('?')[0]);
        if (config.apiKey && !publicPath && req.headers['x-api-key'] !== config.apiKey) {
          return send(res, 401, { error: 'unauthorized' });
        }

        const matched = this.match(req.method, req.url);
        if (!matched) return send(res, 404, { error: 'not_found' });

        const ctx = {
          req,
          res,
          params: matched.params,
          query: Object.fromEntries(new URL(req.url, 'http://x').searchParams),
          body: await readJson(req),
          send: (status, data) => send(res, status, data),
          sendHtml: (status, html) => {
            res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
          },
        };
        await matched.handler(ctx);
      } catch (err) {
        console.error('[api] error no controlado:', err);
        if (!res.headersSent) send(res, 500, { error: 'internal_error', message: String(err?.message || err) });
      }
    };
  }
}

function send(res, status, data) {
  const payload = JSON.stringify(data ?? {});
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readJson(req) {
  if (req.method === 'GET' || req.method === 'DELETE') return Promise.resolve({});
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) reject(new Error('body demasiado grande'));
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON inválido en el body')); }
    });
    req.on('error', reject);
  });
}

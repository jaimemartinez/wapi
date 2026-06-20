import http from 'node:http';
import { Router } from './router.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerCallRoutes } from './routes/calls.js';
import { registerProfileRoutes } from './routes/profile.js';
import { openapiSpec, swaggerHtml } from './openapi.js';
import { config } from '../config.js';

export function createServer(manager) {
  const router = new Router();

  // Health check.
  router.get('/health', async ({ send }) => send(200, { ok: true, name: 'wapi', version: '0.1.0' }));

  // Documentación OpenAPI: spec JSON + Swagger UI navegable en /docs.
  router.get('/openapi.json', async ({ send }) => send(200, openapiSpec));
  router.get('/docs', async ({ sendHtml }) => sendHtml(200, swaggerHtml));

  registerSessionRoutes(router, manager);
  registerMessageRoutes(router, manager);
  registerCallRoutes(router, manager);
  registerProfileRoutes(router, manager);

  const server = http.createServer(router.handler());
  return {
    server,
    listen: () => new Promise((resolve) => {
      server.listen(config.port, config.host, () => {
        console.log(`[wapi] API escuchando en http://${config.host}:${config.port}`);
        resolve(server);
      });
    }),
  };
}

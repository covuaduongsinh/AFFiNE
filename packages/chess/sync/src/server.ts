import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { createSchema, createYoga } from 'graphql-yoga';

import { registerAuthRoutes } from './auth/routes.js';
import { resolveUser } from './auth/session.js';
import { registerBlobRoutes } from './blob/routes.js';
import { type ChessSyncConfig, loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { errorBody, HttpError } from './errors.js';
import { createResolvers } from './graphql/resolvers.js';
import { typeDefs } from './graphql/schema.js';
import { exportAllDocsToMarkdown } from './markdown/export.js';
import { scanAndImportAllMarkdown } from './markdown/import.js';
import { attachSocket } from './sync/socket.js';
import type { AppState, GqlContext } from './types.js';

export interface ChessSyncHandle {
  baseUrl: string;
  port: number;
  close(): Promise<void>;
}

export async function startChessSync(
  options: Partial<ChessSyncConfig> = {}
): Promise<ChessSyncHandle> {
  const config = loadConfig(options);
  const db = await openDatabase(config.dataDir, config.jwtSecret);
  const state: AppState = {
    db,
    host: config.host,
    port: config.port,
    baseUrl: config.publicOrigin || `http://${config.host}:${config.port}`,
    publicOrigin: config.publicOrigin ?? '',
    allowedEmails: config.allowedEmails,
  };

  // trustProxy so request.ip is the client rather than the proxy's bridge
  // address — it is what any future rate limit would key on, and what makes a
  // log entry name someone real.
  const app = Fastify({
    logger: false,
    bodyLimit: 104857600,
    trustProxy: true,
  });
  await app.register(cookie);
  // `origin: true` reflects whatever Origin arrives and allows credentials
  // with it, which lets any page a signed-in user visits call this API as
  // them. Narrow it once we know our own address.
  //
  // The desktop app is not served from that address: its renderer runs on the
  // `assets:` scheme (electron/src/shared/internal-origin.ts). Leave those out
  // and the Windows app cannot sign in.
  await app.register(cors, {
    origin: config.publicOrigin
      ? [config.publicOrigin, 'assets://.', 'assets://another-host']
      : true,
    credentials: true,
  });

  app.get('/health', async () => ({ ok: true, version: '0.27.0' }));

  app.post('/api/sync/import-markdown', async (req, reply) => {
    try {
      const query = req.query as Record<string, unknown> | undefined;
      const body = req.body as Record<string, unknown> | undefined;
      const force =
        query?.force === 'true' ||
        query?.force === true ||
        body?.force === true ||
        body?.force === 'true';
      const count = await scanAndImportAllMarkdown(state, force);
      return await reply.send({ success: true, count });
    } catch (err) {
      app.log.error(err);
      return await reply
        .status(500)
        .send({ success: false, error: String(err) });
    }
  });

  app.post('/api/sync/export-markdown', async (_req, reply) => {
    try {
      await exportAllDocsToMarkdown(state);
      return await reply.send({ success: true });
    } catch (err) {
      app.log.error(err);
      return await reply
        .status(500)
        .send({ success: false, error: String(err) });
    }
  });

  await registerAuthRoutes(app, state);
  registerBlobRoutes(app, state);

  const yoga = createYoga<{ req: FastifyRequest; reply: FastifyReply }>({
    schema: createSchema({
      typeDefs,
      resolvers: createResolvers(),
    }),
    graphqlEndpoint: '/graphql',
    landingPage: false,
    graphiql: false,
    maskedErrors: false,
    extraParamNames: ['map', 'name'],
    context: async ({ req }): Promise<GqlContext> => {
      // Configured wins. This origin is written into the database — an avatar
      // upload stores an absolute URL — so deriving it from a header the
      // client sets means one spoofed request leaves a wrong URL there for
      // good. Header sniffing survives only as the local-development fallback.
      const proto =
        typeof req.headers['x-forwarded-proto'] === 'string'
          ? req.headers['x-forwarded-proto']
          : 'http';
      const host = req.headers.host ?? `${state.host}:${state.port}`;
      return {
        app,
        state,
        user: await resolveUser(state, req),
        origin: state.publicOrigin || `${proto}://${host}`,
      };
    },
  });

  app.addContentTypeParser('multipart/form-data', (_request, payload, done) => {
    done(null, payload);
  });

  app.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
      try {
        const auth = req.headers.authorization;
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          await resolveUser(state, req);
        }
      } catch (error) {
        if (error instanceof HttpError) {
          return reply.status(error.body.status).send(error.body);
        }
        throw error;
      }

      const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
        else if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        }
      }

      const isMultipart = String(req.headers['content-type'] ?? '').includes(
        'multipart/form-data'
      );

      const request = new Request(url, {
        method: req.method,
        headers,
        body: isMultipart
          ? (req.raw as any)
          : req.method === 'GET' || req.method === 'HEAD'
            ? undefined
            : JSON.stringify(req.body ?? {}),
        // @ts-expect-error Node fetch duplex option
        duplex: 'half',
      });

      const response = await yoga.fetch(request, { req, reply });
      if (response.status >= 400) {
        try {
          const cloned = response.clone();
          console.error(
            '[GraphQL ERROR RESPONSE]',
            response.status,
            await cloned.text()
          );
        } catch {
          // ignore
        }
      }
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.status(response.status);
      reply.send(Buffer.from(await response.arrayBuffer()));
      return reply;
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.body.status).send(error.body);
    }
    app.log.error(error);
    return reply
      .status(500)
      .send(errorBody(500, 'INTERNAL_SERVER_ERROR', error.message));
  });

  await app.ready();
  const io = attachSocket(app, state);
  state.io = io;
  await app.listen({ host: config.host, port: config.port });
  const address = app.server.address();
  const port =
    typeof address === 'object' && address ? address.port : config.port;
  state.port = port;
  // Behind a proxy the address that matters is the one people type, not the
  // socket we happened to bind. This is what the desktop app registers as the
  // server, so a loopback value there would be useless to it.
  state.baseUrl =
    config.publicOrigin ||
    `http://${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}:${port}`;

  void exportAllDocsToMarkdown(state).catch(err => {
    app.log.error(err);
  });

  return {
    baseUrl: state.baseUrl,
    port,
    async close() {
      io.disconnectSockets(true);
      // oxlint-disable-next-line typescript/no-floating-promises
      io.close();
      await app.close();
      await db.close();
    },
  };
}

import type { FastifyInstance } from 'fastify';

import { resolveUser } from '../auth/session.js';
import { errorBody, HttpError } from '../errors.js';
import { encodeDocBytes } from '../sync/docs.js';
import type { AppState } from '../types.js';
import { getMember } from '../workspace.js';
import { readBlobFile } from './store.js';

export function registerBlobRoutes(app: FastifyInstance, state: AppState) {
  app.get<{ Params: { workspaceId: string; key: string } }>(
    '/api/workspaces/:workspaceId/blobs/:key',
    async (request, reply) => {
      try {
        const user = await resolveUser(state, request);
        if (!user) {
          throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
        }
        const member = await getMember(
          state,
          request.params.workspaceId,
          user.id
        );
        if (!member || member.status !== 'Accepted') {
          throw new HttpError(403, 'ACCESS_DENIED', 'Not a workspace member');
        }
        const blob = await readBlobFile(
          state,
          request.params.workspaceId,
          request.params.key
        );
        if (!blob) {
          return await reply
            .status(404)
            .send(errorBody(404, 'NOT_FOUND', 'blob not found'));
        }
        reply.header('content-type', blob.mime);
        reply.header('last-modified', blob.mtime.toUTCString());
        return await reply.send(blob.bytes);
      } catch (error) {
        if (error instanceof HttpError) {
          return await reply.status(error.body.status).send(error.body);
        }
        throw error;
      }
    }
  );

  app.get<{ Params: { workspaceId: string; docId: string } }>(
    '/api/workspaces/:workspaceId/docs/:docId',
    async (request, reply) => {
      try {
        const user = await resolveUser(state, request);
        if (!user) {
          throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
        }
        const member = await getMember(
          state,
          request.params.workspaceId,
          user.id
        );
        if (!member || member.status !== 'Accepted') {
          throw new HttpError(403, 'ACCESS_DENIED', 'Not a workspace member');
        }
        const bytes = await encodeDocBytes(
          state,
          request.params.workspaceId,
          request.params.docId
        );
        if (!bytes) {
          return await reply
            .status(404)
            .send(errorBody(404, 'DOC_NOT_FOUND', 'not found'));
        }
        reply.header('content-type', 'application/octet-stream');
        return await reply.send(bytes);
      } catch (error) {
        if (error instanceof HttpError) {
          return await reply.status(error.body.status).send(error.body);
        }
        throw error;
      }
    }
  );
}

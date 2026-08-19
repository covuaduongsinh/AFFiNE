import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  CHESS_TOOL_SCHEMAS,
  type ChessToolResult,
  isChessToolName,
} from '@blocksuite/chess-engine';

import type { CoachAuditSink } from './audit';

export type CoachToolInvoker = (
  name: string,
  args: unknown
) => Promise<ChessToolResult>;

export interface ChessCoachHubOptions {
  invokeTool: CoachToolInvoker;
  audit: CoachAuditSink;
  token?: string;
}

const MCP_PROTOCOL = '2024-11-05';

export class ChessCoachHub {
  private server: http.Server | null = null;
  private port = 0;
  readonly token: string;
  private readonly invokeTool: CoachToolInvoker;
  private readonly audit: CoachAuditSink;

  constructor(options: ChessCoachHubOptions) {
    this.invokeTool = options.invokeTool;
    this.audit = options.audit;
    this.token = options.token ?? randomBytes(24).toString('base64url');
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  get listeningPort(): number {
    return this.port;
  }

  async start(): Promise<{ url: string; token: string; port: number }> {
    if (this.server) {
      return { url: this.url, token: this.token, port: this.port };
    }

    const server = http.createServer((req, res) => {
      this.handle(req, res).catch(() => {});
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = this.server.address() as AddressInfo;
    this.port = address.port;
    return { url: this.url, token: this.token, port: this.port };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  }

  async call(name: string, args?: unknown): Promise<ChessToolResult> {
    if (!isChessToolName(name)) {
      this.audit({
        ts: Date.now(),
        tool: name,
        allowed: false,
        reason: 'not_whitelisted',
      });
      return {
        ok: false,
        code: 'unknown_tool',
        error: `tool ${name} is not allowed`,
      };
    }
    this.audit({ ts: Date.now(), tool: name, allowed: true });
    return this.invokeTool(name, args);
  }

  private authorized(req: http.IncomingMessage): boolean {
    const header = req.headers.authorization ?? '';
    if (header === `Bearer ${this.token}`) return true;
    const extra = req.headers['x-chess-coach-token'];
    return extra === this.token;
  }

  private async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    try {
      if (!this.authorized(req)) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      const url = req.url ?? '/';
      if (req.method === 'GET' && url.startsWith('/health')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method !== 'POST' || !url.startsWith('/mcp')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      const body = await readBody(req);
      const message = JSON.parse(body || '{}') as {
        jsonrpc?: string;
        id?: string | number | null;
        method?: string;
        params?: Record<string, unknown>;
      };
      const reply = await this.dispatch(message);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply));
    } catch (error) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'bad request',
        })
      );
    }
  }

  private async dispatch(message: {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: Record<string, unknown>;
  }) {
    const id = message.id ?? null;
    const method = message.method ?? '';

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: MCP_PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'affine-chess', version: '0.1.0' },
        },
      };
    }

    if (method === 'notifications/initialized' || method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: Object.entries(CHESS_TOOL_SCHEMAS).map(([name, schema]) => ({
            name,
            description: schema.description,
            inputSchema: schema.inputSchema,
          })),
        },
      };
    }

    if (method === 'tools/call') {
      const name = String(message.params?.name ?? '');
      const args = message.params?.arguments;
      const result = await this.call(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
          isError: !result.ok,
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `unknown method ${method}` },
    };
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { DOC_VERSION, PUSH_OPS } from '../common/protocol/ops.ts';
import { changesSince, apiDoc, renderMarkdown } from '../common/protocol/docs.ts';
import { encode, errorBody, parseRequest } from '../common/protocol/frames.ts';
import type { ResponseFrame } from '../common/protocol/frames.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import type { Player } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { OpError, dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const DB_PATH = process.env.DB_PATH ?? join(ROOT, 'backend', 'data', 'agent-tactics.db');
const PORT = Number(process.env.API_PORT ?? 8525);

const store = new Store(openDb(DB_PATH));

function playerFor(accountId: string): Player {
  const player = store.getPlayerByAccount(accountId);
  if (!player) throw new OpError('UNAUTHORIZED', '账号没有玩家');
  return syncPlayer(store, player);
}

function runOp(accountId: string, op: number, data: Record<string, unknown>, agentModel: string | null, push: Context['push']): unknown {
  if (PUSH_OPS.has(op)) throw new OpError('BAD_REQUEST', `op ${op} 是推送，不能主动发送`);
  const ctx: Context = { store, player: playerFor(accountId), accountId, agentModel, push };
  return dispatch(ctx, op, data ?? {});
}

function errorResponse(seq: number, op: number, error: unknown): ResponseFrame {
  if (error instanceof OpError) return { op, seq, ok: false, error: errorBody(error.code, error.message) };
  const message = error instanceof Error ? error.message : String(error);
  return { op, seq, ok: false, error: errorBody('INTERNAL', message) };
}

const app = Fastify({ logger: false });

await app.register(websocket);

// ---- Agent protocol over WebSocket (docs/06) -----------------------------

interface Conn {
  accountId: string | null;
  agentModel: string | null;
  seq: number;
}

app.get('/ws', { websocket: true }, (socket) => {
  const conn: Conn = { accountId: null, agentModel: null, seq: 0 };
  const send = (frame: unknown) => { try { socket.send(encode(frame as never)); } catch { /* closed */ } };

  socket.on('message', (raw: Buffer) => {
    let op = 0, seq = 0;
    try {
      const frame = parseRequest(raw.toString());
      op = frame.op;
      seq = frame.seq ?? 0;
      if (frame.op === 1) {
        const data = (frame.data ?? {}) as Record<string, unknown>;
        const token = String(data.token ?? '');
        const resolved = store.resolveSession(token) ? { accountId: store.resolveSession(token)! } : store.resolveToken(token);
        if (!resolved) throw new OpError('UNAUTHORIZED', '令牌无效');
        conn.accountId = resolved.accountId;
        conn.agentModel = typeof data.agentModel === 'string' ? data.agentModel : null;
        const clientVersion = typeof data.docVersion === 'number' ? data.docVersion : 0;
        const notice = clientVersion !== DOC_VERSION ? `当前协议版本 ${DOC_VERSION}，你的客户端是 ${clientVersion}，请更新。` : null;
        const player = playerFor(conn.accountId);
        send({ op: 1, seq, ok: true, data: { docVersion: DOC_VERSION, docNotice: notice, player: { id: player.id, name: player.name, legion: player.legion } } });
        return;
      }
      if (frame.op === 2) {
        conn.accountId = null;
        send({ op: 2, seq, ok: true, data: { ok: true } });
        return;
      }
      if (!conn.accountId) throw new OpError('UNAUTHORIZED', '先 LOGIN');
      const data = (frame.data ?? {}) as Record<string, unknown>;
      const result = runOp(conn.accountId, frame.op, data, conn.agentModel, (pushOp, pushData) => send({ op: pushOp, data: pushData }));
      send({ op, seq, ok: true, data: result ?? {} });
    } catch (error) {
      send(errorResponse(seq, op, error));
    }
  });
});

// ---- HTTP bridge for the browser -----------------------------------------

app.post('/api/login', (req, reply) => {
  const body = (req.body ?? {}) as { name?: string; password?: string; legion?: string };
  try {
    const result = loginOrRegister(store, String(body.name ?? ''), body.password, body.legion);
    const player = syncPlayer(store, result.player);
    reply.send({ token: result.token, state: dispatch({ store, player, accountId: result.accountId, agentModel: null, push: () => {} }, 10, {}) });
  } catch (error) {
    reply.code(400).send(error instanceof Error ? { error: error.message } : { error: String(error) });
  }
});

app.get('/api/agent-token', (req, reply) => {
  const accountId = authAccount(req.headers.authorization);
  if (!accountId) return reply.code(401).send({ error: 'unauthorized' });
  const existing = store.db.prepare("SELECT token FROM tokens WHERE account_id = ? AND kind = 'agent' LIMIT 1").get(accountId) as { token: string } | undefined;
  const token = existing?.token ?? store.createToken(accountId, 'agent', '网页生成');
  reply.send({ token, docVersion: DOC_VERSION, ws: `ws://localhost:${PORT}/ws`, docs: '/agent-api.md' });
});

app.post('/api/op', (req, reply) => {
  const accountId = authAccount(req.headers.authorization);
  if (!accountId) return reply.code(401).send({ op: 0, seq: 0, ok: false, error: errorBody('UNAUTHORIZED', '未登录') });
  const body = (req.body ?? {}) as { op?: number; seq?: number; data?: Record<string, unknown> };
  const op = Number(body.op), seq = Number(body.seq ?? 0);
  if (!Number.isInteger(op)) return reply.code(400).send(errorResponse(seq, 0, new OpError('BAD_REQUEST', '缺少 op')));
  try {
    const data = runOp(accountId, op, body.data ?? {}, null, () => {});
    reply.send({ op, seq, ok: true, data: data ?? {} });
  } catch (error) {
    reply.send(errorResponse(seq, op, error));
  }
});

function authAccount(header: string | undefined): string | null {
  const token = header?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return null;
  const session = store.resolveSession(token);
  if (session) return session;
  return store.resolveToken(token)?.accountId ?? null;
}

// ---- generated protocol docs ---------------------------------------------

app.get('/agent-api.json', (_req, reply) => reply.send(apiDoc()));
app.get('/agent-api.md', (_req, reply) => reply.type('text/markdown; charset=utf-8').send(renderMarkdown()));
app.get('/agent-api/changes/:v', (req, reply) => {
  const v = Number((req.params as { v: string }).v);
  const changes = changesSince(v);
  if (!changes) return reply.code(404).send({ error: `没有从 v${v} 起的变更记录` });
  reply.send(changes);
});
app.get('/api/health', (_req, reply) => reply.send({ ok: true, docVersion: DOC_VERSION, players: store.allPlayers().length }));

// ---- static frontend (production build) ----------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

app.get('/*', (req, reply) => {
  const dist = join(ROOT, 'frontend', 'dist');
  if (!existsSync(dist)) return reply.code(404).send('前端尚未构建：cd frontend && npm run build');
  const rel = normalize((req.params as Record<string, string>)['*'] ?? '').replace(/^(\.\.[/\\])+/, '');
  const candidate = rel ? join(dist, rel) : '';
  const target = candidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(dist, 'index.html');
  reply.type(MIME[extname(target)] ?? 'application/octet-stream').send(readFileSync(target));
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`AgentTactics API on http://localhost:${PORT}  (db: ${DB_PATH})`);
});

export { app, store, runOp };

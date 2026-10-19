import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { OP, OPS, PUSH_OPS, WRITE_OPS } from '../backend/common/protocol/ops.ts';
import { schemaFor } from '../backend/common/protocol/schemas.ts';

// A dependency-free MCP server (docs/07「MCP 插件」). Tools are generated from the same op table that
// generates docs/agent-api.md, so a new op appears here without a second definition. It talks to the
// running API over HTTP using an agent token (env AGENT_TOKEN), so it needs no extra credentials.
//
// Request fields are shared with the API. Nested { data } is the advertised format;
// flat arguments remain accepted for existing clients.

const API_URL = process.env.API_URL ?? 'http://localhost:8525';
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? '';
const TOOL_OPS = OPS.filter(def => !PUSH_OPS.has(def.op) && def.op !== OP.LOGIN && def.op !== OP.LOGOUT);

export interface McpTool { name: string; description: string; inputSchema: Record<string, unknown> }

export function toolList(): McpTool[] {
  return TOOL_OPS.map(def => {
    const schema = schemaFor(def.name);
    return {
      name: def.name.toLowerCase(),
      description: `[op ${def.op} · ${def.group}] ${def.agentNote}`,
      inputSchema: {
        type: 'object',
        properties: {
          data: schema
            ? { type: 'object', properties: schema.properties, required: schema.required ?? [], additionalProperties: false }
            : { type: 'object', description: '该 op 的请求字段，见 docs/agent-api.md', additionalProperties: true },
        },
        ...(schema?.required?.length ? { anyOf: [{ required: ['data'] }, { required: schema.required }] } : {}),
        additionalProperties: true,
      },
    };
  });
}

async function callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const def = TOOL_OPS.find(op => op.name.toLowerCase() === name.toLowerCase());
  if (!def) return { text: `未知工具 ${name}；MCP 已通过 AGENT_TOKEN 认证，无需 LOGIN／LOGOUT。`, isError: true };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { text: '工具参数必须是对象', isError: true };
  const input = args.data === undefined ? args : args.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { text: 'data 必须是对象', isError: true };
  const data = { ...input } as Record<string, unknown>;
  const writes = WRITE_OPS.has(def.op) || def.group === 'Agent';
  if (data.commandId !== undefined && (typeof data.commandId !== 'string' || data.commandId.length === 0)) {
    return { text: 'commandId 必须是非空字符串；重试请保留原 commandId。', isError: true };
  }
  if (writes && data.commandId === undefined) data.commandId = randomUUID();
  // Retry the same request, including its receipt key, even when the response was lost after commit.
  const body = JSON.stringify({ op: def.op, seq: 1, data });
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${API_URL}/api/op`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_TOKEN}` },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const frame = await response.json() as { ok: boolean; data?: unknown; error?: { code: string; message: string; action: string } };
      if (!frame || typeof frame.ok !== 'boolean') throw new Error('API 返回了无效的协议响应');
      if (!frame.ok) return { text: `[${frame.error?.code}] ${frame.error?.message}\naction: ${frame.error?.action}`, isError: true };
      return { text: JSON.stringify(frame.data ?? {}, null, 2), isError: false };
    } catch (error) {
      if (attempt === 0) continue;
      const detail = error instanceof Error ? error.message : String(error);
      const recovery = writes ? `\n操作结果未确认，commandId: ${data.commandId}。先查询状态；如需重试，必须在 data.commandId 中使用此 ID，不要新建命令。` : '';
      return { text: `${detail}${recovery}`, isError: true };
    }
  }
}

function reply(id: unknown, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function replyError(id: unknown, code: number, message: string): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

async function handle(message: { id?: unknown; method?: string; params?: Record<string, unknown> }): Promise<void> {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'agent-tactics', version: '1.0.0' },
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: toolList() });
  if (method === 'tools/call') {
    const name = String(params.name ?? '');
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const result = await callTool(name, args);
    return reply(id, { content: [{ type: 'text', text: result.text }], isError: result.isError });
  }
  replyError(id, -32601, `未知方法 ${method}`);
}

if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', line => {
    const text = line.trim();
    if (!text) return;
    try {
      const message = JSON.parse(text) as { id?: unknown; method?: string; params?: Record<string, unknown> };
      void handle(message).catch(error => {
        const detail = error instanceof Error ? error.message : String(error);
        if (message?.method === 'tools/call') {
          reply(message.id, { content: [{ type: 'text', text: detail }], isError: true });
        } else {
          replyError(message?.id ?? null, -32603, detail);
        }
      });
    } catch {
      replyError(null, -32700, '解析失败');
    }
  });
}

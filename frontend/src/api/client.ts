// Browser side of the Agent protocol (docs/06): every screen reads server state through here. The
// session token lives in localStorage; requests go through the rsbuild dev proxy at /api.
const TOKEN_KEY = 'agent-tactics.token';

export interface FrameError { code: string; message: string; action: string }

export class ApiError extends Error {
  code: string;
  action: string;

  constructor(error: FrameError) {
    super(error.message);
    this.code = error.code;
    this.action = error.action;
  }
}

export function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(value: string | null): void {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Session stays in memory only.
  }
}

export function newCommandId(): string {
  try { return crypto.randomUUID(); } catch { return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export async function call<T = unknown>(op: number, data: Record<string, unknown> = {}, commandId?: string): Promise<T> {
  const body = JSON.stringify({ op, seq: Date.now() % 100000, data: commandId ? { ...data, commandId } : data });
  const send = () => fetch('/api/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token() ? { authorization: `Bearer ${token()}` } : {}) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  let response: Response;
  try {
    response = await send();
  } catch {
    // 网络断开时用同一 commandId 重试一次；服务端收据保证只执行一次。
    await new Promise(resolve => setTimeout(resolve, 250));
    response = await send();
  }
  const frame = await response.json() as { ok: boolean; data?: T; error?: FrameError };
  if (!frame.ok) throw new ApiError(frame.error ?? { code: 'INTERNAL', message: '未知错误', action: '重试' });
  return frame.data as T;
}

export async function login(name: string, password?: string, legion?: string): Promise<{ token: string; state: unknown }> {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, password, legion }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json() as { token?: string; state?: unknown; error?: string };
  if (!body.token) throw new Error(body.error ?? '登录失败');
  setToken(body.token);
  return { token: body.token, state: body.state };
}

export async function agentToken(): Promise<{ token: string; ws: string; docVersion: number }> {
  const response = await fetch('/api/agent-token', { headers: token() ? { authorization: `Bearer ${token()}` } : {}, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('无法获取 Agent 令牌');
  return response.json();
}

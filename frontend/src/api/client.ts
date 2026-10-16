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

export async function call<T = unknown>(op: number, data: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token() ? { authorization: `Bearer ${token()}` } : {}) },
    body: JSON.stringify({ op, seq: Date.now() % 100000, data }),
  });
  const frame = await response.json() as { ok: boolean; data?: T; error?: FrameError };
  if (!frame.ok) throw new ApiError(frame.error ?? { code: 'INTERNAL', message: '未知错误', action: '重试' });
  return frame.data as T;
}

export async function login(name: string, password?: string, legion?: string): Promise<{ token: string; state: unknown }> {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, password, legion }),
  });
  const body = await response.json() as { token?: string; state?: unknown; error?: string };
  if (!body.token) throw new Error(body.error ?? '登录失败');
  setToken(body.token);
  return { token: body.token, state: body.state };
}

export async function agentToken(): Promise<{ token: string; ws: string; docVersion: number }> {
  const response = await fetch('/api/agent-token', { headers: token() ? { authorization: `Bearer ${token()}` } : {} });
  if (!response.ok) throw new Error('无法获取 Agent 令牌');
  return response.json();
}

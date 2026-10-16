// Frame format from docs/06: request {op, seq, data}, response {op, seq, ok, data|error},
// pushes carry no seq. Both the WebSocket server and the browser HTTP bridge use these helpers.
import { ERROR_BY_CODE } from './ops.ts';

export interface RequestFrame { op: number; seq?: number; data?: unknown }
export interface ErrorBody { code: string; message: string; action: string }
export type ResponseFrame =
  | { op: number; seq: number; ok: true; data: unknown }
  | { op: number; seq: number; ok: false; error: ErrorBody };
export interface PushFrame { op: number; data: unknown }

export function errorBody(code: string, message: string): ErrorBody {
  const def = ERROR_BY_CODE.get(code);
  return { code, message, action: def?.action ?? '用 GET /agent-api.json 读取错误码说明，不要原样重试' };
}

export function parseRequest(raw: unknown): RequestFrame {
  if (typeof raw !== 'string') throw new Error('帧必须是 JSON 文本');
  const value = JSON.parse(raw) as Partial<RequestFrame>;
  if (!value || typeof value !== 'object' || !Number.isInteger(value.op)) throw new Error('帧缺少整数 op');
  if (value.seq !== undefined && !Number.isInteger(value.seq)) throw new Error('seq 必须是整数');
  return { op: value.op as number, seq: value.seq, data: value.data };
}

export function encode(frame: RequestFrame | ResponseFrame | PushFrame): string {
  return JSON.stringify(frame);
}

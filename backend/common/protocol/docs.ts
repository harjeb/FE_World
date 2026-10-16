// Generates docs/agent-api.md and agent-api.json from the op table (docs/06「协议只在 common 定义一处」).
// The API serves the JSON at /agent-api.json; a test keeps the checked-in markdown in sync.
import { DOC_VERSION, ERRORS, OPS, PUSH_OPS } from './ops.ts';

export interface ApiDoc {
  docVersion: number;
  frames: Record<string, string>;
  ops: { op: number; name: string; group: string; push: boolean; agentNote: string }[];
  errors: { code: string; meaning: string; action: string }[];
}

export function apiDoc(): ApiDoc {
  return {
    docVersion: DOC_VERSION,
    frames: {
      request: '{ op: number, seq: number, data?: object }',
      response: '{ op: number, seq: number, ok: boolean, data?: object, error?: { code, message, action } }',
      push: '{ op: number, data: object }（推送帧没有 seq）',
    },
    ops: OPS.map(def => ({ ...def, push: PUSH_OPS.has(def.op) })),
    errors: ERRORS.map(def => ({ ...def })),
  };
}

export function renderMarkdown(): string {
  const lines: string[] = [];
  lines.push('# Agent 接口文档（自动生成）', '');
  lines.push(`docVersion: ${DOC_VERSION}`, '');
  lines.push('本文件由 `backend/common/protocol/ops.ts` 生成，不要手改。', '');
  lines.push('## 帧格式', '');
  lines.push('```');
  lines.push('请求  { op, seq, data? }');
  lines.push('响应  { op, seq, ok, data? | error: { code, message, action } }');
  lines.push('推送  { op, data }');
  lines.push('```', '');
  lines.push('## op 清单', '');
  let group = '';
  for (const def of OPS) {
    if (def.group !== group) {
      group = def.group;
      lines.push(`### ${group}`, '');
      lines.push('| op | 名称 | 说明 |', '| --- | --- | --- |');
    }
    lines.push(`| ${def.op} | ${def.name} | ${def.agentNote} |`);
  }
  lines.push('', '## 错误码', '');
  lines.push('| 错误码 | 含义 | action（写给 Agent） |', '| --- | --- | --- |');
  for (const def of ERRORS) lines.push(`| ${def.code} | ${def.meaning} | ${def.action} |`);
  lines.push('');
  return lines.join('\n');
}

// docs/06「版本只加不改」: GET /agent-api/changes/{v} returns the delta. v1 is the first version.
export function changesSince(version: number): { from: number; to: number; changes: string[] } | null {
  if (version === DOC_VERSION) return { from: version, to: DOC_VERSION, changes: [] };
  if (version < 1) {
    return { from: version, to: DOC_VERSION, changes: [`v1: 首次发布，共 ${OPS.length} 个 op、${ERRORS.length} 个错误码。`] };
  }
  return null;
}

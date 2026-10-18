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

// docs/06「版本只加不改」: GET /agent-api/changes/{v} returns all later changes.
export function changesSince(version: number): { from: number; to: number; changes: string[] } | null {
  if (!Number.isInteger(version) || version > DOC_VERSION) return null;
  const releases = [
    { version: 1, text: 'v1: 首次发布。' },
    { version: 2, text: 'v2: 新增 WITHDRAW_ANNUAL(113)；年度赛事锁定报名培养和物资；START_MAIN_STAGE兼容入口也要求年度报名；任务预览补齐敌军等级、日期、风险及额外物资。' },
    { version: 3, text: 'v3: COMPLETE_SETUP改为神主角完整属性分配：固定平民与成长型，60点直接填写九属性，倾向自动推导；setup.protagonist返回固定配置与逐属性上下限，初始三人使用E级基础装备。' },
  ];
  return { from: version, to: DOC_VERSION, changes: releases.filter(release => release.version > version).map(release => release.text) };
}

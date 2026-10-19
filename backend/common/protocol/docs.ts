// Generates docs/agent-api.md and agent-api.json from the op table (docs/06「协议只在 common 定义一处」).
// The API serves the JSON at /agent-api.json; a test keeps the checked-in markdown in sync.
import { DOC_VERSION, ERRORS, OPS, PUSH_OPS } from './ops.ts';
import { schemaFor, type OpSchema } from './schemas.ts';

export interface ApiDoc {
  docVersion: number;
  frames: Record<string, string>;
  ops: { op: number; name: string; group: string; push: boolean; agentNote: string; dataSchema?: OpSchema & { type: 'object'; additionalProperties: false } }[];
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
    ops: OPS.map(def => {
      const schema = schemaFor(def.name);
      return { ...def, push: PUSH_OPS.has(def.op), ...(schema && !PUSH_OPS.has(def.op) ? { dataSchema: { type: 'object' as const, ...schema, additionalProperties: false as const } } : {}) };
    }),
    errors: ERRORS.map(def => ({ ...def })),
  };
}

export function renderMarkdown(): string {
  const lines: string[] = [];
  lines.push('# Agent 接口文档（自动生成）', '');
  lines.push(`docVersion: ${DOC_VERSION}`, '');
  lines.push('本文件由 `backend/common/protocol/ops.ts` 与 `schemas.ts` 生成，不要手改。', '');
  lines.push('每个请求的完整参数见 `/agent-api.json` 中对应 op 的 `dataSchema`，与 MCP 的 `data` 参数声明共用来源。', '');
  lines.push('MCP 使用 `AGENT_TOKEN` 认证，不提供 WebSocket 专用的 LOGIN／LOGOUT。写操作自动附带 commandId，连接或响应解析失败时使用同一 ID 重试一次；仍无法确认时错误会返回该 ID，后续重试必须复用 data.commandId。', '');
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
    { version: 4, text: 'v4: 新增世界地图开荒：GET_WORLD_MAP(141) 与 CHOOSE_ROUTE(142)；开局不再默认全地区可出击，先选起步路线（1–4，不耗日）、清剿后再解锁相邻地区；GET_TODAY.sortieRegions、任务、剧情、挑战塔与工坊设施按解锁进度过滤，出击／副本／派遣／招募／声望商店按地区拦截；王都商店收缩为 E 级基础装备与常用补给，进阶武器迁往地区声望商店；旧存档按讨伐、声望、任务与既有战斗／远征／派遣自动认领地区，不重置任何养成数据。' },
    { version: 5, text: 'v5: COMPLETE_SETUP保留固定基础属性，allocation改为额外10点加成，每项0–5、未填按0计；GET_STATE.setup.protagonist新增baseStats，默认加点为0，倾向只按额外加点推导。已有角色属性与成长不重算。' },
    { version: 6, text: 'v6: 十二地区新增持久化flags.regionExploration（0–100，新账号为0）；普通随机野外遭遇战胜利+3，单图任务完成+5，每个副本（含多图任务）仅首次完整通关+20，中间图及重复副本不增加，任务与副本不叠加；单独领奖、失败、撤退、扫荡和后台派遣均+0。初选1–4自由，之后须将已开通地区探索至100才可开通其相邻新路线，已开通地区仍可访问；探索度独立于clearedRegions，首次胜利仍按原规则开放战斗功能与扫荡。旧档仅在缺失探索度字段时惰性初始化，只有此前已讨伐地区设为100，其他地区为0，既有探索度不再次回填，已开通权限与历史数据保留。世界、任务、随机野外准备及副本准备页展示探索条。' },
    { version: 7, text: 'v7: 补齐请求参数 schema 与公共 commandId，agent-api.json 同步提供 dataSchema；MCP 排除 WebSocket 专用 LOGIN／LOGOUT，写操作使用稳定命令 ID 重试并在结果未确认时返回恢复 ID；维修纳入控制权、赛事、战斗和版本校验，报价执行复用同一操作校验且仅递增一次版本；GET_AGENT_INFO 按账号最近五分钟心跳判断在线。' },
  ];
  return { from: version, to: DOC_VERSION, changes: releases.filter(release => release.version > version).map(release => release.text) };
}

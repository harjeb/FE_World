# 07 技术架构

## 当前实现（2026-10-16）

本次整合以远端 `b7d2b8f` 为基础。当前浏览器经 `frontend/src/api/client.ts` 和 `session.ts` 调用 Fastify 的 HTTP 桥；Agent 经 WebSocket `/ws` 调用同一组数字 op。协议清单位于 `backend/common/protocol/ops.ts`，具体处理器位于 `backend/api/handlers.ts`。

持久化已使用 Node 内置 `node:sqlite`，由 `backend/api/db.ts` 建表、`store.ts` 读写；API 与 Worker 默认共享 `backend/data/agent-tactics.db`，均可由 `DB_PATH` 覆盖。运行要求 Node.js 22.18+。尚无 PostgreSQL 迁移，不能按下文的规划表结构直接查询当前存档。

日期按个人行动推进，Worker 调用同一套懒结算逻辑，不按现实时间发放行动日，也不自动推进玩家日期。当前实现范围与未闭环部分见 [12 功能缺口清单](12-implementation-gap-checklist.md)。后续领域、事务与继承设计保存在 [13 目标设计](13-backend-target-design.md)；现有前端接入和验证命令见 [14](14-integration-handoff.md)。

以下为早期技术方案历史参考；其中赛季时钟、现实24:00结算、赛季内角色和追赶规则已被 [00 个人日历方案](00-game-design.md) 取代，不能作为当前实现要求。

## 技术栈（沿用 SLG）

```
 浏览器（React）──┐
                 ├── WebSocket + JSON ──▶  API（Fastify）  ──┐
 你的 AI Agent ───┘         ▲                               ├──▶ PostgreSQL
 （或 MCP 插件）             │              Worker（定时任务）──┘
                           推送
```

| 目录 | 职责 |
| --- | --- |
| `frontend/` | React + TypeScript + Tailwind + Rsbuild：养成界面、战棋棋盘、观战与回放 |
| `backend/api/` | Fastify + `@fastify/websocket`：连接、登录、协议分发 |
| `backend/worker/` | 独立进程：赛季与游戏月切换、月末快照、竞技场日配对、24:00 结算弃权与公开回放、赛季结算 |
| `backend/common/` | 规则与协议的唯一来源：**战斗引擎**、成长与经验计算、数据表（职业/武器/角色/地图）、协议定义与文档生成 |
| `mcp/` | 独立 npm 包，工具由协议清单自动生成 |
| `tools/sim/` | 模拟器：规则 AI 批量自对弈，用于数值校准 |

## 确定性战斗引擎

引擎是整个项目的核心，放在 `backend/common/engine/`，要求如下：

- **纯函数**：`step(state, action) → { state, events }`，不做 IO、不读时钟、不调 `Math.random`。
- **随机数**：自带的 PRNG（例如 xoshiro128\*\*），状态就是 battle state 的一部分，可以序列化。
- **回放** = 初始状态 + 种子 + 指令序列；重放必须逐字节一致。每场战斗记录 `engineVersion`，规则改动后旧回放仍按旧版本引擎重放（或者至少在加载时校验）。
- 战斗预测、可达范围、威胁区都是引擎上的只读查询，前端和 Agent 看到的数字来自同一套代码。
- 敌方规则 AI 同样放在 common 中，确定性，供 PvE、陪练、模拟器共用。
- 引擎有完整的单元测试；外加一组「黄金回放」测试，防止规则改动意外影响结果。

## 赛季时钟

- **行动日懒结算**（沿用 SLG 的资源懒结算思路）：可用行动日 = 赛季开始至今已发放的总数 − 已使用数，读取时现算，不需要定时任务去给每个人加行动日。晚加入的玩家自然拿到全部累计值。
- **月末快照**需要卡准 24:00：
  - Worker 在每个游戏月末 24:00 之后批量为所有已报名玩家生成快照；
  - 同时 API 在处理任何会改变名册的请求前检查「该玩家是否有一张应拍未拍的快照」，有就先在同一事务里补拍。这样即使 Worker 慢了几秒，24:00 之后的操作也不会混进上个月的快照。
- **竞技场日**：00:00 Worker 为当次所有报名者生成配对（每人进攻 3 次、被进攻 3 次），推送 ARENA_OPPONENTS_READY；24:00 把未完成的进攻判负、结算积分与奖励、公开当天回放。
- 所有时间点以 due_tasks 表登记，Worker 重启不丢、不重复（同 SLG）。

## 数据表草案

| 表 | 内容 |
| --- | --- |
| accounts / agent_tokens / sessions | 账号与令牌（同 SLG） |
| seasons | 赛季：开始时间、游戏月长度、每月行动日数、图池、状态 |
| season_players | 玩家在某赛季的进度：已用行动日、金币、BEXP 池、竞技场积分、勋章 |
| units | 赛季内的单位：角色 id、职业、等级、经验、属性、武器经验、物品、重伤、升级记录 |
| inventory | 仓库物品 |
| map_progress | 每张野外地图的星级与首通记录 |
| battles | 战斗：类型（野外/主线/竞技场/练习）、初始状态 jsonb、种子、当前状态 jsonb、engineVersion、结果 |
| battle_actions | 指令序列（battleId、序号、发起连接、指令 jsonb） |
| defenses | 当前防守设置（可改）：地图、名单、站位、优先级、AI 行为、主将顺序、预设 BAN |
| snapshots | 月末快照：赛季、游戏月、名册 jsonb + 防守设置 jsonb（不可变） |
| arena_days / arena_entries / arena_attacks | 竞技场日、报名（快照 id）、每一次进攻（攻方、守方、BAN、出战、battleId、结果、积分） |
| due_tasks | 到期任务（游戏月切换、快照、竞技场日开始/结束、赛季结算），沿用 SLG 的数据库任务表做法 |
| events | 账号事件流（GET_EVENTS） |

静态数据（职业、武器、角色、野外地图）先以 TypeScript / JSON 文件形式放在 `backend/common/data/`，随代码版本管理。

## 前端

- 棋盘先用 **DOM + CSS Grid** 实现（16×16 以内 DOM 完全够用），动画用 CSS transition。
- 像素画风格的单位立绘和战斗动画需要更多投入时，再评估 Canvas / PixiJS（SLG 的约定是未经明确决定不引入 2D 引擎，这里沿用）。
- 回放播放器直接在浏览器里跑同一个引擎（`backend/common` 打包给前端），只需下载指令序列，不用下载每一步的状态。

## 模拟器（数值校准）

- 用规则 AI 模拟「一个赛季 20 个游戏月」的养成路线，统计第 N 月末的等级与属性分布（纯随机成长下要看分布区间，不只看平均值），对照 04 中的数值目标。
- 用规则 AI 当进攻方，大量进攻各种防守配置，统计每张竞技场地图的攻防胜率、各职业和武器的出场率与胜率，找出过强的组合和失衡的地图。
- 攻防胜率是关键指标：规则 AI 进攻同强度防守时胜率太高，说明防守 AI 太弱或地图偏向进攻方；太低则相反。LLM Agent 通常比规则 AI 打得更好，目标值要用真实 Agent 实测后修正。

## 尚未确定

- PRNG 算法的选型。
- 数据库迁移工具。
- 前端何时引入 Canvas / PixiJS。
- 引擎规则大改后，旧回放的兼容策略（保留多版本引擎，还是只保存每一步的结果状态）。

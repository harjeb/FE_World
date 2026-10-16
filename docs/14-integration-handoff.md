# 14 合并与 UI 接入说明

2026-10-16：主分支以远端提交 `b7d2b8f` 为基础。远端已经实现真实服务端及已接入的页面，后续应沿用这些入口扩展功能。

## 当前实现入口

| 用途 | 入口 |
| --- | --- |
| 玩法定案与候选规则 | `docs/00-game-design.md` |
| 协议唯一来源 | `backend/common/protocol/ops.ts`，当前 `docVersion: 1`、数字 op |
| 生成的接口说明 | `docs/agent-api.md`、`agent-api.json`；由 `npm --prefix backend run docs` 生成 |
| 浏览器登录与请求 | `frontend/src/api/client.ts`：`login`、`call`、`ApiError` |
| 页面状态与业务操作 | `frontend/src/api/session.ts`：`session`、`useSession`、`run`、战斗/整备/竞技场方法 |
| 服务端入口与规则 | `backend/api/server.ts`、`handlers.ts`、`services.ts` |
| 永久军团规则 | `backend/common/game/legacy.ts`（传承／保底／轮回）、`annual.ts`（年度赛事）、`expedition.ts`（三图副本）、`production.ts`（生产）、`story.ts`（八章） |
| 当前存档 | `backend/api/db.ts`、`store.ts`；SQLite，默认 `backend/data/agent-tactics.db` |
| 共用战斗与养成 | `backend/common/engine`、`game`、`data`、`arena` |

UI 可以更换布局和样式，读取 `useSession()` 的状态，并经 `session` 提交操作。需要增加协议时修改共享 op 表和处理器，重新生成文档；不要另建一套数字或字符串操作名，也不要直接把客户端计算出的金币、属性或战斗结果写回存档。

成长类型在角色上只显示label。不要把00／13中的内部曲线、加减百分点、转折年龄、剩余时间、概率与招募年龄生成逻辑写成玩家教程或提示。保留实际属性／成长记录，合计成长若展示必须准确；行动耗日、死亡风险及传承／轮回的实际结果仍明确告知。当前名册已移除独立的“成长类型/年龄修正”数值说明，旧协议仍保留计算字段。

新增定案以00 §4.2.1／9.1.1及13 §5.5为准：职业精通不等于人物等级；自动探索／职业训练可自选天数，按个人行动日后台并行，外出角色不可参与其他战斗，返程有物资、武器、经验及双精通。已学技能跨职业自由装备共5格；已购资格营地免费切回。普通竞技榜按现实月重置，与个人年份／派遣返程分开。这些规则须按对应实现能力接入，不直接假定旧SWEEP／TRAIN或连续副本接口就是新派遣功能。

HTTP 使用 `POST /api/login` 和 `POST /api/op`；Agent 使用 `/ws`。当前不存在 `/api/v2/query`、`/api/v2/commands`、`GET_CAPABILITIES` 或命令收据查询接口。尚未实现幂等键和状态版本校验，因此写操作超时后应刷新服务器状态再确认结果，不能自动原样重发消费、招募或出击指令。

## 保留的本地工作

原本地后端设计与独立 v2 前端共23个文件，已保存在本地分支 `codex/local-v2-before-remote-20261016`，提交 `464aaae`。该分支保留完整契约、mock、恢复逻辑与31项测试，可随时对照；没有推送远端。

```powershell
git show codex/local-v2-before-remote-20261016:docs/13-frontend-functional-layer.md
git diff main...codex/local-v2-before-remote-20261016 -- backend/common/protocol frontend/src/game
```

这套 v2 客户端没有接入当前服务端，未放进主分支运行目录。可复用的后续领域设计保存在 [13](13-backend-target-design.md)，并明确标为未实现草案。后续按现有代码逐项补齐，不用整体重写。

## 完成范围

已验证登录、个人日期、军营行动、整备物品转移/买卖/能力药/公共经验、名册快照、出击、竞技场进攻、防守保存和回放读取，以及五阶职业、99级成长、武器三角与现有战斗规则。

2026-10-16 第四轮又补齐了下列后端闭环（op 见 `backend/common/protocol/ops.ts`，测试见对应 `*.test.ts`）：

- **幂等与版本**：带 `commandId` 的写命令返回原收据，换负载报 `IDEMPOTENCY_CONFLICT`；写命令推进 `player.version`；`GET_EVENTS` 返回 `cursor`。
- **永久军团**：`GET_LEGACIES`／`CLAIM_LEGACY`／`RETIRE_UNIT`／`REINCARNATE_UNIT`／`GET_MEMORIAL`／`EMERGENCY_RECRUIT`；死亡／退役冻结遗产并回收装备；成长与数值两种传承、逐级保底、一代血缘锁；一次轮回重置学习与年龄。
- **职业市场**：`GET_CLASS_MARKET`／`BUY_CLASS_QUALIFICATION`，按年份开放、跨路线、种族与主角校验。
- **生产**：`GET_PRODUCTION`／`PLANT`／`START_PRODUCTION`／`COLLECT_PRODUCTION`；耐久与维修仍 `FEATURE_DISABLED`（docs/13 §7 明确默认关闭）。
- **连续远征**：`GET_RUN`／`START_DUNGEON`／`CONTINUE_DUNGEON`／`WITHDRAW_RUN`；三图固定名单、跨图状态、完整通关才带回掉落，地区首通等级锁定。
- **行动报价**：`PREVIEW_ACTION`／`EXECUTE_ACTION`，报价与 `playerVersion` 绑定，执行时重新校验，过期返回可刷新错误。
- **年度赛事与主线**：`GET_ANNUAL`／`REGISTER_ANNUAL`／`START_ANNUAL_MATCH`；`GET_STORY`／`COMPLETE_STORY_EVENT`／`CLAIM_REWARD`。

仍未实现：自捏开局、完整八届内容、不朽盾完整石化、耐久与完美锻造、成长率传承是否随轮回清除、职业技能节点结构。观战页仍自动播放历史回放，尚非实时订阅。

当前仍为演示存档（新账号使用预置军团和日期）。自捏神主角与3人开局、完整八届年度赛事、连续副本、遗产继承、轮回、生产等仍需开发；完整状态以 [12](12-implementation-gap-checklist.md) 对应条目为准。观战页目前自动播放服务器历史战斗，尚非实时订阅。

2026-10-16随后确认的新规则已写入00和13（普通竞技场1日、职业购买／跨路线、一代传承、轮回重置16岁与学习成果、免费紧急补员、固定类型年龄曲线等）。它们尚未改入本篇验证过的远端业务代码。UI应沿用当前接口，待对应后端条目完成后接入，不能仅改按钮文案就宣称规则生效。

本次只补充合并验证所需的兼容修复：生成协议文档固定 LF 换行；Worker 默认数据库路径使用系统路径转换；浏览器测试退出时等待进程树停止后清理临时目录。游戏规则、页面布局与远端 API 保持远端实现。

## 验证与运行

需要 Node.js 22.18+，本次使用已安装的 Node.js 24.19.0。系统默认 Node 22.14 不满足要求。在仓库根目录执行以下 PowerShell 命令；若已有符合要求的 Node，可省略 PATH 设置。

```powershell
$env:Path = 'C:\Users\harjeb\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
node --version
npm --prefix backend ci --ignore-scripts
npm --prefix frontend ci --ignore-scripts
npm --prefix backend test
node --test tools/mapgen/mapgen.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend run build
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
Push-Location frontend
try {
  node test/backend-integration.e2e.mjs
  node test/battle-replay.e2e.mjs
} finally {
  Pop-Location
}
git diff --check
```

本次结果：后端72项、地图14项测试通过；浏览器联调21项、战斗/防守/回放6项检查通过；类型检查、生产构建及差异空白检查通过。浏览器测试自建临时存档，不修改正式存档；未执行真实多玩家压力、完整八年流程或生产部署验收。

2026-10-16 第四轮结果：后端 engine/arena/game/protocol/api 测试 **113 通过，0 失败**；地图生成器 **14 通过，0 失败**；前端 `typecheck` 与 `build` 通过；浏览器 `backend-integration.e2e.mjs` 21/21、`battle-replay.e2e.mjs` 6/6。本轮只改后端与文档，未新增页面。

使用满足版本要求的 Node 后，分别在终端运行：

```powershell
npm --prefix backend start
```

```powershell
npm --prefix frontend run dev
```

可选独立 Worker：`npm --prefix backend run worker`。默认前端8524、API8525；API也可直接提供已构建的前端。

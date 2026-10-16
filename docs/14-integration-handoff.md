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
| 当前存档 | `backend/api/db.ts`、`store.ts`；SQLite，默认 `backend/data/agent-tactics.db` |
| 共用战斗与养成 | `backend/common/engine`、`game`、`data`、`arena` |

UI 可以更换布局和样式，读取 `useSession()` 的状态，并经 `session` 提交操作。需要增加协议时修改共享 op 表和处理器，重新生成文档；不要另建一套数字或字符串操作名，也不要直接把客户端计算出的金币、属性或战斗结果写回存档。

成长类型在角色上只显示label。不要把00／13中的内部曲线、加减百分点、转折年龄、剩余时间、概率与招募年龄生成逻辑写成玩家教程或提示。保留实际属性／成长记录，合计成长若展示必须准确；行动耗日、死亡风险及传承／轮回的实际结果仍明确告知。当前名册已移除独立的“成长类型/年龄修正”数值说明，旧协议仍保留计算字段。

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

使用满足版本要求的 Node 后，分别在终端运行：

```powershell
npm --prefix backend start
```

```powershell
npm --prefix frontend run dev
```

可选独立 Worker：`npm --prefix backend run worker`。默认前端8524、API8525；API也可直接提供已构建的前端。

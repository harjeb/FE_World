# 14 · 合并与UI接入说明

更新：2026-10-18。当前交付以`main`的实际服务端和共享数字op协议为准。原本地v2原型已整合为可追溯的历史归档；23个文件的处置、验证和读取方式见[32 分支整合记录](32-branch-integration.md)。

## 当前实现入口

| 用途 | 入口 |
| --- | --- |
| 玩法定案、日期与声望 | [00](00-game-design.md)、[19](19-experience-time-balance.md)、[20](20-region-quests-reputation.md) |
| 当前范围与完成证据 | [TODO](../TODO.md)、[28 首版交付](28-release-readiness.md) |
| 协议唯一来源 | `backend/common/protocol/ops.ts`和`schemas.ts`，`docVersion: 4`，数字op |
| 生成的接口说明 | `docs/agent-api.md`、`agent-api.json`；由`npm --prefix backend run docs`生成 |
| 浏览器登录与请求 | `frontend/src/api/client.ts`：`login`、`call`、`ApiError`、`newCommandId` |
| 页面状态与业务操作 | `frontend/src/api/session.ts`：`session`、`useSession`、`run`及活动方法；战斗状态在`battle/session.ts` |
| 服务端与存储 | `backend/api/server.ts`、`handlers.ts`、`services.ts`、`store.ts`、`db.ts` |
| 共用规则 | `backend/common/engine`、`game`、`data`、`arena` |
| 单页专用数据 | `api/useServerData.ts`；随`player.version`重读，活动列表经`session.refresh`刷新 |
| 当前存档 | SQLite，默认`backend/data/agent-tactics.db`；API与Worker必须使用同一`DB_PATH` |

UI读取`useSession()`状态，通过`session`提交操作。新增协议须修改共享op表／schema／处理器并重生成文档，客户端只发送意图，金币、属性、消耗和胜负由服务端计算。

HTTP使用`POST /api/login`、`POST /api/op`，Agent使用`/ws`。当前没有`/api/v2/query`、`/api/v2/commands`、`GET_CAPABILITIES`或单独的命令收据查询接口；原型中的这些字符串操作不能当作线上接口调用。

## 当前功能与连接恢复

- 新档从D0、13,120金币、0公共经验开始，`COMPLETE_SETUP`建立1级主角和两名自选同伴；演示日期仅用于测试夹具。
- 一年500日、一季125日、八年4000日。十二地各九项任务、500声望、32行动日预算；经典图另有60单图与18连战入口。旧120日存档及未标记500日档通过[33 显式迁移](33-save-migration.md)预演、备份并换算／采纳；生产实迁独立记录。
- `GET_STATE.world/features`和`GET_WORLD_MAP`提供地图／页面开放状态，`CHOOSE_ROUTE`开通可选路线；尚未开放的任务／章节不显示，浏览器与Agent写操作共用地区门禁，细则见[36](36-playtest-feedback.md)。
- `session.run`及战斗写操作生成／沿用`commandId`；网络失败用同一ID重试一次。服务端收据与业务状态同事务，换负载复用ID会拒绝；写命令推进`player.version`。
- `PREVIEW_ACTION`报价绑定`playerVersion`，`EXECUTE_ACTION`重新校验；过期须重新预览。`GET_STATE.eventCursor`配合`GET_EVENTS(cursor)`补拉；完整恢复以服务器状态为准。
- `CLAIM_CONTROL`／`RELEASE_CONTROL`提供5分钟租约；人工与Agent共享规则、权限及事务，另一方可查询。实时观战读取进行中的战斗事件游标，历史战报有独立入口。
- 原型的持久化待处理命令日志与专门的收据查询并未接入当前客户端，页面重载后先重新查询服务器状态；不能把原型测试当作当前服务端的恢复验收。

`rules-v7`／目录20为当前版本；目录20接入世界地图路线、地区商店与页面门禁，目录19修正神主角直接分配、固定平民／成长型与E级起装。315项战技、170项装备／法术模板已接入首版运行时，未知原作数值保留为未知，首稿参数仍需人工平衡。旧规则回放按兼容性展示冻结终局，不能静默用新规则重算。普通竞技场只进攻、每场1日；旧防守路由回落。原三地人物、传承／轮回资源和盾的限量来源保留。

成长类型仅展示玩家可见标签、实例属性、年龄及准确总成长；不要将内部年龄曲线、随机权重或修正百分点写成教程。行动耗日、永久死亡风险和实际传承／轮回结果须在确认前显示。

## 验证与运行

需要Node.js 22.18+。以下PowerShell命令从仓库根目录执行；先用`node --version`确认运行时，API子进程也须使用合格版本。

```powershell
npm --prefix backend ci --ignore-scripts
npm --prefix frontend ci --ignore-scripts
npm --prefix backend test
node --test tools/mapgen/mapgen.test.ts
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node frontend/test/backend-integration.e2e.mjs
node frontend/test/battle-replay.e2e.mjs
node frontend/test/systems.e2e.mjs
git diff --check
```

2026-10-18声望调整`8c70086`验证：后端702／702、前端4／4、类型检查／构建、网页联调30／30、设计探针15／15及装备审计通过。分支整合另验证原型31／31和专用TypeScript检查；见[32](32-branch-integration.md)。这些均使用临时存档，未据此认定真实多人压测、40–60小时人工试玩或生产旧档迁移已完成。

分别启动`npm --prefix backend start`、`npm --prefix frontend run dev`，独立Worker为`npm --prefix backend run worker`。默认前端8524、API8525；API可直接提供已构建前端。部署前的备份、版本和待验收事项见[28](28-release-readiness.md)。

## 历史记录的读取

2026-10-16／17各轮合并、72／113／118／168项后端测试、旧防守、演示开局、120日历及旧“未实现”描述，均保存在本文件的Git历史中。它们对应当时的提交，不定义当前范围：

```powershell
git show 8c70086:docs/14-integration-handoff.md
git show 464aaae:docs/13-frontend-functional-layer.md
```

当前仍待实测的边界由[28](28-release-readiness.md)单独记录；目标架构中的候选由[13](13-backend-target-design.md)标明。不得将历史测试计数累加为本次执行结果。

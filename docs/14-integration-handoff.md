# 14 · 合并与UI接入说明

更新：2026-10-18。当前交付以`main`的实际服务端和共享数字op协议为准。原本地v2原型已整合为可追溯的历史归档；23个文件的处置、验证和读取方式见[32 分支整合记录](32-branch-integration.md)。

## 当前实现入口

| 用途 | 入口 |
| --- | --- |
| 玩法定案、日期与声望 | [00](00-game-design.md)、[19](19-experience-time-balance.md)、[20](20-region-quests-reputation.md) |
| 当前范围与完成证据 | [TODO](../TODO.md)、[28 首版交付](28-release-readiness.md) |
| 协议唯一来源 | `backend/common/protocol/ops.ts`和`schemas.ts`，`docVersion: 11`，数字op |
| 生成的接口说明 | `docs/agent-api.md`、`agent-api.json`；由`npm --prefix backend run docs`生成 |
| 浏览器登录与请求 | `frontend/src/api/client.ts`：`login`、`call`、`ApiError`、`newCommandId` |
| 页面状态与业务操作 | `frontend/src/api/session.ts`：`session`、`useSession`、`run`及活动方法；战斗状态在`battle/session.ts` |
| 服务端与存储 | `backend/api/server.ts`、`handlers.ts`、`services.ts`、`store.ts`、`db.ts` |
| 共用规则 | `backend/common/engine`、`game`、`data`、`arena` |
| 单页专用数据 | `api/useServerData.ts`；随`player.version`重读，活动列表经`session.refresh`刷新 |
| 当前存档 | SQLite，默认`backend/data/agent-tactics.db`；API与Worker必须使用同一`DB_PATH` |

UI读取`useSession()`状态，通过`session`提交操作。新增协议须修改共享op表／schema／处理器并重生成文档，客户端只发送意图，金币、属性、消耗和胜负由服务端计算。

HTTP使用`POST /api/login`、`POST /api/op`，Agent可使用`/ws`或以`AGENT_TOKEN`经MCP调用`POST /api/op`；MCP不暴露WebSocket专用的LOGIN／LOGOUT。当前没有`/api/v2/query`、`/api/v2/commands`、`GET_CAPABILITIES`或单独的命令收据查询接口；原型中的这些字符串操作不能当作线上接口调用。

## 当前功能与连接恢复

- 新档从D0、13,120金币、0公共经验开始，`COMPLETE_SETUP`建立1级主角和两名自选同伴；演示日期仅用于测试夹具。
- 一年500日、一季125日、八年4000日。十二地各九项任务、500声望、32行动日预算；经典图另有60单图与18连战入口。旧120日存档及未标记500日档通过[33 显式迁移](33-save-migration.md)预演、备份并换算／采纳；生产实迁独立记录。
- `GET_STATE.world/features`和`GET_WORLD_MAP`提供地图／页面开放状态，`CHOOSE_ROUTE`开通可选路线；尚未开放的任务／章节不显示，浏览器与Agent写操作共用地区门禁，细则见[36](36-playtest-feedback.md)。
- `session.run`及战斗写操作生成／沿用`commandId`；网络失败用同一ID重试一次。MCP的游戏写操作与Agent叙事也生成／沿用ID，连接或响应解析失败后最多重试一次；结果仍未确认时返回恢复ID，后续重试须显式传入同一`data.commandId`。服务端收据与业务状态同事务，换负载复用ID会拒绝；游戏写命令（含维修）推进`player.version`。
- `PREVIEW_ACTION`报价绑定`playerVersion`，`EXECUTE_ACTION`重新校验；过期须重新预览。`GET_STATE.eventCursor`配合`GET_EVENTS(cursor)`补拉；完整恢复以服务器状态为准。
- `CLAIM_CONTROL`／`RELEASE_CONTROL`提供5分钟租约；人工与Agent共享规则、权限及事务，另一方可查询。实时观战读取进行中的战斗事件游标，历史战报有独立入口。
- 原型的持久化待处理命令日志与专门的收据查询并未接入当前客户端，页面重载后先重新查询服务器状态；不能把原型测试当作当前服务端的恢复验收。

`rules-v14`／目录29（协议13）为当前版本：随机战场改为交错遭遇、分进合击、分散据点，按地图和难度确定上场上限与独立敌军数量。准备页使用固定预览，按`unitIds`提交顺序部署；地图不随换人、排序或重复预览重掷，超员与重复角色不再静默截断。随机副本保存整趟方案，旧战斗与旧远征保留已有配置。普通地区野外胜利、随机副本完整通关、任务连战副本完整通关分别解锁自己的困难版；单图任务维持普通一次性流程。`GET_STATE.hardUnlocks`保存三类权限，`GET_QUESTS.hardAvailable/hardUnlocked`区分内容支持与已解锁。旧档只按真实普通胜利／完整通关历史补齐，失败、中途退出、困难胜利与模糊完成标记不算。已完成的任务副本可选择普通或困难重打，首通探索与固定任务奖励不重复发。野外与副本可选普通／困难战斗难度，战斗与整趟远征锁定难度，旧档缺失字段按普通处理；困难新生成敌军（含经典地图和每波增援）目标增加50%人数（额外人数向上取整、至少1人，以敌阵附近合法空位为限），等级独立随机+2～5、上限99。先按新等级计算基础属性，再对HP随机增加20～35%，力量、魔力、技巧、速度、幸运、防御、魔防、魅力各独立随机增加10～25%（向上取整、至少+1且不超过职业上限），体格随机+1～3；职业与移动力不变。升级合法武器／法杖并配套熟练度，保留原有实用装备选项。加成由固定战斗／单位种子决定，刷新不重随机，已保存敌军不重复加成，旧战斗与回放不回填。任务固定奖励与行动日成本不变，但更多、更高等级敌军会增加战斗经验与掉落机会；竞技场维持普通。部署前先结束进行中的活动、战斗与远征并备份。普通已支持集火、补刀和动态出手顺序；困难增加最多连续三次行动的路径／让位搜索，独立模拟占位与碎冰变化，不读取真实随机流。此前`rules-v9`／目录24修复治疗AI的跟队、落点避险、治疗法术书及默认行为识别；显式保存的固守／护卫等行为不重写，升级前结束进行中的战斗／远征，旧规则回放保持冻结。此前`rules-v8`／目录23新增冬季雪地、可踩裂冰面与两种大水域野图，季节在每张图出发时冻结，旧存档地图不重绘，详见[03](03-combat.md)。目录22新增十二地`flags.regionExploration`（0～100，新档0）：随机野外胜利+3、单图任务完成+5、每个副本（含多图任务）仅首次完整通关+20，不计中间图或重复副本，不叠加任务5点；领奖、失败、撤退、扫荡、后台派遣+0。初选1～4自由，之后须将已开通地区探索至100才可选择其相邻新路线，已开通地区继续可访问；探索度独立于`clearedRegions`，首次胜利仍按原规则开放战斗功能与扫荡。旧档缺失字段时惰性初始化，仅此前已讨伐地区设100，其余为0，已有进度不再回填，历史数据与已开通访问权保留。世界／任务／随机野外准备／副本准备页展示探索条。目录21保留神主角基础值并额外分配10点、每项最多加5点，已有角色不重算；目录20接入世界地图路线、地区商店与页面门禁，目录19固定神主角平民／成长型与E级起装。315项战技、170项装备／法术模板已接入首版运行时，未知原作数值保留为未知，首稿参数仍需人工平衡。旧规则回放按兼容性展示冻结终局，不能静默用新规则重算。普通竞技场只进攻、每场1日；旧防守路由回落。原三地人物、传承／轮回资源和盾的限量来源保留。

成长类型仅展示玩家可见标签、实例属性、年龄及准确总成长；不要将内部年龄曲线、随机权重或修正百分点写成教程。行动耗日、永久死亡风险和实际传承／轮回结果须在确认前显示。

## 验证与运行

需要Node.js 22.18+。以下PowerShell命令从仓库根目录执行；先用`node --version`确认运行时，API子进程也须使用合格版本。

```powershell
npm --prefix backend ci --ignore-scripts
npm --prefix frontend ci --ignore-scripts
npm --prefix backend test
node --test mcp/*.test.ts
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

# 14 合并与 UI 接入说明

## 2026-10-17 新定案的实现边界

最新需求见[00](00-game-design.md)及[22 装备](22-equipment-catalog.md)／[23 技能](23-skill-catalog.md)：地图人数上限、主力＋约10替补、每图敌人等级上限、账号一次传承解锁、每人1枚禁疗盾、物理战技耐久／每书独立次数及旅馆食物恢复、精工＋10、仅进攻与实例BAN、首版塔／高难／最终首领及完整Agent对等。年份已定500日、一季125日、八年4000日；现有120日运行时需迁移。下列新规则已部分落地，未完成部分仍以 TODO 为准。

> 2026-10-18 已落地：正式新档从 D0、13,120 金币和 1 级三人队开始；旧防守页面／入口已删除；普通竞技场每场 1 日且跨日不吞剩余进攻；同形象限制、随机招募个人成长持久化、舞蹈相邻校验和轮回清空战技已接；战报／实时观战／规则手册已有页面。见 [30](30-ui-update-design.md) 与 TODO。

## 2026-10-17 当前修复入口

本轮已修复[21 一致性检查](21-code-design-audit.md)中的传承、真实消耗／身份、年度冻结与活动锁、任务目标／物资箱、年龄和精通偏差，并接入任务确认与实例成长显示。协议升为v2，新增`WITHDRAW_ANNUAL`(113)；旧`START_MAIN_STAGE`也必须先年度报名。具体回归计数、浏览器结果和复现命令统一记录在21。

下文合并轮次及其测试计数属于历史记录。当前已有`COMPLETE_SETUP`自捏开局、`Recipe.requires`声望配方和占领→全灭→首领三图目标；正式新账号从 D0、13,120 金币和 1 级三人队开始，`SEED_DAY=999` 只用于测试夹具。普通竞技场已改为每场 1 日、只进攻；随机生成器已接入游历／酒馆／紧急补员，完整耐久与部分法术逐项效果仍是独立缺口。

2026-10-16：主分支以远端提交 `b7d2b8f` 为基础。远端已经实现真实服务端及已接入的页面，后续应沿用这些入口扩展功能。

## 当前实现入口

2026-10-17日期与经验调整：野外/副本新出征按个人日期的前快后慢曲线计算敌军，第一年末20、第二年末35、第八年末87；同次副本锁入口等级，年度赛事按届数锁档。旧首次通关等级仅留历史记录。高出敌人5级及以上时交战/击杀总经验1（包括首领），无伤未击杀0；普通竞技场仍无等级经验。预览、出征说明、测试与模拟工具同步。详见[19](19-experience-time-balance.md)。其中通关经验、派遣倍率、16人扩编仍为提案，未实装。

新增[20 地区任务与声望](20-region-quests-reputation.md)：占领、护送、资源撤离、任务奖励和地区装备/人物解锁方案。

2026-10-17地区任务首版已实装：希尔瓦林地、托尔加丘陵、莱斯米尔湖镇各6个首次任务，短／标准1／2日、地区远征6日；op123–126及网页任务页已接入，声望永久保留，商店购买不扣声望。声望配方与三图占领→全灭→首领目标也已接入；固定人物有首版归属和加入台词。当前任务确认显示队伍、敌军等级、日期与死亡风险。完整事务回滚验收、NPC路线预告、500档后续任务和正式剧情仍待完成；不做可重复委托。

2026-10-17文档追加：职业成长[审阅表](17-class-growth-review.md)以九项修正合计替代备注；[酒馆小游戏](18-tavern-minigames-draft.md)收录摇盅猜大小与青蛙赛跑候选，尚无玩法代码、存储或op，也未新增UI。正式实现前继续审阅下注额／季度额度／倍率，不要据草案调用不存在的接口。

2026-10-16职业表按最新删减更新为77项（含2个基础身份），见[15](15-class-catalog.md)。勇士合并至勇者；上忍、机关师、战斗修士、战象兵已移除，只保留旧数据读取。GET_CLASS_MARKET列75个五阶职业，舞者／神乐神将／战车兵3项暂不可用，基础身份不出售。classIds只含现行77项，classAliases含24个历史编号；classes另保留只读兼容条目及不可用原因，不得用Object.keys(classes)计算可选数量。市场新增按角色返回的eligibilityReason，用于说明兽／龙本族逐阶限制。

成长按[16](16-class-growth-balance.md)保留原表弱项定向加强：现行58项中20项加强、38项原值，19项扩展沿用独立配置。勇者不叠加勇士成长，本次不追加加强。静态目录版本8，接口stats／growth／caps仍为九项，包含魅力cha；快照、传承、轮回和已有页面均已接入。原表魅力直接保留，扩展魅力修正暂0，示例角色初始5／个人成长20%为首稿。旧记录补缺失字段，不重算旧属性或继承目标，旧战斗保持原随机序列。计略／骑士团、完整技能、白魔法攻击及SS／SSS尚未完成。

本轮验证全部通过：后端168／168（含职业删除、旧数据兼容及兽龙封闭进阶），前端typecheck／build，浏览器backend-integration 22／22、battle-replay 6／6、systems 31／31；九属性12路线6144次培养，审阅稿／技术报告一致性校验与工具严格类型检查通过。测试使用临时存档，无正式数据库迁移或历史属性重算；记录见Beads `fe-world-gdl`。完整九属性表和复现命令见[17](17-class-growth-review.md)。

兽／龙购买和换职限制由classChangeReason统一校验，派遣不能绕过；旧资格不能用于跳阶或切回低阶。轮回按种族选择本族初级职业，不使用临时角色模板的人类职业。市场已有页面使用eligibilityReason禁用不符合进阶方向的选项，轮回说明同步本族初始职业。人类普通路线仍可自由购买和切换已购资格。

| 用途 | 入口 |
| --- | --- |
| 玩法定案与候选规则 | `docs/00-game-design.md` |
| 协议唯一来源 | `backend/common/protocol/ops.ts`，当前 `docVersion: 2`、数字 op |
| 生成的接口说明 | `docs/agent-api.md`、`agent-api.json`；由 `npm --prefix backend run docs` 生成 |
| 浏览器登录与请求 | `frontend/src/api/client.ts`：`login`、`call`、`ApiError` |
| 页面状态与业务操作 | `frontend/src/api/session.ts`：`session`、`useSession`、`run`、战斗/整备/竞技场方法 |
| 服务端入口与规则 | `backend/api/server.ts`、`handlers.ts`、`services.ts` |
| 永久军团规则 | `backend/common/game/legacy.ts`（传承／保底／轮回）、`annual.ts`（年度赛事）、`expedition.ts`（三图副本）、`production.ts`（生产）、`story.ts`（八章） |
| 永久军团页面 | `#/field/dungeon` `battle/DungeonPage.tsx`、`#/arena/annual` `arena/AnnualPage.tsx`、`#/story` `pages/StoryPage.tsx`、`#/workshop` `pages/WorkshopPage.tsx`、`#/legacy` `pages/LegacyPage.tsx`、名册分页 `#/roster/<id>/classes`／`retire` `pages/RosterLegacy.tsx`、`#/rules`、`#/settings`；共用件在 `pages/SystemParts.tsx`，样式在 `styles/systems.css` |
| 页面专用数据 | 纪念名册、职业市场等只有一页用的数据经 `api/useServerData.ts` 读取，`player.version` 变化即重读；远征、年度赛事、主线、生产、遗产随 `session.refresh` 一起读取 |
| 当前存档 | `backend/api/db.ts`、`store.ts`；SQLite，默认 `backend/data/agent-tactics.db` |
| 共用战斗与养成 | `backend/common/engine`、`game`、`data`、`arena` |

UI 可以更换布局和样式，读取 `useSession()` 的状态，并经 `session` 提交操作。需要增加协议时修改共享 op 表和处理器，重新生成文档；不要另建一套数字或字符串操作名，也不要直接把客户端计算出的金币、属性或战斗结果写回存档。

成长类型在角色上只显示label。不要把00／13中的内部曲线、加减百分点、转折年龄、剩余时间、概率与招募年龄生成逻辑写成玩家教程或提示。保留实际属性／成长记录，合计成长若展示必须准确；行动耗日、死亡风险及传承／轮回的实际结果仍明确告知。当前名册已移除独立的“成长类型/年龄修正”数值说明，旧协议仍保留计算字段。

新增定案以00 §4.2.1／9.1.1及13 §5.5为准：职业精通不等于人物等级；自动探索／职业训练可自选天数，按个人行动日后台并行，外出角色不可参与其他战斗，返程有物资、武器、经验及双精通。已学技能跨职业自由装备共5格；已购资格营地免费切回。普通竞技榜按现实月重置，与个人年份／派遣返程分开。这些规则须按对应实现能力接入，不直接假定旧SWEEP／TRAIN或连续副本接口就是新派遣功能。

HTTP 使用 `POST /api/login` 和 `POST /api/op`；Agent 使用 `/ws`。当前不存在 `/api/v2/query`、`/api/v2/commands`、`GET_CAPABILITIES` 或命令收据查询接口。第四轮起写命令可带 `commandId` 取得幂等收据，写命令推进 `player.version`；网页的大副本出发与大竞技场每一场先 `PREVIEW_ACTION` 再按报价 `EXECUTE_ACTION`，其余写操作仍不带 `commandId`，超时后应刷新服务器状态再确认结果，不能自动原样重发消费、招募或出击指令。

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

第五轮（第二轮定案）又补齐：

- **职业精通与资格**：`GET_MASTERY`／`SWITCH_CLASS`／`EQUIP_SKILLS`；按 `(cycle, classId)` 累计精通，阈值解锁技能；已购／本命职业营地免费切回，购买新资格受现实月额度限制。
- **并行派遣**：`GET_DISPATCHES`／`START_DISPATCH`；自选正整数天数，按个人行动日并行，出发冻结职业／武器，返程一次结算素材、武器、经验、职业精通与武器熟练度；占用角色不能参战、换职、轮回、退役或转移装备。
- **现实月榜**：`GET_RATINGS`／`CLAIM_RATING_REWARD`；Worker 按服务端时区归档旧月、冻结奖励并开启新月，不推进个人日期。
- **不朽盾**：`immortal_shield` 致命时消耗一枚、保留 1HP 并石化至下个己方阶段；活动结束后装备回仓（`recoveryBag`）。

仍未实现：完整八届内容、不朽盾重量／携带数量、耐久与完美锻造、特殊装备技能目录、各职业节点内容与派遣精确收益。自捏开局已由`COMPLETE_SETUP`及网页实现。观战页仍自动播放历史回放，尚非实时订阅。

新账号已可自捏神主角和选择两名同伴，但仍使用演示日期、资源和起始等级。完整八届赛事与章节内容仍需开发；连续副本、遗产继承、轮回、生产已有后端与网页，最新状态和验证见[21](21-code-design-audit.md)。观战页目前自动播放服务器历史战斗，尚非实时订阅。

2026-10-16 第五轮把第四轮的后端闭环接到网页：大副本、年度大竞技场、主线、生产、传承与纪念名册、名册的职业资格与退役／轮回，规则手册与设置（含 Agent 接入令牌）也不再是占位。接入时修正了大竞技场替补被丢弃、轮回吞掉携带装备两处后端偏差，并补了页面所需的只读字段（GET_RUN `carry`、GET_MEMORIAL `emergency`、GET_STORY `title`／`learned`、生产订单 `recipeId`／`facilityId`），细节见 [12](12-implementation-gap-checklist.md)「第五轮 UI 接入」。免费补员条件、轮回保留传承成长、装备整场结束后回仓等新定案尚未改入后端，页面按当前接口如实显示；传承石与轮回核心还没有获取途径。

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
  node test/systems.e2e.mjs
} finally {
  Pop-Location
}
git diff --check
```

本次结果：后端72项、地图14项测试通过；浏览器联调21项、战斗/防守/回放6项检查通过；类型检查、生产构建及差异空白检查通过。浏览器测试自建临时存档，不修改正式存档；未执行真实多玩家压力、完整八年流程或生产部署验收。

2026-10-16 第四轮结果：后端 engine/arena/game/protocol/api 测试 **113 通过，0 失败**；地图生成器 **14 通过，0 失败**；前端 `typecheck` 与 `build` 通过；浏览器 `backend-integration.e2e.mjs` 21/21、`battle-replay.e2e.mjs` 6/6。本轮只改后端与文档，未新增页面。

2026-10-16 第五轮（UI 接入）结果：后端测试 **118 通过，0 失败**；前端 `typecheck` 与 `build` 通过；浏览器 `backend-integration.e2e.mjs` 21/21、`battle-replay.e2e.mjs` 6/6、`systems.e2e.mjs` 30/30。

使用满足版本要求的 Node 后，分别在终端运行：

```powershell
npm --prefix backend start
```

```powershell
npm --prefix frontend run dev
```

可选独立 Worker：`npm --prefix backend run worker`。默认前端8524、API8525；API也可直接提供已构建的前端。

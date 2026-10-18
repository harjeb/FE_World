# AgentTactics（暂定名）

一款为 AI Agent 设计的原创火纹式战棋页游：以**永久军团养成、地区冒险与八届年度大竞技场主线**为核心，平时可参加普通竞技场赚钱与排名；两类赛事均可遇到同日进度的玩家历史队伍。
人和 AI 走同一套协议、同一套规则；任何能连 WebSocket、读 JSON 的 Agent 都能上场（同时提供 MCP 插件）。

> 当前处于**设计与原型阶段**：已有可运行的随机地图生成器、可以完整打一局的单机战斗页（确定性战斗引擎 + 前端），以及一套可运行的**服务端**（Fastify API + WebSocket Agent 协议 + Worker + SQLite 存档），前端已接入服务端。
>
> 设计参考了同作者的三国 SLG（`~/dev/slg`）的 Agent 接口做法。
>
> **看玩法、调整方案，请直接阅读：[游戏设计方案（玩法评审版）](docs/00-game-design.md)。** 已整合个人行动日日历、神主角与双渠道招募、五阶职业、年龄候选、成长率／数值传承、轮回、十二地区、生产候选、年度大竞技场主线（每届海选起步、正赛 64 强）、普通竞技场及通关后玩法；包含八年培养预算、同日快照匹配草案及围绕神与邪恶的轻量故事提纲。区分已确认方向、当前草案与待定事项，不包含技术实现。
>
> 原 01–05、09 保留作为历史资料与数值参考，不再作为独立玩法定案入口；其中的赛季清空、野外仅重伤、两段各 20 级等旧规则不再沿用。后续玩法调整集中修改 00，技术文档仍独立维护。
>
> 最新方向：大竞技场名次不阻挡主线，但普通角色会永久死亡；传承两种道具二选一、实际属性保底受上限限制；保留老死与正常退役传承。首轮目标 40–60 小时，新增完美锻造等可选小游戏及耐久奖励草案。
>
> 2026-10-16 玩法追加定案已写入00：职业年份开放后购买并可跨路线；普通竞技场1日；仅一代传承且装备／被动成长计入；轮回清技能学习、熟练度和职业资格，回到16岁，额外30点成长分配；死者装备回收、严重损失酒馆免费随机补2人。保留固定成长类型，只使用其自身年龄曲线，随机招募最低12岁、尽量在主线中跨过转折。这些是设计定案，不代表当前演示代码已实现，差异见12。

> 2026-10-17最新确认：出战人数由地图限制、主力外约10名替补；每图敌人等级上限；一次传承解锁；每人1枚稀缺禁疗盾；精工＋10、物理战技耐久和每书独立次数／旅馆食物恢复；装备／技能／小游戏、最终首领／塔／高难首版；仅进攻与实例BAN、官方兜底；Agent操作1:1。日历已定八年4000日、一年500日、一季125日；旧120日档及未标记500日档通过[显式迁移工具](docs/33-save-migration.md)处理。设计变更不代表现行代码已落实，见00、22／23和TODO。

## 设计文档

全部未完成需求集中记录在 **[TODO.md](TODO.md)**，按模块列出当前状态、完成标准、设计来源和 Beads 任务；已实现功能与待定草案分别标记。

| 文档 | 内容 |
| --- | --- |
| **[00 游戏设计方案（玩法评审版）](docs/00-game-design.md)** | **统一玩法入口：定位、养成、战斗、死亡与传承、轮回、PvE、竞技场及待决清单** |
| [01 游戏总览](docs/01-overview.md) | 定位、设计原则、核心循环、分期；赛季时钟与防守为历史说明 |
| [02 角色、职业与成长](docs/02-units-classes-growth.md) | 属性、角色、职业、个人/职业成长率、等级、转职、武器等级、技能 |
| [03 战斗规则](docs/03-combat.md) | 地图地形、回合流程、战斗公式、武器、随机数、经验 |
| [04 养成与赛季日历](docs/04-progression-calendar.md) | 历史 120 日／赛季日历；当前 500 日个人日历见 00／19／30 |
| [05 普通竞技场](docs/05-arena.md) | 只进攻、每场 1 日、三场跨日结算、实例 BAN、同形象限制与现实月榜 |
| [06 Agent 接口设计](docs/06-agent-api.md) | 协议原则、op 草案、观测格式、战斗查询工具、错误码 |
| [07 技术架构](docs/07-architecture.md) | 技术栈、确定性引擎、数据表草案、Worker 职责 |
| [08 UI 设计提示词](docs/08-ui-design-prompts.md) | 像素战棋与羊皮纸风格、战斗、军营、名册、竞技场、观战回放的设计提示词 |
| [09 永久养成与传承草案](docs/09-permanent-progression-legacy-draft.md) | 永久死亡、不朽盾石化保护、有限传承、99 级与一次轮回、旧方案交接与待定事项 |
| [10 随机地图生成器](docs/10-random-map-generator.md) | 六种场景主题、可选尺寸与种子、四类移动连通校验、JSON/SVG 导出与示例 |
| [11 战斗引擎与战斗页](docs/11-battle-engine-and-page.md) | 确定性引擎、战斗页、只进攻竞技场、页面现状与验证；旧防守说明已标历史 |
| [12 功能实现缺口](docs/12-implementation-gap-checklist.md) | 已有实现、部分闭环与待办的核对清单 |
| [13 后端后续目标设计](docs/13-backend-target-design.md) | 未实现草案：继承保底、轮回、连战、生产、事务与幂等边界 |
| [14 合并与 UI 接入说明](docs/14-integration-handoff.md) | 当前接口入口、本地备份、功能边界与验证命令 |
| [15 职业目录与武器权限](docs/15-class-catalog.md) | 77项职业／身份、来源、武器权限及兽龙专属进阶 |
| [16 职业成长测算](docs/16-class-growth-balance.md) | 原表对照、加强理由、八年培养试算与复现命令 |
| **[17 职业成长调整方案（审阅版）](docs/17-class-growth-review.md)** | **九属性成长与合计、累计增幅及低阶力量+5方案** |
| [18 酒馆小游戏首版设计](docs/18-tavern-minigames-draft.md) | 猜大小／青蛙赛跑已纳入首版，玩法／经济首稿，待实现 |
| [19 经验与日期平衡](docs/19-experience-time-balance.md) | 前快后慢的培养目标、日期敌军、16主力与替补的年度预算 |
| [20 地区任务与声望](docs/20-region-quests-reputation.md) | 三地首次任务、战斗目标、声望商店及固定人物的首版规则与后续内容 |
| [21 设计一致性检查与修复](docs/21-code-design-audit.md) | 原始审计、修复状态、回归和浏览器验证命令 |
| [22 装备属性与首版适配](docs/22-equipment-catalog.md) | 当前35武器／杖、其他道具及跨平台新增装备、耐久、每书次数、旅馆食物恢复 |
| [23 技能效果与首版适配](docs/23-skill-catalog.md) | 当前12技能、首版315项主动武器战技的共用规则与配置示例、支援指令与Agent对等 |
| [24 经典关卡接入](docs/24-classic-scenarios-integration-todo.md) | 60张经典地图转成任务/副本；目录、地形/职业适配、路线分组、验证与事件待办 |
| [25《万缕千丝》技能与职业对应](docs/25-fortunes-weave-skills.md) | 58项现用参考职业的固有／精通关联、96项技能与10项战技／指令效果、个人技能参考和适配边界 |
| [26 首版主动武器战技完整目录](docs/26-weapon-art-catalog.md) | 176项职业精通、103项独立强化研修、36项武器特有授予，共315项；原始参数和来源可复核 |
| [27《万缕千丝》武器与法术扩充](docs/27-fortunes-weave-equipment-magic.md) | 新增61件武器／40种法术书，含1–2格短弓、白魔法攻击／功能及装备授予战技；总目录170项均已接入运行时效果与取得途径（§6） |
| [28 逐职业战技精通清单](docs/28-class-art-learning.md) | 75个武器／兽龙职业各4～6项独立精通战技；强化另走研修，法术书不参与，阈值与费用待配置 |
| [29 本作原创短刃与兽龙战技](docs/29-original-weapon-arts.md) | 15项原创的参数、教师、战术用途和反制；替换此前借用拳剑战技的兼容方案 |
| [28 首版交付与运行边界](docs/28-release-readiness.md) | 内容清单、正常新档、SQLite 备份／恢复、验证门禁与运行时差距 |
| [29 架构与表现技术决策](docs/29-architecture-decisions.md) | SQLite 迁移触发条件、回放版本策略、DOM／Canvas 边界与数据隔离 |
| **[30 界面更新设计](docs/30-ui-update-design.md)** | **真实服务端名册、攻击-only 竞技场、战报／实时观战与长期管理页的页面级设计** |

## 服务端（API · Worker · Agent 协议）

Node.js 22.18+，无需数据库服务（用 `node:sqlite` 落盘）。所有规则都在 `backend/common` 定义一次，API、Worker、前端与 MCP 共用。

```bash
cd backend && npm install
npm start          # API + 静态前端，默认 http://localhost:8525（API_PORT / DB_PATH 可覆盖）
npm run worker     # 月末快照与竞技场结算的后台扫描（默认每 60s）
npm run docs       # 由 op 表重新生成 docs/agent-api.md 与 agent-api.json
npm test           # 引擎 / 竞技场 / 协议 / API / Worker 测试
```

- **WebSocket Agent 协议**：`ws://localhost:8525/ws`，帧格式 `{op,seq,data}` / `{op,seq,ok,data|error}`，推送无 `seq`；用 `sk_` 令牌 `LOGIN`（带 `docVersion`，落后会返回 `docNotice`）。
- **协议文档**：`GET /agent-api.md`、`GET /agent-api.json`、`GET /agent-api/changes/:v`；op 与错误码只在 `backend/common/protocol/ops.ts` 定义一次，文档与 MCP 工具都由它生成。
- **浏览器桥**：`POST /api/login`、`POST /api/op`、`GET /api/agent-token`、`GET /api/health`。前端用会话令牌调用同一套 op。
- **存档**：SQLite 表（账号 / 玩家 / 单位 / 战斗 / 竞技场日 / 快照 / 事件 / 回放 / due_tasks）；行动日懒结算，竞技场日三场打完或到达下一个竞技场日时结算，中途推进日期不会吞掉剩余进攻。
- **MCP 插件**：`mcp/server.ts` 用同一张 op 表生成工具，经 `AGENT_TOKEN` 调 API：`node mcp/server.ts`（stdio）。
- **永久军团后端**（2026-10-16）：幂等命令收据与玩家版本、事件游标；年龄按天与自然寿终；死亡／退役的装备回收（活动结束回仓）、纪念名册与两种遗产传承（逐级保底、一代血缘锁）；一次轮回（保留继承成长）；职业资格市场与免费切回；职业精通节点与五格技能；自选天数的并行自动探索／职业训练；两条生产链；三图连续副本与地区首通等级锁定；年度大竞技场海选＋64 强；八章主线独立结算；不朽盾（1HP 石化）；普通竞技场现实月榜；严重损失免费补员。规则在 `backend/common/game/`，网页已接入主要页面。
- **自走校准**：`node tools/sim/sim.ts` 用规则 AI 跑各地区遭遇战，输出胜率 / 回合数 / 阵亡。

## 前端

Node.js 22.18+。设计稿里的画面都已做成页面，**已接入服务端**：登录后军营、名册、整备、出击、竞技场、任务、生产、酒馆、传承、战报与实时观战都由服务端数据驱动，战斗指令通过 op 提交。开发时前端 `npm run dev`（8524）把 `/api` 代理到 API（8525）。

- 可以完整操作：出击（出征准备页选地区与队伍，确认后服务端生成遭遇战）、军营行动（扫荡 / 训练 / 休整 / 游历招募，耗日与推进到的日期来自 GET_TODAY）、竞技场（报名 → 禁用 → 部署 → 进攻 → 服务端计分；只进攻，不需要编防守队）、任务与挑战塔、酒馆招募／小游戏、生产与派遣。
- 永久军团页面：三图大副本（`#/field/dungeon`，出发前读服务端报价）、年度大竞技场（`#/arena/annual`）、主线（`#/story`）、生产（`#/workshop`）、酒馆（`#/tavern`）、传承（`#/legacy`）、战报（`#/replay`）、实时观战（`#/spectate`）、规则手册（`#/rules`）和设置（`#/settings`）。
- 自捏开局已接入 `COMPLETE_SETUP`：神主角和两名同伴只能选择一次；正式新档从 D0、13,120 金币和 1 级三人队开始，`SEED_DAY=999` 只用于测试夹具。
- 旧档先按[33 迁移说明](docs/33-save-migration.md)预演、备份和显式采纳／换算；新档自动记录schema／日历版本。生产旧档实迁、真实多人压力、40–60小时人工试玩和逐图手感仍需记录实际结果；首版装备／法术行为已接入并经自动验证，平衡首稿仍待人工实测。

```bash
cd frontend && npm install && npm run dev        # http://localhost:8524（需先启动后端）
cd frontend && npm run build && node test/backend-integration.e2e.mjs  # 浏览器端到端：前端确实连上了后端
cd frontend && npm run build && node test/battle-replay.e2e.mjs        # 浏览器端到端：战斗指令提交到服务端
cd frontend && npm run build && node test/systems.e2e.mjs              # 浏览器端到端：永久军团各页面的操作写到服务端
node --test backend/common/engine/*.test.ts backend/common/arena/*.test.ts backend/common/protocol/*.test.ts backend/api/*.test.ts
```

规则引擎在 `backend/common/engine`，前端和服务端共用；服务端结构见 [07 技术架构](docs/07-architecture.md)，协议见 [06 Agent 接口设计](docs/06-agent-api.md)。

## 随机地图工具

Node.js 22.18+，无需安装依赖。在项目根目录运行：

```bash
node tools/mapgen/cli.ts --theme palace --width 25 --seed demo
node tools/mapgen/cli.ts --theme forest --width 20 --seed demo --format svg --out forest.svg
node --test tools/mapgen/mapgen.test.ts
```

支持草地、城市、王宫内、城镇街道、山地、树林；使用方法、地图预览及保证范围见 [工具说明](docs/10-random-map-generator.md)。

## 像素素材

UI 设计稿用的原创像素素材共 64 张 PNG，包括地图单位、头像、图标、纹章、示例地图（含竞技场的王城）和交战演出，放在 [design/pixel-art](design/pixel-art/README.md)。地形字符与随机地图生成器共用一套，见 [03 战斗规则](docs/03-combat.md)的地形表。素材由脚本生成；修改后需用 Python 3 和 Pillow 重新生成：

```bash
python3 design/pixel-art/gen_art.py
```

## 技术栈（沿用 SLG）

React + TypeScript + Tailwind（前端） · Fastify + 标准 WebSocket（API） · 独立 Worker · SQLite（当前存档） · MCP 插件（stdio）。PostgreSQL 为后续规划，尚未迁移。

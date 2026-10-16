# AgentTactics（暂定名）

一款为 AI Agent 设计的原创火纹式战棋页游：以**永久军团养成、地区冒险与八届年度大竞技场主线**为核心，平时可参加普通竞技场赚钱与排名；两类赛事均可遇到同日进度的玩家历史队伍。
人和 AI 走同一套协议、同一套规则；任何能连 WebSocket、读 JSON 的 Agent 都能上场（同时提供 MCP 插件）。

> 当前处于**设计与原型阶段**：已有可运行的随机地图生成器，以及可以完整打一局的单机战斗页（确定性战斗引擎 + 前端），尚无服务端和其他页面。设计参考了同作者的三国 SLG（`~/dev/slg`）的 Agent 接口做法。
>
> **看玩法、调整方案，请直接阅读：[游戏设计方案（玩法评审版）](docs/00-game-design.md)。** 已整合个人行动日日历、神主角与双渠道招募、五阶职业、年龄候选、成长率／数值传承、轮回、十二地区、生产候选、年度大竞技场主线（每届海选起步、正赛 64 强）、普通竞技场及通关后玩法；包含八年培养预算、同日快照匹配草案及围绕神与邪恶的轻量故事提纲。区分已确认方向、当前草案与待定事项，不包含技术实现。
>
> 原 01–05、09 保留作为历史资料与数值参考，不再作为独立玩法定案入口；其中的赛季清空、野外仅重伤、两段各 20 级等旧规则不再沿用。后续玩法调整集中修改 00，技术文档仍独立维护。
>
> 最新方向：大竞技场名次不阻挡主线，但普通角色会永久死亡；传承两种道具二选一、实际属性保底受上限限制；保留老死与正常退役传承。首轮目标 40–60 小时，新增完美锻造等可选小游戏及耐久奖励草案。
>
> **后端与 UI 并行开发：**先读 [06 接口契约 v2](docs/06-agent-api.md)、[07 后端架构](docs/07-architecture.md) 和 [12 领域与持久化设计](docs/12-backend-domain-design.md)。[共享类型](backend/common/protocol/v2.ts) 与 [mock 样例](backend/common/protocol/v2.examples.ts) 可供 UI 开发导入；目前只完成设计与类型交付，HTTP／WebSocket 服务、数据库迁移和新玩法仍待实现。
>
> **非 UI 前端功能已加入：**[13 功能层接入指南](docs/13-frontend-functional-layer.md) 对应 `frontend/src/game/` 的客户端、状态、命令恢复、事件同步、业务控制器、React hooks 与 mock 场景。UI 可直接接入，现有演示页面尚未迁移；后端服务仍待实现。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| **[00 游戏设计方案（玩法评审版）](docs/00-game-design.md)** | **统一玩法入口：定位、养成、战斗、死亡与传承、轮回、PvE、竞技场及待决清单** |
| [01 游戏总览](docs/01-overview.md) | 定位、设计原则、核心循环、**时间模型与公平性**、分期 |
| [02 角色、职业与成长](docs/02-units-classes-growth.md) | 属性、角色、职业、个人/职业成长率、等级、转职、武器等级、技能 |
| [03 战斗规则](docs/03-combat.md) | 地图地形、回合流程、战斗公式、武器、随机数、经验 |
| [04 养成与赛季日历](docs/04-progression-calendar.md) | 赛季与游戏月、行动日、野外练级、主线关、招募、经济、快照 |
| [05 大竞技场](docs/05-arena.md) | 异步攻防、防守设置、按地图变化的 BAN / 出战人数、积分与奖励 |
| [06 UI 与 Agent 接口契约 v2](docs/06-agent-api.md) | 请求与返回、操作清单、重试与事件、三条接入流程、UI 交接说明 |
| [07 后端架构](docs/07-architecture.md) | 模块边界、事务与幂等、战斗 Worker、版本与回放、现有引擎接入清单 |
| [08 UI 设计提示词](docs/08-ui-design-prompts.md) | 像素战棋与羊皮纸风格、战斗、军营、名册、竞技场、观战回放的设计提示词 |
| [09 永久养成与传承草案](docs/09-permanent-progression-legacy-draft.md) | 永久死亡、不朽盾石化保护、有限传承、99 级与一次轮回、旧方案交接与待定事项 |
| [10 随机地图生成器](docs/10-random-map-generator.md) | 六种场景主题、可选尺寸与种子、四类移动连通校验、JSON/SVG 导出与示例 |
| [11 战斗引擎与战斗页](docs/11-battle-engine-and-page.md) | 确定性引擎、暂定规则、战斗页、竞技场进攻流程、运行与测试、尚未实现的部分 |
| [12 后端领域与持久化设计](docs/12-backend-domain-design.md) | 数据表与唯一约束、个人日历、连战状态机、成长传承、64 强赛事、故障验收矩阵 |
| [13 非 UI 前端功能层](docs/13-frontend-functional-layer.md) | 已实现的统一客户端、状态／事件同步、业务流程、mock、React hooks与UI接入示例 |

## 战斗页（前端原型）

Node.js 22.18+。打开后是竞技场（禁用 → 部署 → 进攻 → 计分），左侧导航可进入示例关卡「黑松隘口」：

```bash
cd frontend && npm install && npm run dev        # http://localhost:8524
node --test backend/common/engine/engine.test.ts  # 在项目根目录运行引擎测试
```

规则引擎在 `backend/common/engine`，前端和以后的服务端共用；详见 [11 战斗引擎与战斗页](docs/11-battle-engine-and-page.md)。

## 随机地图工具

Node.js 22.18+，无需安装依赖。在项目根目录运行：

```bash
node tools/mapgen/cli.ts --theme palace --width 25 --seed demo
node tools/mapgen/cli.ts --theme forest --width 20 --seed demo --format svg --out forest.svg
node --test tools/mapgen/mapgen.test.ts
```

支持草地、城市、王宫内、城镇街道、山地、树林；使用方法、地图预览及保证范围见 [工具说明](docs/10-random-map-generator.md)。

## 像素素材

UI 设计稿用的原创像素素材共 63 张 PNG，包括地图单位、头像、图标、纹章、示例地图和交战演出，放在 [design/pixel-art](design/pixel-art/README.md)。地形字符与随机地图生成器共用一套，见 [03 战斗规则](docs/03-combat.md)的地形表。素材由脚本生成；修改后需用 Python 3 和 Pillow 重新生成：

```bash
python3 design/pixel-art/gen_art.py
```

## 技术栈（沿用 SLG）

React + TypeScript + Tailwind（前端） · Fastify + 标准 WebSocket（API） · 独立 Worker · PostgreSQL · MCP 插件（stdio）。

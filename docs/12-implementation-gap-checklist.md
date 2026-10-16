# 12 功能实现缺口清单

## 核对口径

本清单对照 `docs/00–11` 与当前代码，按功能模块整理；是实现状态盘点，不是完整安全审计或上线验收。

- 以 `00-game-design.md` 的永久军团、个人日历方向作为本次比较基线；与旧版专章冲突的内容单列，不能同时作为验收要求。
- **部分实现**：存在规则、接口或页面，但没有完整闭环，或与当前设计不一致。
- **未实现**：在当前相关模型、协议和处理流程中未找到对应完整机制；定义一个字段、常量或物品名不算完成。
- **待确认**：文档本身仍是候选方案，先定规则，不直接算必须开发的承诺。
- 下列路径均相对仓库根目录。证据以文件和函数为主，避免行号随编辑失效。

## 状态总览

本轮共盘点 **32** 个缺口。当前：**6 项已修复**（G01、G02、G03、G05、G07、G28），**6 项部分修复**（G04、G06、G08、G12、G14、G27），**20 项待办**。职业解锁方式明确留待设计，不将旧稿等级、试炼、材料门槛作为必须实现项。

| 状态 | 缺口 |
| --- | --- |
| 已修复 | G01、G02、G03、G05、G07、G28 |
| 部分修复 | G04、G06、G08、G12、G14、G27 |
| 待办 | G09–G11、G13、G15–G26、G29–G32 |

## 一、已有基础，不应重复从零开发

| 模块 | 当前已存在 | 尚不能据此宣称 |
| --- | --- | --- |
| 战斗 | 确定性引擎、移动、攻击、治疗、技能、AI、预测、胜负、事件播放 | 所有新设计战斗机制齐备 |
| 服务端 | 登录、HTTP/WebSocket、SQLite 存储、Worker、协议 op、MCP 工具入口 | 多玩家与 Agent 全链路已验收 |
| 养成 API | 训练、招募、公共经验、转职、买卖、物品转移、解雇 | 网页可完成所有养成操作 |
| 竞技场 | BAN、部署、进攻、防守编辑、结算、官方对手兜底 | 完整真实异步 PvP、报名快照正确冻结 |
| 日历与地区 | 行动推进个人日期、12 地区表、按讨伐进度计算等级 | 八年主线、连续副本与年度赛事完整 |
| 成长类型 | 四类型、年龄更新、随机招募成长型 5%、共享成长修正 | 前端所有成长率展示已经使用最终值 |
| 地图工具 | 随机地图生成、校验、CLI、复现与测试 | 地图均可在回合限制内打赢、已完成平衡校准 |

成长型范围问题已修复：`backend/common/data/growth-types.ts::growthBonus` 对成长型全年龄返回 +5；其他类型在年龄段外仍为 0。回归覆盖 0、11、12、30、48、65、66、70、100 等年龄及所有属性。

## 二、优先补齐：已有功能未闭环或实现偏差

P0 表示应在宣称规则正确/多人可用之前处理；P1 表示核心游玩闭环；不是开发工作量估算。

| ID | 优先级 | 状态 | 缺口与代码证据 | 完成标准 |
| --- | --- | --- | --- | --- |
| G01 | P0 | 已修复 | **防守快照不保证来自真实报名名册**。原实现：`backend/api/services.ts::snapshotData` 新建 roster，却沿用 `player.defense`；`handlers.ts::SET_DEFENSE` 直接接受客户端提交的属性。 | 防守只提交单位标识与战术；属性/装备由服务端生成并存入报名快照。**修复**：新增 `services.ts::bindDefense`，`SET_DEFENSE` 与 `snapshotData` 都用当前名册重建槽位，并强制 `id`/`legion` 为服务器值；新增“伪造属性被忽略”测试。 |
| G02 | P0 | 已修复 | **报名后未冻结防守结算输入**。原实现：`services.ts::settleArenaDay` 使用当前 `player.defense`；`GET_DEFENSE` 返回 `locked: false`。 | 当期只用报名时锁定的阵容。**修复**：`ArenaDayRecord.defense` 在 `syncPlayer` 报名时锁定，`settleArenaDay` 只用它；`GET_DEFENSE` 返回 `locked`/`lockedDay`；新增“改阵后结算不变”测试。 |
| G03 | P0 | 已修复 | **战斗保密边界**。原实现：`GET_BATTLE`/创建接口返回原始 state（含 `rng`/`growthRng`/敌方 `behavior`），并接受客户端 seed。 | **修复**：新增 `handlers.ts::publicState`，SORTIE/ARENA_ATTACK/UNIT_ACT/END_PHASE/RETREAT/SURRENDER/GET_BATTLE(full) 不再下发随机数状态与敌方 AI 行为；SORTIE/ARENA_ATTACK 忽略客户端 seed；ARENA_BAN 揭晓不再含 behavior。新增测试。 |
| G04 | P1 | 部分修复 | **网页养成按钮未接 API**。**已修复**：军营的出击/扫荡/训练/休整/游历、转职、解雇已接入真实 op（带地区/单位选择、错误提示与操作后刷新）。出击先进「出征准备」（`battle/SortiePrep.tsx`）：选地区与队伍（上限取 GET_TODAY），显示胜利条件、回合上限、推进到的日期与阵亡风险，确认后才 SORTIE；军营行动的耗日、金币与推进日期改读 GET_TODAY（`pages/CampActions.tsx`）。**剩余**：`RosterParts.tsx` 的「从仓库放入」仍是提示按钮（缺仓库/整备 UI）。 | 补仓库/整备页面后完全闭环。 |
| G05 | P1 | 已修复 | **装备仅在页面状态中调整**。原实现：`RosterPage.tsx` 的 `equipped` 是本地 React state。 | **修复**：装备按钮调用 `TRANSFER_ITEM`（action=equip），直接使用服务器返回的武器顺序；新增 GET_ROSTER 字段测试，战斗/防守快照与页面一致。 |
| G06 | P1 | 部分实现 | **名册真实值与演示值混用**。**已修复**：`unitSummary` 增加 `joinedDay`/`weaponExp`/`growthLog`；`roster.ts` 用真实 exp/加入日期/武器经验/升级日志，`ROSTER_LIMIT` 改回 18；野外战斗中的升级也写入 `growthLog`（`services.ts::applyBattleOutcome`），加入日期按个人日历显示。名册「竞技场快照对比」改读 GET_SNAPSHOTS（op 73）的真实报名快照。**剩余**：主力/替补/重伤状态仍由 `MAIN`/`INJURED` 固定表推断（后端无此状态模型）。 | 后端建模主力/替补/重伤，或去掉该维度；快照无记录时明确显示缺失。 |
| G07 | P1 | 已修复 | **成长率面板未算类型/年龄加成**。原实现：`RosterParts.tsx::StatsPanel`、`PromotePage.tsx` 直接相加角色和职业成长率。 | 面板与后端共享最终成长口径。**修复**：两处均已计入 `UNIT_TRAITS[...].growthBonus`，并在名册页标注修正值。 |
| G08 | P1 | 部分实现 | **普通竞技场奖励口径**。**已修复**：`services.ts::settleArenaDay` 不再给投降/未打完的进攻发参与金币，防守胜场不再发可用金币（新增测试）。**剩余**：`handlers.ts::ARENA_ATTACK` 未收 3 日费用；00 §10.3 把它列为“当前建议”，且“每场三日”与“单个竞技场日打 3 场”相互冲突，需先定日数规则。 | 明确日数规则后接入并测试。 |
| G09 | P1 | 部分实现 | **真实玩家对手展示不完整**。后端可读取其他玩家同日快照并由官方对手补齐；`frontend/src/demo/live.ts` 只映射已知演示对手，未知对象会被过滤。防守结算使用官方名单 AI 试攻。 | 显示任意服务端合法对手；明确防守结算应采用真实玩家进攻还是规则 AI 评测，完成对应链路。 |
| G10 | P1 | 部分实现 | **实时观战实际为最近回放自动播放**。`frontend/src/watch/SpectatePage.tsx` 加载回放，而非持续订阅正在进行的战斗。 | 订阅实际战斗进度、阶段说明和断线恢复；历史回放与实时观战明确区分。 |
| G11 | P1 | 部分实现 | **身份和展示仍按角色模板而非单位实例组织**。招募可产生同模板多个单位；`demo/roster.ts::rosterEntry`、`demo/live.ts::UNIT_TRAITS`、名册路由/列表以 character 为键。 | 同模板两名角色可独立选择、显示年龄/类型、装备和培养，不覆盖彼此。 |

## 三、永久军团与完整主线的主要系统缺口

| ID | 状态 | 设计要求与当前差距 | 证据/验收方向 |
| --- | --- | --- | --- |
| G12 | 部分修复 | **99级体系已贯通**：所有职业1–99级，初级职业无需转职即可满级；无进阶+20经验偏移；转职保留等级、经验和属性。统一HP150／其余99上限。 | `classes.ts`、`game/model.ts`、`engine/growth.ts`；回归覆盖初级1→99、战斗20→21及99封顶。仍需长期数值校准。 |
| G13 | 未实现 | **一次轮回及轮回后的成长边界**：没有完整轮回状态、资格、重置、永久收益和次数控制。 | `game/model.ts::UnitRecord`、`protocol/ops.ts`、`api/handlers.ts`。先确认暂定收益，覆盖重复提交和永久数据保留。 |
| G14 | 部分修复 | **五阶职业已接入**：12条路线及分支，招募可获得初始职业；真实转职API、名册与预览使用同一数据，职业只使用当前成长修正。新增拳、短剑、兽、龙武器及龙魔法伤害／种族特效。 | 仍为八属性，魅力、完整职业技能学习/保留、新职业专用美术未完成；解锁方式待定，开发版暂时无等级或材料门槛。旧存档保留原职业ID及属性，不回算历史等级。 |
| G15 | 部分实现 | **衰老与自然寿终**：已有整数年龄随个人日历增长，没有出生日期/距生日、寿命、寿终预警与自然死亡处理。 | `game/model.ts::ageAt`、`api/services.ts::syncPlayer`。需覆盖多日行动跨越寿终事件，不能只在行动结束后加年龄。 |
| G16 | 未实现 | **种族年龄映射与主角独立成长模板**：角色表没有完整种族寿命系统；主角不死判定不等于不衰老。 | `data/characters.ts`、`services.ts::syncPlayer/applyBattleOutcome`。确认人类/兽人/龙人与主角的独立规则。 |
| G17 | 部分实现 | **永久死亡＋不朽盾/石化/救援窗口**：已有野外/大竞技场死亡写回和主角免死，但没有盾、石化及下一次操作机会等完整机制。 | `services.ts::applyBattleOutcome`、`engine/resolve.ts`、`game/items.ts`。应对不同战斗模式、撤退和保护失效逐项验收。 |
| G18 | 未实现 | **遗产、数值继承保底、成长率继承**：无资格计算、遗产生成/领取、逐级补点和幂等兑现。 | `game/model.ts`、`api/handlers.ts`。按 00 §7 验证不重复兑现、不复制临时成长加成、死亡与正常退役路径。 |
| G19 | 部分实现 | **正常退役与纪念名册**：有 retired/dead 状态和 DISMISS，不等于完整正常退役传承及纪念展示。 | `game/model.ts::UnitRecord`、`handlers.ts::DISMISS`、前端名册。需区分解雇、合资格退役、死亡及遗产处理。 |
| G20 | 部分实现 | **十二地区连续远征**：有地区等级公式与单场出击，但单场获胜即标记地区讨伐；没有固定名单连续三图、跨图状态和完整远征奖励。 | `game/calendar.ts`、`game/battles.ts`、`services.ts::applyBattleOutcome`。按 00 §8.1.3 实现连续状态及中断/失败规则。 |
| G21 | 部分实现 | **已讨伐地区重打与章节经验**：敌方等级仍按当前讨伐数生成，未落实首次档位锁定；章节奖励标志不等于完整一次性奖励流程。 | `game/calendar.ts::regionLevel`、`api/handlers.ts`、`api/store.ts`。验证重打不追涨、重复领取受阻、各队员经验符合新稿。 |
| G22 | 部分实现 | **年度大竞技场**：有 festival 战斗与轮数，但缺年度窗口、固定报名名单、完整签表；开始每轮重新取当前名册，失败清零后可再次开始；夺冠判定 `festivalRound > 9`。 | `handlers.ts::START_MAIN_STAGE`、`services.ts::applyBattleOutcome`。按 00 §9.4 对齐资格、赛制、场数、退出和当届不可重复奖励。 |
| G23 | 未形成完整闭环 | **八年主线与通关后持续经营**：没有完整八届剧情/目标/最终结算及通关后的系统衔接。 | `api/store.ts` 的 flags、`handlers.ts`、`game/calendar.ts` 仅有基础年份/地区/赛事状态。需要端到端长流程验证。 |
| G24 | 未实现完整系统 | **种植、炼药、锻造及建筑经营**：存在材料、种子和行动费用常量，不代表有生产队列、配方、产出、建筑升级与跨日期结算。 | `game/items.ts`、`game/calendar.ts::ACTION_DAYS`、`api/handlers.ts`。具体形态仍需先确认（00 §9.2）。 |
| G25 | 部分实现 | **补员与新档流程**：当前使用可玩的预置名册；随机招募来自固定角色模板，并非完整的新档主角/伙伴配置及多种族补员体系。 | `api/store.ts` 初始化、`handlers.ts::RECRUIT`、`data/characters.ts`。明确正式开局与调试种子数据的边界。 |

## 四、外围能力、内容与验证缺口

| ID | 状态 | 缺口 | 证据/下一步 |
| --- | --- | --- | --- |
| G26 | 部分实现 | 战斗行动尚未覆盖战场交换物品、骑乘/飞行再移动、村庄拜访效果；战争迷雾尚无完整机制。 | `engine/types.ts`、`engine/step.ts`、`docs/11` 的规则缺项；先区分已承诺行动与可选玩法。营地 TRANSFER_ITEM 不等于战场交换。 |
| G27 | 部分实现 | Agent 接入与呈现。**已修复**：`dispatch` 用带 `agentModel` 的请求记录心跳（`PlayerFlags.agentLastSeen`），`stateView` 下发，前端 5 分钟内视为在线，顶栏与军营简报同一口径；新增测试。**剩余**：控制权切换与超时/断线/人工接管未实现。 | 真实连接与接管流程需验收。 |
| G28 | 已修复 | Agent 查询可读性：ASCII 地形图例需对齐实际字符。 | **修复**：`api/handlers.ts::asciiMap` 图例改为从 `TERRAINS` 生成，覆盖道路/桥/石地板/村庄/浅滩/水域等全部字符；新增图例与地形表一致的测试。MCP 参数约束仍待补（另见 G27/G32）。 |
| G29 | 部分实现 | 正式内容不足：角色、关卡、物品、年度对手、剧情及后期挑战仍有样例/候选内容，不能把生成器和示例地图当完整内容量。 | `data/characters.ts`、`game/enemies.ts`、`game/battles.ts`、`docs/00` §8–9。先批准首版内容清单。 |
| G30 | 部分实现 | 管理页面与帮助入口不完整：整备、规则手册等仍有占位；回放播放能力不等于完整战报管理与检索。 | `frontend/src/shell/Shell.tsx`、`router.ts`、`watch/`。逐个入口验收真实数据及操作。 |
| G31 | 部分实现 | 平衡模拟只覆盖局部战斗，未完成多年养成、经济供需、职业分布和 PvP 平衡校准。 | `tools/sim/sim.ts`；`docs/07` 的模拟目标。按新日历重定模拟跨度，不能照搬旧 20 月目标。 |
| G32 | 未完成验收 | 多玩家快照冻结、长周期主线、所有养成网页提交、MCP 错误/断线、旧存档迁移缺少充分验收证据。 | `backend/api/api.test.ts` 主要直接 dispatch；浏览器测试覆盖有限。按功能补测试，而不是把测试总数当功能完成率。 |

## 五、先决策，不直接计作已承诺缺口

1. **规则版本冲突**：01/04/07 的全服自然日、月度行动预算、赛季重置，与 00 的个人行动日、永久军团相冲突。需统一专章及 UI 文案。（2026-10-16：网页与 Agent 说明已统一为个人日历，01/04/07 专章仍待改。）
2. **实现状态文档失真**：11 仍写“没有服务端”“养成 API 尚未实现”等，已不符合代码；反过来，有接口也不能把占位网页标为完成。（2026-10-16：11 的状态行与「页面现状」已按当前代码改写。）
3. **数据库方案**：07 写 PostgreSQL，当前为 SQLite。是接受当前部署规模还是迁移，属于架构决策，不应仅因数据库名不同就重复造系统。
4. **年龄与成长文案**：00/02 同时出现“年龄与成长类型分开叠加”和按类型×年龄查表描述；当前只计算一次类型对应的年龄修正，应消除重复叠加歧义。
5. **候选玩法**：生产经营具体形式、后期挑战、轮回奖励分配、部分传承细则、剧情世界观仍标有草案/候选。先确认最小首版范围，再进入实现验收。
6. **UI 设计提示词不是功能验收规范**：08 可作交互参考，但不能将每个效果描述都视作已批准的开发需求。

## 六、建议实施顺序

1. **统一规则基线 + 修复正确性**：G01–G03、G07–G09；尤其先保证报名快照可信、结算不可被改阵影响。
2. **让现有后台能力真正可玩**：G04–G06、G10–G11，去掉演示值并接通管理页。
3. **统一长期角色数据模型**：G12–G19，明确属性、等级、年龄、轮回、死亡和传承；同步制定存档迁移。
4. **完成主线闭环**：G20–G25，连续远征、年度赛事、八年主线和经营。
5. **补内容、Agent 体验、长流程与多人验收**：G26–G32。

每个条目至少满足：服务端规则正确、数据可持久化、相关网页/Agent 可调用、失败与重复操作有定义、至少一项对应自动化验证。不能仅靠按钮出现或 op 存在勾选完成。

## 七、本轮修复记录

| 缺口 | 改动 | 验证 |
| --- | --- | --- |
| G01 防守快照绑定真实名册 | `backend/api/services.ts::bindDefense`；`handlers.ts::SET_DEFENSE` | api 测试「伪造属性被忽略」 |
| G02 报名锁定防守 | `common/game/arena.ts` 的 `ArenaDayRecord.defense`/`createArenaDay`；`services.ts::syncPlayer/settleArenaDay`；`handlers.ts::GET_DEFENSE` | api 测试「改阵后结算不变」 |
| G07 成长率面板含类型/年龄修正 | `frontend/src/pages/RosterParts.tsx`、`PromotePage.tsx` | typecheck + build |
| G28 ASCII 图例对齐地形表 | `handlers.ts::asciiMap` | api 测试「图例与地形表一致」 |
| G08 竞技场奖励口径 | `common/game/arena.ts::settleAttack`、`services.ts::settleArenaDay` | api 测试「投降/未打完/防守不发可用金币」 |
| G03 战斗保密 | `handlers.ts::publicState`；SORTIE/ARENA_ATTACK/GET_BATTLE/UNIT_ACT/END_PHASE/RETREAT/SURRENDER；`ARENA_BAN` 揭晓 | api 测试「不下发 rng/behavior」 |
| G05 装备持久化 | `frontend/src/pages/RosterPage.tsx` 调用 `TRANSFER_ITEM` | api 测试「GET_ROSTER 装备与字段」 |
| G06 名册真实字段 | `services.ts::unitSummary` 增加字段；`frontend/src/demo/roster.ts` 使用真实值 | api 测试 + typecheck |
| G04 网页养成按钮 | `frontend/src/pages/CampPage.tsx`、`PromotePage.tsx`、`RosterPage.tsx` 接入 TRAIN/SWEEP/REST/RECRUIT/PROMOTE/DISMISS | api 测试「军营行动」+ e2e |
| G27 Agent 在线心跳 | `handlers.ts::dispatch`、`store.ts::PlayerFlags.agentLastSeen`、`services.ts::stateView`、`frontend/src/demo/live.ts` | api 测试「agent 心跳」 |
| 成长型全年龄 +5（更早一轮） | `common/data/growth-types.ts::growthBonus` | `game/growth.test.ts` |
| 防守页显示保存时的旧单位数据 | `handlers.ts::GET_DEFENSE` 返回前按当前名册 `bindDefense` | api 测试「the defense view follows the live roster after a promotion」 |
| 野外升级未写入成长记录（G06） | `services.ts::applyBattleOutcome` 把战斗的 levelUp 事件写入 `growthLog` 与 `rewards.levelUps` | api 测试「field level-ups are copied into the unit growth log」 |
| 出击无确认、规则不可见（G04） | `battle/SortiePrep.tsx`、`FieldBattle.tsx`；`battles.ts::FIELD_BATTLE` 经 GET_TODAY 下发人数上限/回合上限/胜利条件/阵亡 | api 测试「today lists every action cost…」；e2e「sortie prep shows the rules and spends nothing」「field sortie is server-backed」 |
| 军营行动耗日写死「1 行动日」（G04） | `pages/CampActions.tsx` 读 GET_TODAY；`ui/calendar.ts` 显示推进到的日期、途经的竞技场日与竞技场日警告 | e2e「camp actions show the GET_TODAY costs」「camp rest moves the date one day」 |
| 顶栏 Agent 标签写死在线（G27） | `shell/Shell.tsx` 按 `WORLD.agent.online` | e2e「agent chip follows the heartbeat」 |
| 新职业沿用剑士贴图 | `design/pixel-art/gen_art.py` 新增 thief/monk/beast/dragon 单位与拳套/短刀/兽爪/龙石图标；`assets.ts::spriteFor` 按职业路线取图 | 截图核对；原有 PNG 逐字节不变 |
| 时间文案统一为个人日历 | 顶栏「日期 / 下个事件」、军营、竞技场各页、防守页、名册改用 `ui/calendar.ts`（共享 `dateOf`）；去掉赛季、月末、现实 24:00 与倒计时 | e2e「top bar shows the personal date and next event」「top bar counts down to the next arena day」「defense page shows the server lock」 |
| 竞技场页只显示真实数据 | `arena/ArenaHub.tsx` 区分竞技场日与上次结果；防守试攻、奖励、他人回放改读服务端；GET_ARENA_RESULTS 增加 `lockedDefense` 与每场 `noShow`/`surrender` | api 测试「arena results carry the defense locked at registration」；e2e「arena day shows only real results」「arena shows the last result and the next date」 |
| 名册快照为合成数据（G06） | 新增只读 op `GET_SNAPSHOTS`（73）；`RosterParts.tsx` 按真实报名快照对比 | api 测试「own arena-day snapshots can be read back with their date」；e2e「roster compares real arena snapshots」 |
| 军营待办与 Agent 简报为演示 | `pages/CampPage.tsx` 由 GET_TODAY（新增 `battle`）、竞技场进度与结果生成待办、重要日期；没有计划时不再显示示例计划 | api 测试「today lists every action cost…」；e2e「camp lists the settled arena day」 |
| Agent 说明里的旧时间口径 | `protocol/ops.ts` 中 36/37/60/68/69/72/204 的说明与实现对齐（回放结束即公开、跳到下一季等）；GET_REPLAY 错误文案 | 协议测试（文档由 op 表生成） |
| 转职/名册/竞技场文案与新规则冲突 | `PromotePage.tsx`（无加成时不列「立即获得」，去掉占位技能与「适合」）、`RosterParts.tsx`（体格、成长记录）、`ArenaHub.tsx`（勋章与转职印） | typecheck + 截图 |

## 八、本次验证与限制

- 后端 engine/arena/game/protocol/api 测试：**58 通过，0 失败**（新增 8 项覆盖 G01/G02/G03/G04/G05/G08/G27/G28）。
- 地图生成器测试：**14 通过，0 失败**。
- 前端 `npm run typecheck` 干净、`npm run build` 成功。
- 浏览器 e2e：`backend-integration.e2e.mjs` 6/6、`battle-replay.e2e.mjs` 5/5。
- 2026-10-16 第二轮（防守显示、成长记录、出征准备、军营行动、贴图）：后端测试 **66 通过，0 失败**；e2e `backend-integration` 9/9、`battle-replay` 6/6。
- 2026-10-16 第三轮（个人日历文案、竞技场与军营去演示、名册快照）：后端测试 **68 通过，0 失败**；e2e `backend-integration` 15/15、`battle-replay` 6/6。
- 本轮对清单中尚未修复的条目重新核对了代码证据（轮回/种族/不朽盾/遗产/生产/模拟等仍无实现）。
- 未进行生产部署、真实多玩家压力、完整八年游玩或存档迁移测试。清单不提供整体完成百分比；后续实现应逐条补证据并更新状态。

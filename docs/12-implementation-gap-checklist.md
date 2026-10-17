# 12 功能实现缺口清单

## 2026-10-17 一致性修复后的当前状态

本次修复以[21 审计及验收](21-code-design-audit.md)为准：传承两模式互斥、战场逐级保底与封顶转分配、排除轮回成长跨代、真实道具消耗／剩余回收、按实例判定主角、轮回epoch年龄、有效参战精通、任务专属胜负和箱子生命周期、年度报名冻结与活动锁及退赛均已接入。15项审计探针已纳入后端常规回归。

自捏开局、声望配方、三图占领→全灭→首领、任务队伍与风险预览已有首版。名册成长类型按单位ID读取。浏览器测试分别覆盖真实新开局和旧账号显式夹具，不再依赖新账号自动发整套12人。

普通竞技场每场1日、真正随机角色生成器接线、完整技能／耐久／小游戏／16人编成及八年预算仍未完成。下面带轮次和计数的内容保留为历史记录，不作为最新验收结果；新验证以21为准。

## 核对口径

2026-10-17新增酒馆“摇盅猜大小／青蛙赛跑”设计候选，玩法、局数、下注、返还与后端结算草案见[18](18-tavern-minigames-draft.md)。仅完成文档，未实现规则模块、存储、op或UI；数值均为待审阅首稿，不列作已完成系统。职业成长审阅表已新增九项修正合计并去掉备注列，未改成长数值。

2026-10-16职业目录按最新要求删减为77项：原表采用58＋前作9＋兽／龙10。删除勇士、上忍、机关师、战斗修士、战象兵，保留勇者，勇士旧编号合并至勇者。兽人与龙人封闭逐阶进阶，不能跳阶、降阶、互转或转成人类职业；购买、切换、PROMOTE、派遣训练及轮回均已校验。原作固有／精通全技能、白魔法攻击、魅力战斗用途、EXP擅长加成和舞者／神乐神将／战车兵三项特殊机制仍未完成。当前目录与九属性数值以[15](15-class-catalog.md)／[17](17-class-growth-review.md)及代码为准。

最新验证：后端168项通过；前端typecheck／build通过；浏览器backend-integration 22／22、battle-replay 6／6、systems 31／31；现行77项及24个别名校验、兽龙进阶与旧数据兼容检查通过。完整记录见[14](14-integration-handoff.md)。没有完成原作全机制或完整八年经济平衡验收。

成长按[16](16-class-growth-balance.md)的原表弱项定向加强，现行58项中20项加强、38项保留原值；19项扩展继续独立配置。HP、力、魔、技、速、幸运、防、魔防、魅力九项均已接入成长／上限／传承／轮回，77项审阅表见[17](17-class-growth-review.md)。本次删除职业没有给勇者叠加成长，也没有追加其他加强。静态目录版本8，最新验证结果见[14](14-integration-handoff.md)。旧数据仍可读取，不重算已获属性；计略／骑士团与魅力官方系数、完整技能和八年经济仍待完成。

本清单对照 `docs/00–11` 与当前代码，按功能模块整理；是实现状态盘点，不是完整安全审计或上线验收。

### 2026-10-16最新定案补充验收

以下在第四轮实现记录之后确认，目标以00／13最新段落为准。第五轮已按此实现后端（见下），旧TRAIN／SWEEP仍是武器专项训练与快捷扫荡，并行自动探索是独立系统。

| 内容 | 新验收要求 |
| --- | --- |
| 职业资格与精通 | 按角色购买，营地切回已购职业免费、月度额度只限新资格；每职业独立精通，由有效参战／训练积累，不因人物等级高直接学完 |
| 自动探索／职业训练 | 自选正整数天数，个人行动日并行，外出者／装备唯一占用，其余队员可活动；返程可得素材、武器、经验、职业精通及武器熟练度，收益只发一次 |
| 技能五格 | 已学技能／被动跨职业自由装备，共用最多5格；个人／当前职业能力独立，特殊装备授予不占格且卸下撤销 |
| 轮回 | 已确认保留继承后的个人基础成长；清职业精通／学习与资格，数值保底不再兑现，血缘锁保留 |
| 免费补员 | 新真实伤亡造成存活现役<=2（含神）才开放免费随机2人；解雇／退役／暂时派遣不触发，旧损失事件不能多次领取；不以单一累计阵亡次数替代新条件 |
| 装备回收与盾 | 单场／整次连战／整届赛事结束再回仓，期间不能当补给；盾采用消耗后1HP石化至下个己方阶段方案，重量／数量待配置 |
| 年度赛事 | 报名物资整届固定，不额外购买／维修／外仓补给；存活不足正常人数可缺员继续，仍满足主将等必要地图规则 |
| 现实月榜 | 每现实月归档旧榜、重置积分／名次／当月战绩；月末奖励与赛果唯一，跨月处理不推进个人日期、不清角色／资源 |
| 平衡预算 | 原手动60场＋8届经验表不含新增派遣；须联合核对派遣占用、经验、双精通、掉落、主力／替补培养与总日历 |

派遣精确收益、最大时长／同时人数、召回策略、职业节点与月度购买额度仍待配置，不能把内部类型曲线／年龄抽样规则写成玩家说明。

### 2026-10-16 第五轮后端落地（职业精通、并行派遣、月榜、盾）

第五轮把上表的新验收要求落到后端；仍未落地的是各职业节点内容、派遣精确收益与召回、职业购买额度的最终数值、特殊装备授予技能目录（现有装备表没有成长／技能装备）以及完整八年经济预算。

| 内容 | 后端落地 | 证据 |
| --- | --- | --- |
| 职业精通 | `game/mastery.ts`：按 `(cycle, classId)` 累计，阈值解锁节点、学会技能；`applyBattleOutcome` 对野外／赛事有效参战入账；op `GET_MASTERY` | `mastery.test.ts`、`systems.test.ts` |
| 职业资格 | `BUY_CLASS_QUALIFICATION` 现实月额度 `CLASS_PURCHASE_LIMIT`；`SWITCH_CLASS` 已购／本命职业免费切回，不占额度 | `systems.test.ts` |
| 五格技能 | `setEquippedSkills`：跨职业自由装备，共 5 格；个人技能与当前职业能力单列；op `EQUIP_SKILLS`；引擎按装备技能聚合 | `mastery.test.ts`、`systems.test.ts` |
| 并行派遣 | `game/dispatch.ts` + `dispatches` 表；op `GET_DISPATCHES`／`START_DISPATCH`；出发冻结职业／武器，`syncPlayer` 按 return_day 一次结算，收益只给参与者；占用单位不能参战／换职／轮回／退役／转移 | `systems.test.ts` |
| 轮回保留成长 | `inheritedGrowth` 与 `growthAllocation` 分离；`reincarnate` 保留继承基础，清精通／学习／资格 | `legacy.test.ts` |
| 免费补员 | `emergencyStatus`：新真实伤亡且现役存活≤2（含神）；解雇／退役／派遣不触发 | `permanent.test.ts`、`ui-support.test.ts` |
| 装备回收 | `recoveryBag`：活动途中先入袋，单场直接入仓；连战／赛事结束时 `flushRecoveryBag` | `systems.test.ts` |
| 不朽盾 | `immortal_shield` 物品 + 引擎 `runCombat`：致命消耗一枚、保留1HP、石化至下个己方阶段，连击不再致死，不能手动使用 | `shield.test.ts` |
| 年度补给限制 | 报名名单中的角色整届不能通过 `TRANSFER_ITEM` 补给 | `systems.test.ts`、`systems.e2e.mjs` |
| 现实月榜 | `game/ratings.ts` + `rating_periods`／`ratings`／`monthly_rating_rewards`；Worker `settleMonthlyRatings` 归档并冻结奖励；op `GET_RATINGS`／`CLAIM_RATING_REWARD` | `systems.test.ts`、`worker` |


- 以 `00-game-design.md` 的永久军团、个人日历方向作为本次比较基线；与旧版专章冲突的内容单列，不能同时作为验收要求。
- **部分实现**：存在规则、接口或页面，但没有完整闭环，或与当前设计不一致。
- **未实现**：在当前相关模型、协议和处理流程中未找到对应完整机制；定义一个字段、常量或物品名不算完成。
- **待确认**：文档本身仍是候选方案，先定规则，不直接算必须开发的承诺。
- 下列路径均相对仓库根目录。证据以文件和函数为主，避免行号随编辑失效。

2026-10-16追加规则已同步到00／13：职业年份开放后购买、跨路线；普通竞技场随时每场1日；大竞技场三场海选两胜和单败淘汰；一代传承且计入装备／被动成长；轮回清学习／熟练度／资格并重置16岁；死亡装备回收、严重损失酒馆免费随机2人；固定类型自身曲线与最低12岁招募；个人／职业／五槽／装备授予技能结构。本次为设计更新，未修改对应业务代码，不能因规则已确认就把下列条目标为已完成。

## 状态总览

本轮共盘点 **32** 个缺口。当前：**6 项已修复**（G01、G02、G03、G05、G07、G28），**6 项部分修复**（G04、G06、G08、G12、G14、G27），**20 项待办**。职业解锁方式明确留待设计，不将旧稿等级、试炼、材料门槛作为必须实现项。

2026-10-16 第四轮（后端领域，不含 UI）：**新增后端闭环**：幂等命令收据与玩家版本、事件游标；年龄按天与自然寿终、主角不衰老；死亡／退役冻结遗产并回收装备、纪念名册；成长与数值两种传承及逐级保底、一代血缘锁；一次轮回（回一级、清技能／熟练度／资格、16 岁、30 点分配）；职业资格按年份购买与跨路线／种族校验；两条生产链（播种炼药、矿石木材锻造）；三图连续副本与跨图状态、地区首通等级锁定；年度大竞技场海选＋64 强；八章主线独立结算；严重损失免费补员。以下状态表按此更新，UI 接入与剩余项仍按原口径。

2026-10-16 第五轮（UI 接入）：第四轮的后端闭环都有了网页入口（三图大副本、年度大竞技场、主线、生产、传承与纪念名册、职业资格、退役与轮回），规则手册与设置不再是占位。接入时修了三处后端偏差（大竞技场替补、轮回吞装备、页面所需的只读字段）。新定案（免费补员条件、轮回保留传承成长、装备整场结束后回仓等）仍未改入后端，页面按当前接口如实显示。详见下方「第五轮 UI 接入」。

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
| G07 | P1 | 已修复 | **成长率合计计算**：原先属性／转职页漏算类型与年龄曲线修正，已计入`UNIT_TRAITS[...].growthBonus`。 | 已显示合计保持真实。新定案只给类型label，名册已移除独立修正数值说明，不展示曲线／转折／抽样；旧API计算字段仍在，不宣称完成协议隐藏。 |
| G08 | P1 | 部分实现 | **普通竞技场**：已修复投降／未打完不发参与金币、防守胜场不发可用金币。已定随时报名、每场1日、非致死、模拟消耗。当前`ARENA_ATTACK`未收日数，仍用指定竞技场日3场结构，`ACTION_DAYS.arenaMatch`仍为3。 | 改独立场次、同场只扣1日、重连不重复扣；按1日成本重算金币效率，奖励唯一结算。 |
| G09 | P1 | 部分实现 | **真实玩家对手展示不完整**。后端可读取其他玩家同日快照并由官方对手补齐；`frontend/src/demo/live.ts` 只映射已知演示对手，未知对象会被过滤。防守结算使用官方名单 AI 试攻。 | 显示任意服务端合法对手；明确防守结算应采用真实玩家进攻还是规则 AI 评测，完成对应链路。 |
| G10 | P1 | 部分实现 | **实时观战实际为最近回放自动播放**。`frontend/src/watch/SpectatePage.tsx` 加载回放，而非持续订阅正在进行的战斗。 | 订阅实际战斗进度、阶段说明和断线恢复；历史回放与实时观战明确区分。 |
| G11 | P1 | 部分实现 | **身份和展示仍按角色模板而非单位实例组织**。招募可产生同模板多个单位；`demo/roster.ts::rosterEntry`、`demo/live.ts::UNIT_TRAITS`、名册路由/列表以 character 为键。 | 同模板两名角色可独立选择、显示年龄/类型、装备和培养，不覆盖彼此。 |

## 三、永久军团与完整主线的主要系统缺口

| ID | 状态 | 设计要求与当前差距 | 证据/验收方向 |
| --- | --- | --- | --- |
| G12 | 部分修复 | **99级体系已贯通**：所有职业1–99级，初级职业无需转职即可满级；无进阶+20经验偏移；转职保留等级、经验和属性。统一HP150／其余99上限。 | `classes.ts`、`game/model.ts`、`engine/growth.ts`；回归覆盖初级1→99、战斗20→21及99封顶。仍需长期数值校准。 |
| G13 | 已有首版 | **一次轮回**已接业务、资源扣除和网页；清学习／熟练度／资格、回一级、药剂额度重置、保留继承基础成长和血缘锁。年龄已统一到轮回后的epoch。 | `legacy.test.ts`、`permanent.test.ts`、`design-consistency.test.ts`；正式资源来源和长期平衡仍待完善。 |
| G14 | 部分修复 | **五阶职业**：已有12条路线与分支及共用数据，新增武器和种族特效。新规则年份开放＋购买资格、跨路线已定，当前仍免费相邻转职。 | 补资格市场、跨路线与神不可兽／龙校验；月度额度仍候选。九属性／原作魅力、个人1技能强化、职业N节点、5格装备技能及特殊装备额外授予仍缺。 |
| G15 | 部分实现 | **年龄、曲线与寿终**：已有整数年龄和类型修正，仍从18–45岁招募；未满足最低12岁、按固定类型自身曲线尽量在主线跨转折、生日／寿命／预警及寿终流程。 | 类型曲线只算一次；转折与年龄联合校准，不可仅把18改12。覆盖晚招募、平稳类型、跨日寿终及轮回16岁重算。 |
| G16 | 未实现 | **种族与主角**：已定神不衰老、不可兽／龙转职，其他角色会衰老；现有免死判定不等于完整免衰老、资格与寿命系统。 | 各族寿命待测算，普通兽／龙不默认为不老；主角免死与免衰老分别验证。 |
| G17 | 部分实现 | **死亡与保命**：按实例判定神主角；正式消耗回写，死者只回收剩余物资；盾已实现致命消耗、1HP石化到下个己方阶段。 | 重量／携带数量及完整耐久仍未配置；现有活动与模拟副本的资产边界有回归。 |
| G18 | 未实现 | **一代遗产**：已定A→B后B不能再传，两模式共用限制；成长复制个人基础＋当时装备／被动提高的成长，排除职业／年龄等最终面板修正。没有生成／领取／补点流程。 | 来源先冻结后回收装备；验证逐级保底、上限裁剪、不重复兑现，B轮回／退役／换道具仍不可传给C。 |
| G19 | 部分实现 | **正常退役与纪念名册**：有 retired/dead 状态和 DISMISS，不等于完整正常退役传承及纪念展示。 | `game/model.ts::UnitRecord`、`handlers.ts::DISMISS`、前端名册。需区分解雇、合资格退役、死亡及遗产处理。 |
| G20 | 部分实现 | **十二地区连续远征**：有地区等级公式与单场出击，但单场获胜即标记地区讨伐；没有固定名单连续三图、跨图状态和完整远征奖励。 | `game/calendar.ts`、`game/battles.ts`、`services.ts::applyBattleOutcome`。按 00 §8.1.3 实现连续状态及中断/失败规则。 |
| G21 | 部分实现 | **已讨伐地区重打与章节经验**：敌方等级仍按当前讨伐数生成，未落实首次档位锁定；章节奖励标志不等于完整一次性奖励流程。 | `game/calendar.ts::regionLevel`、`api/handlers.ts`、`api/store.ts`。验证重打不追涨、重复领取受阻、各队员经验符合新稿。 |
| G22 | 部分实现 | **年度大竞技场**：D120起按年开放、报名冻结培养及每轮随机输入、三场海选两胜和六轮单败、年度唯一报名、整届活动锁与`WITHDRAW_ANNUAL`已实现，旧入口不能绕过报名。 | 完整对手池／全签表内容及竞技奖励仍待充实；不能将赛制骨架称为完整八届内容。 |
| G23 | 未形成完整闭环 | **八年主线与通关后持续经营**：没有完整八届剧情/目标/最终结算及通关后的系统衔接。 | `api/store.ts` 的 flags、`handlers.ts`、`game/calendar.ts` 仅有基础年份/地区/赛事状态。需要端到端长流程验证。 |
| G24 | 未实现完整系统 | **生产**：已定种植→炼药、矿木→锻造、行动日成熟、有限工位、损坏装备可修。材料／种子常量不等于已有订单；完美+5、指定材料完美产无损耗仍候选。 | 补扣料、生产队列、成熟与唯一领取，产销待测算；无损耗不能默认是所有完美成品的正式奖励。 |
| G25 | 部分实现 | **补员与新档**：`COMPLETE_SETUP`自捏神主角＋2伙伴只能完成一次；紧急补员按新真实伤亡、存活≤2和领取记录校验；类型曲线年龄抽样已接入。 | 起始日期与资源仍是演示配置；真正随机人物及酒馆付费渠道、正式新档数值仍待接入。 |

### 2026-10-16 第四轮后端落地（不含 UI）

下列条目已按 docs/00、docs/13 的确认规则补上**后端闭环**（规则模块 + 存储 + op + 自动化测试）；UI 接入、长期数值校准与 docs/13 中仍标为候选的机制（不朽盾完整石化、耐久与完美锻造、成长率继承是否随轮回清除、各职业技能节点）不在本轮范围。

| 缺口 | 本轮后端落地 | 证据 |
| --- | --- | --- |
| G13 轮回 | `game/legacy.ts::reincarnate/canReincarnate`；op `REINCARNATE_UNIT`；回一级、清技能／熟练度／资格／学习进度与药效、回初始职业、16 岁重算、30 点分配、血缘锁保留；扣轮回核心与金币 | `legacy.test.ts`、`permanent.test.ts` |
| G14 职业市场 | `data/classes.ts::classOpenYear/classPrice`；op `GET_CLASS_MARKET`／`BUY_CLASS_QUALIFICATION`；按年份开放、跨路线、种族与神主角校验、扣金币、轮回清资格 | `permanent.test.ts`「class market」 |
| G15 年龄与寿终 | `model.ts::ageDaysOf/lifespanEndDayOf`、`data/growth-types.ts::rollRecruitAge`；`syncPlayer` 自然寿终；最低 12 岁、优先跨曲线转折；轮回 16 岁重算 | `growth.test.ts`、`permanent.test.ts` |
| G16 种族与主角 | 主角 `isProtagonist` 不衰老、免死撤退；兽／龙资格按种族与主角限制 | `permanent.test.ts` |
| G17 死亡与回收 | `services.ts::recordDeath`：先冻结遗产成长来源，再回收装备（保留剩余次数），写纪念名册 | `permanent.test.ts` |
| G18 一代遗产 | `game/legacy.ts::createLegacy/claimLegacy/previewInheritance/applyInheritanceFloor`；两种模式、逐级保底、上限裁剪、血缘锁；op `GET_LEGACIES`／`CLAIM_LEGACY` | `legacy.test.ts`、`permanent.test.ts` |
| G19 退役与纪念 | `services.ts::recordRetire`；op `RETIRE_UNIT`／`GET_MEMORIAL`；区分解雇、退役、战死、寿终 | `permanent.test.ts` |
| G20 连续远征 | `game/expedition.ts`；op `START_DUNGEON`／`CONTINUE_DUNGEON`／`WITHDRAW_RUN`／`GET_RUN`；三图、固定名单、跨图 HP／物品、完整通关才带回掉落 | `expedition.test.ts` |
| G21 重打与首通档 | `PlayerFlags.firstClearLevel`；SORTIE 使用首次通关等级；完整通关才写地区讨伐 | `expedition.test.ts` |
| G22 年度大竞技场 | `game/annual.ts`；op `GET_ANNUAL`／`REGISTER_ANNUAL`／`START_ANNUAL_MATCH`；海选三场两胜、64 强六轮单败、年度唯一报名、真实死亡与消耗延续、局间只恢复存活者 HP | `annual.test.ts` |
| G23 八年主线 | `game/story.ts`；op `GET_STORY`／`COMPLETE_STORY_EVENT`／`CLAIM_REWARD`；八章按个人日历开放、名次不阻挡、唯一奖励键 | `annual.test.ts` |
| G24 生产 | `game/production.ts`；op `GET_PRODUCTION`／`PLANT`／`START_PRODUCTION`／`COLLECT_PRODUCTION`；两条链、有限工位、行动日成熟、唯一领取；耐久／维修仍 `FEATURE_DISABLED` | `production.test.ts` |
| G25 免费补员 | op `EMERGENCY_RECRUIT`；累计战死 3 人解锁一次、随机 2 人、不花钱／不推进日期、每次损失只领一次 | `permanent.test.ts` |
| 幂等与版本 | `command_receipts`、`dispatch` 收据与冲突、写命令 `player.version`、事件 `cursor` | `permanent.test.ts` |
| 行动报价 | `PREVIEW_ACTION`／`EXECUTE_ACTION`、`action_quotes` 表；报价绑定 `playerVersion`，执行时重校，过期报错 | `quote.test.ts` |

### 2026-10-16 第五轮 UI 接入

第四轮的 op 都接到网页；页面只读 `useSession()` 与 op 结果，操作经 `session.run` 提交后整体刷新。出发前有真实死亡或多日成本的行动（大副本第 1 图、大竞技场每一场）先 `PREVIEW_ACTION` 再按报价 `EXECUTE_ACTION`，报价过期即失败，不会悄悄改价。

| 缺口 | 网页入口 | 证据 |
| --- | --- | --- |
| G20 连续远征 | `#/field/dungeon`（`battle/DungeonPage.tsx`）：选地区与固定名单 → 服务端报价 → 出发；两图之间显示每人带入下一图的 HP 与道具、待带回掉落，可继续或撤离；战斗页在同页进行，结束对话框按远征状态给出下一步。出击页顶部可切换遭遇战／大副本 | e2e「the dungeon shows the server quote first」「setting out opens the first map」「a retreat ends the run and the page says so」 |
| G22 年度大竞技场 | `#/arena/annual`（`arena/AnnualPage.tsx`）：报名（勾选顺序即出战顺序）、海选／正赛签表、下一场地图与出战人数、报价后开打，比赛在同页进行；竞技场首页与军营有入口 | e2e「registering on the page creates the server entry」「executing the quote opens the match on the same page」「the bracket shows the played qualifier」 |
| G23 八年主线 | `#/story`（`pages/StoryPage.tsx`）：八章时间线，完成事件与领奖分开；章节标题开放后、本章所得完成后才由 GET_STORY 下发 | e2e「completing the chapter is stored」「claiming pays the shared experience once」；api 测试「story chapters show a title once open…」 |
| G24 生产 | `#/workshop`（`pages/WorkshopPage.tsx`）：三个工位的订单进度与领取、各配方的材料与阻挡原因；播种标明推进 1 日 | e2e「starting a recipe opens a server order」「planting spends one day」「collecting a ripe order…」 |
| G17–G19、G25 遗产、纪念、补员 | `#/legacy`（`pages/LegacyPage.tsx`）：遗产列表与兑现（继承者资格、两种模式、成长对比或逐级保底预览、补点权重、传承石库存）、纪念名册、紧急补员资格（GET_MEMORIAL 的 `emergency`） | e2e「retiring stores the memorial and the legacy」「the legacy page lists…」；api 测试「the memorial reports the free emergency recruit status…」 |
| G13、G19 退役与轮回 | 名册分页 `#/roster/<id>/retire`（`pages/RosterLegacy.tsx`）：两项都先列条件、再二次确认；轮回分配 30 点（单项 10） | e2e「the retire tab explains the legacy conditions」 |
| G14 职业资格 | 名册分页 `#/roster/<id>/classes`：按路线 × 阶位列出开放年份、价格与已拥有，选中后确认购买；注明转职暂不检查资格 | e2e「buying a qualification on the page stores it and charges the price」 |
| G30 帮助入口 | `#/rules`（数值取自共享常量与服务端，只写已确定且正在执行的规则）、`#/settings`（Agent 接入令牌与连接地址、战斗显示默认值、退出登录）；导航去掉演示版占位 | e2e「the rules manual reads its numbers from the game data」「settings hands out the Agent token…」 |

接入中发现并修正的后端问题（`api/ui-support.test.ts`）：

- 大竞技场每场结束只保留上场的存活者，报名但未上场的替补从第二场起被丢掉，倒下撤退的主角也被移出；现按报名顺序保留仍在现役的人，上场者带本场剩余物品并恢复满 HP，替补保持原样，死者不复活（`services.ts::handleAnnualOutcome`）。
- 轮回把携带的武器与道具直接清空；现连同剩余次数退回仓库，校验失败时不写任何东西（`handlers.ts::REINCARNATE_UNIT`）。
- 页面所需的只读字段：GET_RUN 的 `carry`、GET_MEMORIAL 的 `emergency`（与 EMERGENCY_RECRUIT 共用一份判断）、GET_STORY 的 `title`／`learned`／`bexp`、GET_PRODUCTION 订单的 `recipeId`／`facilityId`；共享 `ROUTE_NAMES`、`festivalMapId`、轮回常量，页面与服务端用同一份规则。

仍按当前后端显示、待按新定案改后端的：免费补员仍是「累计战死 3 人」（新定案为新伤亡后存活现役 <=2）；轮回仍会替换成长传承带来的个人成长（新定案为保留）；阵亡装备仍在死亡时立即回仓（新定案为整场／整次远征／整届结束后）；传承石与轮回核心尚无获取途径，兑现与轮回在页面上会显示缺少道具。

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
4. **年龄与成长文案**：00已明确固定类型不变、只查自身年龄曲线，不增加额外统一年龄修正；02老表保留为原型参考。曲线节点和年龄生成仍需联合校准。
5. **候选边界**：生产两条链、轮回30点与16岁、一代传承已定；待定的是曲线／产销、免费补员触发、月度职业次数、保命盾完整效果、无损耗配方及后期具体内容，不能把整个模块写成方向未确认。
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
- 2026-10-16 第四轮（后端领域，不含 UI）：后端 engine/arena/game/protocol/api 测试 **113 通过，0 失败**（新增 legacy/annual/expedition/production/permanent/quote 共 32 项）；地图生成器 **14 通过，0 失败**；前端 `typecheck` 干净、`build` 成功；e2e `backend-integration` 21/21、`battle-replay` 6/6。
- 2026-10-16 第五轮（UI 接入）：后端测试 **118 通过，0 失败**（新增 `ui-support` 5 项）；前端 `typecheck` 干净、`build` 成功；e2e `backend-integration` 21/21、`battle-replay` 6/6，新增 `systems.e2e.mjs` 30/30。
- 2026-10-16 第二轮定案后端（职业精通、并行派遣、五格技能、月榜、盾、回收袋）：后端测试 **133 通过，0 失败**（新增 `mastery` 4 项、`shield` 3 项、`systems` 7 项）；地图生成器 **14 通过，0 失败**；前端 `typecheck` 与 `build` 通过；e2e `systems` 30/30、`backend-integration` 21/21、`battle-replay` 6/6。
- 未进行生产部署、真实多玩家压力、完整八年游玩或存档迁移测试。清单不提供整体完成百分比；后续实现应逐条补证据并更新状态。

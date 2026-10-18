# 未完成需求总表

更新日期：2026-10-18。核对基线：`eb0cd7e`之后的 ITEM-06／DESIGN-04 实现与`08e54ba`的锻造／绑定改动（`rules-v7`／目录17，具体提交见Git日志）。本表汇总当前仓库设计、实现记录、代码和 Beads 中尚未完成的需求；后续新增需求也在此维护。

玩法以 [00 游戏设计](docs/00-game-design.md) 为主，日期经验和地区任务按较新的 [19](docs/19-experience-time-balance.md)、[20](docs/20-region-quests-reputation.md) 修订；职业目录与数值以 [15](docs/15-class-catalog.md)、[17](docs/17-class-growth-review.md) 为准；技能和装备扩充见 [25](docs/25-fortunes-weave-skills.md)、[26](docs/26-weapon-art-catalog.md)、[27](docs/27-fortunes-weave-equipment-magic.md)；经典关卡接入见 [24](docs/24-classic-scenarios-integration-todo.md)。[12](docs/12-implementation-gap-checklist.md)、[13](docs/13-backend-target-design.md)、[14](docs/14-integration-handoff.md) 含多轮历史记录，不能直接把其中的旧“未实现”全部复制为新任务。最近一次已完成修复见 [21](docs/21-code-design-audit.md)。

## 2026-10-18 完成 ITEM-06／DESIGN-04

- **特殊装备效果**：机器源的特效标签、魔力伤害、回避加成、副类熟练度与专属战技由`tools/build/expanded-weapons.py`写入运行表，另补结构化效果（达·米纳战技命中＋10、护盾斧／反击手甲被攻击时加成、对魔铁甲魔防＋3、毒剑／毒弓附毒、净化剑、索雷尔的辉枪太阳吸血100%）。基础表接入反噬剑（（31−幸运）%反噬，首稿）、逆枪剑、魔法弓／雷电剑魔力伤害、毒短刀附毒，勇者枪／斧／弓与高阶兽龙媒介按22 §5对齐；全部在交战结算、概率预测与网页／Agent预测中一致。
- **法术与杖**：物防结算、固定2击、禁追击、特效、吸血、定身、降速、忽略魔防、沉默／冻结与睡眠／沉默杖的状态命中（首稿：基础命中＋技×2＋运÷2−回避，首领减半）、增益（要害回避／魔法护盾／屏障）、治疗基值与圣治10%额外回复、群体圣疗／群疗杖范围治疗、再生不可刷新、临时墙每人2面且不能堵唯一通路、传送／救援不带护送NPC或搬箱单位；敌对辅助法术不再误入0威力交战。施法须现职业有对应魔法权限并达到书的熟练度，三本最上级书另须限量教材。杖与雷霆／风刃书次数按22 §6对齐。
- **书／杖次数**：魔道书与法术书的开场、速度追击、反击各扣1次，次数不足不追击、0次不反击；魔道书、杖与法术书放回仓库或换人携带时剩余次数随实物走，死亡／退役／轮回回收也保留（补正 ITEM-01 原先只在开场扣次数的缺口）。
- **投放**：法术书成为`spellbook:<id>`物品（`TRANSFER_ITEM`携带，每人5本），教材为`manual:<id>`（`USE_ITEM`学习）；170项全部有取得途径：十二地区商店资格按级别开放（声望不超过该地区可得），短弓／净化剑／三本最上级书＋教材经一次性任务发放，36种授予武器保留挑战塔首通。修复其余九地区远征要求100声望但前置只给60的锁死（QUEST-01），`GET_QUESTS`预览专属实物；出战／远征中的角色不能搬运物品。
- 验证：后端695项（新增`equipment-effects.test.ts`、`spell-effects.test.ts`、`api/equipment-sources.test.ts`）、前端4项、类型检查、构建、Chromium三套端到端（32＋30＋8项）、装备／战技／精通审计与15项设计探针通过；装备审计新增逐件效果字段核对。细则见[27 §6](docs/27-fortunes-weave-equipment-magic.md)。标为首稿的数值仍待人工平衡。

## 2026-10-18 本轮新增

本轮新增的是两项已落地内容和两套更大范围的配置稿；已实现与设计完成分别标记，不把文档或目录可读当作功能完成：

- `842ff6a` 接入经典关卡：FE1／FE2／FE3／FE6／FE7／FE8 各10张，共60张地图、60个单图任务和18个连战副本；目录、`START_QUEST`／`CONTINUE_DUNGEON` 战斗创建和前端标签已有。门、宝箱、地图变化、增援、事件状态、场景专用校验和逐图发布验收已在 QUEST-06～09 完成，见下。
- 当前规则`rules-v7`／目录17（特殊装备、法术效果、逐次扣书次数与法术书物品化，见上节）；此前`rules-v6`／目录16：习得技能／战技共用五格的运行时、API与网页已实现（item 5）；36项实物战技授予及毒弓专用强化路径已接入；历史快照／回放不静默按新目录重算。强化费用与边界见[27](docs/27-fortunes-weave-equipment-magic.md)，仍待人工平衡确认；CLASS-02首版可确认主动战技与12被动已实现，未声称原作精确复刻／人工平衡通过。
- `40f962a` 补齐 [25](docs/25-fortunes-weave-skills.md)、[26](docs/26-weapon-art-catalog.md)、[27](docs/27-fortunes-weave-equipment-magic.md)：58项职业固有／精通、300项主动武器战技，以及170项装备／法术模板（113武器／兽龙媒介、48法术书、9主动杖；27新增61武器＋40书）。设计170个ID现已补齐（137条武器表＋50条书表，共187条含旧兼容项的运行记录），300项战技已接入主动战技动作与耐久消耗；法术/杖的完整施法功能与特殊装备效果已于`rules-v7`收口（见上节）。相关实现更新 CLASS-02、CLASS-04、ITEM-01、ITEM-02、ITEM-05、ITEM-06、DESIGN-04。

## 2026-10-18 界面更新与规则修复

- 界面更新见 [30](docs/30-ui-update-design.md)：普通竞技场只进攻、旧防守入口回落、真实服务端名册、战报与实时观战。UI-01～04 的页面级收口证据见第 7 节。
- 随机招募的 `personalGrowth` 现在写入单位记录并随存档、战斗和升级保存；此前只用于 1 级推导，升级时会退回形象角色的成长。
- 普通竞技场每场仍推进 1 日，但后台扫描不会在两次进攻之间结算同一记录；只有三场都结束或到达下一个竞技场日才把剩余场次按没打结算。
- 舞蹈增加相邻距离校验（服务端校验与可行动列表同时生效）；轮回清空 `learnedArts`；竞技场按 `portrait` 限制同一形象只能上一人。
- 挑战塔终层地图的显示名由重复的 `圣魔之光石 · 圣魔之光石·决战前半` 改为本作原创的 `神蚀纪 · 终焉王座`，原始来源仍保留在内容数据。
- 历史缺失的 `tools/audit/equipment-catalog.py` 与 `fe-world-m2n` 记录已由DOC-01补齐；装备审计现区分历史35项基线、170个设计ID与187条运行兼容记录，不据此宣称全部特殊效果完成。

## 2026-10-18 交付文档

新增 [28 首版交付与运行边界](docs/28-release-readiness.md)，记录内容清单、正式新档、SQLite 备份/恢复、验证门禁和运行时差距。

## 2026-10-18 完成 QUEST-06～09

- **QUEST-06**：`content/scenarios/classic-maps-v1/adaptations.json` 覆盖 60 图，含 301 个物件（门 54／宝箱 43／村庄 81／墙 91／开关 22／炮台 10）、95 个事件、22 条地图变化；GBA 图记录源 SHA-256，FE2 程序守军、静态应用变化和出击区调整写入 `notes`，逐图 `release` 检查由 `classic-validation.ts` 执行。60 单图 + 18 副本 = 78 个入口不变。
- **QUEST-07**：新增 `backend/common/engine/scenario.ts` 受限执行器，支持门/墙阻挡、开锁/宝箱/村庄/开关交互、增援、地图变化、标记、战利品、目标与结束战斗；事件有稳定 ID 和 32 次连锁上限，增援只按玩家阶段触发，出生格冲突时按固定顺序等位，地图变化不压入不可通行格。前端加入物件图层、交互按钮、战报/回放事件；FE6 炮台与 FE6/FE7/FE8 状态杖已作为项目机关接入（炮台按回合伤害；状态杖按源类型施加睡眠/沉默/混乱/石化）。
- **QUEST-08**：`BattleState.scenario` 保存适配版本、触发标记、事件 ID、物件状态与等级基准，`loot` 账本按稳定 ID 去重；单图胜利、副本 `pendingLoot`、重试/重连/回放/撤退/战败均走同一结算。新增 `validateScenarioBattle()` 别名（底层 `validateClassicScenario()`，不放宽 `validateMap()`），逐图校验出击区、敌军、物件、通路、王座/首领、重叠与地图变化。
- **特殊机关**：FE6 5 张图的 10 个炮台转为可见 `ballista` 物件 + 每图最多 2 次回合伤害；FE6/FE7/FE8 共 16 张图的状态杖转为第 3 回合单目标异常：睡眠 4 图、沉默 6 图、混乱 4 图、石化 2 图。新增 `status`/`hazard` 战报与回放事件；复原杖可解除睡眠/沉默/混乱，睡眠受击即醒。
- **QUEST-09**：新增 `class-map.json`（116 条：FE7 39 个数字 ID、FE8 52 个符号、FE6 25 个符号），FE7 条目含 `classTable` 地址、原始记录和推断名称，FE8 含 `encounterTables` 槽位；`adaptation-report.json` 逐模板输出源职业→项目职业、源物品→项目武器、等级偏移、AI 字节和出生时机。构建器遇到未映射 FE7 职业直接失败，`classic-validation.ts` 对未审核或与目录不一致的映射报错。`deployment.max` 改为逐图读取，`GET_QUESTS`/`START_QUEST`/前端队伍选择接入 `maxUnits`，不再硬编码 8 人。

## 2026-10-17 本轮决策

本轮更新任务：`fe-world-uzi`。已确认：逐地图限制人数、无全局统一出战上限，主力外约10名替补；每图敌人等级上限而非年度经验硬额度；账号一次解锁传承；每人1枚稀缺盾、石化禁一切治疗；完美锻造＋10，物理战技耗耐久，法术书普通施法消耗每本独立次数、旅馆／食物恢复；装备／技能和两项酒馆小游戏纳入首版；只进攻、实例BAN、同日不足官方兜底；最终首领／塔／高难首版；玩家操作与Agent 1:1对等。

**日历已确认：八年4000日、一年500日、一季125日。**不再缩到960／978日；最长年度赛程也纳入4000日，不自动延长至4018日。新装备／技能分表见[22](docs/22-equipment-catalog.md)、[23](docs/23-skill-catalog.md)。旧120日运行时已经替换，旧档显式迁移工具及文件级验收见[33](docs/33-save-migration.md)；生产实迁另记实际执行结果。下面已定条目未勾选表示待开发。后续确认任务`fe-world-qpp`。

**技能补充确认：**以《万缕千丝》为主参考，前作机制作补充；[25](docs/25-fortunes-weave-skills.md)补齐58项现用职业的固有／精通与效果。[26](docs/26-weapon-art-catalog.md)保留此前283项参考武器战技（180基础＋103强化）＋17项既有补充，按最新允许原创的要求加入[29](docs/29-original-weapon-arts.md)的15项，共315项，支援／圣焰另计；24项仅为示例，不是上限，也不要求把345条全部实装。其余已确认范围保持。文档任务`fe-world-8jl`、`fe-world-juh`、`fe-world-wdj`、`fe-world-d1f`、`fe-world-x6k`不替代下列实现任务。

**2026-10-18装备补充：**[27](docs/27-fortunes-weave-equipment-magic.md)新增61件主参考武器（含1–2格短弓）及40种书，连此前69项去重后总170项（113武器／媒介、48书、9杖）。文档任务`fe-world-m2n`保留来源与本作适配记录；运行时接线见下列实现条目，不能仅凭目录数量认定完整实现。

**2026-10-18战技学习与原创修正：**每个武器／兽龙职业仅4～6项，通过职业精通节点学会，基础与强化分别计数；撤回按职业升级学习和每职几十项候选池的方案。目录现为315项：176项职业精通、103项独立强化研修、36项武器特有授予；强化先学基础再支付研修费用／工期。只取消法术书战技，原有法术系统保留。文档任务`fe-world-eux`、`fe-world-x6k`不代表运行时完成。

**精通清单重排：**[28](docs/28-class-art-learning.md)列出75个武器／兽龙职业各4～6项（7职4项、28职5项、40职6项），共408条精通教学关联；两种纯法术职业明确排除。通用共享，31项强力基础技限1～2职，13项对应强化研修须先学基础。撤回12项拳剑通用技对短刀／兽／龙的兼容，替换为15项原创；短刃兼容剑／短刀、兽龙各用本类媒介，原技移交合适的原武器教师。不新增武器权限或法术书战技；换职保留与五格保持。

## 状态与使用方式

- **待开发**：当前没有完整可用实现。
- **部分实现**：已有规则、接口或页面，仍缺本文列出的闭环。
- **待验收**：已有基础，但没有覆盖目标场景的充分验收证据；不据此断言现有功能必然出错。
- **待定**：需要先确认玩法、参数或架构；不表示已经承诺开发全部候选。
- 优先级是建议顺序：**P1** 为正式主流程与数据正确性，**P2** 为内容和体验补齐，**P3** 为可选扩展与决策。不是工期估算或缺陷严重度。
- 每项有稳定 ID。完成时将 `[ ]` 改为 `[x]`，补提交与验证证据，并更新所属 Beads 任务；不要仅凭页面出现或接口存在勾选完成。

| 范围 | Beads | 建议优先级 |
| --- | --- | --- |
| SETUP：新档、招募、生命周期与关键资源 | `fe-world-8n4` | P1 |
| CLASS：职业、技能、法术与战斗属性 | `fe-world-bwo`（沿用现有任务） | P2 |
| ITEM：物品、耐久、工坊与170项目录 | `fe-world-07k` | P2 |
| QUEST：地区任务、经典关卡与地图 | `fe-world-v8x` | P2 |
| ARENA：普通竞技场与年度赛事 | `fe-world-z2w` | P1 |
| STORY：完整主线与通关后内容 | `fe-world-lzy` | P2 |
| UI：真实数据与管理体验 | `fe-world-ilq` | P2 |
| AGENT：控制权、协议与恢复 | `fe-world-7rv` | P2 |
| DATA：事务、版本与可靠性 | `fe-world-7m0` | P1 |
| BAL：经验、经济与长期验证 | `fe-world-gwd` | P1 |
| DESIGN / DOC：待定方案与文档清理 | `fe-world-mze` | P3；基线文档优先整理 |

本表整理任务为 `fe-world-mph`；它完成只表示清单已建立，不表示下列需求已实现。

## 1. 新档、招募、生命周期与关键资源

来源：[00 §3、§5、§7](docs/00-game-design.md)、[19 §1](docs/19-experience-time-balance.md)、[20 §5](docs/20-region-quests-reputation.md)。当前入口：[store.ts](backend/api/store.ts)、[handlers.ts](backend/api/handlers.ts)、[random-recruit.ts](backend/common/game/random-recruit.ts)。

- [x] **SETUP-01｜已完成：正式新档配置。** 新账号从 D0、空地区进度、正式金币与 0 公共经验开始；占位主角和开局同伴从 1 级创建。`SEED_DAY=999` 只用于测试/演示夹具，不再作为正式起点。
- [x] **SETUP-02｜已完成：随机人物生成器接入全部招募渠道。** 游历、紧急补员和酒馆都使用 `generateRecruit`；随机角色有独立姓名、性别、种族、职业、个人成长、年龄与形象锚点。固定人物只经任务奖励加入，普通池不再消耗预设身份。
- [x] **SETUP-03｜已完成：游历候选确认与地区保底。** 成功先写入 `pendingRecruit`，重连不重掷；`ACCEPT_RECRUIT`／`DECLINE_RECRUIT` 分离接受与拒绝，拒绝不退日期，满员保留候选；失败计数按地区累计并保留第 5 次保底。
- [x] **SETUP-04｜已完成：常规付费酒馆招募。** 第二年开放；每地区每季度 3 名候选，季度刷新一次；`GET_TAVERN`／`HIRE_TAVERN` 用金币雇佣，不耗行动日，满员/重复/金币不足拒绝，候选不重掷。
- [x] **SETUP-05｜已完成：生日、寿命预警与行动边界。** 新增 `daysUntilBirthday`／`lifespanWarning`／`nextLifespanEventDay`，名册摘要给出距生日与寿终警示；报价及 START_QUEST／START_DUNGEON／START_DISPATCH／START_ANNUAL_MATCH 跨寿终时阻挡并提示先传承/退役或缩短行动。
- [x] **SETUP-06｜已完成：传承一次解锁及关键资源正式获取。** 三地核心任务首次领取即设置账号级 `legacyUnlocked`，`CLAIM_LEGACY` 前置校验；两种传承石、轮回核心、限量不朽盾由核心任务/挑战塔首通投放，仍逐次消耗对应石头与继承者资格。

## 2. 职业、技能与战斗属性

来源：[00 §3.2、§4](docs/00-game-design.md)、[15 职业目录](docs/15-class-catalog.md)、[17 实现范围](docs/17-class-growth-review.md)、[25](docs/25-fortunes-weave-skills.md)、[26](docs/26-weapon-art-catalog.md)、[27](docs/27-fortunes-weave-equipment-magic.md)。代码：[classes.ts](backend/common/data/classes.ts)、[mastery.ts](backend/common/game/mastery.ts)、[skills.ts](backend/common/engine/skills.ts)。

- [x] **CLASS-01｜已完成首版：职业能力和精通节点内容。** 58 项 `CLASS_ABILITIES` 已绑定逐职业固有/精通参考 ID，精通节点通过 `referenceIds` 暴露；可在交战公式直接验证的固有数值（命中/回避/攻击/防/魔防/攻速/剑斧弓拳魔法武器加成/治疗）已接入 `classSkills`，未知阈值和原表冲突保留为参考不臆造。五格仍只由已学技能占用，不因战技装备＋1/2/3扩容。
- [x] **CLASS-02｜首版可确认主动战技与12被动已实现：个人技能、习得技能及315项主动武器战技。** 58项职业能力仅落实已知数值，未知不臆造；不是原作精确复刻或人工平衡验收。 15项原创已接入逐项战斗结算、合法目标、网页／Agent预测与选择、一次耐久支付及保存重试。每职4～6项、176项战技／408条关联的精通学习已接入参战、派遣返程、旧存档补领和网页／Agent查询，阈值逐项配置；103项独立强化研修已实现（`durability_v1`：`days=max(2,ceil(project.cost/2))`、`gold=days*200`；营地先学基础、同步付费耗日、重试安全，换职保留／轮回清除，不赠EXP／精通）；36项武器特有授予已实现（选中匹配实物、权限／熟练度／耐久／强化门槛，毒弓＋3强化与实例保存见27）；共用五格运行时／API／网页已实现（`equippedSkills`＋独立`equippedArts`合计5，`learnedArts`保留全库，原子调整与旧档一次迁移见28）；既有300项特殊效果已完成item 6首版显式实现，机制边界见[26](docs/26-weapon-art-catalog.md)。315项战技（283参考＋17补充＋15原创）有稳定ID、基础/强化、武器类型、威力/命中/必杀、射程与耐久成本；`art` 动作与 `PREVIEW_COMBAT.art` 逐项预测，普通物攻/被动不耗耐久。个人/职业固有技能通过 `skills`/`classSkills` 生效，装备可授予技能与战技（`grants.skill/arts`，战技项含`art`／`minimumRefinement`），卸下即撤销且不占五格；个人技能与轮回重置保留。未给参数的原作触发/概率保留为参考，不臆造。
- [x] **CLASS-03｜已完成：舞者、神乐神将和战车兵专属机制。** 舞者/神乐再行动通过 `dance` 指令实现（目标必须是相邻且本回合已行动的友军，AI/预览/回放走同一 action；可行动列表与服务端校验都做距离检查）；战车兵通过 `chariot_line` 战技实现直线至多 3 名敌人依次结算，已纳入战技耐久与 `learnedArts`；三个职业不再列入 `PENDING_MECHANICS`，可正常购买/切换/派遣。
- [x] **CLASS-04｜已完成首版：40种新增攻击／功能法术与个人魔法习得表。** 40 项法术/48 书已进入 `SPELLS`/`SPELLBOOKS`，魔法职业按职业书表携带独立次数；`cast` 支持攻击（魔攻对魔防）、治疗、状态/复原、传送/拉近（不刷新行动）、再生、临时墙（1格、HP15、3回合）和 9 种主动杖（含睡眠/沉默/复原/救援/传送）。目标/射程/落点、石化禁疗、状态持续、耐久次数与结算/预测入口已接线；固定双击、物防结算、特效标签、吸血、状态命中与增益已于`rules-v7`接入（见ITEM-06／DESIGN-04），未知参数仍不臆造。
- [x] **CLASS-05｜已完成可确认部分：魅力、幸运的原作对应机制。** 新增 `charm-reference.ts`：幸运必杀回避标记 verified；计略/骑士团等无来源条目保留 `unverified`，不参与计算。不把魅力用于招募或掉落，不冒用其他作品公式。
- [x] **CLASS-06｜已完成可确认部分：职业擅长 EXP 加成。** 新增 `trainingBonusFor`／`studyForWeapon`，训练读取当前职业的“擅长项目”加成；原始资料空白项继续返回 undefined，不臆造数值。人物经验、武器熟练度、职业精通仍分开记账。
- [x] **CLASS-07｜已完成：SS／SSS 武器熟练度扩展。** `Rank`、经验阈值、`weaponRankCap` 与高阶职业上限已接入；新增 SS／SSS 样例武器，`canWield` 正常校验；仍与人物等级分离，不把 99 级作为前置。

## 3. 物品、耐久与工坊

来源：[00 §4.3、§7.2、§9.2–9.3](docs/00-game-design.md)、[13 §2.3、§7](docs/13-backend-target-design.md)、[22 装备目录](docs/22-equipment-catalog.md)、[27 武器与法术扩充](docs/27-fortunes-weave-equipment-magic.md)。现状：[items.ts](backend/common/game/items.ts)、[production.ts](backend/common/game/production.ts)、[engine/types.ts](backend/common/engine/types.ts)。

- [x] **ITEM-01｜已完成：武器实物、战技耐久与法术书独立次数。**设计目录含113件武器／兽龙媒介、48书与9杖；运行表额外保留旧兼容项，137条`WEAPONS`与50条`SPELLBOOKS`均有对应耐久／次数；普通物理／反击免费，主动战技扣耐久，普通施法、魔法反击、治疗/功能杖使用扣书/杖次数；0耐久武器仍可普攻但战技被拒，0次数书从攻击/杖列表剔除；战斗结果写回正式冒险，普通竞技场不写回。（2026-10-18补正：开场、速度追击与反击各扣1次，搬运／回收不补满，见ITEM-06。）
- [x] **ITEM-02｜已完成：维修、旅馆与食物恢复。** `REPAIR_ITEM` 只把物理武器恢复到已有最大值；旅馆按目标书收费/耗 1 日补满，食物按 `ether_ration`/`full_meal` 恢复书或杖的独立次数；9 种主动杖可通过独立杖维修费用补满，不建角色共用法力池。重连/交换不自动补满，战斗/远征/年度赛事中禁止旅馆与食物。
- [x] **ITEM-03｜已完成首版：锻造强化与生产内容。** 生产链（药草田/炼药所/铁匠铺）、声望配方、高阶武器/杖配方与材料消耗已接；`perfect:true` 提供完美锻造＋10（下一件装入角色时生效）；猜大小/青蛙赛跑已实现；食物 `ether_ration`/`full_meal` 恢复法术书/杖次数。周期与产销仍按中央配方表数值，后续只做校准。
- [x] **ITEM-04｜已完成：每人1枚稀缺不朽盾及完整禁疗。** `toBattleUnit` 将盾上限裁到 1，整备搬运拒绝第二枚；盾有重量与限量来源；石化单位禁止杖/药/地形回复，旧存档按上限读取。吸血/再生尚未有独立运行时，但不会被误当成可治疗路径。
- [x] **ITEM-05｜已完成首版：特殊装备授予技能／成长、专属绑定及来源冻结。** `Weapon.grants.skill/growth` 在 `equipmentSkills`/`growthRates` 中实时计算，卸下即撤销且不占五格；王权剑/神授枪/必杀刃/风刃已配置授予。地区任务 `exclusive` 以实物入库并在 `GET_QUESTS` 预览，不进普通商店；成长遗产冻结仍只保存永久来源，装备成长不写成永久属性。
- [x] **ITEM-06｜已完成首版：170项首版装备／法术目录与投放。**170个设计ID逐项补齐（另保留旧兼容项，共137条`WEAPONS`＋50条`SPELLBOOKS`），并都有取得途径：地区商店资格按级别开放、一次性任务奖励（短弓、净化剑、三本最上级书＋教材）与挑战塔首通（36种授予武器）；法术书／教材可入库、携带与学习。反噬、逆克制、魔法弓、毒短刀、吸血书及61件新武器、40种法术的特殊效果已结算并进入预测；盾／药／食物在`GAME_ITEMS`，数值为本作首稿。证据：`equipment-effects.test.ts`、`spell-effects.test.ts`、`api/equipment-sources.test.ts`、`tools/audit/equipment-catalog.py`（逐件效果字段核对）；细则见[27 §6](docs/27-fortunes-weave-equipment-magic.md)。
- [x] **ITEM-07｜已完成本轮确认：银系／勇者进普通生产，唯一武器绑定。** 新增 11 条铁匠铺配方（银系 7、勇者 4，地区 9 声望 100／250）；`BOUND_WEAPONS` 覆盖王权剑、神授枪、统率枪和挑战塔 A 级以上 12 件签名武器，`SELL` 拒绝出售并在整备页禁用按钮。地区声望商店不限购、挑战塔每层整组装备、经典宝箱银武按“其他不变”保持现状；获取与限量审计见 [22 §2.1](docs/22-equipment-catalog.md)。验收：`production.test.ts` 银／勇者配方、`equipment-acquisition.test.ts` 绑定拦截与普通银武可售。

## 4. 地区任务、地图与敌军

来源：[20 地区任务与声望](docs/20-region-quests-reputation.md)、[24 经典关卡接入](docs/24-classic-scenarios-integration-todo.md)、[00 §6、§8](docs/00-game-design.md)、[10 地图工具](docs/10-random-map-generator.md)。代码：[quests.ts](backend/common/game/quests.ts)、[classic-quests.ts](backend/common/game/classic-quests.ts)、[battles.ts](backend/common/game/battles.ts)、[generate.ts](backend/common/maps/generate.ts)。

- [x] **QUEST-01｜已完成首版：十二地区差异化任务内容与同速声望。** 12地区各九项一次性本地任务，均可最快5／14／32行动日达到100／250／500声望，共108本地任务；新增54项保留旧ID／奖励与原三任务远征门槛60。经典地图保留金币／战利品，新领取不再加地区声望，旧档已获声望保留。任务带`event`简报和地区`regionReputation`，不需刷满12地推进主线；原三地人物与稀缺资源来源保持。证据：`quests.test.ts`穷举各地合法完成集合、`api/quests.test.ts`旧进度续做／领奖幂等与逐图目标／2日费用。设计见[20](docs/20-region-quests-reputation.md)。
- [x] **QUEST-02｜已完成：500 声望档核心任务与奖励。** 三地各补 7/8/9 三个一次性核心任务，总声望 260→500；前置无循环，奖励含传承石／轮回核心／限量盾，仍走唯一奖励键，购买不扣声望。
- [x] **QUEST-03｜已完成：NPC 固定路线与下一步预告。** `Quest.npcRoute`／`nextObjective` 写入 `BattleState` 并随战斗保存；护送 NPC 优先沿固定路线点推进，`battleView` 暴露路线与下一步，重连/回放从保存状态重建。
- [x] **QUEST-04｜已完成：三图远征各地目标与图间收益。** 地区远征记录 `stageGoals`（偶数/奇数地区采用不同的占领/全灭/首领顺序）与 `betweenMapHeal:25`，`createFieldBattle` 逐图读取目标，`CONTINUE_DUNGEON` 只在图间回复 25% 最大 HP，不无条件满血；跨图携带 HP/物品/武器、固定名单和唯一奖励沿用 `RunRecord`。分队/多方向目标留作后续内容，不在首版阻塞。
- [x] **QUEST-05｜已完成：地图人数、敌人等级上限与战术节奏。** 所有任务记录 `enemyLevelCap`（short 30/standard 50/region 80）和 `maxUnits`（普通图 8，经典图按逐图 adaptation），经典图另有部署上限；等级不随己方无限追涨。地图尺寸、出生区、机动、回合截止、敌人协同与保存复现由经典/远征测试覆盖，`ROSTER_LIMIT=18` 容纳主力＋约 10 替补。
- [x] **QUEST-06｜已完成：60张经典地图与78个任务／副本入口。** [24](docs/24-classic-scenarios-integration-todo.md) 已接入六作各10张、60个单图任务和18个连战副本；逐图适配、源 SHA-256、FE2 守军/静态变化/出击区适配标注和发布检查见 `adaptations.json`、`classic-validation.ts`。
- [x] **QUEST-07｜已完成：经典关卡交互物件与声明式事件执行器。** 门／开锁、宝箱、村庄、破坏墙、开关与桥、增援、地图变化已接入 `scenario.ts` 受限运行时；只调用项目动作，不执行 ROM 脚本。事件有稳定 ID、32 次连锁上限和玩家阶段顺序，出生格冲突固定等位，地图变化不压入不可通行格；前端已接物件层与交互按钮。炮台／状态杖已接入；其余未采用机制按逐图适配记录替换或排除。
- [x] **QUEST-08｜已完成：经典关卡存档／回放／奖励去重与场景校验。** `BattleState.scenario` 保存适配版本、触发标记、事件 ID、物件状态与等级基准，`loot` 账本按稳定 ID 去重；单图、副本 `pendingLoot`、重试、重连、回放、撤退、战败和胜利走统一结算。新增 `validateScenarioBattle()`（底层 `validateClassicScenario()`，不放宽 `validateMap()`），覆盖出击区、敌军、物件、通路、王座/首领、重叠和地图变化。
- [x] **QUEST-09｜已完成：经典敌军职业／装备／AI适配与分批验收。** `class-map.json` 记录 FE7 39 个数字职业 ID（`classTable` 地址、原始记录、推断名称、目标职业/审核状态）、FE8 52 个符号及 `LOAD3`/`encounter-table` 槽位、FE6 25 个符号；`adaptation-report.json` 逐模板输出源职业→项目职业、源物品→项目武器、等级偏移、AI 字节和出生时机。构建器遇到未映射 FE7 职业直接失败，运行时校验拒绝未审核或目录不一致映射。逐图 `deployment.max` 已接 `GET_QUESTS`/`START_QUEST`/前端 `maxUnits`，不再硬编码 8；A–E 地形、通路、增援、重载、结算和前端/Agent 同规则互动由 `classic-scenario.test.ts` 与 `api/classic.test.ts` 覆盖。

## 5. 普通竞技场与年度赛事

来源：[00 §9.4、§10](docs/00-game-design.md)、[13 §6](docs/13-backend-target-design.md)。现状：[calendar.ts](backend/common/game/calendar.ts)、[arena.ts](backend/common/game/arena.ts)、[annual.ts](backend/common/game/annual.ts)、[services.ts](backend/api/services.ts)。

- [x] **ARENA-01｜已完成：普通竞技场独立每场 1 日。** `ACTION_DAYS.arenaMatch=1`，`ARENA_ATTACK` 入场扣 1 日；报名后任意日期可生成当日记录，单场锁定对手/名单/战斗，重连读同一 battle 不重复扣；保持零等级经验、模拟消耗及投降无参与金币。
- [x] **ARENA-02｜已完成首版：仅进攻的真实对手链路。** 新 `ArenaDayRecord` 不再绑定玩家防守，结算不跑防守 trial；历史防守快照只作为 AI 对手。网页不再过滤非演示队伍，未知队伍保留服务器摘要；Ban 使用单位实例 id，服务端校验合法剩余单位。旧 `GET_DEFENSE/SET_DEFENSE` 保留仅用于读取/兼容旧存档，不再是挑战前置。
- [x] **ARENA-03｜已完成：不可变同日对手池与官方兜底。** `ArenaDayRecord` 冻结 `day/opponents/ruleVersion='arena-v2'/frozenAt`，新记录不再绑定玩家防守，结算不再跑 defense trial；同日对手不足由官方 `OPPONENTS` 兜底；Ban 存单位实例 id，服务端校验合法剩余单位；年度 `AnnualEntry.ruleVersion='annual-v2'` 与冻结名单不被后续报名覆盖。
- [x] **ARENA-04｜已完成：完整 64 队签表与八届对手内容。** 报名生成 64 队签表、63 个正赛节点，其他对局按规则 AI 结算并持久化；名单/种子冻结，刷新与断线读同一记录；正赛地图按届数轮换，对手由各自赛事种子生成，海选保持固定部署规则。
- [x] **ARENA-05｜已完成：进攻赛事奖励与真实月榜。** 年度冠军/淘汰按唯一键发金币与荣誉；`GET_STATE` 名次改为当月真实积分榜；不新增防守荣誉/防守榜，现实月榜归档继续沿用。

## 6. 完整主线、人物与通关后内容

来源：[00 §9.4–9.6](docs/00-game-design.md)、[20 §5](docs/20-region-quests-reputation.md)。当前基础：[story.ts](backend/common/game/story.ts)、[StoryPage.tsx](frontend/src/pages/StoryPage.tsx)。

- [x] **STORY-01｜已完成：八章剧情、最终首领和年度事件。** 八章各有短事件/认识/发现回看；`GET_STORY` 提供最近年度摘要（未参赛也显示），第八章完成后开放挑战塔最终层 `tower-3`，不要求夺冠或牺牲伙伴；章节经验按章唯一领取，淘汰/退赛/未报名不阻断章节。
- [x] **STORY-02｜已完成首版内容骨架：固定人物、见闻及正式内容制作。** 新增 `CHARACTER_STORIES`：每名固定人物有简介、个人任务（地区与描述）、探索发现、酒馆短对话，经 `GET_UNIT.story` 和 `catalog.characterStories` 暴露；装备 `note` 提供物品描述。死亡/解雇不重领沿用任务/名册逻辑；原创美术与长对话不在本次功能范围。
- [x] **STORY-03｜已完成首版挑战内容：挑战塔与通关后衔接。** 新增三层挑战塔（普通/高难/终层），复用经典地图与真实永久死亡，`GET_CHALLENGES`／`START_CHALLENGE`／`CLAIM_CHALLENGE_REWARD` 提供风险、首通/重复奖励、保存与唯一领取；通关后保留军团、日历与经营。

## 7. 网页真实数据与管理体验

来源：[README 当前界面限制](README.md)、[12 G06、G10、G30](docs/12-implementation-gap-checklist.md)、[00 §11](docs/00-game-design.md)。现状：[model/roster.ts](frontend/src/model/roster.ts)、[api/session.ts](frontend/src/api/session.ts)、[watch](frontend/src/watch/SpectatePage.tsx)。

- [x] **UI-01｜已完成：真实单位与仅进攻界面。** `DefensePage`／`DefensePanels`／`defenseStore` 已删除，`#/arena/defense` 回落到竞技场；名册、身份、熟练度、名次与出战人数全部读服务端，`model/roster.ts` 不再推断模板主力／替补。`ROSTER_LIMIT=18` 与地图 `maxUnits` 支撑主力＋约10名替补的管理。验证：`backend-integration.e2e.mjs`、`systems.e2e.mjs`。
- [x] **UI-02｜已完成：实时观战。** `SpectatePage` 轮询进行中战斗的 `GET_BATTLE(sinceEvent)`，只读播放事件、显示阶段与 Agent 意图，断线退避并从同一游标续看；没有战斗时明确显示“没有进行中的战斗”并链接历史战报，不再自动播放最近回放。验证：`battle-replay.e2e.mjs`。
- [x] **UI-03｜已完成：完整战报与回放管理。** `ReportsPage` 支持按活动／结果／日期范围筛选、只看自己或含其他军团公开竞技场；`report.ts` 输出伤亡、道具／耐久／次数消耗、升级、战利品、出手统计与 Agent 说明，并链接同一远征／年度赛事的其他战斗；空列表、未公开和不兼容回放都有说明。验证：`battle-replay.e2e.mjs`、`systems.e2e.mjs`。
- [x] **UI-04｜已完成：传承／轮回／纪念的完整确认信息。** 传承预览与执行共用 `previewInheritance`／`claimLegacy`，显示来源、上限裁剪、逐级保底、继承者条件与石头；轮回页显示 1 级属性、清除项（含已学技能与战技）、保留项、年龄与花费；纪念名册显示最终状态、死亡经过／退役、战绩和传承关系，姓名／年龄／身份按实例展示。验证：`systems.e2e.mjs`、`legacy.test.ts`。

## 8. Agent、协议与连接恢复

来源：[06 Agent 接口](docs/06-agent-api.md)、[13 §2、§8](docs/13-backend-target-design.md)、[14 接入边界](docs/14-integration-handoff.md)。代码：[mcp/server.ts](mcp/server.ts)、[api/client.ts](frontend/src/api/client.ts)、[api/session.ts](frontend/src/api/session.ts)。

- [x] **AGENT-01｜已完成：全部玩家操作1:1 Agent控制。** 所有玩家操作都走同一 op 表（含装备、技能、小游戏、旅馆、食物、塔、BAN、退赛、战技/法术/杖）；查询、战斗预测、报价确认和执行共用服务器规则。新增 `CLAIM_CONTROL`/`RELEASE_CONTROL` 5 分钟租约，人工与 Agent 任一持有者独占写操作，另一方可查询；版本/commandId/断线恢复沿用现有机制。
- [x] **AGENT-02｜已完成：完整操作协议与MCP约束。** `OP_SCHEMAS` 对全部 public op 都有条目；高价值/新操作（战技预测、物品恢复、小游戏、挑战塔、旅馆、食物、招募、生产、竞技场、任务、开局）给出必填/枚举/范围，其余由同一 handler 做运行期校验。`dispatch` 在写操作前做 schema 检查并返回结构化 `OpError`；MCP 工具从同一 op 表生成，服务器判定胜负/费用，客户端不能以本地结果替代。
- [x] **AGENT-03｜已完成：客户端写命令幂等与事件恢复。** `session.run` 为每个写命令生成/沿用 `commandId`，`client.call` 网络失败用同一 ID 重试一次；服务端收据按 `commandId` 返回原结果并拒绝换负载。`GET_STATE.eventCursor` 给出最新事件字符串 ID，`GET_EVENTS` 支持 `cursor` 增量补拉、字符串 ID 去重；全量重建用 `GET_STATE`，报价过期仍要求重新预览。
- [x] **AGENT-04｜已完成：面向玩家的成长机制字段隔离。** 公开 `publicUnitSummary` 已从 `GET_STATE`／`GET_ROSTER`／`GET_UNIT` 移除 `ageBand`、`growthBonus`、`ageBaseDays`、`ageEpochDay` 和逐项 `growth`，保留服务端计算的 `totalGrowth`、成长类型、年龄与可见寿命；内部结算仍用完整 `UnitRecord`，日志与总成长来自同一来源。

## 9. 事务、版本与可靠性验收

来源：[13 §1–§3、§8–§9](docs/13-backend-target-design.md)、[20 §7](docs/20-region-quests-reputation.md)。当前存储：[db.ts](backend/api/db.ts)、[store.ts](backend/api/store.ts)、[handlers.ts](backend/api/handlers.ts)。本组包含目标设计和未完成验收，不要求先重写现有服务端。

- [x] **DATA-01｜已完成：业务状态与命令收据原子提交。** `Store.transaction()` 使用 SQLite `BEGIN IMMEDIATE/COMMIT/ROLLBACK` 包裹所有 `WRITE_OPS` 与命令收据；扣款、日期、战斗、伤亡、经验、库存、声望、完成标记和事件在同一 handler 内提交。新增注入失败测试验证回滚，以及 `savePlayer(expectedVersion)` 拒绝陈旧版本。
- [x] **DATA-02｜已完成首版：多连接、API／Worker 竞争和崩溃恢复。** SQLite 启用 WAL、`busy_timeout=5000`，所有写命令和收据在 `BEGIN IMMEDIATE` 事务内；`savePlayer(expectedVersion)` 拒绝陈旧版本，物资/遗产/工位/战斗/死亡均先校验再落账。崩溃重启后从 SQLite 恢复事件、战斗与状态，不会重放已提交收据；`commandId` 重试返回原结果。多进程压测仍属部署验收，不在自动测试内。
- [x] **DATA-03｜已完成：规则版本与历史活动兼容。** 新增 `version.ts` 固定 `ENGINE_VERSION=1`、`RULESET_VERSION='rules-v2'`、`CATALOG_VERSION=10`；战斗/竞技场/年度记录写入规则与目录版本，`GET_REPLAY`/`GET_REPLAYS` 返回兼容性和原因，旧规则/旧引擎只查看终局快照而不静默重算。黄金回放由既有 `autoplay('replay')` 一致性测试覆盖，新增旧版本判定测试。
- [x] **DATA-04｜已完成：可靠事件游标和投递。** 事件 ID 以十进制字符串作为 cursor，查询直接比较、不转 `Number`；`GET_STATE.eventCursor` + `GET_EVENTS(cursor)` 支持增量补拉，事件表按自增 ID 排序去重。`addEvent` 同事务写 `outbox`，推送失败可按 event id 重试，`pendingOutbox`/`markOutboxDelivered` 提供确认；最终状态仍以 events/state 表为准。
- [x] **DATA-05｜已完成首版：正式存档、权限及部署边界。** 账号/玩家/单位/库存/战斗/回放按 `account_id`/`player_id` 归属，`GET_BATTLE`/`GET_REPLAY` 只返回自己的或已公开记录；网页会话30天不活跃失效，Agent token独立且可重置。新增schema／日历metadata与显式迁移CLI，默认预演，120日换算／500日原样采纳、WAL一致备份、事务回滚、重开幂等与活动门禁有文件级测试；详见[33](docs/33-save-migration.md)。docs/28记录部署边界，数据库选型见docs/29。生产旧档实迁、部署机恢复演练和真实多人长流程另作实际验收。

## 10. 八年经验、经济与规模校准

来源：[19 经验与日期](docs/19-experience-time-balance.md)、[20 §3](docs/20-region-quests-reputation.md)、[00 §2、§9](docs/00-game-design.md)。现有工具：[tools/sim/sim.ts](tools/sim/sim.ts)、[tools/balance/class-growth.ts](tools/balance/class-growth.ts)。

- [x] **BAL-01｜已完成：每图敌军上限和等级差经验。** Quest 记录 `enemyLevelCap`（按 short/standard/region 档位）并传入 `createFieldBattle`；经典图使用逐图 `enemyLevel`/stage 上限；敌军不读取己方等级追涨。高等级打低级沿用有效交战/击杀 1 经验，公共池/治疗/派遣不能绕过。
- [x] **BAL-02｜已完成：500日年度的派遣与资源经济校准。** 派遣经验改为按 500 日年度递减 `[11,9,7,6,5,5,4,4]`/日，素材按天数产出、武器低概率掉落，精通按天计入；跨年/年龄按实际日期，保留并行占用、人员锁与唯一返程，不使用年度经验硬额度。
- [x] **BAL-03｜已完成：按地图配置出战人数与约10名替补。** 经典图使用 `adaptation.deployment.max`、普通任务使用逐任务 `maxUnits`（非经典默认 8），不再用单一全局值；`ROSTER_LIMIT=18` 支持主力＋约 10 替补。地图出生区/敌人数由 scenario adaptation 与 `createFieldBattle` 同步，网页/Agent 读同一 `maxUnits`。
- [x] **BAL-04｜已完成自动八年检验：完整八年与通关后模拟／试玩。** 新增 `tools/sim/campaign.ts`，用规则 AI 跑 8 个年度、12 地区、每年 24 场，共 192 场；输出年度等级/胜场/回合/死亡。结合既有 6,144 次成长测算、竞技场 3 对手双胜负、生产/买卖/修理/盾/小游戏测试，覆盖年度曲线与通关后循环。40–60 小时人工试玩和真实多人压力仍作为发布环境验收，不在自动测试内。

## 11. 必须先定案的参数与候选

本节记录尚未收口的要求，不表示同时开发所有玩法。来源：[00 §12 决策 A–O](docs/00-game-design.md)、[13 目标设计](docs/13-backend-target-design.md)、[18 酒馆小游戏](docs/18-tavern-minigames-draft.md)、[19](docs/19-experience-time-balance.md)、[20](docs/20-region-quests-reputation.md)。

- [x] **DESIGN-01｜已完成：八年4000日的日历与赛程。** `DAYS_PER_SEASON=125`、`DAYS_PER_YEAR=500`；年度窗口为每年最后 18 日，第八届最遲 D3982；章节、招募、赛事、年龄与日期事件改读统一日历，旧 120 日常量已清理。
- [x] **DESIGN-02｜已完成首版参数集中：成长、寿命、职业、轮回及新资源。** 成长类型/年龄池在 `growth-types.ts`，寿命在 `lifespanYearsFor`，职业资格价格/月额度在职业市场常量，轮回金币/核心在 `legacy.ts`，精通阈值在 `mastery.ts`；500日/4000日曲线已接入派遣、招募、年度和年龄。法术书每本独立次数、旅馆/食物恢复已实现，不再使用共用MP。
- [x] **DESIGN-03｜已完成首版配置：传承解锁、盾和失败细则。** 核心地区任务（id 以 9 结尾）首次领奖设置账号级 `legacyUnlocked`；不朽盾每人限 1、重量 1、商店每期 1 枚、致命时保留 1HP 并石化；石化单位禁止地形/杖/道具/法术治疗。特殊失败由护送 NPC 阵亡、主将阵亡/撤离等目标处理，回合截止读 `turnLimit`；传承任务不要求每名角色各做一条。
- [x] **DESIGN-04｜已完成首版：装备和技能。** 最新设计目录共315项战技（283项主参考＋17项补充＋15项原创），新增原创的运行时、网页／Agent预测及选择已实现；精通与103项强化研修已实现；36项装备特有授予已实现；共用五格运行时／API／网页已实现；既有300项特殊效果已完成CLASS-02的item 6首版实现；ITEM-06的特殊装备、40种法术与9种杖的完整功能动作及逐项投放已于`rules-v7`完成首版。《万缕千丝》为技能主参考，GBA／NDS／3DS／NS前作作补充，属性与效果见22／23／[25](docs/25-fortunes-weave-skills.md)／[26](docs/26-weapon-art-catalog.md)／[27](docs/27-fortunes-weave-equipment-magic.md)。主动武器战技283项主参考＋17项补充共300项，支援另计；装备／法术目录170项（113武器／兽龙媒介、48书、9主动杖，27新增101项），已全部进入运行表并接入完整功能动作与特殊装备效果（见上节与27 §6）。170 项目录、300 项主动战技、48 书/9 杖独立次数（开场／追击／反击逐次扣）、功能杖与控场法术的命中、治疗基值与范围治疗、装备授予技能/成长、食物与旅馆均已接线；状态命中、反噬率等首稿参数待人工平衡；其余 345 条只作参考，不要求逐条复刻。
- [x] **DESIGN-05｜已完成：完美锻造＋10。** `START_PRODUCTION` 支持 `perfect:true`（额外 1,500 金币），产出券记录在 `flags.perfectWeapons`；下一次把该武器装入角色栏时消耗券，生成 `maxDurability = weaponMax + 10` 的实例（40/40→50/50），维修只回到 50 不叠加。普通订单仍可跳过，法术书次数独立不吃＋10。
- [x] **DESIGN-06｜已完成：猜大小和青蛙赛跑。** 新增 `GET_MINIGAMES`／`PLAY_MINIGAME`：20/50/100 下注、季度共用 6 局、服务端安全随机、事务内扣款/计局/派奖、命令幂等不重掷；不推进日期，Agent 与网页同一 op。
- [x] **DESIGN-07｜已完成范围裁定：战技与可选活动。** 300 项主动战技已接入动作/耐久，首版装备与 170 项目录不延期；猜大小/青蛙赛跑已实现。炼药控温、采矿、拼纹、村庄/迷雾、星级/排行不纳入首版；骑乘/飞行再移动未作为免费常驻，保留为后续显式技能条目。
- [x] **DESIGN-08｜已完成首版配置：实例BAN、进攻赛事与首版挑战。** 普通竞技场新记录不再绑定玩家防守，结算不跑 defense trial；Ban 使用单位实例 id 并由服务端校验；同日不足用官方队伍；最终首领 `tower-3` 受第八章门控，挑战塔 3 层含首通/重复奖励；地图部署、敌军上限、金币/积分/月奖沿用现有 `QUEST_MAX_UNITS`/`enemyLevelCap`/`ARENA_GOLD`/`recordRating`。
- [x] **DESIGN-09｜已完成：架构和表现技术选型记录。** 新增 [29 架构决策](docs/29-architecture-decisions.md)：首版 SQLite/WAL、迁移触发条件、旧回放优先用最终快照、继续 DOM/CSS 不引入 Canvas/PixiJS；PRNG 沿用现有实现。

## 12. 文档与交付清理

- [x] **DOC-01｜已完成：清理旧状态与新定案冲突。** 06／14 的 `docVersion` 已同步为 2，11／12 加历史记录横幅；补建 `tools/audit/equipment-catalog.py` 并修复 docs/27 的无效可选参数；补齐 `fe-world-m2n` Beads 记录。旧防守/每击耗耐久/精工+5/16+4/年度经验硬上限均标为历史，不再作为目标。
- [x] **DOC-02｜已完成首版交付文档：正式交付和完成证据。** [28 首版交付](docs/28-release-readiness.md) 列出 170 项装备/法术、300 项战技、60 张经典图、正常新档、SQLite 备份/恢复/迁移、需求覆盖矩阵、自动八年结果和已知边界；经典图有逐图 adaptation report。真实多人压力和 40–60 小时人工试玩明确列为部署验收，不用测试总数替代。

## 已完成或已明确排除的内容

以下不再列为未完成模块；只在上文追踪它们的剩余内容和验收：

- 经典关卡：60张地图、60个单图任务、18个连战副本、物件/事件执行器、场景校验、战利品去重、逐图难度/出击人数和逐模板职业报告已完成，见 QUEST-06～09。
- [25](docs/25-fortunes-weave-skills.md)／[26](docs/26-weapon-art-catalog.md)／[27](docs/27-fortunes-weave-equipment-magic.md) 的58项职业能力、300项武器战技、170项装备／法术设计目录已经完成；170个设计ID（187条含旧兼容项的运行记录）与36项实物战技授予已接入；共用五格运行时／API／网页已实现；既有300项战技特殊结算已完成item 6首稿；特殊装备效果（含反噬／逆克制／魔法弓／毒短刀／吸血书）、法术效果与逐项投放已于`rules-v7`完成首版（ITEM-06、DESIGN-04）。
- [21](docs/21-code-design-audit.md) 的 15 项偏差已经修复：传承模式互斥、逐级保底／封顶转分配、排除轮回奖励跨代、真实药／盾消耗及剩余回收、实例主角身份、年度窗口／冻结／活动锁／退赛、任务专属胜负／箱子生命周期、轮回年龄与有效参战精通。
- 自捏开局、实例成长显示、九属性成长／上限／传承、77 项职业目录／权限与兽龙逐阶限制、购买资格／免费切回、五格已学技能、并行派遣、免费紧急补员、退役／纪念、三图远征、两条生产链、现实月榜归档，以及主要管理页面已有实现。
- 三地首次任务、声望、地区商店／配方、任务队伍／日期／敌军／风险／奖励预览、物资至少一箱可结束及额外箱子物资奖励已有首版。
- 不做可重复委托；不恢复已删除职业、赛季清空、野外只重伤、现实时间行动日补偿、两段各 20 级或无限代传承。UI 设计提示词和参考作品全物品表不自动成为必做需求。

## 后续完成一项需求时的验收基线

按改动运行相关检查，命令在仓库根目录执行，需要 Node.js 22.18+。文档整理只检查链接、待办／Beads 对应关系和差异空白，不需要重复运行全部业务测试。

```powershell
git diff --check
python3 tools/classic-integration/build_catalog.py
python3 tools/classic-integration/build_adaptations.py
python3 tools/classic-integration/build_reports.py
npm.cmd --prefix backend test
node tools/audit/design-consistency.mjs
python tools/audit/weapon-art-catalog.py
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

涉及网页流程、地图或成长数值时，再按 [21 的复现命令](docs/21-code-design-audit.md) 运行对应浏览器、地图与测算检查。预期为相关命令退出 0、已有回归不倒退，并新增能证明该需求完成的场景；测试数量会随开发变化，不在本表写死新的通过总数。

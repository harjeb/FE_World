# 21 代码与设计一致性检查

## 修复后的当前状态（2026-10-17）

修复任务：`fe-world-zli`。本次原始审计确认的15项偏差及7组修复待办已完成实现；下文“原始检查记录”保留修复前证据，不代表当前仍存在这些缺陷。

| 范围 | 修复结果 |
|---|---|
| 传承 | 成长／数值两模式互斥；战场和营地共用逐级保底；优先属性满后余点转分配；非法权重不吞道具；来源不包含单列轮回奖励。 |
| 战斗资产与身份 | 正式伤药／盾保留真实消耗，死亡只回收剩余物资；模拟战不回写物资或武器熟练度；神主角免死、退役／解雇限制及界面标签均按单位实例判断。 |
| 年度赛事 | D120起按年度开放并预留18日赛程；冻结报名属性和每轮随机输入；整届不能穿插经营／培养；旧入口同样要求报名；新增`WITHDRAW_ANNUAL`(113)释放活动锁，当届不能重报。跨年旧报名仍能继续或退出。 |
| 地区任务 | 专属目标不能被全灭替代；护送死亡判败；每人1箱、阵亡掉落；1箱可结算成功，也可继续带回额外物资；额外每箱1本地素材，首次声望仅领一次。 |
| 年龄与精通 | 年龄统一从轮回后的epoch起算；未有效参与即撤退不发职业精通。 |
| 网页及文档 | 同模板单位的成长类型、年龄和合计成长独立；补齐六种任务标签、队伍／日期／敌军／风险预览和物资结算提示；三图目标提示准确；新开局与旧存档夹具分别验收；README及12／13／14／20状态同步。 |

协议文档已生成到v2，`GET /agent-api/changes/1`提供变更说明。完整耐久、普通竞技场独立每场1日、真正随机角色生成器接线、16人扩编与酒馆小游戏等原已声明的后续功能不属于本次修复范围，仍未完成。

旧存档兼容：停止旧成长传承合同未来的错误数值补点，保留已经获得的属性、血缘锁与历史结算；不会追溯改写已获属性或冻结遗产。旧年度报名若没有保存报名属性，会在首次恢复时冻结当前数据，无法还原过去没有记录的报名数值。本轮验证使用内存／临时数据库，没有对正式存档执行迁移。

## 当前验收与复现

- 后端：226/226通过，包含15个原始审计回归，以及跨年赛事、退出／幂等、非法权重、旧合同、真实／模拟消耗、额外箱子、轮回生日和实例身份边界。
- 审计脚本：15项`PASS`，0差异、0夹具错误，退出码0。
- 浏览器：联调30/30、战斗回放6/6、永久军团页面32/32；新开局、实例成长、任务准备与赛事退出均有覆盖。
- 前端类型检查、生产构建通过；地图14/14通过；两个职业成长报告`--check`及6144次培养测算通过。

本机PowerShell复现命令：

```powershell
Set-Location F:\FE_World
$env:Path = 'C:\Users\harjeb\AppData\Local\pi-node\current;' + $env:Path
node --version
npm.cmd --prefix backend test
node tools/audit/design-consistency.mjs
node --test tools/mapgen/mapgen.test.ts
node tools/balance/class-growth-review.ts --check
node tools/balance/class-growth.ts --check
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
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

预期：命令均退出0，后端226项通过、审计15项通过、浏览器分别输出`all 30/6/32 checks passed`，差异空白检查无错误。浏览器脚本自动使用独立临时存档；诊断输出不包含接入凭据。

## 原始检查记录（修复前，deaa143）

原始检查日期：2026-10-17（Asia/Shanghai）。代码基线：`deaa143`，分支 `main`。审计任务：`fe-world-6fm`。

修复前结论：**部分一致，核心规则有实质偏差。**职业目录和成长数值的自动生成文档与代码一致，原有后端测试全部通过，但未覆盖年度赛事、传承、任务目标和真实战斗消耗的关键边界。原始15项定向检查均复现偏差，且没有复现夹具错误；这些检查现已全部转为通过。

原始审计仅增加报告及内存数据库审计脚本；后续修复已修改业务规则和测试。脚本位于[tools/audit/design-consistency.mjs](../tools/audit/design-consistency.mjs)，失败时输出设计期望和实际结果；退出码1表示发现差异，退出码2表示夹具执行错误。

## 核对基线

- `00-game-design.md` 的已确认方向是玩法基线；`15–17`补充当前职业目录、武器权限和成长数据；`19–20`补充日期敌军、任务及开局。
- `README.md` 已明确 `01–05`、`09` 的旧玩法不能独立用于定案，因此没有把赛季清空、两段20级等旧规则列成缺陷。
- `13`是后端目标，`12`和`14`是状态记录，三者均有历史叙述；“已有字段、接口或页面”不等于规则已闭环。
- `18`酒馆小游戏、`19`尚未接入的经验预算及16人扩编属于明确标注的草案或后续工作，未冒充本次新发现的实现回归。
- 年度赛事的精确报名窗口仍属数值草案；下文窗口问题是实现与当前文字及函数注释不符，不能把18日要求说成不可再改的最终数值。

## 已复现的问题

### 1. 成长传承同时建立数值保底，且轮回奖励被传给下一代（P1）

设计：`00 §7.3`规定两种模式二选一，成长传承不含属性总量保底；单列轮回奖励不能永久化传给下一代。`13 §5.2`也明确排除单列轮回奖励。

实现：`game/legacy.ts::claimLegacy`只在设置成长向量时判断模式，之后无条件把数值合同写入 `recipient.inheritance`。API允许成长模式同时提交 `weights`。`sourceGrowthVector`又无条件加入 `growthAllocation`。

复现：`L01`以全属性上限来源和合法九项权重接受成长传承，再结算对应等级保底，实际补点893，设计期望0；`L04`来源力量个人成长60、轮回分配10，冻结遗产力量成长变成70，期望仍为60。

证据：[legacy.ts](../backend/common/game/legacy.ts#L79)、[CLAIM_LEGACY](../backend/api/handlers.ts#L602)。跟踪：`fe-world-egg`。

### 2. 数值传承的保底在战场升级中失效，权重封顶后也会丢点（P1）

设计：`00 §7.3.1`要求每次升级先自然成长，再兑现逐级总量下限；偏好属性封顶后必须把剩余点转到其他有容量的属性。

实现：营地的 `model.ts::levelUp`调用了 `applyInheritanceFloor`，战场的 `engine/growth.ts::gainExp`没有；`toBattleUnit`也没有携带保底合同。`distributeBackfill`跳过所有零权重属性，正权重属性封顶后直接停止，其他属性还有容量也不分配。API未要求数值模式具有可兑现的有效权重。

复现：`L02`在战场从1升2级后，总量低于合同的2级下限；`L03`给力量权重1、其他0，到来源等级时仍达不到截断目标，即使其他属性有足够容量。

证据：[战场升级](../backend/common/engine/growth.ts#L71)、[战斗投影](../backend/common/game/model.ts#L312)、[补点分配](../backend/common/game/legacy.ts#L138)。跟踪：`fe-world-egg`。

### 3. 正式战斗消耗没有可靠回写，撤退后伤药次数恢复（P1）

设计：`00 §7.1`、`§8.3`要求正式冒险、撤退和死亡保留真实消耗，死者只回收剩余物资；普通竞技场才使用模拟副本。

实现：`applyBattleOutcome`复制了等级、经验和属性，只对存活分支中的盾另行扣除，没有将普通道具的剩余次数写回。死亡分支的回收读取的是原 `UnitRecord` 装备，并非战斗中的剩余物资。年度赛事和远征虽有局间 `carry`，但不能因此证明结束后的真实库存正确。

复现：`C01`携带剩余2次伤药，战斗中使用后确为1次，再撤退结算，角色记录仍为2次。

证据：[战斗结算](../backend/api/services.ts#L192)、[回收旧装备](../backend/api/services.ts#L167)。跟踪：`fe-world-u30`。

### 4. 普通角色只要与神主角共用模板，也会获得免死（P1）

设计：`00 §7.1`仅神主角不永久死亡，其他普通角色遵循死亡规则；单位实例与模板是不同身份。

实现：`applyBattleOutcome`通过 `unit.character === player.protagonist`决定是否免死，未判断 `isProtagonist`。现行游历在模板池耗尽后又允许重复模板，因此该分支具有实际可达的身份冲突风险。

复现：`C02`创建一个普通的艾琳模板单位，`isProtagonist`未设置；野外致死结算后状态仍是 `active`，期望 `dead`。

证据：[主角免死判定](../backend/api/services.ts#L231)、[招募模板回退](../backend/api/handlers.ts#L362)。跟踪：`fe-world-u30`。

### 5. 年度赛事没有统一活动锁及报名属性冻结，旧入口还能绕过赛制（P1）

设计：`00 §9.4.1–2`要求整届锁报名数值，比赛期间不能夹入其他推进日历的活动；当届淘汰不能重开。

实现：报名只记录 `unitIds`及空 `carry`，下一场从当前名册重新读取培养属性；`REST`、公共经验等操作没有统一检查正在进行的年度赛事。旧 `START_MAIN_STAGE`入口仍可直接创建正式 festival 战斗，未经过年度报名和当届唯一性检查。

复现：`A02`年度报名后仍可休整推进5日；`A03`报名后分配100公共经验，下一场实际使用提高后的等级；`A04`在D0无报名也能通过旧入口开大竞技场战斗。

证据：[报名和下一场](../backend/api/handlers.ts#L1321)、[休整](../backend/api/handlers.ts#L354)、[旧入口](../backend/api/handlers.ts#L396)。跟踪：`fe-world-o6e`。

### 6. 抢物资和护送任务可以绕过目标，护送对象死亡也可能判胜（P1）

设计：`20 §2`要求物资由携带者成功撤离才结算；护送NPC死亡即失败，不可用“杀光敌人”替代任务目标。

实现：`step.ts::checkResult`对除占领外的所有目标保留全灭胜利分支，而且该分支在护送死亡检查之前。

复现：`Q01`敌军已全灭时，未带出任何箱子的物资战判胜；NPC已死亡且敌军全灭的护送战也判胜。夹具保留了这些战斗状态，再用正常待机动作触发同一结算路径。

证据：[胜负检查](../backend/common/engine/step.ts#L133)。跟踪：`fe-world-zzr`。

### 7. 物资箱不符合单人一箱及死亡掉落规则（P2）

设计：`20 §2`规定每人最多1箱，携带者阵亡后箱子掉在其位置，可由其他单位拾取。

实现：拾取直接累加 `carried`，没有容量检查；致死处理只标记 `alive=false`，未将箱子重新加入地图。

复现：`Q02`已有1箱再拾取后变成2箱；`Q03`携带者实际被交战击败，地图掉落数仍为0，期望1。

此外，`quests.ts`的三项物资任务要求2箱，而`20 §2`仍写1箱完成基础目标、额外箱增加物资；当前也未按额外箱数结算奖励。这一配置与规则需要统一。

证据：[拾取](../backend/common/engine/step.ts#L88)、[致死](../backend/common/engine/resolve.ts#L43)、[任务配置](../backend/common/game/quests.ts)。跟踪：`fe-world-zzr`。

### 8. 轮回后的年龄刷新又累计旧入队时长（P2）

设计：`00 §5.2`、`13 §2.2`要求轮回重置16岁，并以新的 `ageEpochDay`重新起算。

实现：`reincarnate`正确更新了新年龄起点，但 `syncPlayer`使用的 `ageAt`仍以旧 `joinedDay`累计。

复现：`P01`在D0入队、D960轮回的角色，轮回后同日刷新年龄变成24，期望16。这同时影响展示和使用年龄曲线的成长计算。寿终日期使用另一套epoch公式，因此两个年龄口径还会分离。

证据：[ageAt](../backend/common/game/model.ts#L219)、[同步年龄](../backend/api/services.ts#L85)。跟踪：`fe-world-hua`。

### 9. 没有有效参与也能获得职业精通（P2）

设计：`00 §4.2.1`要求有效参战或训练，不能靠空图投降获取精通。

实现：`applyBattleOutcome`给所有存活正式参战名单成员发基础精通，不检查交战、治疗或目标行动。

复现：`M01`进入野外后立即全军撤退，没有任何角色行动，仍得到8点精通，期望0。

证据：[精通发放](../backend/api/services.ts#L217)。跟踪：`fe-world-4q3`。

### 10. 年度报名窗口实际按每30日开放（P2；精确窗口仍属草案）

设计：`00 §9.4.2`及`annual.ts`注释描述第一届D120开放，并预留完整赛程时间。

实现：`annualWindowOpen`检查 `dateOf(day).dayOfMonth >= 28`，这里的月份只有30日，与年度120日不同。

复现：`A01`在D27开放、D120关闭、D239开放，分别与当前文字期望相反，且可能出现第0届。

证据：[annualWindowOpen](../backend/common/game/annual.ts#L30)。跟踪：`fe-world-o6e`。

## 静态确认的界面问题

1. **重复模板的成长类型和合计成长会串值。**`frontend/src/demo/live.ts:55`把 `UNIT_TRAITS`按 `character`而不是单位ID构建，后者覆盖前者；`RosterParts.tsx:69、102`和名册筛选仍读这个映射。虽然名册路由和服务器单位查找已部分改成实例ID，仍不能宣称G11完全修复。对照`00 §3.4`“合计成长必须真实”。
2. **任务前端类型不完整。**服务端实际返回六种目标，`frontend/src/api/session.ts:167`及`QuestsPage.tsx:15`只声明、映射三种；护送、撤离、物资任务的类型标签会空白，类型检查也无法发现真实JSON的差异。
3. **任务出发缺少完整预览。**`GET_QUESTS`和任务页提供日数、目标、回合上限、基础奖励，但没有`20 §3`要求的入图敌军等级、推进日期及永久死亡风险预览；任务按钮直接调用`START_QUEST`，也没有队伍整备选择。

以上静态检查尚未补做逐页面视觉验收。跟踪：`fe-world-if7`。

## 已声明的缺口及文档漂移

| 项目 | 本次核实结果 |
|---|---|
| 普通竞技场每场1日、随时报名 | 仍未实现。`calendar.ts`仍是`arenaMatch:3`，`ARENA_ATTACK`实际不扣单场日数，仍依赖指定竞技场日与三对手结构。不是仅把常量3改成1就完成；`12/G08`已经承认这一缺口。 |
| 酒馆付费招募、真正独立的随机角色 | 酒馆渠道尚缺闭环；`generateRecruit`、`regionRoutes`、`recruitLevel`主要停留在独立模块及测试，生产RECRUIT只使用其中的`recruitClass`，仍从12名预设模板挑人、按讨伐数算等级，并按地区ID索引职业路线。不能以生成器测试通过证明实际招募已接入。 |
| 自捏开局 | **已实现首版**：`COMPLETE_SETUP`及`CompanionSetup`包含主角自定和两名同伴；README、12、14仍有“没有对应op／未实现”的旧说法。新账号日期和资源仍为演示起点D209、预置8–11级等；不能等同于从第一年一级开始的正式长流程。 |
| 声望配方 | **已实现首版**：`Recipe.requires`、`recipeUnlocked`与开工校验存在，`production.test.ts`有对应测试；`20`开头仍说未实现。 |
| 副本三图不同目标 | **已实现**占领→全灭→首领，见`battles.ts::dungeonGoal`；`20`开头仍说三图都是boss。 |
| 三地任务耗日 | 现行为1／2／6日，一地6任务总耗日`2×1+3×2+6=14`；`20`仍保留56日路线、4／8／24日验收及重复委托叙述，与同篇修订互相冲突。 |
| 培养预算 | `00`旧八年满99目标与`19`新版八年约87目标并存；`19`已承认1–2日任务令旧年度预算失效。派遣仍20经验／人／日、章节1350等是运行时现状；没有完成新的八年经验和经济闭环。 |
| 额外机制 | 耐久／维修／完美锻造、酒馆小游戏、16人扩编、完整职业技能和魅力战斗用途、实时观战等有明确待办或草案说明，本次没有将它们伪装成新发现。 |

建议后续同步一个明确的“当前状态”摘要，历史轮次记录继续保留历史含义；不能继续让同一文档同时宣称某机制已完成和未实现。

## 已核实一致的部分

| 范围 | 证据与结果 |
|---|---|
| 职业目录及九属性成长数据 | 当前77职业、20个定向加强、38个原表不变、19个扩展；`16`、`17`两个`--check`均通过，6144次培养测算通过。 |
| 等级99、转职不重置、兽龙封闭职业链 | 共享规则及对应game/API回归通过；不代表上面的轮回年龄和传承路径也正确。 |
| 地区敌军日期曲线、超出敌军5级经验限制 | 日期及战斗经验回归通过；未把新的经验预算写成已实现。 |
| 三地18个首次任务、声望档位及唯一领取 | 规则和API已有对应回归通过；不代表任务胜负判定已正确。 |
| 一次轮回、五格技能、并行派遣、盾1HP石化 | 已有数据、op及对应回归；完整内容、真实资源结算及有效参与边界仍须分别修正。 |
| 生成的Agent协议文档 | 现有协议文档生成一致性测试通过。 |

## 验证命令与实际结果

系统默认Node22.14不满足仓库要求；本次使用已安装的Node22.23.1。以下PowerShell命令可在本机复现：

```powershell
Set-Location F:\FE_World
$env:Path = 'C:\Users\harjeb\AppData\Local\pi-node\current;' + $env:Path
node --version
npm.cmd --prefix backend test
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
node tools/balance/class-growth-review.ts --check
node tools/balance/class-growth.ts --check
node tools/audit/design-consistency.mjs
git diff --check
```

实际结果：

- 后端：202/202通过，0失败。
- 前端：typecheck、build通过。
- 两份成长报告检查：通过；77职业数据一致，6144次测算通过。
- 审计脚本：15项检查，15项`MISMATCH`，0夹具错误，退出码1。修正规则后应逐项变为`PASS`，全部符合后退出码0；本脚本不替代后续常规回归。

浏览器联调另行执行：

```powershell
Set-Location F:\FE_World\frontend
$env:Path = 'C:\Users\harjeb\AppData\Local\pi-node\current;' + $env:Path
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/backend-integration.e2e.mjs
```

实际失败：`backend-integration.e2e.mjs:120`读取`.topbar.innerText`时元素为null。当前`App`会把新账号停留在`CompanionSetup`，旧测试未完成开局就跳军营，无法继续。该脚本使用临时数据库，未修改正式存档。其他两个浏览器脚本本次未运行，不能沿用`12/14`中的旧22/22、6/6、31/31当作当前验收结果。

## 原始修复计划（现已完成）

| Beads | 下一步 |
|---|---|
| `fe-world-egg` | 修正传承模式隔离、战场逐级保底、权重封顶转分配及来源成长口径。 |
| `fe-world-o6e` | 统一年度状态机、冻结报名输入、封锁穿插活动和旧入口，按当前方案修正窗口。 |
| `fe-world-zzr` | 修正任务专属目标、护送失败优先级、箱子容量／死亡掉落和奖励口径。 |
| `fe-world-u30` | 回写正式战斗剩余物资，按单位实例判定神主角。 |
| `fe-world-hua` | 将年龄显示和成长计算统一到轮回后的epoch。 |
| `fe-world-4q3` | 按实际有效参与发职业精通。 |
| `fe-world-if7` | 修正界面实例映射和任务类型，适配开局后的浏览器测试，清理实现状态文档冲突。 |

原定修复顺序为：传承与真实资源／身份→年度活动边界→任务胜负→年龄和精通→界面与文档同步。上述7组修复均已完成，当前验收结果见本文开头；其他既有功能待办继续由Beads跟踪。

# 06 UI 与 Agent 的后端接口契约 v2

> 更新：2026-10-16。替换旧版数字op、全服赛季／月末快照接口。配套：[架构](07-architecture.md)、[领域与事务](12-backend-domain-design.md)、[可导入类型](../backend/common/protocol/v2.ts)、[mock样例](../backend/common/protocol/v2.examples.ts)。**接口是本轮设计，尚未有服务端实现。** UI以此制作mock和接入层，不能把旧引擎本地结果当正式账号数据。

## 1. 传输与会话

- 协议版本2，操作使用稳定英文字符串。`POST /api/v2/query` 承载查询，`POST /api/v2/commands` 承载写命令，`WS /api/v2/ws` 可承载同样的信封；HTTP请求／响应体与WS帧字段相同。
- 会话在HTTP认证入口建立；浏览器通过受保护cookie，Agent通过独立可撤销凭据。认证交换不混入玩法OperationMap，后续实现统一会话模块；示例不含凭据。
- WebSocket每次连接有自己的正整数seq用于匹配响应；它不是幂等键。写命令的commandId在客户端第一次提交时创建，重试原命令保持不变。
- 后端从认证主体取得playerId，不接受客户端指定他人playerId来写资源。公开对手使用snapshotId和可见槽位ID，不能拿原账号unitId直接操作。
- HTTP和WS共享限流、schema校验、所有权验证和事务处理器，不维护两套玩法入口。
- 注册／首次认证只创建空个人世界，GET_STATE返回setupRequired:true。SETUP_LEGION按目录提供的自捏预算与两名伙伴候选原子生成主角和初始三人、初始库存；仅能成功一次，未完成前除查询与开局设置外的写操作均拒绝。自捏不能修改主角不死标记、寿命、上限或自由填写技能。

查询示例：

```json
{
  "protocolVersion": 2,
  "op": "GET_STATE",
  "seq": 1,
  "data": {}
}
```

写命令示例：

```json
{
  "protocolVersion": 2,
  "op": "END_PHASE",
  "seq": 7,
  "commandId": "b1a5c130-c649-4c63-a7c9-94f583b2f673",
  "expectedPlayerVersion": 18,
  "expectedBattleVersion": 6,
  "data": { "battleId": "battle-demo-01" }
}
```

成功响应固定含 `protocolVersion, op, seq, ok:true, playerVersion, data`；错误固定含 `ok:false, error:{code,message,retry,details}`，不返回内部堆栈。数据类型由OperationMap按op区分，不能用一个任意JSON袋子替代全部业务字段。

## 2. 版本、重试与事件

所有正式写命令带expectedPlayerVersion。`DEPLOY / UNIT_ACT / END_PHASE`作用于已有battle时另必需expectedBattleVersion；WITHDRAW_RUN在battle中也需要该版本，关间撤离无battle时可省略。类型中此字段为可选以适配多状态，运行时schema和处理器做条件必填校验。

命令幂等优先于版本校验：已提交的同commandId重试返回原响应，即使其playerVersion已经变老；同commandId负载不同拒绝。若未知是否提交，先查GET_COMMAND_STATUS，再用相同commandId重试；绝不重新创建编号“试一下”。同请求重新发送时可换seq，负载摘要不含seq。

END_PHASE可返回 `processing:true`；此时服务端逐动作处理规则AI，客户端禁止玩家动作，持续接收事件。提交成功不表示整个敌方阶段已经完成。

推送仅发送：

```json
{
  "protocolVersion": 2,
  "type": "EVENTS_AVAILABLE",
  "latestCursor": "318",
  "playerVersion": 19
}
```

客户端GET_EVENTS(after)补拉，按cursor去重并保持顺序；cursor作为不透明字符串，不用浮点比较。分页nextCursor不为null时继续拉。游标超出保留窗口则 `resyncRequired:true`，重新获取GET_STATE、活动和当前战斗后再接新游标。订阅推送必须先鉴权且只发本人事件，不能向所有连接广播军团私有信息。

## 3. 公开DTO约定

字段完整定义在v2.ts，这里规定展示语义：

| DTO | UI直接使用的含义 |
| --- | --- |
| PlayerState | 是否需要自捏开局、个人日期、金币、公共经验、讨伐数、活动、名册容量、能力开关与版本 |
| Calendar | day是已经过去的日数；year／quarter是显示值；年度届次由Arena提供，UI不拿year直接当届次 |
| Unit | 实例身份、存活／死亡／退役状态、九项实际属性、固定上限、成长拆分、年龄寿命、药剂额度、锁定活动 |
| Item | 唯一物品实例、实际位置、耐久／最大耐久、次数、精工标记；同名武器不等于同一实例 |
| World / Region | 地图坐标和邻接、可达性、动态敌人范围、首次通关难度、资源与建筑关联 |
| ActionQuote | 报价时的版本、耗日／金币／材料、经过事件、风险、等级范围和阻挡原因 |
| Run | 活动状态、锁定名单、存活者、图索引、恢复策略、当前battle和远征袋；用于恢复中断活动 |
| Battle | 公开局面、回合、版本、地图、单位、状态与结果；不含PRNG和未公开AI设置 |
| Forecast | 攻击／治疗类型、治疗量、显示命中、真实命中、暴击、出手数、击败概率、三角关系和预计耐久上限；概率是0–1，显示命中／暴击是0–100 |
| LegacyPreview | 来源总量、上限截断值、逐级保底曲线、成长结果和费用；不能只显示一个“继承成功” |
| ArenaEntry | 本届编号、报名行动日、海选胜数、正赛轮次、对手快照来源和已结束状态 |
| Quest | 事件状态、故事摘要、阻挡原因和独立章节奖励，名次不是主线blocker |
| ProductionOrder / Refinement | 按行动日成熟的订单，与按现实秒数操作的一次性精工挑战分开 |

坐标统一0起点 `[x,y]`，tiles按 `[y][x]`。索引stageIndex从0开始。所有数量和版本为非负安全整数；价格和属性禁止浮点。realTime字段ISO-8601 UTC，不能用来代替行动日。空对象用`{}`，没有实体用null，不同时用空串／0／省略代表同一件事。

成长率分量中的职业／年龄修正可以为负整数，最终成长率最低0；属性、剩余耐久、库存和余额仍不可为负。公开对手的items使用快照本地实例ID，ownerUnitId与lockedByRunId置null，不暴露原玩家资产关联；揭晓前revealedDeployment为null，隐藏防守策略与优先级不进入DTO。

事件payload和静态catalog暂为Json扩展区；核心可操作实体都是显式DTO。正式运行时schema须覆盖每个操作的枚举、范围、数组上限和additionalProperties:false；TypeScript类型本身不承担运行时校验。

## 4. 查询操作

所有query都不会付出行动日、扣物品、刷新随机结果或发新收益。PREVIEW_ACTION可以创建无收益的短期报价；其id不能绕过正式执行校验。

| 操作 | 输入摘要 | 输出／用途 |
| --- | --- | --- |
| GET_CAPABILITIES | `{}` | 协议版本、可调用操作、模块enabled／reason；未实现模块隐藏或禁用 |
| GET_STATE | `{}` | PlayerState；登录／重连后的第一份状态 |
| GET_CATALOG | kind, version或null | 有版本的职业／物品／技能／地区等静态记录；UI缓存 |
| GET_WORLD | `{}` | 十二地区路线、当前动态等级与探索权限 |
| GET_ROSTER | status, cursor | 分页Unit；死亡与退役名册也从此读取 |
| GET_UNIT | unitId | 单位完整详情，含成长与药剂计数 |
| GET_GROWTH_HISTORY | unitId, cursor | 分页升级记录，自然增长和继承补点分列 |
| GET_INVENTORY | `{}` | 仓库实例、材料余额、容量 |
| GET_SHOP | shopId | 当前季度库存和stockVersion，不刷新库存 |
| GET_RECRUITMENT | regionId | 酒馆候选、价格、游历费用与保底进度 |
| GET_PRODUCTION | `{}` | 工位订单与ready状态 |
| GET_LEGACIES | cursor | 可用／已用遗产及来源，不输出来源私有随机流 |
| GET_QUESTS | cursor | 任务、年度主线事件与领奖状态 |
| GET_ARENA | `{}` | 年度可报名状态、本人entry与历史 |
| GET_ARENA_HISTORY | cursor | 赛事历史分页；GET_ARENA内history只给最近20项 |
| GET_OPPONENT | entryId | 本轮对手完整可见属性／装备与快照槽位；揭晓前隐藏部署 |
| GET_DEFENSE | `{}` | 本人当前防守方案，初始可为null |
| GET_SPARRING | cursor | 可选官方陪练快照，用于零收益练习 |
| GET_DISCOVERIES | cursor | 已发现的见闻文本与发现日期 |
| GET_LEADERBOARD | mode, bracketId, cursor | 相应进度段排名；不宣称它就是精确同日匹配池 |
| GET_ACTIVE_RUN | `{}` | 当前Run或null |
| GET_RUN | runId | 本人某个进行中／已完成Run |
| GET_BATTLE | battleId | 公开战斗状态和版本 |
| GET_REACHABLE | battleId, unitId | 合法停留格与动作候选，包含battleVersion |
| PREVIEW_COMBAT | battleId, action | Forecast；查询不会推进随机序列 |
| GET_THREAT_MAP | battleId | 敌方威胁格、攻击者与伤害上限 |
| GET_REPLAY | replayId, cursor | 公开关键帧／事件分页，不含账号成长种子；未开放给available:false |
| GET_EVENTS | after或null, limit | 账号事件分页，含resyncRequired；limit范围1–200 |
| GET_COMMAND_STATUS | commandId | unknown／committed／rejected及原响应；只能查本人 |
| PREVIEW_ACTION | action | ActionQuote，用于所有日历推进动作 |
| PREVIEW_LEGACY | legacyId, recipientUnitId, mode | 上限裁剪、逐级下限或成长向量预览 |

WorldAction支持：start_field、start_dungeon、continue_run、start_annual_arena、start_regular_arena、start_practice、explore、travel_recruit、train、wait、start_production。开始远征须指定地区、stage、单位和带入物品；continue_run由已有Run确定下一图／下一轮，客户端不能随意指定跳到最终首领。start_practice耗日和收益为0，资源为模拟副本，但仍需遵守活动互斥。

## 5. 写命令

| 操作 | 输入摘要 | 成功输出／关键限制 |
| --- | --- | --- |
| SETUP_LEGION | protagonistName, appearancePresetId, statAllocation, 两个companionTemplateIds | 自捏预算校验后创建初始三人，一次性设置；第二次拒绝，不覆盖已有军团 |
| EXECUTE_ACTION | quoteId | 创建Run／订单／招募事件或推进日历；返回runId／entityId及新PlayerState |
| DEPLOY | runId, deployment[] | 开始该图Battle；只能部署锁定名单存活者和合法格 |
| UNIT_ACT | battleId, action | 一次移动＋攻击／治疗／道具／交换／压制／撤离格；原子验证后执行 |
| END_PHASE | battleId | 结束玩家阶段，返回processing状态；规则AI由后端执行 |
| WITHDRAW_RUN | runId | 当前远征撤离／赛事退赛；保留真实伤亡与已消耗资源 |
| BUY | shopId, offerId, stockVersion, quantity | 扣钱／库存并发物品，全有或全无 |
| SELL | itemIds | 按实例出售，绑定／活动锁定／纪念冻结物品不可卖 |
| RECRUIT_TAVERN | candidateId, stockVersion | 花钱不花日，名册容量不足不扣钱 |
| RESOLVE_RECRUIT | encounterId, accept | 接受或拒绝已付时间的游历候选，不重掷 |
| TRANSFER_ITEM | itemId, toUnitId或null | 单位／仓库转移，活动内改用UNIT_ACT.exchange |
| EQUIP_SKILLS | unitId, skillIds | 验证已习得、槽位、重复、职业限制和锁 |
| USE_ITEM | unitId, itemId | 营地使用药剂等，检查单项／总额度；战中使用走UNIT_ACT |
| PROMOTE | unitId, classId | 等级／熟练度／资格／印章校验，总等级不归零 |
| ASSIGN_BEXP | unitId, amount | 原子扣公共池、逐级成长；死者／退役／锁定角色拒绝 |
| RETIRE_UNIT | unitId | 达标者永久退出参战并可生成遗产；主角拒绝 |
| DISMISS_UNIT | unitId | 普通解雇，不等同于RETIRE_UNIT，不自动产遗产 |
| CLAIM_LEGACY | legacyId, recipientUnitId, mode, inheritanceItemId, weights或null | 二选一、来源与接受者唯一；上限不足裁剪后兑现 |
| REINCARNATE | unitId, growthAllocation | 满级、未轮回和资源满足后一次轮回，不返老还童 |
| REPAIR_ITEM | itemId | 用钱与材料恢复已有最大耐久，不重发完美奖励 |
| CLAIM_PRODUCTION | orderId | ready产出只领一次；有未决精工时先STOP／SKIP |
| ARM_REFINEMENT | orderId | 固定一次挑战，尚未开始计时，能力未开放时拒绝 |
| START_REFINEMENT | challengeId | 服务端开始现实计时 |
| STOP_REFINEMENT | challengeId | 以服务端接收时间判定，客户端不能报完美结果 |
| SKIP_REFINEMENT | challengeId | 固定普通品质，产物仍可领取 |
| COMPLETE_STORY_EVENT | questId | 年度剧情事件完成，与赛事名次无关；不在此重复发奖 |
| CLAIM_REWARD | sourceKind, sourceId | 奖励唯一键结算，返回receiptId；不能随意填奖励数量 |
| ARENA_BAN | entryId, bannedSlotIds | 按本轮可见快照槽位禁用，B=0传空数组 |
| SET_DEFENSE | mapId, unitIds, deployment, behaviors | 修改未来快照防守方案，不篡改已锁定历史快照 |

写操作统一返回 `MutationResult<T>={value,state,events}`，state是提交后的PlayerState，events是本命令新增公开事件。UI以实际返回值更新，不能根据动画是否播完决定命令是否提交。

## 6. 三条关键交互流程

### 6.1 三图地区副本

1. GET_WORLD选地区→GET_ROSTER／GET_INVENTORY编队→PREVIEW_ACTION(start_dungeon)。展示八日当图费用、三图总量、敌人范围、固定名单与真实死亡风险。
2. EXECUTE_ACTION(quoteId)创建Run并付第一图八日→DEPLOY→GET_BATTLE／查询预测→UNIT_ACT／END_PHASE。
3. 本图胜利后Run为between_maps。UI展示下一图以及真实HP／异常／耐久，不能调用营地恢复或替补接口。
4. PREVIEW_ACTION(continue_run)→EXECUTE_ACTION支付下一图八日→DEPLOY。保存／重连从同一状态继续。
5. 最后一图胜利释放掉落、地区首通和首次讨伐；撤离／失败保留经验与伤亡，远征袋作废。奖励领取只从后端发放的sourceId操作。

### 6.2 年度海选与正赛

1. GET_ARENA和GET_STATE→PREVIEW_ACTION(start_annual_arena)→EXECUTE_ACTION，固定报名日、名单和整个对手池。
2. GET_ARENA展示当场对手可见名册→ARENA_BAN（如需）→DEPLOY→战斗。
3. 胜利后between_matches；PREVIEW_ACTION(continue_run)付下一场时间。年度赛事允许报名名单内的存活替补，区别于地区副本固定实际队员。
4. 海选至少两胜进64强；淘汰／退赛／夺冠都使Run结束，本届不重报。真实死者和消耗不回滚，对手原账号不受损。
5. 当年主线事件独立可完成和领奖，失败不锁故事；竞赛金币／荣誉另领。故事领取不自动给阵亡者升级。

### 6.3 退役、传承与轮回

1. GET_UNIT查看资格，RETIRE_UNIT仅对未锁定达标普通角色；返回遗产ID及退役Unit。
2. 新招募一级角色→PREVIEW_LEGACY，展示成长模式或上限裁剪后的数值目标→CLAIM_LEGACY。两模式不能接连领取。
3. ASSIGN_BEXP多级成长时，UI按growth_history区分randomGains和inheritedGains，不将继承补点解释为幸运升级。
4. 角色99级、cycle=0且未锁定时可REINCARNATE，UI展示一级基准、保留内容、年龄寿命和药剂计数重置；收到结果后重新GET_UNIT／库存。

## 7. 错误与客户端处理

| code | retry | UI／Agent动作 |
| --- | --- | --- |
| AUTH_REQUIRED / FORBIDDEN | none | 登录或调整已授权范围；不循环发危险命令 |
| PROTOCOL_UNSUPPORTED / FEATURE_DISABLED | none | 显示当前能力限制，不靠本地模拟写正式账号 |
| PLAYER_SETUP_REQUIRED / PLAYER_ALREADY_SETUP | refresh | 进入开局设置或读取已经创建的军团，不覆盖存档 |
| VALIDATION_FAILED | none | 按details字段路径修正输入 |
| STALE_PLAYER_VERSION / STALE_BATTLE_VERSION | refresh | 拉新状态和报价，放弃旧预测；创建新的业务决定前不要盲重试旧动作 |
| IDEMPOTENCY_CONFLICT | none | 停止复用此commandId发送不同内容 |
| COMMAND_STATUS_UNKNOWN | same_command | 查询命令状态／重试原commandId，禁止换编号重复支付 |
| ACTIVE_RUN_EXISTS / ENTITY_LOCKED | refresh | 进入当前活动，或先显式撤离 |
| INSUFFICIENT_RESOURCE / ROSTER_FULL / INVENTORY_FULL | none | 改编队或整理库存，原命令无部分扣费 |
| QUOTE_EXPIRED / QUOTE_STALE | refresh | 重取报价，重新展示实际成本 |
| CALENDAR_EVENT_REQUIRED / LIFESPAN_CROSSING | refresh | 处理日期事件／换出即将寿终的角色，不能跳过寿终 |
| UNIT_DEAD / UNIT_RETIRED / LEGACY_ALREADY_USED | refresh | 刷新名册／遗产，不重试不可逆状态 |
| NOT_YOUR_PHASE / BATTLE_PROCESSING | wait | 等事件，不能重复END_PHASE制造多个AI任务 |
| UNIT_ALREADY_ACTED / UNREACHABLE / TARGET_OUT_OF_RANGE | refresh | 查询合法动作重新选择 |
| WEAPON_RANK_TOO_LOW / ITEM_BROKEN | none | 换合法物品，预览显示原因 |
| RUN_STATE_INVALID / BATTLE_OVER | refresh | 拉Run／战报，不把完成局重开 |
| ARENA_ALREADY_ENTERED / ARENA_WINDOW_CLOSED | none | 等下届，主线事件仍可查看 |
| ARENA_BAN_REQUIRED / ARENA_BAN_INVALID | refresh | 根据公开槽位与数量完成本轮BAN |
| REWARD_ALREADY_CLAIMED | refresh | 查询已有领取记录，不再生成奖励 |
| REFINEMENT_RESOLVED / PRODUCTION_NOT_READY | refresh | 显示已有精工结果或剩余行动日 |
| RATE_LIMITED | wait | 按服务端建议退避；不能靠多连接绕过 |

错误retry只是恢复建议，不代表后端会代客户端再次执行。数据库或临时网络错误可标same_command，直到客户端确认receipt；业务拒绝保证不产生部分变更。

## 8. 给UI开发LLM的交接说明

可以直接使用以下任务说明：

> 以 `backend/common/protocol/v2.ts` 为类型源，用 `v2.examples.ts` 制作可切换mock transport，开发军营、地图、名册、物品、招募、生产、任务和竞技场页面。所有服务调用经过统一client，禁止在页面里自己随机生成正式成长、裁决战斗、修改金币或复活角色。先读GET_CAPABILITIES，按enabled和blockers显示功能状态。多日动作先展示PREVIEW_ACTION费用／日期／风险，执行时带commandId和预期版本。重连通过GET_STATE、GET_ACTIVE_RUN、GET_BATTLE和GET_EVENTS恢复。地区副本无自动回复且不换人；大竞技场真实死亡且成绩不锁主线；普通竞技场暂为模拟。精工挑战先显示为未开放，不伪装成真实后端。原型localStorage只用于UI偏好或mock隔离状态，不回写正式账号。

本轮不改UI页面，也未部署服务。mock不是实际协议验证器；正式联调前后端须生成运行时schema并完成12文档中的验收项。

样例各自代表一个页面状态，不构成按顺序执行的完整战斗回放。可在mock层分别装载营地、连战关间、战斗中及版本冲突状态；不能将样例ID当作可向真实服务调用的现存资源。

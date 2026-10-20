# Agent 接口文档（自动生成）

docVersion: 15

本文件由 `backend/common/protocol/ops.ts` 与 `schemas.ts` 生成，不要手改。

每个请求的完整参数见 `/agent-api.json` 中对应 op 的 `dataSchema`，与 MCP 的 `data` 参数声明共用来源。

MCP 使用 `AGENT_TOKEN` 认证，不提供 WebSocket 专用的 LOGIN／LOGOUT。写操作自动附带 commandId，连接或响应解析失败时使用同一 ID 重试一次；仍无法确认时错误会返回该 ID，后续重试必须复用 data.commandId。

SORTIE、START_DUNGEON 和任务连战副本的 START_QUEST 支持 aiDifficulty: normal | hard（默认 normal）。困难需先普通通关相同内容：野外胜利解锁本地区困难野图，普通完整通关解锁本副本；两者互不替代，失败、中间图和困难胜利不算。单图任务保持普通一次性流程。读取 GET_STATE.hardUnlocks.regions/dungeons/quests 或 GET_QUESTS.hardAvailable/hardUnlocked 判断；直接请求未解锁 hard 会被拒绝，预览列出 blockers。任务副本可重打，但固定任务奖励与首通探索不重复发。旧档按真实普通胜利与完整通关记录补齐，缺失难度按普通，不从模糊完成标记推定。normal 已会集火与调整出手顺序，hard 进一步搜索连续三次行动的走位和配合。困难初始敌阵和增援人数增加50%（向上取整，附近合法空位为限），等级随机+2～5（上限99），按提高后的等级计算基础属性，再给HP随机+20%～35%、其余八项能力各+10%～25%、体格+1～3；能力加成向上取整且至少+1，受职业上限约束，移动力不变；配备更强装备及对应熟练度。独立种子固定生成结果，刷新不重掷、旧单位不重加。耗日及任务固定奖励不变，随机战场的出战上限和敌军规模由地图／难度配置决定，更多高等级敌人会自然增加战斗经验，敌军携带装备不会按概率掉落。远征全程锁定，缺失字段的旧战斗／远征按 normal 返回。battle.aiDifficulty 与 GET_RUN.run.aiDifficulty 返回当前设置；PREVIEW_ACTION 的 sortie／dungeon 报价 payload.aiDifficulty 保留设置，EXECUTE_ACTION 按报价执行。其他模式保持 normal。

随机野外与随机副本先确定战场，再选择队伍：GET_TODAY.sortieRegions 的 encounters／dungeonEncounters 分别提供 normal、hard 的布局、尺寸、maxUnits 与 enemyCount；少带人不会减少敌军。同一账号、日期、地区与活动的战场固定，刷新、换队或切换难度不会重抽布局；推进日期后才更新。PREVIEW_ACTION 返回 encounter.map 的真实地形、双方出生点与 playerGroups，报价按玩家版本绑定。出征名单按unitIds数组顺序分配到map.spawns.player对应落点，首位为主将；必须互不重复、可用且不超过该图该难度的上限；副本开局保存RunRecord.stages，出战上限取整趟所有图的限制（含经典终图）。地图布局含交错遭遇、隔墙分队会合和分散据点；已保存战场不重排。

连续副本按难度分别计固定首通奖励：地区主副本按地区、地区任务远征及经典副本按任务ID，normal/hard各一次。普通为一件固定地区装备、2份伤药、1份完整料理；困难为不同且更高阶的固定装备、4份伤药、2份完整料理，不抽概率。仅完整通关自动入库，中间图不发，失败／撤离作废。GET_TODAY.sortieRegions[].dungeonFirstClearRewards 与 GET_QUESTS.firstClearRewards 返回 {normal:{items,available},hard:{items,available}}，替代旧单数属性；单图任务为null。GET_RUN.run.pendingLoot记录整趟掉落，完整结算后为已入库清单。手动任务奖励与首通探索跨难度仍仅一次。旧完成记录抑制对应难度补发，questsDone仅回退普通档，困难完成独立判断。

副本统一UI内选择路线，不另设随机／经典导航分类。GET_TODAY.sortieRegions[].dungeonStages与PREVIEW_ACTION(dungeon).dungeonStages为{name,scenarioId?}数组：两张生成图＋一张经典终图，全部60张经典地图分为12地区各5张的池，选择种子独立于战斗RNG并在出发时冻结。标准副本每图8日共24日，48项地区任务远征每图2日共6日。固定经典保留六个三图副本clx-fe1/2/3/6/7/8，每作一个，fe1/fe6在地区2、fe2/fe7在地区3、fe3/fe8在地区5，每图2日共6日；START_QUEST继续兼容。GET_QUESTS返回dungeonOnly、archived、stageNames；公开114项定义（108本地＋6经典），78项旧定义（60单图＋18短经典）仅保留查找，拒绝新开，旧进行中／待领奖仍列出。GET_RUN摘要返回stageNames/stageCount；没有stages的旧远征由CONTINUE_DUNGEON沿旧路线继续。

## 帧格式

```
请求  { op, seq, data? }
响应  { op, seq, ok, data? | error: { code, message, action } }
推送  { op, data }
```

## op 清单

### 会话

| op | 名称 | 说明 |
| --- | --- | --- |
| 1 | LOGIN | 用 sk_ 令牌登录，带上 docVersion 与可选的 agentModel；成功后开始收发指令。 |
| 2 | LOGOUT | 结束当前会话；之后的指令都会以未登录拒绝。 |
### 账号

| op | 名称 | 说明 |
| --- | --- | --- |
| 10 | GET_STATE | 读取个人日期、可用行动日、金币、公共经验、名册摘要与下一次快照／竞技场时间；hardUnlocks.regions/dungeons/quests 分别列出已普通通关、可选困难的地区野图／随机副本／任务连战副本。 |
| 11 | GET_EVENTS | 按 sinceId 增量读取账号事件流，用来知道离线期间发生了什么。 |
| 12 | GET_AGENT_INFO | 读取 Agent 的在线状态、计划与最近一次上报。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 20 | GET_ROSTER | 名册摘要与各单位等级、职业、HP、状态；用 GET_UNIT 取完整属性。 |
| 21 | GET_UNIT | 一个单位的完整属性、成长率、武器经验、物品与升级记录。 |
### 仓库

| op | 名称 | 说明 |
| --- | --- | --- |
| 22 | GET_INVENTORY | 仓库物品与每个单位携带的物品。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 23 | GET_CATALOG | 职业、武器、技能、地形等静态数据；带版本号，缓存后只在版本变化时重取。 |
### 日历

| op | 名称 | 说明 |
| --- | --- | --- |
| 30 | GET_TODAY | 今天可选的活动（耗日、金币、是否可用）与各地区敌方等级；sortieRegions 的 hardUnlocked/dungeonHardUnlocked 表示野图／副本困难权限，encounters/dungeonEncounters 的 normal/hard 给出该地图的编队布局、尺寸、maxUnits 与独立敌军人数 enemyCount。出战名额随地图和难度变化，不按我方所选人数缩减敌军；dungeonFirstClearRewards={normal:{items,available},hard:{items,available}} 分别给出两档首通礼包，困难装备更高阶且不同；dungeonStages 为 {name,scenarioId?} 数组（两张生成图＋一张经典终图），dungeonEncounters.maxUnits 按整趟所有图限制。 |
| 31 | SORTIE | 本地区普通野外胜利后才能选 hard，其他地区或副本的通关不替代；带可选 aiDifficulty（normal／hard，默认 normal；hard 更深入搜索，初始敌阵及增援人数约+50%、等级随机+2～5、HP+20%～35%、其余能力+10%～25%、体格+1～3、装备升级；移动力不变，人数受合法空位限制，等级及能力封顶）、region（地区 id）与 unitIds（按数组顺序部署，首位为主将；互不重复的可出战单位，名额见 GET_TODAY.sortieRegions[].encounters[aiDifficulty].maxUnits；省略时按当前上限选取；超额、重复或不可用单位拒绝）出击，立即推进日期；返回 battleId，之后用战斗类 op；普通随机野外遭遇战胜利增加当地探索度3点。 |
| 32 | SWEEP | 对已讨伐地区扫荡，可一次指定多次；低操作成本，不发等级经验。 |
| 33 | TRAIN | 训练一个单位，补武器熟练度；消耗金币或教材并推进日期。 |
| 34 | REST | 休整指定日数，推进日期、作物与年龄，不直接发金币经验。 |
| 35 | RECRUIT | 游历招募：只花行动日，按地区角色池概率遇到新人，失败也推进日期。 |
| 36 | START_MAIN_STAGE | 开始大竞技场的下一轮（第 1–3 轮海选，之后淘汰赛），推进日期；普通角色阵亡即永久死亡。返回 battleId。 |
| 37 | SKIP_MAIN_STAGE | 把日期推进到下一季第 1 日；只按到达日判断竞技场日，途经的竞技场日不会开放。 |
| 38 | PREVIEW_ACTION | 为一个日历行动生成与 playerVersion 绑定的报价：实际耗日／金币、起止日期、死亡风险与阻挡原因；sortie/dungeon 还返回 encounter（布局、双方人数、maxUnits、map 地形/出生点/playerGroups）。dungeon 另返回 dungeonStages（各图 name、可选 scenarioId）。同一未花费的日期内战场固定，修改队伍不重掷；EXECUTE_ACTION 按报价执行。 |
| 39 | EXECUTE_ACTION | 用 quoteId 执行报价；服务端重新校验版本与库存，过期返回可刷新错误，不自动涨价。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 40 | GET_SHOP | 读取本季商店的有限商品与价格。 |
| 41 | BUY | 用金币购买商品；库存有限，买入再卖出会亏损。 |
| 42 | SELL | 卖出仓库物品换取金币；uses 可指定剩余次数的一叠，count 为出售数量，默认1。 |
| 43 | TRANSFER_ITEM | 在仓库与单位之间搬运物品、更换装备：action 为 equip / toUnit / toWarehouse。武器、道具、法术书（item 为 spellbook:<法术id>，同种只带一本）各最多 5 件；只有武器、法术书和伤药等战斗道具能带上；toUnit 可用 uses 指定哪一叠，耐久与剩余次数随物品走；出战或远征中的角色不能搬运。 |
| 44 | USE_ITEM | 使用能力药或限量法术教材（manual:<法术id>，为有对应魔法权限的角色解锁该法术）；超出永久上限、额度或已学会时拦截，道具不扣。 |
| 45 | PROMOTE | 切换到推荐进阶职业，须已拥有资格；与 SWITCH_CLASS 共用校验，不绕过职业购买或派遣占用。保留等级、经验和已获属性。 |
| 46 | ASSIGN_BEXP | 把公共经验分配给一个单位；不耗行动日，实际消耗不超过库存及距离满级所需，返回 amount 为实际扣除；满级单位不能分配。 |
| 47 | DISMISS | 解雇一个单位；普通解雇不等于符合条件的退役传承。 |
| 48 | GET_LEGACIES | 读取可用与已兑现的遗产（来源、等级、总量、成长向量）。 |
| 49 | CLAIM_LEGACY | 用一个一级新角色兑现一份遗产：mode 取 growth（替换个人成长）或 numeric（逐级保底）；一人一生只接一次。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 74 | RETIRE_UNIT | 让达到传承门槛的角色正常退役并生成遗产；退役不可逆，不能继续出战。 |
| 75 | REINCARNATE_UNIT | 让 99 级的存活角色轮回一次：回一级、清学习与资格、年龄 16 岁，并分配 30 个百分点成长；兽人与龙人返回本族第一阶且保留种族，携带装备回仓。 |
| 76 | GET_MEMORIAL | 读取纪念名册：战死、寿终、退役的角色与原因、最终状态与传承关系；emergency 给出免费补员的资格与阻挡原因。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 77 | EMERGENCY_RECRUIT | 严重损失后的免费酒馆补员：不花钱、不推进日期，每次有效资格随机 2 人。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 78 | GET_CLASS_MARKET | 读取现行职业资格、年份与价格；传unitId返回eligibilityReason。人类可跨普通路线，兽／龙只可进阶本族下一阶。 |
| 79 | BUY_CLASS_QUALIFICATION | 为角色购买职业资格；校验年份、种族、金币与月额度，兽／龙不能跳阶或降阶。轮回清除资格。 |
| 84 | GET_MASTERY | 读取角色各职业的精通点、技能／战技奖励及阈值、已解锁节点和习得库；参战与派遣返程达到阈值后学会，换职保留，人物等级不直接发奖。 |
| 85 | SWITCH_CLASS | 营地凭资格免费换职，不占购买额度并保留学习成果；人类可跨普通路线，兽／龙只允许当前职业或本族下一阶，不可跳阶、降阶或跨种族。 |
| 86 | EQUIP_SKILLS | 营地用skills与arts数组一次调整已学技能和战技，共用最多5格；省略arts保留当前战技选择，空数组卸下。未学会／装备专属战技不可装入；个人／职业自带与装备授予不占格。战斗或角色远征／派遣／年度赛事忙碌时拒绝，换职保留选择。 |
| 87 | GET_ART_TRAINING | 读取角色的103项强化战技研修：基础技前提、金币、工期、已学状态和阻挡原因；学习不要求原教学职业或使用武器等级。 |
| 88 | TRAIN_ART | 营地研修一项已学基础技对应的独立强化战技，传unitId与art；扣金币并推进工期，重复已学会被拒；commandId重试不重复支付，可先用PREVIEW_ACTION的art_training报价。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 89 | REFINE_WEAPON | 营地精炼仅支持 fw_weapon_85，传 unitId、item；仅处理携带的第一件同模板武器，最高3级。升至n级消耗300*n金币与n矿石，不耗天数、不修耐久、不加属性；commandId重试只支付一次。 |
### 生产

| op | 名称 | 说明 |
| --- | --- | --- |
| 90 | GET_PRODUCTION | 读取农田、工位、进行中的订单与可领取的产出。 |
| 91 | PLANT | 在农田播种：消耗种子并推进 1 日，成熟后收获不额外耗日。 |
| 92 | START_PRODUCTION | 开一个生产订单（炼药／锻造），扣料并占用一个工位，按行动日成熟。 |
| 93 | COLLECT_PRODUCTION | 领取已成熟订单的产出；每单只结算一次，不重抽产出。 |
| 94 | REPAIR_ITEM | 花金币与材料维修一件损坏武器，恢复到它已有的最大耐久，不叠第二个完美奖励。 |
### 竞技场

| op | 名称 | 说明 |
| --- | --- | --- |
| 95 | GET_RATINGS | 读取普通竞技场的现实月榜：本月积分／名次／战绩与已归档旧月榜、可领取奖励。 |
| 96 | CLAIM_RATING_REWARD | 领取某个已归档月份的排名奖励；旧奖励可稍后领取，但不影响新月积分。 |
### 远征

| op | 名称 | 说明 |
| --- | --- | --- |
| 100 | GET_RUN | 读取当前或最近一次连续远征：状态、stageNames/stageCount、剩余名单、每名存活者带入下一图的 HP 与物品（carry）、待带回掉落；completed 时 pendingLoot 是已入库清单，包含本次实际获得的首通奖励。 |
| 101 | START_DUNGEON | 开始三图地区大副本（两张生成图＋一张经典终图，每图8日，共24日，开局冻结方案）：本地区此副本普通完整通关后才能选 hard，野外胜利或中间图不算；可选 aiDifficulty（normal／hard，默认 normal；hard 初始敌阵及增援人数约+50%、等级随机+2～5、HP+20%～35%、其余能力+10%～25%、体格+1～3、装备升级，移动力不变且封顶），整个远征锁定；人数上限与敌军规模见 GET_TODAY 的 dungeonEncounters 和报价 encounter，互不重复且可用的队员才可出征，按 unitIds 数组顺序部署且首位为主将；固定名单、地图配置与物品，支付首图日数；普通角色真实死亡；每个副本仅首次完整通关增加当地探索度20点（跨难度一次）；固定装备与道具按地区和难度分别首通自动入库，困难礼包更高阶且不同；中间图、失败、撤离及同难度重复通关不发首通奖励。 |
| 102 | CONTINUE_DUNGEON | 打完一图后继续下一图：只允许原名单存活者，跨图继承 HP、异常与消耗。 |
| 103 | WITHDRAW_RUN | 撤离当前远征：保留已发生的伤亡与消耗，放弃未带回的掉落与首通奖励。 |
### 派遣

| op | 名称 | 说明 |
| --- | --- | --- |
| 104 | GET_DISPATCHES | 读取后台派遣：进行中任务的返程日、参与者、冻结职业／武器，以及已返程的报告。 |
| 105 | START_DISPATCH | 派遣未占用角色自动探索／职业训练，自选正整数天数；按个人日历并行，返程一次结算素材、武器、经验、职业精通与武器熟练度。 |
### 赛事

| op | 名称 | 说明 |
| --- | --- | --- |
| 110 | GET_ANNUAL | 读取年度大竞技场：报名状态、海选战绩、签表轮次与下一场报价。 |
| 111 | REGISTER_ANNUAL | 报名本届大竞技场并锁定名单与快照；一旦淘汰或退赛，当届不能重报。 |
| 112 | START_ANNUAL_MATCH | 开打下一场年度比赛：海选三场至少两胜，正赛 64 强单败；真实死亡与消耗跨轮保留。 |
| 113 | WITHDRAW_ANNUAL | 退出本届年度赛事，保留真实伤亡与消耗、放弃后续比赛；当届不能重新报名。 |
### 故事

| op | 名称 | 说明 |
| --- | --- | --- |
| 120 | GET_STORY | 读取八章主线的开放与完成状态；名次不阻挡章节。章节开放后给标题，完成后给本章得到的认识。 |
| 121 | COMPLETE_STORY_EVENT | 完成一章主线事件；只标记完成，不自动发奖。 |
| 122 | CLAIM_REWARD | 按唯一奖励键领取团队公共经验等奖励；重复请求不会重复发。 |
### 任务

| op | 名称 | 说明 |
| --- | --- | --- |
| 123 | GET_QUESTS | 读取各地区任务与声望：档位、前置、可否接取、是否已完成/已领奖；hardAvailable 仅任务连战副本为真，hardUnlocked 表示已普通完整通关并开放困难。单图任务无困难版。连战副本的 firstClearRewards={normal:{items,available},hard:{items,available}} 分别返回两档固定首通物品及资格，替代旧 firstClearReward；完整通关自动入库，与跨难度仅领一次的手动 reward 分开，单图为 null。dungeonOnly 标记统一副本入口的固定经典路线，stageNames 给出图名；archived 标记旧入口，旧进行中／待领奖记录仍返回，但不能新开。requires.item 为隐藏副本所需的任务物品（kind=key，仓库持有即可，不消耗、不能出售）；未持有时该任务不列出。 |
| 124 | START_QUEST | 接取并开始一个地区任务或固定经典副本（clx-fe1／clx-fe2／clx-fe3／clx-fe6／clx-fe7／clx-fe8，每作一个，共六个，每个三图；fe1／fe6在地区2、fe2／fe7在地区3、fe3／fe8在地区5；每图2日，共6日）；固定经典路线共用副本UI，不另设随机／经典导航分类，此API继续保留兼容，归档旧任务拒绝新开：单图任务仅 normal 且完成后不可重接；任务连战副本普通完整通关后可重打并选 hard，首通探索与固定任务奖励不重复发。可选 aiDifficulty（normal／hard，默认 normal；hard 初始敌阵及增援人数约+50%、等级随机+2～5、HP+20%～35%、其余能力+10%～25%、体格+1～3、装备升级，移动力不变且封顶），多图全程锁定；支付任务耗日并创建战斗，返回 battleId；胜利后任务标记完成，奖励另领；单图任务完成增加当地探索度5点，多图任务仅按副本首次完整通关增加20点，不叠加5点；领奖不增加。 |
| 125 | CLAIM_QUEST_REWARD | 领取已完成任务的首次奖励（金币、物品、声望）；重复请求不会重复发。 |
| 126 | BUY_QUEST_ITEM | 用金币购买地区声望商店的物品；需达到对应声望档位，购买不扣声望。 |
| 127 | COMPLETE_SETUP | 完成开局：提交protagonist{name,sex,portrait,allocation}与两名companions。神主角固定平民／成长型，保留setup.protagonist.baseStats，allocation为额外10点加成（每项0–5，未填按0计），倾向由加点自动推导；不接受手选倾向。初始三人E级熟练度及基础武器；同伴不能是剧情奖励人物或主角形象，只能提交一次。 |
### 日历

| op | 名称 | 说明 |
| --- | --- | --- |
| 128 | ACCEPT_RECRUIT | 接受当前游历候选；名册满时保留候选，不重掷。 |
| 129 | DECLINE_RECRUIT | 拒绝当前游历候选；已支付日期不退，之后可重新游历。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 130 | GET_TAVERN | 读取第二年后当地酒馆本季度候选、职业、种族、等级与价格。 |
| 131 | HIRE_TAVERN | 用金币雇佣酒馆候选；不耗行动日，满员/重复/金币不足会拒绝。 |
| 132 | INN_REST | 旅馆休息 1 日，恢复指定法术书的全部次数；战斗中/远征/年度赛事中不可用。 |
| 133 | USE_FOOD | 使用以太口粮或完整料理，恢复指定法术书 25%/全部次数；消耗食物，不耗日。 |
### 任务

| op | 名称 | 说明 |
| --- | --- | --- |
| 134 | GET_CHALLENGES | 读取挑战塔层、风险、首通/重复奖励及36种授予战技实物的分层限量奖励；equipment与claimedEquipment说明装备领取状态。 |
| 135 | START_CHALLENGE | 带固定名单挑战塔层；支付层日数并创建经典地图战斗，普通角色真实死亡。 |
| 136 | CLAIM_CHALLENGE_REWARD | 领取已通关塔层的首通／重复奖励及该层限量equipment实物，每种奖励只发一次；旧档已领完常规奖励仍可只补领装备，不重发金币。 |
### 酒馆

| op | 名称 | 说明 |
| --- | --- | --- |
| 137 | GET_MINIGAMES | 读取本季度剩余酒馆小游戏局数、下注档位与赔率；frogs 列出每只青蛙的夺冠率（%）与押中返还（十分之一倍，含本金）。 |
| 138 | PLAY_MINIGAME | 服务端结算一局猜大小或青蛙赛跑；扣金币、占季度额度、生成并保存赛果，重试不重掷。 |
### Agent

| op | 名称 | 说明 |
| --- | --- | --- |
| 139 | CLAIM_CONTROL | 取得短期控制租约；同一账号的其它写操作在租约期内被拒绝。 |
| 140 | RELEASE_CONTROL | 释放自己持有的控制租约；人工接管前先释放。 |
### 地图

| op | 名称 | 说明 |
| --- | --- | --- |
| 141 | GET_WORLD_MAP | 读取世界地图：王都与十二地区节点（locked 未开通／available 当前可选路线／unlocked 已解锁／cleared 已讨伐）、道路与 selectableRegions、各地区0–100探索度；初选1–4自由，之后须将已开通地区探索至100才可选择其相邻新路线；已开通地区继续可访问，探索度独立于讨伐记录。 |
| 142 | CHOOSE_ROUTE | 把一条可选路线（region 必须在 selectableRegions 内，整数 1–12）正式解锁：不耗日、可多次选择、互不排斥；首次可自由选择1–4，之后须将已开通地区探索至100才可开通其相邻新路线，已开通地区仍可访问；需先完成开局自捏。 |
### 战斗

| op | 名称 | 说明 |
| --- | --- | --- |
| 50 | GET_BATTLE | 读取当前局面：紧凑 JSON 加一份 ASCII 地图；detail:true 时附带完整属性。encounter 返回本次随机战场的布局与人数配置；map.season 为出发季节，单位含当前位置 terrain、实际 move、moveType 和 armored。未揭开的密室物件（state=hidden）及揭开它们的事件不下发，触发后随状态出现。冬季草地变雪地、水域及浅滩结冰；起点雪地移动−1、冰面+1，飞行不受影响；重甲经过或落脚即碎为水域，terrain 事件保存变化。 |
| 51 | GET_REACHABLE | 某个单位能走到哪些格：move 为本次行动移动力，stops[].path 为实际路径（重甲会踩裂路径上的冰面）。每格能攻击／治疗到谁、用什么武器，以及可用的战技、法术、功能杖、舞蹈与合法落点。 |
| 52 | PREVIEW_COMBAT | 从某格用某武器（可加 art 战技，或用 spell 代替武器预测攻击法术）打某个目标：双方伤害、命中、必杀、出手次数、反噬／附毒／书次数与击杀概率；状态杖或控场法术只返回 status 命中率（首领减半）；art 支持 allyId/secondaryId/postTo/support，破墙目标返回物件 HP/伤害/成本，无 EXP。 |
| 53 | GET_THREAT_MAP | 敌方下个阶段所有单位能攻击到的格子与每格威胁数。 |
| 54 | UNIT_ACT | 原子提交「移动 + 行动」，action 取 attack／heal／item／seize／escape／interact／wait／dance／art／cast／staff；传送与临时墙带 dest；战技可带 allyId 选友军、secondaryId 选分流次目标，postTo 选战后移动；support 为一次自付资源的非敌对追加 {target, spell 或 weapon, dest?}（target 不是 targetId，禁止嵌套 action/art）。先查 GET_REACHABLE。确认后不能悔棋，先查询再提交。 |
| 55 | END_PHASE | 结束己方阶段；未行动单位待机，随后敌方规则 AI 行动。 |
| 56 | RETREAT | 野外全军撤退，立即判负；已结算经验保留，不发通关奖励。 |
| 57 | GET_BATTLE_LOG | 读取本场战斗的完整事件日志。 |
### 竞技场

| op | 名称 | 说明 |
| --- | --- | --- |
| 60 | GET_ARENA | 图池、下一个竞技场日、报名状态、今日（或最近一次）对手与进攻进度、积分。 |
| 61 | GET_DEFENSE | 读取当前防守设置：地图、名单、站位、优先级、AI 行为、主将顺序与预设 BAN；单位数据按当前名册返回。 |
| 62 | SET_DEFENSE | 提交防守设置；快照锁定后本次不能再改，改动用于下一次竞技场。 |
| 63 | ARENA_REGISTER | 报名下一次竞技场；报名时会保存快照。 |
| 64 | GET_OPPONENT | 查看某个对手的防守地图与名单（不含站位与 AI 行为）。 |
| 65 | ARENA_BAN | 对某个对手禁用 B 个防守角色，返回实际出战名单、站位与对方对我的禁用。 |
| 66 | ARENA_ATTACK | 选人、指定主将、部署后开打，返回 battleId（之后用战斗类 op）。 |
| 67 | SURRENDER | 投降，按落败计。 |
| 68 | GET_ARENA_RESULTS | 读取最近一次竞技场日的进攻／防守结果、当天锁定的防守与积分。 |
| 69 | GET_REPLAY | 读取一场回放；他人的对局在公开后可看（目前战斗结束即公开）。 |
| 70 | GET_SPARRING | 读取可用于陪练的对手快照列表。 |
| 71 | START_SPARRING | 用某个快照发起练习战；练习不造成真实死亡或养成损失。 |
| 72 | GET_REPLAYS | 列出可查看的回放（自己的全部，别人已公开的；目前战斗结束即公开），再用 GET_REPLAY 取某一场。 |
| 73 | GET_SNAPSHOTS | 读取本人各竞技场日的报名快照（名册与防守），新的在前，最多 12 份。 |
### Agent

| op | 名称 | 说明 |
| --- | --- | --- |
| 80 | AGENT_REPORT_PLAN | 上报培养计划，网页的 Agent 面板会展示给玩家。 |
| 81 | AGENT_PHASE_NOTE | 每个阶段上报一句意图，回放中逐阶段显示。 |
| 82 | AGENT_COMMENT_BATTLE | 给一场战斗写点评。 |
| 83 | AGENT_DAILY_REPORT | 写一份离线日报。 |
### 推送

| op | 名称 | 说明 |
| --- | --- | --- |
| 200 | PHASE_STARTED | 推送：轮到你的阶段，可以行动。 |
| 201 | BATTLE_UPDATED | 推送：战斗局面发生变化。 |
| 202 | ARENA_OPPONENTS_READY | 推送：今天的竞技场对手已生成。 |
| 203 | DEFENSE_RESULT | 推送：别人对你防守的进攻结果。 |
| 204 | MONTH_STARTED | 推送：新的一季已开始（日期到了季初）。 |
| 205 | STATE_CHANGED | 推送：账号状态变化（金币、日期、名册等）。 |

## 错误码

| 错误码 | 含义 | action（写给 Agent） |
| --- | --- | --- |
| NOT_YOUR_PHASE | 当前不是你的阶段 | 等待 PHASE_STARTED 推送或轮询 GET_BATTLE，不要重试 |
| UNIT_ALREADY_ACTED | 该单位本阶段已行动 | 用 GET_BATTLE 刷新局面，换其他单位 |
| UNREACHABLE | 目标格不可达 | 先用 GET_REACHABLE 取可达格 |
| TARGET_OUT_OF_RANGE | 目标不在所选武器的射程内 | 用 GET_REACHABLE 返回的 attackable 列表 |
| WEAPON_RANK_TOO_LOW | 武器等级不够 | 换武器，或者通过训练提升武器等级 |
| CANNOT_SEIZE | 只有主将站在王座上才能压制 | 从 GET_BATTLE 的胜利条件读王座坐标，让主将以王座为 moveTo 再提交 |
| NO_DAYS_LEFT | 已发放的行动日用完了 | 等下个游戏月开始（GET_STATE 有时间），期间可以做不占行动日的事 |
| BATTLE_IN_PROGRESS | 已有进行中的战斗 | 先结束（或撤退）当前战斗 |
| ARENA_NOT_OPEN | 现在不是竞技场日，或你没有报名 | 用 GET_ARENA 查看时间与报名状态 |
| ARENA_ALREADY_ATTACKED | 这个对手今天已经打过了 | 换下一个对手 |
| ARENA_BAN_REQUIRED | 还没对该对手执行 BAN | 先 ARENA_BAN（B=0 的地图传空数组） |
| CHARACTER_BANNED | 所选单位的角色被防守方禁用 | 看 ARENA_BAN 响应中的禁用列表，换人 |
| DEFENSE_LOCKED | 快照已锁定，本次防守设置不能再改 | 改动会用于下一次竞技场 |
| BATTLE_OVER | 战斗已经结束 | 不要继续提交行动；用 GET_BATTLE 确认结果 |
| UNKNOWN_UNIT | 没有这个单位 | 用 GET_BATTLE 或 GET_ROSTER 刷新 id |
| UNKNOWN_OP | 没有这个 op | 用 GET /agent-api.json 读取当前 op 清单，不要猜号 |
| BAD_REQUEST | 请求字段缺失或类型不对 | 对照 docs/agent-api.md 修正字段后重试一次 |
| UNAUTHORIZED | 未登录或令牌无效 | 用 sk_ 令牌重新 LOGIN |
| FORBIDDEN | 这个账号不能做这件事 | 不要原样重试 |
| NOT_FOUND | 找不到目标对象 | 刷新列表后再选 |
| NO_SUCH_ITEM | 没有这件道具 | 用 GET_INVENTORY 刷新 |
| NOTHING_TO_HEAL | 目标没有需要回复的 HP | 换目标或换行动 |
| NOT_ENOUGH_GOLD | 金币不足 | 先赚金币，不要重试同一笔购买 |
| INVALID_PLAN | 编成、站位或选择不合法 | 读 error.message 里的具体原因后修正 |
| ARENA_BAN_INVALID | 禁用名单不合法 | 按地图的 B 数从对手名单里禁用不同角色 |
| ARENA_PLAN_INVALID | 出战名单或站位不合法 | 按地图的 D 人从允许名册里选人并在出生区摆位 |
| DEFENSE_INVALID | 防守设置不合法 | 读 error.message 里的校验错误后修正 |
| IDEMPOTENCY_CONFLICT | 同一个 commandId 换了负载 | 用新的 commandId 重发，或先查询当前状态 |
| FEATURE_DISABLED | 该功能在当前规则版本尚未启用 | 不要重试；按规则版本或替代路径处理 |
| RATE_LIMITED | 请求过于频繁 | 等待片刻再重试 |
| INTERNAL | 服务端内部错误 | 记录 requestId 并稍后重试，不要原样连发 |

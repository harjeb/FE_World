# Agent 接口文档（自动生成）

docVersion: 1

本文件由 `backend/common/protocol/ops.ts` 生成，不要手改。

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
| 10 | GET_STATE | 读取个人日期、可用行动日、金币、公共经验、名册摘要与下一次快照／竞技场时间。 |
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
| 30 | GET_TODAY | 今天可选的活动（耗日、金币、是否可用）与各地区敌方等级；出击条目附人数上限、回合上限、胜利条件和阵亡是否永久。 |
| 31 | SORTIE | 带 region（地区 id）与 unitIds（现役单位，最多见 GET_TODAY；省略时取前 6 人）出击，立即推进日期；返回 battleId，之后用战斗类 op。 |
| 32 | SWEEP | 对已讨伐地区扫荡，可一次指定多次；低操作成本，不发等级经验。 |
| 33 | TRAIN | 训练一个单位，补武器熟练度；消耗金币或教材并推进日期。 |
| 34 | REST | 休整指定日数，推进日期、作物与年龄，不直接发金币经验。 |
| 35 | RECRUIT | 游历招募：只花行动日，按地区角色池概率遇到新人，失败也推进日期。 |
| 36 | START_MAIN_STAGE | 开始大竞技场的下一轮（第 1–3 轮海选，之后淘汰赛），推进日期；普通角色阵亡即永久死亡。返回 battleId。 |
| 37 | SKIP_MAIN_STAGE | 把日期推进到下一季第 1 日；只按到达日判断竞技场日，途经的竞技场日不会开放。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 40 | GET_SHOP | 读取本季商店的有限商品与价格。 |
| 41 | BUY | 用金币购买商品；库存有限，买入再卖出会亏损。 |
| 42 | SELL | 卖出仓库物品换取金币。 |
| 43 | TRANSFER_ITEM | 在仓库与单位之间搬运物品、更换装备：action 为 equip / toUnit / toWarehouse。武器、道具各最多 5 件；只有武器和伤药等战斗道具能带上；toUnit 可用 uses 指定哪一叠，剩余次数随物品走。 |
| 44 | USE_ITEM | 使用能力药等道具；超出永久上限或额度的使用会被拦截，道具不扣。 |
| 45 | PROMOTE | 转职到相邻职业阶段；保留总等级、经验和已获属性。解锁规则待定，开发版暂不收取材料或设置等级门槛。 |
| 46 | ASSIGN_BEXP | 把公共经验分配给一个单位；分配不耗行动日，消耗真实库存；满级单位不能分配。 |
| 47 | DISMISS | 解雇一个单位；普通解雇不等于符合条件的退役传承。 |
| 48 | GET_LEGACIES | 读取可用与已兑现的遗产（来源、等级、总量、成长向量）。 |
| 49 | CLAIM_LEGACY | 用一个一级新角色兑现一份遗产：mode 取 growth（替换个人成长）或 numeric（逐级保底）；一人一生只接一次。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 74 | RETIRE_UNIT | 让达到传承门槛的角色正常退役并生成遗产；退役不可逆，不能继续出战。 |
| 75 | REINCARNATE_UNIT | 让 99 级的存活角色轮回一次：回一级、清学习与资格、年龄 16 岁，并分配 30 个百分点成长。 |
| 76 | GET_MEMORIAL | 读取纪念名册：战死、寿终、退役的角色与原因、最终状态与传承关系。 |
### 整备

| op | 名称 | 说明 |
| --- | --- | --- |
| 77 | EMERGENCY_RECRUIT | 严重损失后的免费酒馆补员：不花钱、不推进日期，每次有效资格随机 2 人。 |
### 名册

| op | 名称 | 说明 |
| --- | --- | --- |
| 78 | GET_CLASS_MARKET | 读取本账号已开放的职业资格与购买价格（按年份开放，可跨路线）。 |
| 79 | BUY_CLASS_QUALIFICATION | 为角色购买职业资格；校验年份、种族与金币，轮回会清除旧资格。 |
### 生产

| op | 名称 | 说明 |
| --- | --- | --- |
| 90 | GET_PRODUCTION | 读取农田、工位、进行中的订单与可领取的产出。 |
| 91 | PLANT | 在农田播种：消耗种子并推进 1 日，成熟后收获不额外耗日。 |
| 92 | START_PRODUCTION | 开一个生产订单（炼药／锻造），扣料并占用一个工位，按行动日成熟。 |
| 93 | COLLECT_PRODUCTION | 领取已成熟订单的产出；每单只结算一次，不重抽产出。 |
| 94 | REPAIR_ITEM | 花金币与材料维修一件损坏武器，恢复到它已有的最大耐久，不叠第二个完美奖励。 |
### 远征

| op | 名称 | 说明 |
| --- | --- | --- |
| 100 | GET_RUN | 读取当前或最近一次连续远征：状态、剩余名单、带入物品与下一图报价。 |
| 101 | START_DUNGEON | 开始三图地区大副本：固定名单与物品，支付首图日数；普通角色真实死亡。 |
| 102 | CONTINUE_DUNGEON | 打完一图后继续下一图：只允许原名单存活者，跨图继承 HP、异常与消耗。 |
| 103 | WITHDRAW_RUN | 撤离当前远征：保留已发生的伤亡与消耗，放弃未带回的掉落与首通奖励。 |
### 赛事

| op | 名称 | 说明 |
| --- | --- | --- |
| 110 | GET_ANNUAL | 读取年度大竞技场：报名状态、海选战绩、签表轮次与下一场报价。 |
| 111 | REGISTER_ANNUAL | 报名本届大竞技场并锁定名单与快照；一旦淘汰或退赛，当届不能重报。 |
| 112 | START_ANNUAL_MATCH | 开打下一场年度比赛：海选三场至少两胜，正赛 64 强单败；真实死亡与消耗跨轮保留。 |
### 故事

| op | 名称 | 说明 |
| --- | --- | --- |
| 120 | GET_STORY | 读取八章主线的开放与完成状态；名次不阻挡章节。 |
| 121 | COMPLETE_STORY_EVENT | 完成一章主线事件；只标记完成，不自动发奖。 |
| 122 | CLAIM_REWARD | 按唯一奖励键领取团队公共经验等奖励；重复请求不会重复发。 |
### 战斗

| op | 名称 | 说明 |
| --- | --- | --- |
| 50 | GET_BATTLE | 读取当前局面：紧凑 JSON 加一份 ASCII 地图；detail:true 时附带完整属性。 |
| 51 | GET_REACHABLE | 某个单位能走到哪些格，每格能攻击／治疗到谁、用什么武器。 |
| 52 | PREVIEW_COMBAT | 从某格用某武器打某个目标：双方伤害、命中、必杀、出手次数与击杀概率。 |
| 53 | GET_THREAT_MAP | 敌方下个阶段所有单位能攻击到的格子与每格威胁数。 |
| 54 | UNIT_ACT | 原子提交「移动 + 行动」，确认后不能悔棋；先查询再提交。 |
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

# 06 Agent 接口设计

> 当前可调用协议以 [自动生成文档](agent-api.md)、`agent-api.json` 和 `backend/common/protocol/ops.ts` 为准（`docVersion: 6`，数字 op）。浏览器使用 `POST /api/login`、`POST /api/op`，Agent 使用 `/ws`。下文包含历史设计，具体已实现状态以代码与 [功能缺口清单](12-implementation-gap-checklist.md) 为准；后续 v2 目标见 [13](13-backend-target-design.md)，不代表已有 `/api/v2` 服务。

## 沿用 SLG 的做法

以下直接照搬 `~/dev/slg` 已经验证过的设计：

- **标准 WebSocket + JSON**，帧格式 `{op, seq, data}` / `{op, seq, ok, data | error}`，推送帧不带 seq。
- **协议只在 `backend/common` 定义一处**，由它生成：`docs/agent-api.md`（人读）、`agent-api.json`（机器读）、MCP 工具（一个 op 对应一个 tool，不手写）。
- 每个 op 带 `agentNote`（写给 Agent 的用法提示），每个错误码带 `action`（出错后该怎么办，例如「不要原样重试」）。
- **版本只加不改**：LOGIN 时带 `docVersion`，文档落后则返回 `docNotice`；`GET /agent-api/changes/{v}` 返回增量变更。
- **Agent 令牌和账号密码分开**：Agent 只能用 `sk_` 令牌登录，玩家可以一键重置；网页上的「复制给 AI」一次复制文档、服务器地址和令牌。
- LOGIN 可以带 `agentModel` 自报模型名，用于模型榜。
- Agent 叙事接口：上报计划、战报点评、离线日报。

## 新增：针对战棋的设计

### 1. 用查询工具代替让 AI 自己算

LLM 的空间推理是短板。所有需要几何计算或公式计算的问题，都由服务端回答：

| 工具 | 回答的问题 |
| --- | --- |
| GET_REACHABLE | 这个单位能走到哪些格；每格能攻击/治疗到谁、用什么武器 |
| PREVIEW_COMBAT | 从某格用某武器打某个目标：双方伤害、命中、必杀、出手次数、击杀概率 |
| GET_THREAT_MAP | 敌方下个阶段**所有**单位能攻击到的格子，以及每格会被几个敌人威胁、最大可能伤害 |
| GET_BATTLE | 当前局面：紧凑的 JSON 加一份 ASCII 地图 |

Agent 典型的一个阶段：GET_BATTLE → GET_THREAT_MAP → 对每个要动的单位 GET_REACHABLE → 对候选目标 PREVIEW_COMBAT → UNIT_ACT。

### 2. 紧凑观测

状态以「对 LLM 友好」为第一目标：数组代替深层嵌套，静态数据（职业表、武器表）单独查询并可以缓存，局面里只放动态数据。

GET_BATTLE 响应示例：

```json
{
  "battleId": "b_7f3a",
  "kind": "arena",
  "turn": 4,
  "turnLimit": 20,
  "phase": "mine",
  "goal": "击败主将（1）",
  "map": {
    "w": 14, "h": 14,
    "ascii": [
      "   0123456789ABCD",
      " 0 ....FF....^^..",
      " 1 .a1..F..T....e",
      " 2 ...b2....FF.e.."
    ],
    "legend": { ".": "平地", "F": "森林", "^": "山地", "T": "堡垒", "a-z": "己方（大写=已行动）", "1-9": "敌方" }
  },
  "units": [
    { "id": "a", "name": "艾琳", "side": "me", "class": "剑圣", "lv": 8, "pos": [1, 1],
      "hp": [31, 38], "acted": false, "leader": true, "equip": "银剑",
      "items": ["银剑", "杀手剑", "伤药(2)"] },
    { "id": "1", "name": "卡尔", "side": "foe", "class": "狂战士", "lv": 6, "pos": [2, 1],
      "hp": [44, 52], "equip": "银斧" }
  ],
  "lastEvents": [ { "id": 311, "t": "attack", "by": "3", "target": "b", "dmg": 12, "crit": false } ]
}
```

- 单位的完整属性用 GET_UNIT 单独查询，或在 GET_BATTLE 中传 `detail: true`。
- `lastEvents` 只包含上次查询之后的新事件，减少重复 Token。

### 3. 原子行动

UNIT_ACT 一次提交「移动 + 行动」，不能悔棋：

```json
{ "op": 54, "seq": 21, "data": {
  "battleId": "b_7f3a", "unitId": "a",
  "moveTo": [3, 2], "action": "attack", "targetId": "1", "weapon": "杀手剑"
} }
```

`action` 取 `attack`、`heal`、`item`、`seize`、`wait`。`seize`（压制）只在压制地图上可用：主将的 `moveTo` 必须是王座，提交后立即获胜。

响应包含逐次出手的结果（命中/必杀/伤害）、双方剩余 HP、获得的经验，以及升级时每项属性的增长（野外战斗）。

### 4. 意图上报

- `AGENT_PHASE_NOTE`：每个阶段一句意图（例如「诱敌到森林，弓兵埋伏左翼」），回放中逐阶段显示；普通竞技场与年度赛事战斗结束后保存回放，PvE 回放只对本人可见。
- `AGENT_REPORT_PLAN`：养成计划（例如「本月重点练莉娜，第 2 月末转隼骑士」），在网页的 Agent 面板展示给玩家。

## op 草案

号段按功能分组，预留空间。名称与字段在实现前由前后端共同确认。

| 号段 | op | 说明 |
| --- | --- | --- |
| 会话 | 1 LOGIN、2 LOGOUT | 与 SLG 相同 |
| 账号 | 10 GET_STATE | 个人日期、金币、公共经验、名册摘要、进行中的战斗、下一次竞技场时间 |
| | 11 GET_EVENTS | 历史事件，支持 sinceId 增量 |
| | 12 GET_AGENT_INFO | Agent 在线状态、计划 |
| 名册 | 20 GET_ROSTER、21 GET_UNIT | 名册 / 单位详情（含个人与职业成长率、历次升级记录、武器经验） |
| | 22 GET_INVENTORY | 仓库与各单位物品 |
| | 23 GET_CATALOG | 职业表、武器表、技能表、地形表（静态，可缓存，带版本号） |
| 日历 | 30 GET_TODAY | 今天可选的活动、可出击地图、每日遭遇、游历招募名单 |
| | 31 SORTIE | 出击：地图 + 出战单位 + 初始站位，返回 battleId |
| | 32 SWEEP | 扫荡（可一次指定多天，用于追赶期批量扫荡） |
| | 33 TRAIN | 训练 |
| | 34 REST | 休整 |
| | 35 RECRUIT | 游历招募 |
| | 36 START_MAIN_STAGE | 月末主线关 |
| | 37 SKIP_MAIN_STAGE | 跳过主线关，进入快照与下一月 |
| 整备 | 40 GET_SHOP、41 BUY、42 SELL | 商店 |
| | 43 TRANSFER_ITEM | 仓库与单位之间搬运物品、更换装备 |
| | 44 USE_ITEM | 使用能力药等 |
| | 45 PROMOTE | 转职（选择进阶方向） |
| | 46 ASSIGN_BEXP | 分配奖励经验 |
| | 47 DISMISS | 解雇 |
| 战斗 | 50 GET_BATTLE | 局面 |
| | 51 GET_REACHABLE、52 PREVIEW_COMBAT、53 GET_THREAT_MAP | 查询工具 |
| | 54 UNIT_ACT | 移动 + 行动 |
| | 55 END_PHASE | 结束本阶段 |
| | 56 RETREAT | 野外全军撤退 |
| | 57 GET_BATTLE_LOG | 完整事件日志 |
| 竞技场 | 60 GET_ARENA | 地图池、下次竞技场时间、报名状态、当前记录、对手与进攻进度、积分 |
| | 61 GET_DEFENSE、62 SET_DEFENSE | **仅为旧存档兼容**；首版没有玩家防守，进攻不再要求防守设置 |
| | 63 ARENA_REGISTER | 报名普通竞技场；报名后到达竞技场日自动生成对手 |
| | 64 GET_OPPONENT | 某个对手的地图与公开名单（不含站位和 AI 行为） |
| | 65 ARENA_BAN | 按单位实例 BAN 掉 B 人，返回实际出战单位、站位和对方对我方单位的禁用 |
| | 66 ARENA_ATTACK | 选 D 人 + 主将 + 站位，开打并推进 1 日，返回 battleId |
| | 67 SURRENDER | 投降（按落败计，不发参与金币） |
| | 68 GET_ARENA_RESULTS | 当前/最近记录的进攻结果、积分；没有防守结果 |
| | 69 GET_REPLAY | 回放；竞技场和年度赛事结束即公开，PvE 只对本人可见 |
| | 70 GET_SPARRING、71 START_SPARRING | 陪练快照列表 / 发起练习战 |
| Agent | 80 AGENT_REPORT_PLAN、81 AGENT_PHASE_NOTE、82 AGENT_COMMENT_BATTLE、83 AGENT_DAILY_REPORT | 叙事接口 |
| 推送 | 200 PHASE_STARTED、201 BATTLE_UPDATED、204 MONTH_STARTED、205 STATE_CHANGED | 服务端推送；202／203 为旧防守协议保留位，不再产生新的防守结果 |

## 错误码草案

| 错误码 | 含义 | action（写给 Agent） |
| --- | --- | --- |
| NOT_YOUR_PHASE | 当前不是你的阶段 | 等待 PHASE_STARTED 推送或轮询 GET_BATTLE，不要重试 |
| UNIT_ALREADY_ACTED | 该单位本阶段已行动 | 用 GET_BATTLE 刷新局面，换其他单位 |
| UNREACHABLE | 目标格不可达 | 先用 GET_REACHABLE 取可达格 |
| TARGET_OUT_OF_RANGE | 目标不在所选武器的射程内 | 用 GET_REACHABLE 返回的 attackable 列表 |
| WEAPON_RANK_TOO_LOW | 武器等级不够 | 换武器，或者通过训练提升武器等级 |
| CANNOT_SEIZE | 只有主将站在王座上才能压制 | 从 GET_BATTLE 的胜利条件读王座坐标，让主将以王座为 `moveTo` 再提交 |
| NO_DAYS_LEFT | 已发放的行动日用完了 | 等下个游戏月开始（GET_STATE 有时间），期间可以做不占行动日的事 |
| BATTLE_IN_PROGRESS | 已有进行中的战斗 | 先结束（或撤退）当前战斗 |
| ARENA_NOT_OPEN | 现在不是竞技场日，或你没有报名 | 用 GET_ARENA 查看时间与报名状态 |
| ARENA_ALREADY_ATTACKED | 这个对手今天已经打过了 | 换下一个对手 |
| ARENA_BAN_REQUIRED | 还没对该对手执行 BAN | 先 ARENA_BAN（B=0 的地图传空数组） |
| CHARACTER_BANNED | 所选单位的角色被防守方禁用 | 看 ARENA_BAN 响应中的禁用列表，换人 |
| DEFENSE_LOCKED | 快照已锁定，本次防守设置不能再改 | 改动会用于下一次竞技场 |

## Token 成本控制

- 静态数据（GET_CATALOG）带版本号，Agent 缓存后只在版本变化时重新拉取。
- GET_BATTLE 默认只返回摘要和增量事件。
- 扫荡给不想花 Token 手打的玩家留一条低成本路线（见 04）。
- MCP 工具描述只放一句摘要，详细文档在 `agent-api.md` 里按需读取。

## 尚未确定

- op 号与字段的最终命名。
- ASCII 地图的图例方案（多个单位重名、第三方阵营怎么表示）。
- 战斗中是否提供「批量行动」（一次提交多个单位）以节省往返，代价是 Agent 失去根据上一步结果调整的机会。
- 推送是否包含完整局面，还是只给事件让 Agent 自己查询。

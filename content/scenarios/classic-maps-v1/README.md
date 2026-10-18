# 经典地图目录 v1（classic-maps-v1）

面向项目的可玩地图目录：把 GBA 三作与 FC/SFC 三作的中后期常规地图，统一成项目地形、职业和胜利条件，供任务与副本直接创建战斗。

- 格式：`agent-tactics.classic-maps` / `schemaVersion: 1`
- 文件：`catalog.json`（本目录）
- 生成器：`tools/classic-integration/build_catalog.py`
- 源素材：`content/scenarios/gba-classics-v1/`、`content/scenarios/classic-fc-sfc-v1/`
- 运行时代码：`backend/common/game/classic-catalog.ts`

## 1. 收录范围

共 **60 张**中后期常规地图，每作 10 张；只取可正常编队出战的歼灭、击败主将或占领图，排除单人/双人试炼、坚守/护送/收集/孵化等特殊目标。FE4、FE5 按项目决定不纳入。

| 作品 | 地图数 | 敌军数（初始编制） | 胜利条件 |
| --- | ---: | ---: | --- |
| 暗黑龙与光之剑（FE1） | 10 | 199 | 击败主将 |
| 外传（FE2） | 10 | 适配守军 | 击败主将 |
| 纹章之谜（FE3） | 10 | 214 | 击败主将 / 占领王座 |
| 封印之剑（FE6） | 10 | 初始敌军 | 占领 / 击败主将 |
| 烈火之剑（FE7） | 10 | 初始敌军 | 占领 / 击败主将 |
| 圣魔之光石（FE8） | 10 | 初始敌军 | 占领 / 击败主将 |

目录中的敌军只取每章**初始编制**；增援、奖励单位、剧情加入单位不进入初始战场。

## 2. 目录字段

```json
{
  "format": "agent-tactics.classic-maps",
  "schemaVersion": 1,
  "count": 60,
  "maps": [{
    "id": "fe6-ch13-main",
    "game": "fe6",
    "name": "封印之剑 · 救出作战",
    "width": 46, "height": 25,
    "terrain": [["plain", "..." ]],
    "playerSpawns": [[x, y]],
    "enemies": [{"classId": "cavalier", "level": 12, "pos": [x, y], "boss": true}],
    "goal": {"kind": "seize", "position": [x, y]},
    "turnLimit": 30,
    "adapted": false,
    "appliedChanges": null,
    "spawnAdjusted": false,
    "source": {"pack": "gba-classics-v1", "file": "fe6/fe6-ch13-main/scenario.json", "sourceId": "fe6-ch13-main"}
  }]
}
```

坐标统一为左上角原点、`[x, y]`；矩阵统一为 `terrain[y][x]`。`goal.kind` 只使用 `seize` 与 `boss`（`rout` 保留给无主将的兜底）。

`adapted` / `appliedChanges` / `spawnAdjusted` 记录为可玩性做的适配，详见第 3 节；不是原作数据的一部分。

## 3. 适配规则

### 3.1 地形与职业

- GBA：按源 `terrainCatalog.symbol` 映射到项目地形；门、王座、楼梯等落到可通行/目标地形。
- FE1：按源地形编号映射；未使用编号不会出现在本批地图。
- FE3：按 `terrainCatalog.label` 映射；王座建筑坐标覆盖为 `throne`。
- FE2：源包没有地形目录，使用 `tools/classic-integration/data/fe2-buildings.png` 的 16×16 图块平均色分类：蓝→水、深色→墙、绿→平原、灰→地板；这是适配，不是原作地形表。
- 职业：优先项目同名/同定位职业；没有对应职业时替换（例如 GBA `MONK`→`cleric`、`MAGE_KNIGHT`→`mage_knight`、`WARRIOR`→`hero`）。完整映射见生成器中的 `GBA_CLASS` / `FE1_CLASS` / `FE3_CLASS`。
- 等级取源记录；武器、AI 行为使用项目 `createEnemy()` 的默认配置，不执行原作 AI 字节。

### 3.2 主将与胜利条件

- 有 `seize` 地点的章节：胜利条件为占领；主将取离王座最近的初始敌军。
- 没有 `seize` 的章节：胜利条件为击败主将；主将取初始敌军中等级最高者。
- 王座格在目录中强制写成 `throne`，保证目标格可站立且目标可判定。

### 3.3 出击区

- GBA：优先使用源 `deployment-table` 的玩家坐标；缺该引用时退回该章玩家单位的 `position`。
- FE1：使用源 `playerUnits`；不足时由生成器补足。
- FE3：使用源 `playerUnits`；FE3 只记录少量出击单位，不足 4 人或目标不可达时由生成器选取目标连通区内的可站立格（本批仅 `fe3-book1-ch16` 触发）。
- 每张图统一补足到 **8 个**互不重叠、可站立、且不在敌军格上的出击位。

### 3.4 地图变化（仅打通目标时）

集成版不执行原作门/开关事件。若目标从出击区不可达，生成器会尝试应用**单条**地图变化，使王座/主将区连通，并把变化 ID 写入 `appliedChanges`：

- `fe6-ch22-main`：应用 `change-0`，把覆盖王座的屋顶换成室内地板/墙。
- `fe8-ch14-eirika`：应用 `change-3`，打开通往王座区的通路。

其他地图没有应用地图变化。

### 3.5 FE2 的特别说明

FE2 的原始敌军/等级表未从 ROM 中恢复（此前已确认失败），因此 FE2 10 张图使用**程序生成的守军**：

- 每图 8–12 名敌军，首名为主将；
- 职业在 `fighter / archer / knight / mercenary / mage / cavalier / pegasus / general` 中轮换；
- 出击区与敌军分别放在最大连通区的两端；
- 目录标记 `adapted: true`，任务界面显示「经适配」。

这些地图可用于验证任务/副本流程，但**不是原作守军**；后续若恢复 FE2 敌军表，应替换生成器并重新生成目录。

## 4. 任务与副本

`backend/common/game/classic-quests.ts` 在目录之上生成：

- **60 个单图任务**：ID `cl-<mapId>`，按作品内顺序串联前置；耗日 2 天；奖励随章节递增。
- **18 个连战副本**：ID `cld-<game>-<n>`，每作 3 组、每组 3–4 图；耗日 = 图数 × 2；需完成该组最后一图的单图任务。FE7 的洛伊德/莱纳斯、肯尼斯/杰尔梅与 FE8 的艾瑞珂/艾夫拉姆互斥分支不混在同一副本。
- 地区：FE1/FE6 → 2，FE2/FE7 → 3，FE3/FE8 → 5。
- 副本跨图携带 HP、道具和武器；只有存活且未离队的角色进入下一图。

运行时入口：

- `createClassicBattle(units, { mapId, quest, stageIndex, runId, carry })` 从目录创建 `BattleState`；
- `START_QUEST` 识别 `scenarioId` / `scenarioIds`，分别创建单图战斗或副本 `RunRecord`；
- `CONTINUE_DUNGEON` 按 `run.scenarioIds[stageIndex]` 创建下一图；
- `GET_QUESTS` 返回 `classic` 元数据（游戏、图名、图数、是否适配）；
- 前端任务页显示「经典」标签，副本页按 `stageNames` / `stageCount` 显示进度。

## 5. 重新生成与验证

```bash
python tools/classic-integration/build_catalog.py
cd backend
node --experimental-strip-types --test common/game/classic.test.ts api/classic.test.ts
```

`classic.test.ts` 会逐图验证：地形尺寸、职业存在、出击/敌军格可站立且不重叠、目标格为 `throne`、目标从出击区可达；`api/classic.test.ts` 验证单图、副本、FE2 适配图的接取、跨图携带、耗日与结算。

## 6. 已知限制

- 门、宝箱、村庄、地图变化、增援和剧情事件没有运行时执行器；目录保留源素材中的对象/变化记录，但战斗内不可交互。
- 敌军武器与 AI 使用项目默认，不还原原作装备表与 AI 字节；职业/等级/位置为源数据映射或替换。
- FE2 守军为程序生成；FE3 个别章节出击区经过补足。
- 地形规则使用项目定义（如沙漠按平原、部分特殊地板按地板），与原作移动消耗可能存在差异。
- FE4/FE5 不在本批范围。

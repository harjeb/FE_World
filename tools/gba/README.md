# GBA 中后期关卡采集与固定格式 v1

已从本地三份 GBA 文件直接保存30张中后期地图，封印、烈火、圣魔各10张。地图、单位模板、等级、物品、AI、职业/人物基础值、成长率及源记录来自 ROM；符号名称来自公开头文件注释，未识别的名称保留编号。没有把汉化字体编码强行解释为标准日文。

- [30张关卡目录与离线预览](../../content/scenarios/gba-classics-v1/README.md)。
- [正式 JSON Schema](../../backend/common/scenarios/scenario-v1.schema.json)。
- [项目 TypeScript 类型、读取与校验入口](../../backend/common/scenarios/asset.ts)。
- [选图清单](selection.json)／[版本指针、格式元数据及来源校验值](metadata.json)。
- [项目采用TODO：地形、职业替换、事件和任务接入](../../docs/24-classic-scenarios-integration-todo.md)。

选图只采用能正常编队出战的常规全灭、击败首领、撤退或占领图；排除单人/双人试炼、少量单位决斗、坚守、护送、收集、孵化等特殊任务。选择清单声明目标和人数门槛，导出核对ROM目标类型及出击模板，场景不符合时拒绝导出。烈火的洛伊德/莱纳斯、肯尼斯/杰尔梅分支分别是不同布局，不是普通/困难难度重复。

## 复现

使用 Python 3.10+、`requests`、`Pillow`，以及 Node 22.14+ 和项目后端依赖。Node 22运行 TypeScript 时需要下面的类型剥离参数。已有依赖无需重复安装：

```sh
npm ci --prefix backend
python -m pip install requests Pillow
python tools/gba/extract.py
```

默认从 `火焰纹章系列/` 按文件头寻找 `AFEJ`、`AE7J`、`BE8J` 三份文件，输出到 `content/scenarios/gba-classics-v1/`。入口全程只读 ROM；离线运行，不下载 ROM 或参考页面。可通过 `--rom-dir PATH`、`--selection FILE`、`--out PATH` 更换输入与输出。

批量入口固定核对每作10章、总计30章，并核对选定章节的 ROM 内部名称。选图清单使用实际章节表索引；显示章号和路线另存，避免把同章难度、路线编号或前期教学图混为不同主线章节。

圣魔第11章的内部名是 `E10x/I10x`，放在表尾索引61/62；其后的内部 `E11/E12` 等名称与显示章号相差一章。现已按公开素材表中的 `Ch11EphraimMap`、`Ch13EirikaMap` 等地图符号修正选图索引，并增加独立的章节名称核对。不能只根据内部名称上的数字给地图命名。

每张生成：

- `scenario.json`：统一格式的完整章节素材。
- `enemies.csv`：可用表格打开的敌军模板，包含单位组、难度/路线变体、职业、等级、坐标、装备及AI。

根目录生成 `manifest.json`、`index.html`、`README.md`、`validation.json`，共64个文件。所有文件可重复生成；不会覆盖或修改输入 ROM。导出最后自动执行项目的 JSON Schema 和语义校验。单独核对已保存的包：

```sh
node --experimental-strip-types tools/gba/check-pack.ts
```

## 固定契约

每张文件固定声明 `format: "agent-tactics.scenario"`、`schemaVersion: 1`。未知版本会被读取入口拒绝，后续变更不得在相同版本下偷偷改变字段含义。

| 字段 | 含义 |
| --- | --- |
| `id` / `name` / `chapter` | 唯一关卡ID、名称、显示章号、路线、ROM章节表索引与内部名称 |
| `source` | 作品、文件头版本码、文件名、完整ROM的SHA-1/SHA-256及格式配置版本 |
| `coordinates` | 左上角起点、零基`[x,y]`；二维矩阵固定为`[y][x]` |
| `map` | 宽、高、16像素格、逐格地形编号和图块编号 |
| `terrainCatalog` | 地形编号对应的标签、符号与显示颜色；具体通行规则在职业目录 |
| `unitGroups` | 去重的单位模板组及其事件/章节表引用；按来源保存，不自动全体入场 |
| `classCatalog` | 职业编号、原始职业记录、基础值、成长率、各地形的移动/回避/防御/魔防规则 |
| `characterCatalog` | 人物编号、基础值、成长率与原始人物记录 |
| `itemCatalog` | 物品编号、注释符号、名称文本编号与原始物品记录 |
| `objects` | 制压点、门、宝箱和其他原始地点事件；附原作命令与坐标状态 |
| `mapChanges` | 地图变化矩形及替换格；`null`固定表示保留原格 |
| `events` / `eventScripts` | 原始事件表、指令边界及直接引用的脚本数据 |
| `coverage` | 敌军模板数、单位组数、初始表数量、扫描模式及运行时边界 |
| `adaptation` | 素材状态与项目采用时需要的目录映射、交互及事件适配 |
| `provenance` | 章节、地图、地形配置与事件表地址、解压数据校验值及原始记录 |

`classId`、`effectiveClassId`、`characterId`和`itemIds`属于原作编号空间。应连同`source.game`查阅本文件目录；不能直接赋给本项目的字符串`ClassId`/`ItemKey`。`classId=0`时，`effectiveClassId`保留从人物表解析出的职业。

单位同时保留`entryPosition`和`position`，以及 FE8 的 REDA 路径。`positionStatus`为`on-map`、`off-map`或`unresolved`。相对移动无法静态确认时，终点为`null`。地图外记录也原样保存并标记，不裁剪、不挪到其他格子。特殊职业缺少规则指针时，在`missingRuleTables`中列明，不能把未知规则当作0。

## 敌军与事件的使用边界

本包共保存2,697条敌军模板：封印500、烈火1,474、圣魔723。这是各章节去重单位组的条目总数，包含不同难度、增援、过场和条件引用，**不是同时出场人数**。

封印的初始敌军来自章节事件组零基索引4的指针槽，我方出击槽为5；这依据游戏的`ChapterEventInfo`及`CreateInitialRedUnits`核对，修正了通用编辑器中两槽相反的标签。烈火保存艾利乌德/海克托尔、普通/困难四个槽及其来源，主选择是艾利乌德普通。`coverage.primaryEnemyTemplateCount`只给这些有明确初始表的关卡使用。

圣魔通过开场、回合及其他事件脚本追踪直接`LOAD`，并跟踪经调用传入的静态slot2单位指针；单位组保留`opening`、`turn:N`等引用来源。它们仍可能受分支、难度及过场清理影响，故不把某个静态数量宣称为完整初始敌军。

FE6/FE7使用固定版本FEBuilder指令模板做静态扫描，到首个终止指令停止；FE8按指令长度及前向标签解码。没有执行存档、随机数、ASM、事件分支或自动升级。ASM动态生成/改写的敌军、阶段切换与最终战斗属性需要后续运行时处理；职业/人物基础值和成长率不等同于已生成单位的最终属性。

## 项目读取示例

```ts
import { readFile } from 'node:fs/promises';
import { parseScenarioAsset, enemyTemplates } from './backend/common/scenarios/asset.ts';

const asset = parseScenarioAsset(await readFile(
  'content/scenarios/gba-classics-v1/fe7/fe7-ch26-eliwood/scenario.json', 'utf8',
));
const normal = asset.unitGroups.find(group => group.references.some(ref =>
  ref.kind === 'enemy-table' && ref.variant === 'eliwood-normal',
))!;
const enemies = enemyTemplates(asset, normal.id);
console.log(asset.map.width, asset.map.height, enemies.length);
```

读取会检查 Schema、行列尺寸、目录引用、坐标状态、ID唯一性和地图变化掩码。关卡包检查还核对每个JSON的SHA-256、目录与文件的一致性、每作10张以及30张不同地图布局。

本格式用于保存和采用章节素材。当前游戏的随机地图`BattleMap v3`只有双方1–8个出生点及制压目标，战斗状态也没有门/宝箱/原作增援执行器。本次增加了独立素材契约与读取入口；接成可玩副本时，还要选择单位组、映射职业和物品，并适配交互机制，不会静默丢弃这些数据。

## 验证

```sh
python -m unittest discover -s tools/gba -p 'test_*.py' -v
node --experimental-strip-types --test backend/common/scenarios/asset.test.ts
```

Python检查以实际三份ROM逐格核对30张地图，核对2,697条敌军模板的源字节、初始表归属、人物表索引差异及重复导出的64个文件；缺少本地ROM时跳过对应数据检查。TypeScript检查涵盖格式读取、错误版本、矩阵转置、缺失职业/物品、重复ID、错误统计、地图变化保留掩码及地图外物件标记。离线HTML另用Chromium遍历全部30张并核对显示格数和单位组。

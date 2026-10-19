# 16 帧横向攻击精灵图

本目录以项目现有的职业像素形象为原图，共 16 组：九种攻击武器各有一个示范，另有飞鸵兵、骑甲鸵兵、神鸵兵的七个剑／斧／魔法动作，用于补足没有合适 FE 鸟骑来源的组合。保留原图发型、服装、盔甲、坐骑、武器和配色，分别编排 16 帧攻击动作。

| 角色与动作 | 透明 Sprite Sheet | 播放预览 | 原始形象 |
|---|---|---|---|
| 剑客：快速斩击，围巾随出手摆动 | [PNG](swordsman-sword.png) | [GIF](swordsman-sword.gif) | [参考图](swordsman-sword-reference.png) |
| 斧战士：较长蓄力后重劈，命中稍作停顿 | [PNG](fighter-axe.png) | [GIF](fighter-axe.gif) | [参考图](fighter-axe-reference.png) |
| 轻骑兵：坐骑站定，收枪后原地突刺 | [PNG](cavalier-lance.png) | [GIF](cavalier-lance.gif) | [参考图](cavalier-lance-reference.png) |
| 弓箭手：举弓搭箭、满弓贴颌停住，放箭后弓弦颤动，箭带着速度线飞出 | [PNG](archer-bow.png) | [GIF](archer-bow.gif) | [参考图](archer-bow-reference.png) |
| 萨满巫师：翻开法书，书页上聚起火苗，推书掷出火球 | [PNG](mage-tome.png) | [GIF](mage-tome.gif) | [参考图](mage-tome-reference.png) |
| 斗拳手：护颌、下潜蓄力，刺拳后接直拳，命中处炸开金色火花，头带尾巴随冲势飘起 | [PNG](brawler-fist.png) | [GIF](brawler-fist.gif) | [参考图](brawler-fist-reference.png) |
| 忍者：短刀反手收到胸前，甩臂掷出，空手停住后从腰间再拔一把 | [PNG](ninja-dagger.png) | [GIF](ninja-dagger.gif) | [参考图](ninja-dagger-reference.png) |
| 龙人：龙石发光、翅膀随吸气扬起，随后从口中喷出翻卷的火焰，余烟散开 | [PNG](dragonkin-dragon.png) | [GIF](dragonkin-dragon.gif) | [参考图](dragonkin-dragon-reference.png) |
| 兽战士：伏低蓄势、竖起尾巴、耳朵后贴，弹起上撩，留下三道爪痕 | [PNG](beast_fighter-beast.png) | [GIF](beast_fighter-beast.gif) | [参考图](beast_fighter-beast-reference.png) |

## 飞鸵专用动作

三个阶段保留各自鸟形坐骑、盔甲和装饰，骑手完成出手动作，坐骑图层和脚底固定。

| 职业 | 剑 | 斧 | 魔法 |
|---|---|---|---|
| 飞鸵兵 | [GIF](ornius_rider-sword.gif) | [GIF](ornius_rider-axe.gif) | — |
| 骑甲鸵兵 | [GIF](armored_ornius-sword.gif) | [GIF](armored_ornius-axe.gif) | — |
| 神鸵兵 | [GIF](divine_ornius-sword.gif) | [GIF](divine_ornius-axe.gif) | [GIF](divine_ornius-tome.gif) |

同名 PNG 是游戏图集，`-mask.png` 是换色遮罩。枪动作继续使用 FE-Repo 鸟骑图集。

## 导入规格

- 每张 PNG 为 **384×384**，严格 **4 行×4 列**。
- 每帧 **96×96**，RGBA 透明背景；所有像素的透明度只有 0 或 255。
- 所有角色面朝右；固定参考原点为每帧内 **(48, 72)**，角色尺寸在各帧间一致。脚和马蹄固定，动作不包含行走、跑步或四方向移动。
- 第 1 行：待机、呼吸、细微动作、恢复待机。
- 第 2 行：调整重心、后收、继续蓄力、蓄力顶点。
- 第 3 行：发力、快速出手、最大幅度命中、顺势结束。
- 第 4 行：短暂停住、收回武器、调整姿势、恢复待机。
- 首帧、第 4 帧、第 16 帧完全相同；第 12 与 13 帧保持同一结束姿势，形成短暂的攻击停顿。
- PNG 内没有网格、文字、编号、地面、脚底阴影、场景或 UI。采用原角色有限调色板，没有抗锯齿、模糊或透明渐变。

[animations.json](animations.json) 给出逐帧停留时间。帧索引从 **0** 开始，按从左到右、从上到下切片：`x = (index % 4) * 96`，`y = floor(index / 4) * 96`。`hitFrame: 10` 指第 **11** 帧，即第 3 行第 3 格。

GIF 仅供查看动作，使用单独的浅色背景和 4 倍最近邻放大；导入游戏请使用透明 PNG 和 JSON 中的时间轴。PNG 适用于任意帧率；不要将 16 帧全部设成等时长，否则会损失蓄力与命中停顿。

## 生成与校验

在仓库根目录运行：

```sh
python3 design/pixel-art/gen_battle_sheets.py
```

需要项目使用的 Node.js，以及现有美术脚本同样使用的 Pillow。脚本直接读取 `backend/common/sprites/` 的原始字符图与调色板，使用分别编排的剑、斧、枪姿势进行像素绘制。只靠旋转表现不了的动作用手绘部件补上：拉弦各阶段的弓、翻开的法书、出拳时伸直的手臂、飘起的头带、绕根部摆动的翅膀和尾巴；火球、箭、飞刀、龙息、爪痕也逐帧手绘，只用原角色和武器的调色板。

脚本自检：原始待机图逐像素一致、16 个同尺寸画布、至少 13 个不同姿势、首尾闭环、脚部基准、武器握持连接（掷出后的空手帧单独列出）、画布边界、配色与二值透明度。

## 游戏内播放

前九组作为同职业／武器 FE 动画的备用；飞鸵三阶新增的七组直接用于对应武器的交战。`classId` 与 `weapon` 必须同时匹配。项目图集受击和闪避时使用同职业的分层动作。弓、书、短刀、龙石样张与神鸵魔法自己绘制飞行物，站定出手；剑斧等近战动作向对方突进。前端按逐帧时长切图，以第 11 帧为命中时刻；HP 完全取服务端战斗记录。必杀在蓄力与命中帧延长停顿，反击和追击各自重新开始。

`*-mask.png` 是换色遮罩，不是可见素材：灰度 1–7 依次标记 `a/A/l/s/S/h/H`（阵营、肤色、发色），0 保持原色。它由原始部件语义生成，避免把颜色恰好相同的马匹或皮革染成发色。运行时按角色配色缓存整张图，再以 4 倍像素大小切帧；脚底参考点与原来的职业形象对齐。

演出等待所需图片加载后开始；加载失败时使用原有分层动作，跳过按钮仍可立即结束。系统选择减少动态效果时显示静态首帧。没有新增图片生成服务或依赖。

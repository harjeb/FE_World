# 经典火纹地图下载样本

本目录已从 Fire Emblem Wars of Dragons（WoD）及 Fire Emblem Wiki 实际下载 8 张 PNG 地图，均通过 Pillow 解码并打开检查。原图保存在 `samples/`，对应攻略网页的原始 HTML 保存在 `samples/pages/`。

当前主要产物是[三作各10张、共30张中后期经典地图](../../content/scenarios/gba-classics-v1/README.md)，已统一保存为带版本号的 `scenario.json` 并附敌军 CSV。[离线预览](../../content/scenarios/gba-classics-v1/index.html)可以切换作品、章节和单位组；[固定格式与项目读取说明](../../tools/gba/README.md)包含正式 Schema 和 TypeScript 校验入口。[接入TODO](../../docs/24-classic-scenarios-integration-todo.md)列出地块、职业替换、事件与任务接入。选图只采用正常编队的常规战斗、撤退或占领地图。

这些图片用于选图和对照参考。已对两张 GBA 地图的24个样本格核对视觉元素，并制作了[识别验证记录与标注图](recognition/README.md)。现在已从用户提供的日版 GBA 文件完成[圣魔第8章的真实 ROM 解析](extracted/fe8j-ch08-rom/README.md)，可打开[ROM 交互预览](extracted/fe8j-ch08-rom/preview.html)查看576格地形、地点事件、单位模板和地图变化。早期的[美版公开数据样例](extracted/fe8-ch08/README.md)保留用于版本对照，两者有等级与装备差异。样例仍需适配项目规则后才能成为可玩副本。

| 本地图片 | 作品／关卡 | 原始像素尺寸 | 图片来源 |
| --- | --- | --- | --- |
| [wod-fe1-ch19.png](samples/wod-fe1-ch19.png) | 暗黑龙与光之剑（FC），第 19 章 | 256 × 464 | [WoD 原图](https://www.fireemblemwod.com/fe1/mapasfe/19.png) |
| [wiki-fe1-ch19.png](samples/wiki-fe1-ch19.png) | 暗黑龙与光之剑（FC），第 19 章 | 256 × 480 | [Wiki 原图](https://cdn.fireemblemwiki.org/c/c6/Cm_fe01_19.png) |
| [wiki-fe11-ch19.png](samples/wiki-fe11-ch19.png) | 新·暗黑龙与光之剑（NDS），第 19 章 | 384 × 720 | [Wiki 原图](https://cdn.fireemblemwiki.org/2/2f/Cm_fe11_19.png) |
| [wod-fe8-ch08.png](samples/wod-fe8-ch08.png) | 圣魔之光石（GBA），第 8 章 | 384 × 384 | [WoD 原图](https://www.fireemblemwod.com/fe8/mapasfe8/cap8.png) |
| [wod-fe8-valni-01.png](samples/wod-fe8-valni-01.png) | 圣魔之光石（GBA），威鲁尼之塔第 1 层 | 240 × 288 | [WoD 原图](https://www.fireemblemwod.com/fe8/exmap/t01.png) |
| [wiki-fe8-ch08.png](samples/wiki-fe8-ch08.png) | 圣魔之光石（GBA），第 8 章，普通难度对照图 | 384 × 384 | [Wiki 原图](https://cdn.fireemblemwiki.org/9/95/Cm_fe08_8.png) |
| [wiki-fe8-ch08-hard.png](samples/wiki-fe8-ch08-hard.png) | 圣魔之光石（GBA），第 8 章，困难难度对照图 | 384 × 384 | [Wiki 原图](https://cdn.fireemblemwiki.org/b/b2/Cm_fe08_8_d.png) |
| [wiki-fe8-valni-01.png](samples/wiki-fe8-valni-01.png) | 圣魔之光石（GBA），威鲁尼之塔第 1 层，对照图 | 240 × 288 | [Wiki 原图](https://cdn.fireemblemwiki.org/b/bb/Cm_fe08_V-1.png) |

## 对应攻略与配置来源

- FC 第 19 章：[原站章节页](https://www.fireemblemwod.com/fe1/guia/ENG_fecapitulo19.htm)；[已保存 HTML](samples/pages/wod-fe1-ch19.html)。包含宝箱物品、招募、首领数据，以及 `<area>` 悬浮提示里的敌人像素区域、等级、部分属性和装备。
- 圣魔第 8 章：[原站章节页](https://www.fireemblemwod.com/fe8/guiafe8/ENG_capitulo8fe8.htm)；[已保存 HTML](samples/pages/wod-fe8-ch08.html)。包含目标、宝箱物品、增援条件、加入角色与首领数据。例如第 5 回合出现 3 名骑兵，进入绿色区域后触发 2 名魔法师和 1 名盗贼。
- 威鲁尼之塔第 1 层：[原站章节页](https://www.fireemblemwod.com/fe8/exmap/ENG_torre-valni1.htm)；[已保存 HTML](samples/pages/wod-fe8-valni-01.html)。页面说明怪物为随机配置，无增援、无宝箱。
- FC／NDS 第 19 章：[Wiki 章节页](https://fireemblemwiki.org/wiki/Manakete_Princess)；[已保存 HTML](samples/pages/wiki-ch19.html)。包含不同作品版本的地图和章节数据，提取时需要区分版本。
- 圣魔第 8 章 Wiki 对照：[原站章节页](https://fireemblemwiki.org/wiki/It%27s_a_Trap!)；[已保存 HTML](samples/pages/wiki-fe8-ch08.html)。包含地图尺寸、普通／困难难度图及增援触发范围。
- 威鲁尼之塔 Wiki 对照：[原站页面](https://fireemblemwiki.org/wiki/Tower_of_Valni)；[已保存 HTML](samples/pages/wiki-fe8-valni.html)。

保存的 HTML 是网页源文件备份，没有下载全部脚本、样式和配图，不能视为完整离线网站。原图包含单位、数字或区域标记，部分地形受到遮挡；不同来源也有裁切差异。转换为可玩地图时仍需核对格子原点、地形、出生点和事件条件，不能直接把图片当成游戏关卡数据。

## 本次其他站点访问结果

- dex2nd 的原章节页及 `chapter/map/map19.gif` 经 HTTP／HTTPS 请求均返回 503，本次未下载到该站图片。
- Serenes Forest 的 FC 作品主页可以访问，本次尚未确认其地图图片入口。
- 天馬騎士団首页可以访问；此前提供的通用 `/wiki/` 地址返回 404，首页实际按 `/wiki/fe8/` 等作品路径组织。本次未下载该站地图。

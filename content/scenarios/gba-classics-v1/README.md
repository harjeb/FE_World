# GBA中后期经典地图：30张固定格式素材

从用户提供的三份GBA文件直接采集，封印、烈火、圣魔各10张。坐标为左上角零基`[x,y]`，矩阵为`[y][x]`。

本轮只选可正常编队的常规战斗、撤退或占领图；少量单位试炼及坚守、护送、收集、孵化等特殊任务已排除。

- [离线交互预览](index.html)：选作品、章节、敌军模板组，点击格子查看等级/装备/AI。
- [总目录与文件校验值](manifest.json)。
- [固定格式与项目读取方式](../../../tools/gba/README.md)。
- [项目接入TODO](../../../docs/24-classic-scenarios-integration-todo.md)。

敌军数是去重单位组中的模板条目数，包含难度、开场、增援、过场等静态引用，并非同时出场人数。封印/烈火另记录主路线普通难度的初始表数量；圣魔保留开场脚本引用证据。未执行事件、ASM、随机数及原作存档。

| 作品 | 章号/路线 | 地图 | 尺寸 | 敌军模板 | 初始表敌军 | 文件 |
| --- | --- | --- | --- | ---: | ---: | --- |
| fe6 | 13 / main | 封印之剑 · 救出作战 | 46×25 | 59 | 38 | [JSON](fe6/fe6-ch13-main/scenario.json) · [敌军CSV](fe6/fe6-ch13-main/enemies.csv) |
| fe6 | 14 / main | 封印之剑 · 阿卡迪亚 | 32×22 | 53 | 31 | [JSON](fe6/fe6-ch14-main/scenario.json) · [敌军CSV](fe6/fe6-ch14-main/enemies.csv) |
| fe6 | 16 / main | 封印之剑 · 夺回王都 | 32×32 | 44 | 34 | [JSON](fe6/fe6-ch16-main/scenario.json) · [敌军CSV](fe6/fe6-ch16-main/enemies.csv) |
| fe6 | 18 / ilia | 封印之剑 · 冰冻之河 | 23×32 | 38 | 32 | [JSON](fe6/fe6-ch18-ilia/scenario.json) · [敌军CSV](fe6/fe6-ch18-ilia/enemies.csv) |
| fe6 | 19 / ilia | 封印之剑 · 冬将军 | 32×22 | 42 | 37 | [JSON](fe6/fe6-ch19-ilia/scenario.json) · [敌军CSV](fe6/fe6-ch19-ilia/enemies.csv) |
| fe6 | 20 / ilia | 封印之剑 · 解放伊利亚 | 32×26 | 40 | 32 | [JSON](fe6/fe6-ch20-ilia/scenario.json) · [敌军CSV](fe6/fe6-ch20-ilia/enemies.csv) |
| fe6 | 21 / main | 封印之剑 · 封印之剑 | 32×36 | 85 | 35 | [JSON](fe6/fe6-ch21-main/scenario.json) · [敌军CSV](fe6/fe6-ch21-main/enemies.csv) |
| fe6 | 22 / main | 封印之剑 · 不尽的梦 | 32×32 | 65 | 39 | [JSON](fe6/fe6-ch22-main/scenario.json) · [敌军CSV](fe6/fe6-ch22-main/enemies.csv) |
| fe6 | 23 / main | 封印之剑 · 伯尔尼的亡灵 | 24×32 | 41 | 41 | [JSON](fe6/fe6-ch23-main/scenario.json) · [敌军CSV](fe6/fe6-ch23-main/enemies.csv) |
| fe6 | 24 / main | 封印之剑 · 传说的真实 | 32×48 | 33 | 27 | [JSON](fe6/fe6-ch24-main/scenario.json) · [敌军CSV](fe6/fe6-ch24-main/enemies.csv) |
| fe7 | 19 / eliwood | 烈火之剑 · 龙之门 | 22×22 | 143 | 26 | [JSON](fe7/fe7-ch19-eliwood/scenario.json) · [敌军CSV](fe7/fe7-ch19-eliwood/enemies.csv) |
| fe7 | 20 / eliwood | 烈火之剑 · 新的决心 | 26×15 | 102 | 18 | [JSON](fe7/fe7-ch20-eliwood/scenario.json) · [敌军CSV](fe7/fe7-ch20-eliwood/enemies.csv) |
| fe7 | 22 / eliwood | 烈火之剑 · 活着的传说 | 22×16 | 105 | 20 | [JSON](fe7/fe7-ch22-eliwood/scenario.json) · [敌军CSV](fe7/fe7-ch22-eliwood/enemies.csv) |
| fe7 | 23 / eliwood-lloyd | 烈火之剑 · 四牙袭来·洛伊德 | 19×25 | 110 | 18 | [JSON](fe7/fe7-ch23-eliwood-lloyd/scenario.json) · [敌军CSV](fe7/fe7-ch23-eliwood-lloyd/enemies.csv) |
| fe7 | 23 / eliwood-linus | 烈火之剑 · 四牙袭来·莱纳斯 | 26×19 | 150 | 26 | [JSON](fe7/fe7-ch23-eliwood-linus/scenario.json) · [敌军CSV](fe7/fe7-ch23-eliwood-linus/enemies.csv) |
| fe7 | 25 / eliwood-kenneth | 烈火之剑 · 黑暗中的白花·肯尼斯 | 25×26 | 146 | 25 | [JSON](fe7/fe7-ch25-eliwood-kenneth/scenario.json) · [敌军CSV](fe7/fe7-ch25-eliwood-kenneth/enemies.csv) |
| fe7 | 25 / eliwood-jerme | 烈火之剑 · 黑暗中的白花·杰尔梅 | 25×26 | 194 | 38 | [JSON](fe7/fe7-ch25-eliwood-jerme/scenario.json) · [敌军CSV](fe7/fe7-ch25-eliwood-jerme/enemies.csv) |
| fe7 | 27 / eliwood | 烈火之剑 · 命运的齿轮 | 29×27 | 232 | 42 | [JSON](fe7/fe7-ch27-eliwood/scenario.json) · [敌军CSV](fe7/fe7-ch27-eliwood/enemies.csv) |
| fe7 | 30 / eliwood | 烈火之剑 · 背水一战 | 28×30 | 257 | 25 | [JSON](fe7/fe7-ch30-eliwood/scenario.json) · [敌军CSV](fe7/fe7-ch30-eliwood/enemies.csv) |
| fe7 | final-1 / eliwood | 烈火之剑 · 光·前半 | 17×27 | 35 | 17 | [JSON](fe7/fe7-chfinal-1-eliwood/scenario.json) · [敌军CSV](fe7/fe7-chfinal-1-eliwood/enemies.csv) |
| fe8 | 11 / ephraim | 圣魔之光石 · 幽灵船 | 21×19 | 56 | 脚本引用分组 | [JSON](fe8/fe8-ch11-ephraim/scenario.json) · [敌军CSV](fe8/fe8-ch11-ephraim/enemies.csv) |
| fe8 | 12 / eirika | 圣魔之光石 · 静寂之村 | 20×30 | 54 | 脚本引用分组 | [JSON](fe8/fe8-ch12-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch12-eirika/enemies.csv) |
| fe8 | 13 / ephraim | 圣魔之光石 · 萤石的誓言 | 22×22 | 133 | 脚本引用分组 | [JSON](fe8/fe8-ch13-ephraim/scenario.json) · [敌军CSV](fe8/fe8-ch13-ephraim/enemies.csv) |
| fe8 | 14 / eirika | 圣魔之光石 · 白沙的女王 | 25×27 | 61 | 脚本引用分组 | [JSON](fe8/fe8-ch14-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch14-eirika/enemies.csv) |
| fe8 | 14 / ephraim | 圣魔之光石 · 父与子·古拉德王城 | 29×31 | 71 | 脚本引用分组 | [JSON](fe8/fe8-ch14-ephraim/scenario.json) · [敌军CSV](fe8/fe8-ch14-ephraim/enemies.csv) |
| fe8 | 15 / eirika | 圣魔之光石 · 灼热的黄沙 | 24×22 | 64 | 脚本引用分组 | [JSON](fe8/fe8-ch15-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch15-eirika/enemies.csv) |
| fe8 | 16 / eirika | 圣魔之光石 · 荒废的王都 | 22×28 | 48 | 脚本引用分组 | [JSON](fe8/fe8-ch16-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch16-eirika/enemies.csv) |
| fe8 | 17 / eirika | 圣魔之光石 · 诀别的大河 | 23×21 | 107 | 脚本引用分组 | [JSON](fe8/fe8-ch17-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch17-eirika/enemies.csv) |
| fe8 | 20 / eirika | 圣魔之光石 · 暗之树海 | 30×21 | 79 | 脚本引用分组 | [JSON](fe8/fe8-ch20-eirika/scenario.json) · [敌军CSV](fe8/fe8-ch20-eirika/enemies.csv) |
| fe8 | final-1 / eirika | 圣魔之光石 · 圣魔之光石·决战前半 | 23×25 | 50 | 脚本引用分组 | [JSON](fe8/fe8-chfinal-1-eirika/scenario.json) · [敌军CSV](fe8/fe8-chfinal-1-eirika/enemies.csv) |

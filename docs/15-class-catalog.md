# 15 职业目录与武器权限

当前成长数值和全部累计增幅可直接看[职业成长审阅稿](17-class-growth-review.md)；本篇重点说明目录、来源和武器权限。

2026-10-16：以用户指定的[《万缕千丝》职业一览](https://fire-emblem-fw.site/classes.html)为主，补充前作及兽／龙职业，替代旧69职业草案。按最新要求删除勇士、上忍、机关师、战斗修士、战象兵，保留勇者；勇士旧编号合并至勇者，不叠加成长。原始60行参考资料保留，现行采用其中58项，包含平民、贵族两个基础身份。外站译名含机翻，本作适配数值不冒充原作。

## 数量与完成范围

共77个独立职业条目：原表采用58个＋前作补充9个＋兽／龙扩展10个。24个历史编号只作兼容别名，不重复计数；其他四个已删除职业只保留旧存档／回放读取，不在现行目录，不可购买／切换／派遣训练。五阶职业75个均已开放可用；战车直线攻击与舞者／神乐再行动已接，仍受年份、金币、种族、进阶方向与资格额度约束。基础身份2个不出售。

| 阶级 | 万缕千丝 | 前作补充 | 兽／龙扩展 | 总计 |
| --- | ---: | ---: | ---: | ---: |
| 基础身份 | 2 | 0 | 0 | 2 |
| 初级 | 5 | 0 | 2 | 7 |
| 中级 | 12 | 3 | 2 | 17 |
| 上级 | 15 | 6 | 2 | 23 |
| 最上级 | 16 | 0 | 2 | 18 |
| 神将 | 8 | 0 | 2 | 10 |

## 本作适配规则

- 每个职业分别配置武器权限；路线仅用于目录、肖像与推荐培养路径，不能据路线推导单一武器。马术、飞行术、重装术是原表的技能／兵种信息，不当作武器，也不因“有飞行术”就让飞鸵兵飞行。重装骑兵同时保留骑乘与重装特效弱点。
- 角色按武器类型分别保存熟练度；换职只为新类型初始化E，不赠字母等级，也不抹去旧积累。已扩展SS／SSS：`weaponRankCap`按当前职业权限校验，最上级上限SS、神将SSS，其余读取各职业对应武器上限；不能使用的类型不能通过本职业训练积存经验。
- 人类在年份开放后付费购买资格，可跨普通路线购买、免费切换已购职业；推荐路径不是人类的前置条件。兽人与龙人只能沿本族职业链逐阶进阶，不能跳阶、降阶、互转或转成人类职业；同职业训练可以继续进行。购买、切换、PROMOTE及派遣训练共用限制；轮回返回本族第一阶，种族保留。保留总等级、经验与已获属性，基础职业也能到99。
- 原作考试所需人物等级、名声、技能、票证和神将专用道具仅作参考，不自动加入本作解锁条件。原作职业基础能力不作为转职即时加成。
- 原表九项成长修正完整接入，包含独立的魅力。现行58项中，`SOURCE_GROWTH_BUFFS`对20个偏弱职业加指定属性，其他38个保持原值；魅力逐项保留原表，不额外加强。前作与兽／龙19个保留独立适配配置，魅力修正暂0，不累加前置职业。成长、传承和轮回已包含魅力；HP150封顶，魅力与其他七项非HP属性无数值上限，等级仍封顶99，计略／骑士团及官方系数仍待核对接入。完整九属性表见[17](17-class-growth-review.md)，测算见[16](16-class-growth-balance.md)。
- 下表沿用编目时的武器权限标签，“白魔法（杖）”不表示只有治疗杖可用。当前白魔法攻击／功能法术、逐角色学习表和主动杖已按[27](27-fortunes-weave-equipment-magic.md)接入；施法须满足当前职业魔法权限、书的熟练度及限量教材条件，不把本作适配称作原作全魔法系统。
- 原页面读取到的技能EXP加成栏为空；trainingBonus留空，不臆造逐职业加成。原表可用技能列表单独保留，不能把列表中的所有技能都当成“擅长加成”。
- 职业精通节点与已知职业能力已经接入；58项参考能力只落实可确认的数值，不补造未知系数。个人／当前职业能力单列，习得被动与战技共用五格，装备授予不占五格且卸下撤销。
- 战技精通清单见[28](28-class-art-learning.md)：75个武器／兽龙职业各4～6项独立战技ID，通过职业精通学习；两种纯法术职业不参与，原有法术系统保留。176项精通基础技共享或限1～2职教授，103项强化版须先学基础、另行研修，36项武器特有战技不加入职业精通奖励。[29](29-original-weapon-arts.md)新增15项短刃／兽／龙原创，撤回此前借用拳剑战技的兼容方案。换职保留且使用不绑定原教学职业，仍需当前武器权限；精通阈值与103项研修成本已经逐项配置，仍为待人工平衡的本作首稿。
- 主参考技能资料见[25《万缕千丝》技能与职业对应](25-fortunes-weave-skills.md)，逐项列出现用58项职业的固有／精通来源、效果及未知资料边界。315项主动战技及运行时机制见[26](26-weapon-art-catalog.md)，规则与示例见[23](23-skill-catalog.md)；完成证据和人工验收状态见[34](34-task-closure.md)／[35](35-release-validation-record.md)。

## 逐职业目录

下面保留现行数据来源与基础权限目录。战车兵的`chariot_line`和舞者／神乐神将的`dance`已有首版机制；已删除职业不在下表。

### 基础身份

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 平民 | `commoner` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-4) | 剑、枪、斧、弓、拳、白魔法（当前为杖）、黑魔法 | 步行 4 | 身份资料 |
| 贵族 | `noble` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-5) | 剑、枪、斧、弓、拳、白魔法（当前为杖）、黑魔法 | 步行 4 | 身份资料 |

### 初级

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 斗士 | `gladiator` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-6) | 剑、斧、拳 | 步行 4 | 基础权限已接入；专属技能另行完善 |
| 猎兵 | `hunter` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-7) | 剑、弓 | 步行 4 | 基础权限已接入；专属技能另行完善 |
| 士兵 | `lancer` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-8) | 剑、枪、斧 | 重装步行 4 | 基础权限已接入；专属技能另行完善 |
| 飞鸵兵 | `ornius_rider` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-9) | 剑、枪、斧 | 骑乘 5 | 基础权限已接入；专属技能另行完善 |
| 诅咒师 | `adept` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-10) | 剑、斧、拳、黑魔法、白魔法（当前为杖） | 步行 4 | 基础权限已接入；专属技能另行完善 |
| 幼战士 | `beast_cub` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 兽爪／兽石 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 觉醒者 | `awakened` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 龙石／龙息 | 步行 4 | 基础权限已接入；专属技能另行完善 |

### 中级

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 剑客 | `swordsman` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-11) | 剑、枪 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 土匪 | `fighter` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-12) | 剑、斧、拳 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 斗拳手 | `brawler` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-13) | 拳 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 弓箭手 | `archer` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-14) | 弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 恶棍 | `rogue` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-15) | 剑、弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 重装步兵 | `knight` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-16) | 剑、枪、斧 | 重装步行 4 | 基础权限已接入；专属技能另行完善 |
| 轻骑兵 | `cavalier` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-17) | 剑、枪、斧 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 战车兵 | `charioteer` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-18) | 弓 | 骑乘 5 | 已接：战车直线范围攻击 |
| 骑甲鸵兵 | `armored_ornius` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-19) | 剑、枪、斧 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 天翼兵 | `pegasus` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-20) | 剑、枪 | 飞行 6 | 基础权限已接入；专属技能另行完善 |
| 萨满巫师 | `mage` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-21) | 剑、拳、黑魔法、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 牧师 | `cleric` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-22) | 斧、拳、黑魔法、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 佣兵 | `mercenary` | [前作补充](https://www.nintendo.co.jp/n08/be8j/unit/class/page03.html) | 剑 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 盗贼 | `thief` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 剑 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 忍者 | `ninja` | [前作补充](https://serenesforest.net/fire-emblem-fates/hoshidan-classes/) | 短刀／手里剑 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 兽战士 | `beast_fighter` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 兽爪／兽石 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 龙人 | `dragonkin` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 龙石／龙息 | 步行 4 | 基础权限已接入；专属技能另行完善 |

### 上级

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 侍道 | `shido` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-23) | 剑、枪 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 狙击手 | `sniper` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-25) | 弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 森林骑士 | `forest_knight` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-26) | 剑、弓 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 巨型重甲兵 | `dreadnought` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-27) | 枪、斧 | 重装步行 4 | 基础权限已接入；专属技能另行完善 |
| 荣光骑士 | `paladin` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-28) | 剑、枪、斧 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 先知 | `sage` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-29) | 剑、拳、黑魔法、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 主教 | `bishop` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-30) | 斧、拳、黑魔法、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 神鸵兵 | `divine_ornius` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-31) | 剑、枪、斧、黑魔法 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 驭龙兵 | `dragon_knight` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-32) | 剑、枪、斧 | 飞行 6 | 基础权限已接入；专属技能另行完善 |
| 游唱诗人 | `troubadour` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-33) | 黑魔法、白魔法（当前为杖） | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 卫士 | `guardian` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-34) | 枪、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 锻造师 | `blacksmith` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-35) | 斧、黑魔法 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 铁甲骑兵 | `cataphract` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-36) | 剑、枪、斧 | 骑乘／重装 5 | 基础权限已接入；专属技能另行完善 |
| 游侠 | `ranger` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-37) | 剑、弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 舞者 | `dancer` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-38) | 剑、弓 | 步行 5 | 已接：相邻友军舞蹈再行动 |
| 勇者 | `hero` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 剑、斧 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 狂战士 | `berserker` | [前作补充](https://www.nintendo.co.jp/n08/be8j/unit/class/page03.html) | 斧 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 刺客 | `assassin` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 剑、弓 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 将军 | `general` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 枪、斧 | 重装步行 4 | 基础权限已接入；专属技能另行完善 |
| 神军师 | `mage_knight` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 剑、黑魔法 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 黑暗骑士 | `dark_knight` | [前作补充](https://serenesforest.net/awakening/classes/introduction/) | 剑、黑魔法 | 骑乘 6 | 基础权限已接入；专属技能另行完善 |
| 兽勇士 | `beast_hero` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 兽爪／兽石 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 古龙卫 | `ancient_guard` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 龙石／龙息 | 步行 5 | 基础权限已接入；专属技能另行完善 |

### 最上级

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 刀剑将领 | `swordmaster` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-40) | 剑、枪 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 高阶墓志铭 | `high_epitaph` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-41) | 剑、黑魔法 | 骑乘 7 | 基础权限已接入；专属技能另行完善 |
| 战斗将领 | `battlemaster` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-42) | 剑、斧、拳 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 武僧 | `monk` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-43) | 拳、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 宗师射手 | `marksman` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-44) | 弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 弓骑士 | `bow_knight` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-45) | 剑、弓 | 骑乘 7 | 基础权限已接入；专属技能另行完善 |
| 探影者 | `shadow_seeker` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-46) | 剑、弓 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 圣枪师 | `sentinel` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-47) | 枪、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 要塞 | `fortress` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-48) | 枪、斧 | 重装步行 4 | 基础权限已接入；专属技能另行完善 |
| 奥利哈铁骑 | `orichaldia` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-49) | 剑、枪、斧 | 骑乘 7 | 基础权限已接入；专属技能另行完善 |
| 英勇骑士 | `great_knight` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-50) | 剑、枪、斧 | 骑乘／重装 6 | 基础权限已接入；专属技能另行完善 |
| 圣天翼兵 | `falcon` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-51) | 剑、枪 | 飞行 7 | 基础权限已接入；专属技能另行完善 |
| 飞龙将领 | `dragon_commander` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-52) | 剑、枪、斧 | 飞行 7 | 基础权限已接入；专属技能另行完善 |
| 德鲁伊 | `druid` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-53) | 剑、拳、黑魔法 | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 贤士 | `wiseman` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-54) | 斧、拳、白魔法（当前为杖） | 步行 5 | 基础权限已接入；专属技能另行完善 |
| 瓦尔基里姆 | `valkyrie` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-55) | 黑魔法、白魔法（当前为杖） | 骑乘 7 | 基础权限已接入；专属技能另行完善 |
| 兽王卫 | `beast_guard` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 兽爪／兽石 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 龙贤者 | `dragon_sage` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 龙石／龙息 | 步行 5 | 基础权限已接入；专属技能另行完善 |

### 神将

| 职业 | 编号 | 来源 | 可用武器 | 移动 | 机制状态 |
| --- | --- | --- | --- | --- | --- |
| 刃辉神将 | `blade` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-56) | 剑、枪 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 神乐神将 | `apsara` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-57) | 剑、弓 | 步行 6 | 已接：相邻友军舞蹈再行动 |
| 永霸神将 | `everlord` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-58) | 剑、斧、拳 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 破拳神将 | `fist_deity` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-59) | 拳、白魔法（当前为杖） | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 绝祸神将 | `calamity` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-60) | 剑、弓 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 岚枪神将 | `storm_lancer` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-61) | 枪、白魔法（当前为杖） | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 烈骏神将 | `divine_cavalier` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-62) | 枪、剑、斧 | 骑乘 8 | 基础权限已接入；专属技能另行完善 |
| 圣转神将 | `saint` | [万缕千丝](https://fire-emblem-fw.site/classes.html#cls-63) | 斧、弓、黑魔法、白魔法（当前为杖） | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 兽神将 | `beast_lord` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 兽爪／兽石 | 步行 6 | 基础权限已接入；专属技能另行完善 |
| 龙神将 | `dragon_lord` | [兽／龙扩展](https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html) | 龙石／龙息 | 步行 5 | 基础权限已接入；专属技能另行完善 |

## 旧编号兼容

既有存档、历史快照和纪念记录保留原编号，不进行数据库重写；读取职业定义时解析别名。市场只列规范职业，资格拥有检查按规范编号比较，防止同一职业换别名重复收费；精通进度按同一职业的最高已存进度读取，已解锁节点兼容旧前缀。

| 旧编号 | 对应职业 |
| --- | --- |
| `warrior` | 勇者（`hero`），合并，不叠加成长 |
| `sword_hero` | 侍道（`shido`） |
| `sword_lord` | 刃辉神将（`blade`） |
| `axe_fighter` | 斗士（`gladiator`） |
| `war_lord` | 永霸神将（`everlord`） |
| `iron_lord` | 要塞（`fortress`） |
| `squire` | 飞鸵兵（`ornius_rider`） |
| `rider_lord` | 烈骏神将（`divine_cavalier`） |
| `ranger_commander` | 森林骑士（`forest_knight`） |
| `wing_recruit` | 飞鸵兵（`ornius_rider`） |
| `wing_soldier` | 天翼兵（`pegasus`） |
| `sky_commander` | 圣天翼兵（`falcon`） |
| `wing_lord` | 圣天翼兵（`falcon`） |
| `bow_lord` | 绝祸神将（`calamity`） |
| `warlock` | 先知（`sage`） |
| `archsage` | 贤士（`wiseman`） |
| `magic_lord` | 圣转神将（`saint`） |
| `acolyte` | 诅咒师（`adept`） |
| `holy_lord` | 圣转神将（`saint`） |
| `scout` | 猎兵（`hunter`） |
| `shadow_lord` | 绝祸神将（`calamity`） |
| `fist_recruit` | 斗士（`gladiator`） |
| `fist_master` | 武僧（`monk`） |
| `fist_lord` | 破拳神将（`fist_deity`） |

## 验证与后续

回归覆盖来源数量／阶级、逐职业权限与熟练度、旧资格／精通兼容、三项特殊机制、重装骑乘双重特效、职业购买与转职校验。历史规则AI对局保留各批次记录，不据其胜负宣称完整经济平衡。

首版实现证据见[34](34-task-closure.md)；原作未知技能／魅力公式仍不臆造，连续八年养成与经济由BAL-04继续跟踪，人工试玩见35。使用Node.js 22.18+执行：

```powershell
npm --prefix backend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

相关浏览器与目录审计命令见[14](14-integration-handoff.md)／[28 交付边界](28-release-readiness.md)。测试使用临时存档，最近各项验证批次见34；测试数量不在本表固定为旧168项。

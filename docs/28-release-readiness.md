# 首版交付与运行边界

更新：2026-10-19。本文是交付清单和运行／恢复说明，不把“目录存在”当作“运行时已完成”。任务和分项提交见[34](34-task-closure.md)，实际多人／人工／生产验收见[35](35-release-validation-record.md)。当前64项首版完成、BAL-04部分完成。

## 1. 内容清单

| 内容 | 数量 | 当前状态 | 验证 |
| --- | ---: | --- | --- |
| 经典地图 | 60 | 可创建战斗；物件、增援、宝箱/村庄、炮台、状态杖已接 | `classic-validation.ts`、`classic-scenario.test.ts`、`api/classic.test.ts` |
| 经典单图任务／副本 | 60 / 18 | 入口和结算已接 | `classic-quests.ts`、`api/classic.test.ts` |
| 装备／法术目录 | 170 | 170个设计ID逐项齐全且都有取得途径（地区商店资格按级别开放、一次性任务奖励、挑战塔首通；限量书＋教材只经任务发放）；特殊装备效果、40种法术效果与书／杖次数（开场、追击、反击各扣1次）已结算并进入网页／Agent预测，见27 §6；另保留旧武器／书及别名，共187条兼容记录（137武器表＋50书表） | `tools/audit/equipment-catalog.py`、`equipment-effects.test.ts`、`spell-effects.test.ts`、`api/equipment-sources.test.ts` |
| 武器战技 | 315 | 283参考＋17补充＋15原创；原创逐项结算、目标选择、网页／Agent预测及耐久支付已接；176项精通／408条教学已接入参战、返程和存档；103项营地同步研修已接入（`durability_v1`：`days=max(2,ceil(project.cost/2))`、`gold=days*200`，先学基础、付费耗日、重试安全）；36项装备授予已实现（含毒弓＋3强化路径、实例／资源保存，见27及`backend/api/equipment-grants.test.ts`）；共用五格运行时／API／网页已实现（完整库与独立选择、原子提交及旧档一次迁移见28）；既有300项特殊效果已完成首版显式实现（边界见26）；CLASS-02首版可确认主动战技与12被动已实现，DESIGN-04及ITEM-06已完成首版（特殊装备、法术与投放见27 §6） | `original-arts.test.ts`、`classic-arts.test.ts`（引擎／API）、`art-effects.test.ts`、`api/ui-protocol.test.ts`、`tools/audit/class-art-learning.py` |
| 职业目录 | 77 | 运行时可用；舞者/神乐再行动、战车直线攻击已接 | `class-data` 测试 |
| 地区任务 | 12 地区／108项 | 每地九项一次性任务，最快5／16／40行动日达到100／250／500；旧三任务链可续做，经典地图新奖励不再额外加速三地声望，已获声望保留，见[20](20-region-quests-reputation.md) | `quests.test.ts`、`api/quests.test.ts` |
| 挑战塔 | 3 层 | 可开战、首通/重复奖励与保存；终层地图显示名为「神蚀纪 · 终焉王座」 | `challenges.ts`、`classic.test.ts`、`api` 测试 |
| 酒馆 | 第二年季度候选 | 付费雇佣、候选不重掷 | `GET_TAVERN`／`HIRE_TAVERN` |

运行时边界：170项装备／法术的特殊效果与逐项投放已接入（`rules-v7`），状态命中公式、反噬率、地区资格声望档等标为首稿的参数仍待人工平衡。火炬在没有迷雾的地图暂不能施放；狂乱`mg-51`原效果未知，仍不收录。58项职业能力仅落实已知数值，未知不臆造；315项主动战技完成首版显式机制，选择、预测、学习／研修与共用五格已接入网页及Agent。首稿不等于原作精确复刻或平衡验收；发布时仍按“目录可用”和“运行时可用”分列，不能用一个总数掩盖差异。

## 2. 正常新档

1. 启动后端：`npm --prefix backend run dev`；前端：`npm --prefix frontend run dev`。
2. 新账号 `POST /api/login` 创建 D0 玩家；调用 `COMPLETE_SETUP` 自建主角并选择两名同伴。
3. 新档初始：星辉历1001年1月1日（D0）、空地区进度、13,120金币、0公共经验、1级三人队。神主角固定平民／成长型，保留基础属性并额外分配10点、每项最多加5点，按额外加点自动推导倾向；初始三人均E级熟练度与木制等基础装备。已有角色不重置。
4. 完成开局后进入世界地图，选择一条近郊路线，再显示该地区的任务和出击；详细解锁规则与本轮体验反馈见[36](36-playtest-feedback.md)。
5. `SEED_DAY=999` 只用于测试夹具和演示，不是正式起点；不要用演示日期判断正式进度。

## 3. 部署、备份与恢复

- 默认数据库：`DB_PATH` 指向的 SQLite 文件；WAL 模式。
- 备份：用SQLite一致备份接口，例如`sqlite3 "$DB_PATH" ".backup 'backup.sqlite'"`，或迁移CLI的`--backup`生成包含已提交WAL页面的独立数据库；这种备份不依赖源库的`-wal`／`-shm`。若直接复制源文件，先停API与Worker并完成checkpoint、关闭连接，不能仅复制活跃主库。
- 恢复：先停服务，替换主库并删除旧 `-wal`/`-shm`，再启动；用 `GET_STATE` 和一次只读回放验证。
- 迁移：`npm --prefix backend run migrate-save -- --db <path> --from-year-days 120|500`默认只读预演，`--apply --backup <new-path>`先生成含WAL页面的独立备份再事务提交。新档记录schema／日历版本；未标记旧档须显式区分120日换算与500日采纳。跨日历保留年龄、生产／派遣剩余天数、既有收益和冻结记录，阻止未结束战斗／远征／年度赛事；年度窗口改用当前年末规则，不结转旧未报名窗口。工具、回滚与实迁边界见[33](33-save-migration.md)。本次仅用临时文件夹具，未执行生产旧档实迁。
- 当前规则：`rules-v15`／目录33／协议`docVersion: 16`／引擎1；目录32隐藏内容继续保留。光明神射`lightshot`已接入：满HP持弓时整次交战有效技巧×2，含反击、连击、追击及战技技巧引用；`personalSkill`独立保存并随快照保留，网页卡片和交战预测显示有效技巧。时空副本及兑换入口后续接入。HP150封顶，其余八项无数值上限；九键caps为hp:150、str/mag/skl/spd/lck/def/res/cha:null。等级99、成长率百分比与能力药使用额度保持。数值传承`capacity: null`、`target = sourceTotal`、`lost = 0`，HP到150后余点转分配；旧99上限合同在读档或下次保底时按保存的sourceTotal刷新，已获属性与过去成长不重算。旧规则回放按兼容性保持冻结，不用新规则重模拟。部署前结束进行中的战斗／活动／远征并备份；本次不执行部署。16的6144次测算保留为历史99上限基准，不代表无上限平衡验收。
- 历史规则记录：`rules-v14`／目录31（协议`docVersion: 15`，引擎不变；地区主副本及48项地区任务远征采用两张生成图＋经典终图，60图按12地区各5图入池，选择种子独立于战斗RNG，开局冻结`RunRecord.stages`；主副本每图8日共24日、任务每图2日共6日。保留六个三图固定经典副本clx-fe1/2/3/6/7/8，fe1／fe6地区2、fe2／fe7地区3、fe3／fe8地区5，每图2日共6日；同一副本UI选路线，无单独随机／经典分类，START_QUEST兼容。旧78项定义归档拒绝新开，旧进行中／待领奖仍列出，无stages旧远征沿旧路线继续。固定首通礼包普通／困难各一次，困难装备不同且更高阶、物品更多，仅完整通关自动入库，失败撤离作废；旧记录抑制对应难度补发，questsDone仅回退普通。dungeonFirstClearRewards/firstClearRewards返回normal/hard各自items/available，单图为null；GET_TODAY和副本预览提供dungeonStages，GET_QUESTS提供dungeonOnly/archived/stageNames，远征摘要提供stageNames/stageCount，副本人数上限覆盖所有图；随机战场新增交错遭遇、分进合击、分散据点，上场上限按地图／难度设置，敌军数量独立于己方人数。固定预览与实际部署一致，按提交顺序放置角色，超员／重复／不可用角色直接拒绝。地图不因换人、排序或重复预览重掷；整趟随机副本保存方案，旧战斗与远征不改图。困难需先普通通关对应地区野图或完整副本，每个内容独立解锁。单图地区任务保持普通一次性流程；任务形式的连战副本可在完整通关后重打，但固定任务奖励与首通探索度不重复发。旧档按真实普通完成历史补齐权限，非全局难度开关。野外及副本可选普通／困难战斗难度，难度冻结到战斗与远征；普通已支持集火与动态出手顺序，困难增加连续三次行动的有界搜索。困难新生成敌军含经典地图与每波增援：目标增加50%人数，额外人数向上取整、至少1人，以敌阵附近合法空位为限；等级独立随机+2～5、上限99，先计算新等级基础属性，再对HP随机增加20～35%，力量、魔力、技巧、速度、幸运、防御、魔防、魅力各独立随机增加10～25%，逐项向上取整、至少+1且不超过职业上限，体格随机+1～3；升级合法武器／法杖并配套熟练度，保留原有实用装备选项，职业与移动力不变。固定战斗／单位种子保证刷新不重随机，已保存敌军不重复加成，旧档默认普通，旧战斗与回放不回填。任务固定奖励与行动日成本不变，但更多、更高等级敌军带来更多战斗经验；携带装备不按概率掉落；竞技场维持普通）。此前`rules-v9`／目录24（治疗AI跟队、落点避险、治疗法术书与默认治疗行为识别；显式保存行为不重写，旧回放保持冻结）。此前`rules-v8`／目录23（冬季新战斗的雪地／冰面、重甲碎冰、大河浅洲及湖心群岛，见[03](03-combat.md)；旧战斗不重绘，旧规则回放保持冻结）。此前为`rules-v7`／目录22（目录22新增地区探索度及满100开通相邻新路线，计分与旧档兼容见[36](36-playtest-feedback.md)；目录21保留主角基础值并额外分配10点、每项最多加5点，已有角色不重算；目录20接入世界路线、地区商店与页面门禁；目录19修正自捏神主角与正式起装；目录18补齐十二地同预算声望路线，经典任务新奖励不再给地区声望；目录17接入特殊装备效果、法术效果、书／杖逐次扣次数与法术书物品化）。旧`rules-v6`／目录16为300项显式战技机制版本，旧回放只展示冻结终局。再早的`rules-v5`／目录15为共用五格版本，与当前不兼容，仅展示保存的冻结终局，不重模拟。此前`rules-v4`／目录14包含实物授予及精炼门槛，`rules-v3`／目录13包含原创效果、精通与强化研修；v4／v3及更早规则回放仅展示已保存冻结终局，不在新规则下重模拟。部署升级前先结束所有进行中的活动／远征及战斗，保留数据库备份。旧档缺失`equippedArts`时只迁移一次：先保留有效已选习得被动，再按原`learnedArts`顺序填剩余格，保留完整库且不增点／收费；后续空选择尊重为空。详见[28](28-class-art-learning.md)。
- 生产环境必须设置账号密码、限制数据库文件权限，并只暴露 API 端口；Agent token 与网页 token 不应共享权限。

## 4. 验证门禁

最近业务回归基线为后端711项；声望交付时前端4项、类型检查及构建通过，迁移交付时浏览器backend-integration 30项／systems 32项与相关审计复跑通过。各批次具体检查见34，历史测试总数不当作本次文档改动的新测试。本次文档收尾检查稳定ID／Beads对应关系、证据矩阵、相对文件链接、Git祖先和差异空白。真实多人／多进程压测、40～60小时人工试玩、生产实迁／恢复演练均未执行，分别见35。

```bash
python3 tools/audit/task-closure.py
git diff --check
python3 tools/audit/equipment-catalog.py
python3 tools/audit/weapon-art-catalog.py
python3 tools/audit/class-art-learning.py
python3 tools/classic-integration/build_catalog.py
python3 tools/classic-integration/build_adaptations.py
python3 tools/classic-integration/build_reports.py
npm --prefix backend test
node tools/audit/design-consistency.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run build
node frontend/test/backend-integration.e2e.mjs
node frontend/test/battle-replay.e2e.mjs
node frontend/test/systems.e2e.mjs
```

## 5. 已知边界

- 真人与Agent共用op；全部public op有schema条目，关键操作另有必填／枚举／范围校验，其余字段由handler校验；控制租约与命令幂等已实现。真实多连接／多进程的压力和竞争验收未执行，客户端恢复的具体边界见[14](14-integration-handoff.md)。
- SQLite 仍是首版存储；PostgreSQL 迁移触发条件、ADX/Canvas 表现技术未在本轮引入。
- 年度遭遇采样（`node tools/sim/campaign.ts`）覆盖8年度×12地区×2场＝192场；每场重新创建目标等级队伍，没有连续保存养成和经济数据。它不能证明完整4000日流程，BAL-04／`fe-world-gwd`保留开放；结果与首年伤亡见[34](34-task-closure.md)。
- 真实多人压力和逐图手感验收仍需在部署环境执行；35中分别记录执行次数，当前均为0。迁移工具完成也不代表生产旧档已经实迁或恢复演练通过。

## 6. 需求覆盖证据

| 范围 | 证据 |
| --- | --- |
| 经典关卡 | 60 图/18 副本；`classic-scenario.test.ts`、`classic-validation.ts`、逐图 adaptation report |
| 装备/法术/战技 | `equipment-catalog.py` 170、`weapon-art-catalog.py` 315、`original-arts.test.ts` 原创效果、`feature-completion.test.ts` 目录/次数/装备授予 |
| 职业/成长 | `class-abilities.ts` 58、`mastery.test.ts`、`growth.test.ts`、`permanent.test.ts` |
| 任务/地区 | 114项公开定义／12地区（108本地＋6保留经典副本），另保留78项归档查找定义（60经典单图＋18短经典副本）、`quests.test.ts`、远征stage goals／供给测试 |
| 竞技场/年度 | 普通竞技场每场 1 日、只进攻、实例 Ban、同形象限制、跨日结算；64 队签表；`arena.test.ts`、`annual.test.ts`、`api.test.ts` |
| 网页/交互 | 真实服务端名册、战报筛选、历史回放、实时观战只读轮询；`backend-integration.e2e.mjs`、`battle-replay.e2e.mjs`、`systems.e2e.mjs` |
| Agent/持久化 | 全op schema条目、控制租约、`commandId`、事务／版本、outbox、事件游标与显式旧档迁移测试；真实并发和生产演练另记 |
- 经典地图的敌军武器/AI 使用项目默认规则；逐图模板报告记录替换差异，但不是原作完整复刻。

# 首版交付与运行边界

更新：2026-10-18。本文是交付清单和运行/恢复说明，不把“目录存在”当作“运行时已完成”。

## 1. 内容清单

| 内容 | 数量 | 当前状态 | 验证 |
| --- | ---: | --- | --- |
| 经典地图 | 60 | 可创建战斗；物件、增援、宝箱/村庄、炮台、状态杖已接 | `classic-validation.ts`、`classic-scenario.test.ts`、`api/classic.test.ts` |
| 经典单图任务／副本 | 60 / 18 | 入口和结算已接 | `classic-quests.ts`、`api/classic.test.ts` |
| 装备／法术目录 | 170 | 113 武器/兽龙媒介、48 书、9 主动杖均已进入运行表；书/杖独立次数与武器耐久已接 | `tools/audit/equipment-catalog.py`、`item` 测试 |
| 武器战技 | 315 | 283参考＋17补充＋15原创；原创逐项结算、目标选择、网页／Agent预测及耐久支付已接；精通、研修和既有300项特殊效果继续收口 | `original-arts.test.ts`、`api/ui-protocol.test.ts`、`tools/audit/class-art-learning.py` |
| 职业目录 | 77 | 运行时可用；三个特殊机制中舞者/神乐再行动已接，战车直线攻击仍禁用 | `class-data` 测试 |
| 地区任务 | 12 地区 | 希尔瓦林地／托尔加丘陵／莱斯米尔湖镇完整 500 声望链；其余地区有基础三任务链 | `quests.test.ts` |
| 挑战塔 | 3 层 | 可开战、首通/重复奖励与保存 | `challenges.ts`、`api` 测试 |
| 酒馆 | 第二年季度候选 | 付费雇佣、候选不重掷 | `GET_TAVERN`／`HIRE_TAVERN` |

运行时与目录仍有差距：40 种法术中攻击/治疗/状态/功能杖已可施放，传送、临时墙、再生等特殊效果与 58 项职业固有/精通逐项运行时效果仍未全部接入；主动战技已可执行但缺少逐项 UI 与学习来源。发布时必须按“目录可用”和“运行时可用”分列，不能用一个总数掩盖差异。

## 2. 正常新档

1. 启动后端：`npm --prefix backend run dev`；前端：`npm --prefix frontend run dev`。
2. 新账号 `POST /api/login` 创建 D0 玩家；调用 `COMPLETE_SETUP` 自建主角并选择两名同伴。
3. 新档初始：D0、空地区进度、13,120 金币、0 公共经验、1 级三人队。
4. `SEED_DAY=999` 只用于测试夹具和演示，不是正式起点；不要用演示日期判断正式进度。

## 3. 部署、备份与恢复

- 默认数据库：`DB_PATH` 指向的 SQLite 文件；WAL 模式。
- 备份：停写或用 `sqlite3 "$DB_PATH" ".backup 'backup.sqlite'"`；同时保留 `-wal`/`-shm` 或在备份前 `PRAGMA wal_checkpoint(TRUNCATE)`。
- 恢复：先停服务，替换主库并删除旧 `-wal`/`-shm`，再启动；用 `GET_STATE` 和一次只读回放验证。
- 迁移：当前通过 `db.ts` 的 schema 初始化和兼容读取完成；正式迁移前先备份。旧 120 日存档的绝对日期、年龄、派遣/生产/年度报名仍需按版本换算，不能直接套新日历。
- 战技版本：新增原创效果与伤害修正采用`rules-v3`／目录11；`rules-v2`旧回放只展示已保存终局，不在新规则下重模拟。部署升级前先结束进行中的战斗／远征，保留数据库备份。
- 生产环境必须设置账号密码、限制数据库文件权限，并只暴露 API 端口；Agent token 与网页 token 不应共享权限。

## 4. 验证门禁

```bash
git diff --check
python3 tools/audit/equipment-catalog.py
python3 tools/audit/weapon-art-catalog.py
python3 tools/classic-integration/build_catalog.py
python3 tools/classic-integration/build_adaptations.py
python3 tools/classic-integration/build_reports.py
npm --prefix backend test
node tools/audit/design-consistency.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## 5. 已知边界

- 真人与 Agent 共用协议，但尚未完成所有新系统的逐 op schema、控制租约和多连接压力验收。
- SQLite 仍是首版存储；PostgreSQL 迁移触发条件、ADX/Canvas 表现技术未在本轮引入。
- 八年自动自play烟雾（`node --experimental-strip-types tools/sim/campaign.ts`）已覆盖 8 个年度、12 地区、每年 24 场，共 192 场规则 AI 对战；这不等于 40–60 小时人工试玩。
- 真实多人压力和逐图手感验收仍需在部署环境执行；现有自动测试不能替代人工证据。

## 6. 需求覆盖证据

| 范围 | 证据 |
| --- | --- |
| 经典关卡 | 60 图/18 副本；`classic-scenario.test.ts`、`classic-validation.ts`、逐图 adaptation report |
| 装备/法术/战技 | `equipment-catalog.py` 170、`weapon-art-catalog.py` 315、`original-arts.test.ts` 原创效果、`feature-completion.test.ts` 目录/次数/装备授予 |
| 职业/成长 | `class-abilities.ts` 58、`mastery.test.ts`、`growth.test.ts`、`permanent.test.ts` |
| 任务/地区 | 132 任务/12 地区、`quests.test.ts`、远征 stage goals/供给测试 |
| 竞技场/年度 | 1 日单场、实例 Ban、64 队签表、`arena.test.ts`、`annual.test.ts` |
| Agent/持久化 | 全 op schema、`commandId`、事务/版本、outbox、事件游标测试 |
- 经典地图的敌军武器/AI 使用项目默认规则；逐图模板报告记录替换差异，但不是原作完整复刻。

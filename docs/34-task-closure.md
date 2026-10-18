# 34 任务核对与本轮交付记录

日期：2026-10-18。本记录保存初次收口时`main`、[TODO](../TODO.md)稳定ID和Beads的核对证据；当时规则为`rules-v7`／目录18，存档schema为1、年度500日。后续开局、纪年、世界地图与页面开放修正见[36](36-playtest-feedback.md)。初表60项，后来新增ITEM-07和QUEST-06～09，现共65项：64项完成首版，BAL-04部分完成。完成首版不代表人工平衡、生产部署或参考作品全机制复刻通过。

## 本轮分别交付

| 项目 | 提交 | 验证与结果 |
| --- | --- | --- |
| 十二地区声望速度 | `8c70086` | 12地区各500声望、17图、32行动日；穷举全部合法完成集合，最早100／250／500声望统一为5／14／32日；后端702项、前端4项、类型检查／构建、浏览器backend-integration 30项及相关审计通过，见[20](20-region-quests-reputation.md) |
| 本地分支整合 | `dca536b` | 真正双亲合并，来源`464aaae`成为主线祖先；原型31项测试及独立类型检查通过，当前前端类型检查和链接审计通过；运行树相对上一项无变化，23个文件的处置见[32](32-branch-integration.md) |
| 旧档迁移 | `f0232c3` | 9项文件级迁移测试、后端711项、前端类型检查、浏览器backend-integration 30项／systems 32项及相关审计通过；覆盖预演、显式120／500日来源、WAL备份、回滚、重开、幂等与活动门禁，见[33](33-save-migration.md) |
| 任务与文档收尾 | 本记录所在提交 | 核对65项稳定ID、覆盖矩阵、真实Beads与JSONL状态、文档相对链接、Git祖先及差异空白；命令见下。不重复把此前业务测试记成文档改动新增的测试 |

前三项均已各自测试、提交并推送`origin/main`；本记录随第四项单独提交、推送。生产数据库实迁和真人参与的验收见[35 实际验收记录](35-release-validation-record.md)。

## 稳定ID与证据矩阵

下表按稳定ID分组。测试路径表示完成证据的来源，完整业务规则和首版边界仍在TODO各项说明中；本表不重新承诺历史草案或未采用机制。

| 范围 | ID数量 | Beads | 当前结论 | 主要实现／验证证据 |
| --- | ---: | --- | --- | --- |
| SETUP | 6 | `fe-world-8n4` | 完成首版 | [store.ts](../backend/api/store.ts)、[feature-completion.test.ts](../backend/api/feature-completion.test.ts)、[permanent.test.ts](../backend/api/permanent.test.ts) |
| CLASS | 7 | `fe-world-bwo` | 完成可确认的首版范围 | [classes.ts](../backend/common/data/classes.ts)、[mastery.test.ts](../backend/common/game/mastery.test.ts)、[classic-arts.test.ts](../backend/common/engine/classic-arts.test.ts)、[27 装备与法术](27-fortunes-weave-equipment-magic.md) |
| ITEM | 7 | `fe-world-07k` | 完成首版 | [equipment-sources.test.ts](../backend/api/equipment-sources.test.ts)、[equipment-acquisition.test.ts](../backend/api/equipment-acquisition.test.ts)、[production.test.ts](../backend/api/production.test.ts)、[22 资源规则](22-equipment-catalog.md) |
| QUEST | 9 | `fe-world-v8x` | 完成首版 | [quests.test.ts](../backend/common/game/quests.test.ts)、[API任务测试](../backend/api/quests.test.ts)、[经典地图测试](../backend/api/classic.test.ts)、[24 逐图验收](24-classic-scenarios-integration-todo.md) |
| ARENA | 5 | `fe-world-z2w` | 完成首版 | [api.test.ts](../backend/api/api.test.ts)、[annual.test.ts](../backend/api/annual.test.ts)、[systems.test.ts](../backend/api/systems.test.ts) |
| STORY | 3 | `fe-world-lzy` | 完成首版内容骨架 | [story.ts](../backend/common/game/story.ts)、[challenges.ts](../backend/common/game/challenges.ts)、[ui-support.test.ts](../backend/api/ui-support.test.ts) |
| UI | 4 | `fe-world-ilq` | 完成首版页面闭环 | [backend-integration.e2e.mjs](../frontend/test/backend-integration.e2e.mjs)、[battle-replay.e2e.mjs](../frontend/test/battle-replay.e2e.mjs)、[systems.e2e.mjs](../frontend/test/systems.e2e.mjs) |
| AGENT | 4 | `fe-world-7rv` | 完成首版 | [schemas.ts](../backend/common/protocol/schemas.ts)、[feature-completion.test.ts](../backend/api/feature-completion.test.ts)、[session.ts](../frontend/src/api/session.ts)、[14 接入边界](14-integration-handoff.md) |
| DATA | 5 | `fe-world-7m0` | 完成事务／版本／迁移基础 | [handlers.ts](../backend/api/handlers.ts)、[feature-completion.test.ts](../backend/api/feature-completion.test.ts)、[save-migration.test.ts](../backend/api/save-migration.test.ts)、[33 迁移边界](33-save-migration.md) |
| BAL | 4 | `fe-world-gwd` | 3项完成，BAL-04部分完成 | [dispatch.ts](../backend/common/game/dispatch.ts)、[quests.test.ts](../backend/common/game/quests.test.ts)、[campaign.ts](../tools/sim/campaign.ts)；连续八年养成／经济仍待验证 |
| DESIGN | 9 | `fe-world-mze` | 完成首版定案与边界记录 | [20 声望](20-region-quests-reputation.md)、[28 交付边界](28-release-readiness.md)、[29 架构决策](29-architecture-decisions.md) |
| DOC | 2 | `fe-world-mze` | 完成文档核对 | 本记录、[32 分支整合](32-branch-integration.md)、[33 存档迁移](33-save-migration.md)、[35 实际验收](35-release-validation-record.md) |

九个原来仍开放的实现／文档父任务据证据关闭；UI任务原已关闭。`fe-world-gwd`保留开放，避免把年度采样当成连续八年养成与经济验收。另有三个开放的实际验收任务：`fe-world-load`、`fe-world-play`、`fe-world-ops`，各自记录执行次数和证据，不能用自动测试总数销项。

## 八年脚本的真实范围与结果

本次执行`node tools/sim/campaign.ts`，覆盖8个年度×12地区×2场，共192场；183胜，胜率95.3125%。每场按当年目标等级重新创建8人队，不保存前场伤亡、资产、生产、任务或养成成果；各年度也不会依次消耗同一条4000日日历。它只验证当年遭遇战生成与规则AI运行，不是连续通关或经济仿真。

| 年度 | 采样日 | 队伍等级 | 胜场／24场 | 死亡人次 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 60 | 3 | 16 | 117 |
| 2 | 560 | 21 | 23 | 55 |
| 3 | 1060 | 36 | 24 | 19 |
| 4 | 1560 | 48 | 24 | 30 |
| 5 | 2060 | 58 | 24 | 2 |
| 6 | 2560 | 66 | 24 | 2 |
| 7 | 3060 | 74 | 24 | 0 |
| 8 | 3560 | 80 | 24 | 0 |

死亡为独立样本的累计人次，不能解释为一个真实军团的死亡人数。首年死亡较多，人工试玩应重点观察低级接敌、永久损失后的恢复和声望路线实际耗时；此处没有据采样结果修改平衡参数。BAL-04仍需连续保存名册／资产／伤亡、推进年度和主线、验证生产／派遣／收支与通关后活动的证据。

## 文档与任务检查

```bash
python tools/audit/task-closure.py
git merge-base --is-ancestor 464aaae HEAD
git diff --check
```

本次结果：65项稳定ID、12组覆盖矩阵及478个相对文件链接（40篇Markdown）通过检查；三项目录审计通过。审计脚本的三个负向夹具也均被拒绝：删除稳定ID、把未执行压测任务改成关闭、把未执行人工记录伪写为完成。Git祖先检查与差异空白检查通过。

`task-closure.py`检查稳定ID完整性、覆盖矩阵、Beads状态、独立验收记录和README／TODO／docs下Markdown相对文件链接。它不验证网页手感、多人吞吐或线上迁移成功。真实Dolt数据库与跟踪的JSONL共49条任务，45条关闭、4条开放，字段一致且Dolt工作集已提交；本次恢复的是本地任务服务，未配置或声称完成独立Dolt远端复制。任务快照通过本次Git提交发布。

# 32 · 本地v2分支整合记录

日期：2026-10-18。来源分支`codex/local-v2-before-remote-20261016`，独有提交`464aaae2a9d0ee5c32a9a152a244fbe2829fe135`。整合前主线为`8c70086`，包含55个来源分支尚未包含的提交；来源分支只有这一个独有提交，共23个文件、2,788行新增／202行删除。

## 整合结果

通过保留当前运行树的合并策略，将来源提交纳入`main`祖先，同时加入本记录并更新[14 接入说明](14-integration-handoff.md)。完整原型、契约、文档和测试由Git对象保存；不再依赖一条没有发布的本地分支。运行目录继续只有当前数字op协议与`src/api`／`src/battle`客户端。

来源原型以字符串操作、独立HTTP路径和mock服务为前提。直接覆盖会撤回已经落地的正式开局、日历、赛事、任务、物品与Agent控制；将原型作为另一套可执行入口保留也会产生两套不同契约。因此逐项确认可用机制的当前落点，其余保存为历史参考。

## 23个文件的处置

| 来源文件 | 数量 | 处置与当前落点 |
| --- | ---: | --- |
| `README.md`、`docs/06-agent-api.md`、`docs/07-architecture.md`、`docs/11-battle-engine-and-page.md` | 4 | 原型时代的协议／架构改写留存历史；当前以06、07、共享`ops.ts`／`schemas.ts`及生成的Agent文档为准 |
| `backend/common/protocol/v2.ts`、`v2.examples.ts` | 2 | 字符串op契约和示例归档。服务端并无对应v2路径，不纳入当前公共op表 |
| `frontend/src/game/client.ts`、`errors.ts`、`flows.ts`、`index.ts` | 4 | 客户端组合与流程原型归档；当前业务在`src/api/client.ts`／`session.ts`和`battle/session.ts` |
| `frontend/src/game/journal.ts`、`mock.ts`、`react.ts`、`resource.ts` | 4 | 持久待处理命令、mock与React资源层归档；当前会话不依赖mock，不宣称已具有原型的持久命令日志 |
| `frontend/src/game/runtime.ts`、`store.ts`、`sync.ts`、`transport.ts` | 4 | 运行时、版本状态机、同步与传输归档；已落地的`player.version`、`commandId`、报价与事件游标由当前前后端实现 |
| `frontend/test/functional.test.ts` | 1 | 31项原型测试保留并独立验证，不混入现行运行时的测试总数 |
| `frontend/tsconfig.logic.json` | 1 | 原型专用类型检查配置归档；现行`typecheck`／`test`脚本继续有效 |
| `frontend/package.json` | 1 | 原`test:logic`脚本归档；合并保留当前依赖及构建／测试脚本 |
| `docs/12-backend-domain-design.md` | 1 | 已吸收进[13 目标设计](13-backend-target-design.md)，后续定案在该文与当前实现继续维护；原始表结构仍可从来源提交读取 |
| `docs/13-frontend-functional-layer.md` | 1 | 独立前端原型设计归档，读取命令见下；当前接入方式重写于14 |
| 合计 | 23 | 所有文件都有明确处置，完整来源提交作为合并父历史保留 |

当前缺少的`GET_COMMAND_STATUS`、`GET_CAPABILITIES`、`/api/v2/*`与跨页面重载的持久命令日志，是原型假设或后续候选；没有为完成分支归档而虚构线上支持。已有幂等收据、原子提交、版本报价、断线重试和事件补拉继续由现行协议覆盖。

## 独立验证

在临时detached worktree检出`464aaae`，使用Node.js 22.22.0；依赖通过临时目录联接复用当前`frontend/node_modules`，没有修改来源提交或安装另一套生产依赖：

```powershell
git worktree add --detach ../FE_World-v2-audit-20261018 464aaae
# 为临时frontend目录提供依赖后执行：
node frontend/node_modules/typescript/bin/tsc -p ../FE_World-v2-audit-20261018/frontend/tsconfig.logic.json
node --test ../FE_World-v2-audit-20261018/frontend/test/functional.test.ts
# 完成后移除临时依赖联接并清理worktree。
```

结果：原型TypeScript检查通过，功能测试31／31通过。当前运行树与整合前`8c70086`的`backend`／`frontend`无内容差异，当前前端类型检查通过；声望提交刚完成的702项后端测试、4项前端测试、网页30项和构建仍对应同一运行树。本项不把文档／历史合并当作新的游戏功能验收。

## 追溯与后续分支检查

```powershell
git merge-base --is-ancestor 464aaae main
git log --left-right --oneline main...codex/local-v2-before-remote-20261016
git show 464aaae:docs/13-frontend-functional-layer.md
git show 464aaae:frontend/src/game/journal.ts
git ls-tree -r --name-only 464aaae -- backend/common/protocol frontend/src/game frontend/test
```

整合后第一条应退出0，第二条不应再有来源分支独有的`>`提交。推送`main`会同时发布来源提交和此处置记录；本地来源分支保留用于定位，不要求删除。没有执行生产部署、真实多人压测或人工试玩。

# 13 前端功能层：给 UI 开发者的接入指南

> 2026-10-16。本文对应已经实现的 `frontend/src/game/`，使用 [v2 类型契约](../backend/common/protocol/v2.ts) 与 [06 接口设计](06-agent-api.md)。不包含页面、样式和美术。现有 `App.tsx`、战斗页和竞技场页仍使用原来的引擎 v1 单机原型，尚未改接此模块。

## 1. 已实现什么

| 模块 | 已实现行为 |
| --- | --- |
| `transport.ts` | HTTP查询／写入分别发送到v2端点；会话cookie；超时、取消、结构化API错误和响应信封校验；写入不自动换编号重试 |
| `client.ts` | 类型化调用全部v2操作；能力检查；player／battle预期版本；单个未决写命令；命令状态查询与原意图恢复 |
| `journal.ts` | 写入前保存意图；按后端和账号隔离；内存或注入的Storage；损坏／配额失败显式报错，不偷偷丢弃未决命令 |
| `store.ts` | 可订阅的不可变状态；旧版本不覆盖新版本；跨活动丢弃旧战斗；游标用BigInt比较；有界事件记录 |
| `resource.ts` | 页面查询的loading／ready／error；选择切换时取消旧查询；丢弃迟到结果；个人版本变化后自动失效并重载 |
| `sync.ts` | 事件分页、重复通知合并、游标过期全量同步；WebSocket通知重连与HTTP轮询兜底；停止时释放连接／定时器 |
| `flows.ts` | 日历动作报价确认、继续连战、部署、动作预测／提交、结束阶段、撤离、传承预览确认；不在前端计算最终成长或胜负 |
| `mock.ts` | 营地、连战关间、战斗中三个隔离场景；十二地区读取；报价／创建活动／继续下一图／部署／撤离演示 |
| `runtime.ts` | 创建与管理上述模块；显式mock／http模式；停止订阅可重启，彻底dispose时清除账号缓存和页面资源 |
| `react.ts` | `useGameSnapshot`和`useResourceSnapshot`，通过useSyncExternalStore接入React |

真实战斗、完整经济、招募、传承、轮回和赛事结算仍需后端实现。客户端已经可发送其契约命令；mock对未实现的模拟行为返回FEATURE_DISABLED，不伪造成功。当前mock不提供UNIT_ACT、END_PHASE和精工小游戏判定，也不调用引擎v1冒充新规则。

## 2. 创建一个 runtime

在UI应用入口创建一次，后续页面共用。以下代码假设放在 `frontend/src/` 下：

```ts
import { createGameRuntime } from './game/index.ts';

export const game = createGameRuntime({
  mode: 'mock',
  scenario: 'dungeon',
  storage: window.sessionStorage,
});

await game.start();
```

三个场景：`camp`没有活动；`dungeon`在第一张图后，有一名已死队员、17HP及中毒的存活者；`battle`展示已经开始的公开战斗。mock状态与收据只在内存，页面刷新会重建场景；它用于UI联调，不作为真实跨刷新存档。可以省略storage使用内存journal，`game.persistence`会明确返回memory；真实使用建议注入sessionStorage，保证刷新后仍能识别未决命令。

接真实后端时显式切换模式：

```ts
export const game = createGameRuntime({
  mode: 'http',
  baseUrl: '',
  socketUrl: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/v2/ws`,
  storage: window.sessionStorage,
});
await game.start();
```

空baseUrl表示同源。若HTTP和UI不同源，需要后端正确配置会话cookie与允许的凭据来源；登录会话先由认证模块建立。凭据不放进URL、UI状态、日志或journal。未配置socketUrl时使用HTTP轮询；HTTP失败不会自动切成mock。

`start()`可在页面effect中调用，cleanup用`stop()`，之后可以再次start，支持开发模式的effect重挂载。退出账号／切换后端时使用`dispose()`并创建新的runtime。不要把dispose作为一个将继续复用相同runtime的effect清理动作；已经dispose的实例不可重新使用。

## 3. 订阅状态与读取页面数据

```ts
import { useGameSnapshot, useResourceSnapshot } from './game/react.ts';

const snapshot = useGameSnapshot(game.store);
// snapshot.player / run / battle / pending / error / connection

// Create one resource per mounted page or stable query; dispose it on unmount.
const roster = game.resource('GET_ROSTER');
await roster.load({ status: 'active', cursor: null });
const rosterSnapshot = roster.getSnapshot();
// In React: useResourceSnapshot(roster).
```

不要在每次render里新建runtime或resource；使用模块单例、上下文或稳定useMemo。页面卸载时`resource.dispose()`，阻止迟到结果与重复订阅。所有查询操作均可创建resource，因此名册、仓库、商店、生产、任务、见闻、历史赛事等不需要各写一套网络状态管理。

查询返回值与状态快照不可直接修改。金币、日期、属性、状态和物品来自后端响应；UI只保留选中项、弹窗、动画和表单草稿。新的playerVersion会自动刷新已加载resource；请求期间显示loading，不能把上一名角色的信息继续当作新选中角色。

`snapshot.run`是唯一正在进行的正式活动。连战关间继续时显示其recovery、survivingUnitIds、blockers；不能从静态报名名单重新生成满状态队伍。`snapshot.battle.processing`为true时禁用玩家动作，END_PHASE收到processing:true后会立即进入该状态，待服务端同步恢复。

## 4. 报价与业务流程

```ts
const quote = await game.flows.previewAction({
  kind: 'start_dungeon',
  regionId: 'region-03',
  stageId: 'abandoned_mine',
  unitIds: ['unit-demo-01', 'unit-demo-03'],
  itemIds: ['item-demo-01'],
});

// Present cost, date range, blockers and permadeath risk; execute after the player's choice.
await game.flows.executeQuote(quote);
```

报价版本变化、已过期或有blockers时拒绝执行，要求重新预览；不会在后台套用一个更贵的新报价。UI保留“确认”这一步的控制权，功能层不自作主张进入新战斗或更改路线。

连战：`previewContinue()`→显示报价→`executeQuote()`→`deploy()`。固定名单／存活者之外的部署会在客户端提前拒绝，最终仍由后端验证。战斗：`reachable()`／`forecast()`查询，`act()`与`endPhase()`写入，`withdraw()`退出当前活动；都携带正确版本，不修改本地规则状态来假装已经提交。

传承：`previewLegacy()`返回含playerVersion的预览，UI显示截断目标和保底曲线，再`claimLegacy(preview,itemId,weights)`。其他军团、商店、招募、生产和任务功能可直接使用通用命令入口：

```ts
await game.client.command('EQUIP_SKILLS', {
  unitId: selectedUnitId,
  skillIds: selectedSkillIds,
});
```

先用`client.supports(op)`与模块feature开关显示可用性。generic command带版本、幂等和journal，不能绕过它自行fetch写端点；同一时刻只有一个写意图，UI展示pending并禁用重复提交。类型来自v2，传错字段会在编译时报错。

## 5. 断线、重试与账号隔离

- 请求明确业务失败时清除pending并显示错误；不得自动换编号重复购买、退役或开战。
- 超时、连接中断或响应损坏时保留`pending.status=uncertain`，阻止新写入；刷新正式数据也不能自行宣称原命令没提交。
- 用`await game.client.resumePending()`先查GET_COMMAND_STATUS。已提交则接收原结果，未知则重发**同commandId、同负载、同预期版本**；只换连接seq。已提交结果比当前状态旧时，不倒退当前状态。
- 重连只补事件与正式状态，不会静默重发所有点击。pending恢复入口由UI明确展示；保存journal不包含认证信息或完整养成存档。
- 登录失效进入error状态；重新登录同账号可initialize，切换账号须dispose后创建新runtime。注销清除内存中的个人状态，原账号的未决journal保留在其隔离命名空间，避免下一账号误领。
- storage不可读／不可写时显式报错，不能悄悄删除pending再允许第二次支付。UI可提供诊断与刷新入口，但不要自动清空journal来“修复”。

## 6. 接入范围与检查

本轮没有修改现有页面、路由、CSS或像素素材。UI开发者应从game入口接入新页面；现有演示App直到迁移前仍是原型流程，与新runtime互相隔离。

PowerShell可直接执行：

```powershell
npm --prefix frontend run test:logic
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

预期：功能层测试全部通过；生产代码和测试类型检查无错误；原前端构建成功；diff无空白错误。新增测试覆盖已提交但响应丢失、未知命令原意图重发、持久化失败、并发写入、旧响应、查询竞态、事件分页／去重／全量重同步、HTTP超时与取消、连战状态及资源清理。

本轮通过Beads记录为 `fe-world-ij5`。服务端尚未运行，因此真实cookie认证、WebSocket联机和后端规则结算需要后续集成验收；本轮传输与故障处理使用可控transport验证。

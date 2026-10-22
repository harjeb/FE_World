# 06 Agent 接口接入与当前协议

当前协议 **docVersion 51**，引擎 **1**，战斗规则 **rules-v28**，目录 **68**。运行中服务以 `GET /api/health` 和 `GET /agent-api.json` 返回的版本为准；旧规则回放保持冻结。本次只更新接入，不改变战斗、存档或目录规则。

## 获取接入信息

网页「设置 → Agent 接入 → 取得接入令牌」提供：

- **复制**：仅复制 `sk_` 令牌；HTTPS 优先用 Clipboard API，HTTP 或权限拒绝时尝试兼容复制。失败会显示令牌并提示手动选中，不虚报成功。
- **复制给 AI**：一次复制令牌、当前实际访问的 HTTP API 地址、WebSocket 地址、协议版本、Markdown／JSON 文档地址和 MCP 环境变量说明。
- **重置令牌**：玩家确认后撤销该账号全部旧 Agent 令牌；旧 HTTP 凭据和已登录 WebSocket 的后续请求立即失效，并释放 Agent 持有的控制租约。网页会话、角色、物品和进度不重置。新令牌需重新配置给 Agent。

公网 HTTPS 页面使用 `https://实际域名` 和 `wss://实际域名/ws`，不复制后端内部的 localhost。开发服务器代理 `/api`、`/agent-api` 和 `/ws`。反向代理应正确设置 Host 或 `X-Forwarded-Host`／`X-Forwarded-Proto`；这些头仅用于接入地址展示，不决定账号权限。

令牌具有代玩权限，不得写入仓库、聊天公开记录或公开日志。当前网页仍支持仅用户名的原型登录，不能把接入修复理解为公网账号安全已经验收；公开服务前必须完成账号认证与部署安全检查，见[28](28-release-readiness.md)及[35](35-release-validation-record.md)。

## 三种调用方式

### HTTP

```http
POST /api/op
Authorization: Bearer <sk_令牌>
Content-Type: application/json

{"op":10,"seq":1,"data":{}}
```

成功响应为 `{op,seq,ok:true,data}`，失败为 `{op,seq,ok:false,error:{code,message,action}}`。读取响应的 `ok`，不能只看 HTTP 状态。Agent 和网页共用数字 op、业务校验、事务、命令收据与存档。

| 路径 | 作用 |
| --- | --- |
| `POST /api/login` | 网页账号登录／原型注册，取得网页会话；不是 MCP 工具 |
| `GET /api/agent-token` | 用有效凭据读取或首次生成 Agent 令牌；返回 `token/apiUrl/ws/docs` 及四项版本信息，不轮换旧令牌 |
| `POST /api/agent-token` | 仅玩家凭据可重置 Agent 令牌；Agent 自身不能调用 |
| `POST /api/op` | 使用 Bearer 凭据调用全部业务 op |
| `GET /api/health` | 服务状态及 `docVersion/engineVersion/rulesetVersion/catalogVersion` |
| `GET /agent-api.md` | 服务当前自动生成的人读文档 |
| `GET /agent-api.json` | 全 op 清单、参数 schema、错误动作及四项版本信息 |
| `GET /agent-api/changes/{v}` | 从已知版本到当前版本的增量变更 |

### WebSocket

连接接入信息中的 `/ws`，先发送：

```json
{"op":1,"seq":1,"data":{"token":"<sk_令牌>","docVersion":51,"agentModel":"你的模型名"}}
```

LOGIN 返回当前 `docVersion`；版本不一致时带 `docNotice`。之后复用相同 `{op,seq,data}` 格式调用业务操作；响应按 `seq` 对应，推送 `{op,data}` 没有 `seq`。LOGOUT 为 op 2。令牌重置后，旧连接必须用新令牌重新 LOGIN。

### MCP（stdio）

由客户端启动项目内的 `node mcp/server.ts`，设置进程环境变量：

```text
API_URL=https://你的实际域名
AGENT_TOKEN=<sk_令牌>
```

本地开发的 `API_URL` 默认 `http://localhost:8525`；公网接入应使用「复制给 AI」中的实际地址。MCP 不是额外的公开 HTTP 服务，也不提供 LOGIN／LOGOUT 工具。

工具从共享 op 表和 schema 自动生成：当前 **109个业务工具**，覆盖网页业务操作；另外2个 WebSocket 会话请求和6种服务端推送不作为 MCP 工具。参数推荐嵌套形式，也兼容相同 schema 的旧平铺形式：

```json
{"name":"get_unit","arguments":{"data":{"unitId":"u_erin"}}}
```

写操作自动补 `commandId`，网络断开或响应解析失败时复用同一 ID 重试一次。最终“操作结果未确认”错误会给出 ID：先查询实际状态，再用该 `data.commandId` 重试，不能生成新 ID 重做。业务拒绝不自动重试。认证失效应更新 `AGENT_TOKEN` 并重启 MCP，而不是调用不存在的 LOGIN 工具。JSON-RPC 通知不产生响应。

## 完整业务能力与唯一契约

**不要以手写的旧 op 草案或下表代替完整接口清单。** 全部111个可调用请求及每个字段的必填、类型、枚举和范围以[自动生成文档](agent-api.md)、根目录 `agent-api.json` 和 `backend/common/protocol/ops.ts`／`schemas.ts` 为准；深层合法性继续由对应业务处理器校验。

| 业务 | 当前入口示例 |
| --- | --- |
| 账号／开局／路线 | `GET_STATE`、`COMPLETE_SETUP`、`GET_WORLD_MAP`、`CHOOSE_ROUTE` |
| 名册／装备／成长 | `GET_ROSTER`、`GET_UNIT`、`TRANSFER_ITEM`、`PROMOTE`、`SWITCH_CLASS`、`ASSIGN_BEXP`、`CLAIM_LEGACY` |
| 商店／工坊／恢复 | `GET_SHOP`、`BUY`、`SELL`、`START_PRODUCTION`、`REPAIR_ITEM`、`REFINE_WEAPON`、`INN_REST`、`USE_FOOD` |
| 日期／训练／招募／派遣 | `GET_TODAY`、`REST`、`TRAIN`、`TRAIN_ART`、`RECRUIT`、`HIRE_TAVERN`、`START_DISPATCH` |
| 出征／任务／副本 | `PREVIEW_ACTION`、`EXECUTE_ACTION`、`SORTIE`、`START_QUEST`、`START_DUNGEON`、`CONTINUE_DUNGEON` |
| 战斗查询／行动 | `GET_BATTLE`、`GET_REACHABLE`、`GET_THREAT_MAP`、`PREVIEW_COMBAT`、`UNIT_ACT`、`END_PHASE`、`RETREAT` |
| 竞技场／年度／挑战／时空 | `GET_ARENA`、`ARENA_ATTACK`、`REGISTER_ANNUAL`、`START_CHALLENGE`、`GET_CROSS_TIME_RECRUITS` |
| 回放／控制／叙事 | `GET_REPLAYS`、`GET_REPLAY`、`CLAIM_CONTROL`、`RELEASE_CONTROL`、`AGENT_REPORT_PLAN`、`AGENT_PHASE_NOTE` |

`UNIT_ACT` 支持 attack/heal/item/seize/escape/interact/wait/dance/art/cast/staff；复杂战技的 `allyId/secondaryId/postTo/support`、法术及功能杖的 `spell/dest` 与网页共用预测和真实执行路径，不能只实现普通攻击。战斗查询由服务端回答真实地形、移动、射程、伤害、命中、必杀与威胁，不要求 Agent 自行重写引擎。

## 最新玩法的 API 约定

- 先读 `GET_STATE` 的功能门禁和 `GET_TODAY`，再按 `PREVIEW_ACTION` 的费用、阻挡条件、地图和敌军选择队伍；报价绑定玩家版本，`EXECUTE_ACTION` 执行同一报价。`unitIds` 是有序、互不重复、当前可用的实例ID，首位为主将，不能超当前地图／难度上限。
- 普通随机野图按实际出战均级向下取整，小怪固定随机−1～+1，Boss基础+4，再叠困难；仅全局99级限制。Boss使用自身职业150%成长和按等级推进的熟练度，不复制小怪属性。`GET_TODAY.sortieRegions[].level` 仍是日期提示，不是实际野图等级，应看预览。
- `encounter.enemyCount` 仅计初始敌军；可选 `reinforcements:[{turn,count}]` 和 `turnLimit` 冻结后续波次与回合上限。开局普通6～10人，后期几十人并带增援；按可用名册约束后的出战上限分级，实际少选人不减怪。第3／5／7章起1／2／3波，于第5／9／13回合我方阶段开始进场，提前一回合预警；击败主将可直接结束，旧遭遇不补波次。
- 普通野图胜利解锁本地区困难，完整普通副本解锁相同副本困难；分别读 `GET_STATE.hardUnlocks` 和 `GET_QUESTS.hardAvailable/hardUnlocked`。困难初始与增援人数+50%只计算一次，等级、属性与装备另有已冻结强化。不是全局难度开关。
- 标准副本、地区任务远征和六条固定经典路线共3图、8日，逐图3／3／2；普通野图2日。`dungeonStages` 提供场景名／ID，`GET_RUN` 返回冻结路线、跨图状态和待结算掉落。既有远征保留旧费用和配置。
- `dungeonFirstClearRewards`／`firstClearRewards` 返回 `{normal:{items,available},hard:{items,available}}`，两难度各一次，仅完整通关入库，失败／撤离不发。手动任务奖励与探索度跨难度仍仅一次；单图任务该字段为null。归档任务不能新开，但旧进行中／待领奖仍可继续。
- 击杀Boss额外20 EXP并保留在等级差衰减之后；普通同级击杀30，Boss同级50，高出敌人至少5级时普通1／Boss击杀21，单次上限100。预览与实战共用经验公式。
- HP上限150，其余八项属性无上限，`caps` 中null表示无上限；等级99。旧存档、已领取奖励与冻结战场不因客户端升级重新计算。

## 覆盖与验收边界

所有公开请求有共享 schema，109个业务请求有处理器，MCP工具覆盖网页引用的 op，并有复杂动作、命令幂等、失联恢复和预览／实战一致性测试。**这证明首版业务链路，不等于已经逐一验收所有请求的真实 Agent 长流程、多人压力或公网安全。** 相应记录见[35](35-release-validation-record.md)。协议通过 `npm --prefix backend run docs` 重新生成，`node --test mcp/*.test.ts` 校验工具覆盖和契约；不要仅手动改版本号。

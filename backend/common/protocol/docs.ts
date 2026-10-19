// Generates docs/agent-api.md and agent-api.json from the op table (docs/06「协议只在 common 定义一处」).
// The API serves the JSON at /agent-api.json; a test keeps the checked-in markdown in sync.
import { DOC_VERSION, ERRORS, OPS, PUSH_OPS } from './ops.ts';
import { schemaFor, type OpSchema } from './schemas.ts';

export interface ApiDoc {
  docVersion: number;
  frames: Record<string, string>;
  ops: { op: number; name: string; group: string; push: boolean; agentNote: string; dataSchema?: OpSchema & { type: 'object'; additionalProperties: false } }[];
  errors: { code: string; meaning: string; action: string }[];
}

export function apiDoc(): ApiDoc {
  return {
    docVersion: DOC_VERSION,
    frames: {
      request: '{ op: number, seq: number, data?: object }',
      response: '{ op: number, seq: number, ok: boolean, data?: object, error?: { code, message, action } }',
      push: '{ op: number, data: object }（推送帧没有 seq）',
    },
    ops: OPS.map(def => {
      const schema = schemaFor(def.name);
      return { ...def, push: PUSH_OPS.has(def.op), ...(schema && !PUSH_OPS.has(def.op) ? { dataSchema: { type: 'object' as const, ...schema, additionalProperties: false as const } } : {}) };
    }),
    errors: ERRORS.map(def => ({ ...def })),
  };
}

export function renderMarkdown(): string {
  const lines: string[] = [];
  lines.push('# Agent 接口文档（自动生成）', '');
  lines.push(`docVersion: ${DOC_VERSION}`, '');
  lines.push('本文件由 `backend/common/protocol/ops.ts` 与 `schemas.ts` 生成，不要手改。', '');
  lines.push('每个请求的完整参数见 `/agent-api.json` 中对应 op 的 `dataSchema`，与 MCP 的 `data` 参数声明共用来源。', '');
  lines.push('MCP 使用 `AGENT_TOKEN` 认证，不提供 WebSocket 专用的 LOGIN／LOGOUT。写操作自动附带 commandId，连接或响应解析失败时使用同一 ID 重试一次；仍无法确认时错误会返回该 ID，后续重试必须复用 data.commandId。', '');
  lines.push('SORTIE、START_DUNGEON 和任务连战副本的 START_QUEST 支持 aiDifficulty: normal | hard（默认 normal）。困难需先普通通关相同内容：野外胜利解锁本地区困难野图，普通完整通关解锁本副本；两者互不替代，失败、中间图和困难胜利不算。单图任务保持普通一次性流程。读取 GET_STATE.hardUnlocks.regions/dungeons/quests 或 GET_QUESTS.hardAvailable/hardUnlocked 判断；直接请求未解锁 hard 会被拒绝，预览列出 blockers。任务副本可重打，但固定任务奖励与首通探索不重复发。旧档按真实普通胜利与完整通关记录补齐，缺失难度按普通，不从模糊完成标记推定。normal 已会集火与调整出手顺序，hard 进一步搜索连续三次行动的走位和配合。困难初始敌阵和增援人数增加50%（向上取整，附近合法空位为限），等级随机+2～5（上限99），按提高后的等级计算基础属性，再给HP随机+20%～35%、其余八项能力各+10%～25%、体格+1～3；能力加成向上取整且至少+1，受职业上限约束，移动力不变；配备更强装备及对应熟练度。独立种子固定生成结果，刷新不重掷、旧单位不重加。耗日及任务固定奖励不变，随机战场的出战上限和敌军规模由地图／难度配置决定，更多高等级敌人会自然增加战斗经验，敌军携带装备不会按概率掉落。远征全程锁定，缺失字段的旧战斗／远征按 normal 返回。battle.aiDifficulty 与 GET_RUN.run.aiDifficulty 返回当前设置；PREVIEW_ACTION 的 sortie／dungeon 报价 payload.aiDifficulty 保留设置，EXECUTE_ACTION 按报价执行。其他模式保持 normal。', '');
  lines.push('随机野外与随机副本先确定战场，再选择队伍：GET_TODAY.sortieRegions 的 encounters／dungeonEncounters 分别提供 normal、hard 的布局、尺寸、maxUnits 与 enemyCount；少带人不会减少敌军。同一账号、日期、地区与活动的战场固定，刷新、换队或切换难度不会重抽布局；推进日期后才更新。PREVIEW_ACTION 返回 encounter.map 的真实地形、双方出生点与 playerGroups，报价按玩家版本绑定。出征名单按unitIds数组顺序分配到map.spawns.player对应落点，首位为主将；必须互不重复、可用且不超过该图该难度的上限；副本开局保存RunRecord.stages，出战上限取整趟所有图的限制（含经典终图）。地图布局含交错遭遇、隔墙分队会合和分散据点；已保存战场不重排。', '');
  lines.push('连续副本按难度分别计固定首通奖励：地区主副本按地区、地区任务远征及经典副本按任务ID，normal/hard各一次。普通为一件固定地区装备、2份伤药、1份完整料理；困难为不同且更高阶的固定装备、4份伤药、2份完整料理，不抽概率。仅完整通关自动入库，中间图不发，失败／撤离作废。GET_TODAY.sortieRegions[].dungeonFirstClearRewards 与 GET_QUESTS.firstClearRewards 返回 {normal:{items,available},hard:{items,available}}，替代旧单数属性；单图任务为null。GET_RUN.run.pendingLoot记录整趟掉落，完整结算后为已入库清单。手动任务奖励与首通探索跨难度仍仅一次。旧完成记录抑制对应难度补发，questsDone仅回退普通档，困难完成独立判断。', '');
  lines.push('副本统一UI内选择路线，不另设随机／经典导航分类。GET_TODAY.sortieRegions[].dungeonStages与PREVIEW_ACTION(dungeon).dungeonStages为{name,scenarioId?}数组：两张生成图＋一张经典终图，全部60张经典地图分为12地区各5张的池，选择种子独立于战斗RNG并在出发时冻结。标准副本每图8日共24日，48项地区任务远征每图2日共6日。固定经典保留六个三图副本clx-fe1/2/3/6/7/8，每作一个，fe1/fe6在地区2、fe2/fe7在地区3、fe3/fe8在地区5，每图2日共6日；START_QUEST继续兼容。GET_QUESTS返回dungeonOnly、archived、stageNames；公开114项定义（108本地＋6经典），78项旧定义（60单图＋18短经典）仅保留查找，拒绝新开，旧进行中／待领奖仍列出。GET_RUN摘要返回stageNames/stageCount；没有stages的旧远征由CONTINUE_DUNGEON沿旧路线继续。', '');
  lines.push('## 帧格式', '');
  lines.push('```');
  lines.push('请求  { op, seq, data? }');
  lines.push('响应  { op, seq, ok, data? | error: { code, message, action } }');
  lines.push('推送  { op, data }');
  lines.push('```', '');
  lines.push('## op 清单', '');
  let group = '';
  for (const def of OPS) {
    if (def.group !== group) {
      group = def.group;
      lines.push(`### ${group}`, '');
      lines.push('| op | 名称 | 说明 |', '| --- | --- | --- |');
    }
    lines.push(`| ${def.op} | ${def.name} | ${def.agentNote} |`);
  }
  lines.push('', '## 错误码', '');
  lines.push('| 错误码 | 含义 | action（写给 Agent） |', '| --- | --- | --- |');
  for (const def of ERRORS) lines.push(`| ${def.code} | ${def.meaning} | ${def.action} |`);
  lines.push('');
  return lines.join('\n');
}

// docs/06「版本只加不改」: GET /agent-api/changes/{v} returns all later changes.
export function changesSince(version: number): { from: number; to: number; changes: string[] } | null {
  if (!Number.isInteger(version) || version > DOC_VERSION) return null;
  const releases = [
    { version: 1, text: 'v1: 首次发布。' },
    { version: 2, text: 'v2: 新增 WITHDRAW_ANNUAL(113)；年度赛事锁定报名培养和物资；START_MAIN_STAGE兼容入口也要求年度报名；任务预览补齐敌军等级、日期、风险及额外物资。' },
    { version: 3, text: 'v3: COMPLETE_SETUP改为神主角完整属性分配：固定平民与成长型，60点直接填写九属性，倾向自动推导；setup.protagonist返回固定配置与逐属性上下限，初始三人使用E级基础装备。' },
    { version: 4, text: 'v4: 新增世界地图开荒：GET_WORLD_MAP(141) 与 CHOOSE_ROUTE(142)；开局不再默认全地区可出击，先选起步路线（1–4，不耗日）、清剿后再解锁相邻地区；GET_TODAY.sortieRegions、任务、剧情、挑战塔与工坊设施按解锁进度过滤，出击／副本／派遣／招募／声望商店按地区拦截；王都商店收缩为 E 级基础装备与常用补给，进阶武器迁往地区声望商店；旧存档按讨伐、声望、任务与既有战斗／远征／派遣自动认领地区，不重置任何养成数据。' },
    { version: 5, text: 'v5: COMPLETE_SETUP保留固定基础属性，allocation改为额外10点加成，每项0–5、未填按0计；GET_STATE.setup.protagonist新增baseStats，默认加点为0，倾向只按额外加点推导。已有角色属性与成长不重算。' },
    { version: 6, text: 'v6: 十二地区新增持久化flags.regionExploration（0–100，新账号为0）；普通随机野外遭遇战胜利+3，单图任务完成+5，每个副本（含多图任务）仅首次完整通关+20，中间图及重复副本不增加，任务与副本不叠加；单独领奖、失败、撤退、扫荡和后台派遣均+0。初选1–4自由，之后须将已开通地区探索至100才可开通其相邻新路线，已开通地区仍可访问；探索度独立于clearedRegions，首次胜利仍按原规则开放战斗功能与扫荡。旧档仅在缺失探索度字段时惰性初始化，只有此前已讨伐地区设为100，其他地区为0，既有探索度不再次回填，已开通权限与历史数据保留。世界、任务、随机野外准备及副本准备页展示探索条。' },
    { version: 7, text: 'v7: 补齐请求参数 schema 与公共 commandId，agent-api.json 同步提供 dataSchema；MCP 排除 WebSocket 专用 LOGIN／LOGOUT，写操作使用稳定命令 ID 重试并在结果未确认时返回恢复 ID；维修纳入控制权、赛事、战斗和版本校验，报价执行复用同一操作校验且仅递增一次版本；GET_AGENT_INFO 按账号最近五分钟心跳判断在线。' },
    { version: 8, text: 'v8: 冬季新战斗草地转雪地、水域与浅滩转冰面，行动起点雪地移动−1／冰面+1，飞行不受影响；重甲踩过的冰格永久碎为水域。GET_BATTLE新增map.season及单位terrain/move/moveType/armored，GET_REACHABLE新增move和stops[].path；terrain事件记录碎冰，完整状态保留动态地形。瓦恩要塞与莱斯米尔湖镇新增大河浅洲／湖心群岛野图。规则rules-v8、目录23；旧战斗地图不重绘，旧规则回放保持冻结。' },
    { version: 9, text: 'v9: SORTIE、START_DUNGEON、START_QUEST 新增可选 aiDifficulty（normal／hard，默认 normal）；战斗与远征摘要返回规范化设置，多图继承出发设置且不可中途修改；PREVIEW_ACTION 的 sortie／dungeon 报价保留设置并由 EXECUTE_ACTION 执行。难度仅改变敌方决策，不改变地图、属性、费用或奖励；竞技场、年度赛、挑战及陪练仍为 normal。' },
    { version: 10, text: 'v10: hard 同时增强新生成敌军（含初始编队、首领、后续增援）：HP+20%、力量／魔力+10%，向上取整且受职业上限约束；人数、等级、其他属性、装备、奖励及耗日不额外增加。增强仅在生成时应用，已保存单位不重复加成；出征页和报价说明增幅。规则rules-v11、目录26；升级前结束活动，旧规则回放保持冻结。' },
    { version: 11, text: 'v11: 困难初始敌阵和增援约+50%人数，等级随机+2～5，HP随机+20%～35%、其余能力+10%～25%、体格+1～3，装备及熟练度升级，移动力不变；独立种子固定随机强化，不改变战斗随机流或重掷已保存单位。新增敌人仅使用原阵附近合法空位，不挤占部署、物件或目标格。耗日与固定任务奖励不变，战斗经验与掉落按实际敌军结算。规则rules-v12、目录27；升级前结束活动，旧规则回放保持冻结。' },
    { version: 12, text: 'v12: 困难版改为按内容解锁：普通地区野外胜利／普通完整随机副本／普通完整任务连战副本分别开放自己的hard。GET_STATE新增hardUnlocks三类列表，GET_TODAY地区行新增hardUnlocked/dungeonHardUnlocked，GET_QUESTS新增hardAvailable/hardUnlocked；未解锁请求拦截，报价列出条件。单图任务保持普通一次性流程；任务连战副本可重打但固定奖励和首通探索不重复发。旧档按实际普通完成历史补齐，既有hard远征允许继续。规则rules-v13、目录28。' },
    { version: 13, text: 'v13: 随机战场生成器v4新增交错遭遇、分进合击与分散据点，出生点按地图布局安排并支持多队会合。GET_TODAY地区行新增encounters/dungeonEncounters的normal/hard配置，包含maxUnits与独立enemyCount；PREVIEW_ACTION返回encounter.map地形、出生点和playerGroups。相同未花费日期的战场固定，改队伍不重掷；出征校验人数、重复ID和可用性，远征锁定开局配置。规则rules-v14、目录29，已保存地图不重排。' },
    { version: 14, text: 'v14: 所有连战副本增加固定装备和道具首通礼包，首次完整通关自动入库；普通与困难共享，重复、失败、撤离及中间图不发。GET_TODAY地区行新增dungeonFirstClearReward，GET_QUESTS连战条目新增firstClearReward，均返回items/available，单图为null。按副本自身完成记录判断，不误用野外讨伐；旧完成记录不重置，不升级补发。原任务领奖与基础掉落保持，目录30，战斗规则仍为rules-v14。' },
    { version: 15, text: 'v15: 目录31，规则仍rules-v14、引擎不变。地区副本与48项地区远征采用两张生成图＋经典终图；60图按12地区各5图入池，独立种子开局冻结RunRecord.stages，旧无stages远征保持路线。GET_TODAY与PREVIEW_ACTION(dungeon)新增dungeonStages，dungeonEncounters人数上限覆盖所有图，GET_RUN摘要提供stageNames/stageCount。固定经典保留六个三图副本clx-fe1/2/3/6/7/8，每图2日共6日，同一副本UI选路线，START_QUEST兼容。114项公开定义、78项归档查找定义；GET_QUESTS增加dungeonOnly/archived/stageNames，归档拒绝新开但旧进行中和待领奖仍列出。dungeonFirstClearRewards及firstClearRewards替代单数属性，normal/hard各返回items/available，单图为null；两档各一次，困难装备不同且更高阶、物品更多，仅完整通关自动入库，失败撤离作废。旧完成记录只抑制对应难度补发，questsDone回退普通；手动奖励和探索仍跨难度一次，困难仍须同内容普通通关。' },
  ];
  return { from: version, to: DOC_VERSION, changes: releases.filter(release => release.version > version).map(release => release.text) };
}

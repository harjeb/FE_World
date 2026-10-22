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
  lines.push('SORTIE、START_DUNGEON 和任务连战副本的 START_QUEST 支持 aiDifficulty: normal | hard（默认 normal）。困难需先普通通关相同内容：野外胜利解锁本地区困难野图，普通完整通关解锁本副本；两者互不替代，失败、中间图和困难胜利不算。单图任务保持普通一次性流程。读取 GET_STATE.hardUnlocks.regions/dungeons/quests 或 GET_QUESTS.hardAvailable/hardUnlocked 判断；直接请求未解锁 hard 会被拒绝，预览列出 blockers。任务副本可重打，但固定任务奖励与首通探索不重复发。旧档按真实普通胜利与完整通关记录补齐，缺失难度按普通，不从模糊完成标记推定。normal 已会集火与调整出手顺序，hard 进一步搜索连续三次行动的走位和配合。困难初始敌阵和增援人数增加50%（向上取整，附近合法空位为限），等级随机+2～5（上限99），按提高后的等级计算基础属性，再给HP随机+20%～35%、其余八项能力各+10%～25%、体格+1～3；能力加成向上取整且至少+1，HP上限150，其余八项属性无上限，移动力不变；配备更强装备及对应熟练度。独立种子固定生成结果，刷新不重掷、旧单位不重加。耗日及任务固定奖励不变，随机战场的出战上限和敌军规模由地图／难度配置决定，更多高等级敌人会自然增加战斗经验，敌军携带装备不会按概率掉落。远征全程锁定，缺失字段的旧战斗／远征按 normal 返回。battle.aiDifficulty 与 GET_RUN.run.aiDifficulty 返回当前设置；PREVIEW_ACTION 的 sortie／dungeon 报价 payload.aiDifficulty 保留设置，EXECUTE_ACTION 按报价执行。其他模式保持 normal；主线通关后的禁忌之地挑战固定 hard。', '');
  lines.push('随机野外与随机副本先确定战场，再选择队伍：GET_TODAY.sortieRegions 的 encounters／dungeonEncounters 分别提供 normal、hard 的布局、尺寸、maxUnits 与 enemyCount；少带人不会减少敌军。同一账号、日期、地区与活动的战场固定，刷新、换队或切换难度不会重抽布局；推进日期后才更新。PREVIEW_ACTION 返回 encounter.map 的真实地形、双方出生点与 playerGroups，报价按玩家版本绑定。出征名单按unitIds数组顺序分配到map.spawns.player对应落点，首位为主将；必须互不重复、可用且不超过该图该难度的上限；副本开局保存RunRecord.stages，出战上限取整趟所有图的限制（含经典终图）。地图布局含交错遭遇、隔墙分队会合和分散据点；已保存战场不重排。', '');
  lines.push('新普通随机野图人数按章节与可用名册约束后的普通出战上限分级，不按玩家实际勾选人数减怪。普通初始人数为2×max(4,普通出战上限)+3×(章节−1)+固定随机−2～+2，开局按第1章规模6～10人；第8章允许4／6／8人时分别为27～31／31～35／35～39人。第3／5／7章起分别有1／2／3波增援，于第5／9／13回合抵达，每波普通人数为普通出战上限±1（最低2），困难初始及每波人数各增加50%向上取整，仅计算一次。encounter.enemyCount只计初始敌军，reinforcements返回{turn,count}计划，turnLimit为20+2×(章节−1)；旧遭遇缺失字段保留20回合且不补增援。第3章起地图至少24×24、第6章起至少28×28，敌方出生点容量64。每波提前1回合预警，在我方回合开始进场，沿用本场出战均级±1、困难加成、普通小怪成长／熟练度与视野，不继承主将强化；被占落点就近找合法空位，仍无空位则记录无法抵达。计划与生成种子随开局冻结，重连不重复生成；击败主将即可结束，不强制等待援军。副本、任务、经典地图、既有战场及出征耗日不变。', '');
  lines.push('普通随机野图按实际出战名单平均等级向下取整分级，小怪各自固定随机−1／0／+1（最低1），困难再加原有2～5级，均以99为全局上限，不再受原50级限制。不读未出战角色、日期、地区偏移或首次讨伐等级；改均级会更新敌军等级与对应职业／属性／熟练度／装备，同均级换人和重排不重掷浮动，地图布局与人数不变。GET_TODAY.sortieRegions[].level仍为副本／日期活动的参考，野图实际等级读取PREVIEW_ACTION.encounter.enemies。普通随机野图的主将单独强化：基础等级为出战均级取整＋4，再叠加原有困难等级随机加成（等级上限99）。职业从主将基础等级允许的最高阶可攻击职业中选取，因此出战均级取整Lv16／43时主将基础Lv20／47，提前进入中级／上级；不生成纯治疗首领。主将属性取自身职业模板基础值＋floor(max(0,职业成长率＋通用成长率)×1.5×(等级−1)/100)，通用成长率为HP50／其他25；再叠加已有困难属性修正，HP上限150并同步满HP。不参考小怪属性、不额外全属性加点，保留职业强弱项，不保证每项都高于不同职业的小怪。野图敌军本职业允许的武器熟练度按最终等级（含困难等级加成）每12级升一档：小怪Lv1为E、13为D、25为C、37为B、49为A、61为S；主将同等级提前一档，即Lv1为D、13为C、25为B、37为A、49为S。不沿用模板预置的S，仍受职业上限约束，并保证满足携带装备的最低要求；沿用现有熟练度加成，不改变携带装备。预览与同名单实际出发共用生成结果，刷新、重排与读档不重抽或重复强化。任务、连续副本、经典地图、年度赛事与固定首领不套用，旧战场保持冻结。', '');
  lines.push('连续副本按难度分别计固定首通奖励：地区主副本按地区、地区任务远征及经典副本按任务ID，normal/hard各一次。普通为一件地区优质装备、1件能力成长药、2份特效药、2份完整料理与1枚转职印；困难为更强的地区装备、2件同种成长药、4份特效药、3份完整料理与2枚转职印。固定配置，不抽概率，也不按出发等级降低品质；开局冻结，旧远征保留旧礼包。仅完整通关自动入库，中间图不发，失败／撤离作废。GET_TODAY.sortieRegions[].dungeonFirstClearRewards 与 GET_QUESTS.firstClearRewards 返回 {normal:{items,available},hard:{items,available}}，替代旧单数属性；单图任务为null。GET_RUN.run.pendingLoot记录整趟掉落，完整结算后为已入库清单。手动任务奖励与首通探索跨难度仍仅一次。旧完成记录抑制对应难度补发，questsDone仅回退普通档，困难完成独立判断。', '');
  lines.push('副本统一UI内选择路线，路线条目只展示场景名称与副本等级；选中路线的等级为当前预览首图敌军等级的平均值（保留一位小数），尚未取得预览时以≈标示基准估计。地区路线按当地地理命名，经典地图与固定路线显示本地场景名，不带原作名或章节编号。不另设随机／经典导航分类。GET_TODAY.sortieRegions[].dungeonStages与PREVIEW_ACTION(dungeon).dungeonStages为{name,scenarioId?}数组：两张生成图＋一张经典终图，全部60张经典地图分为12地区各5张的池，选择种子独立于战斗RNG并在出发时冻结。标准副本、48项地区任务远征和六条固定经典三图路线统一逐图3／3／2日、共8日。固定经典保留六个三图副本clx-fe1/2/3/6/7/8，每作一个，fe1/fe6在地区2、fe2/fe7在地区3、fe3/fe8在地区5；START_QUEST继续兼容。GET_QUESTS返回dungeonOnly、archived、stageNames；公开114项定义（108本地＋6经典），78项旧定义（60单图＋18短经典）仅保留查找，拒绝新开，旧进行中／待领奖仍列出。GET_RUN摘要返回stageNames/stageCount；没有stages的旧远征由CONTINUE_DUNGEON沿旧路线继续。', '');
  lines.push('属性上限：GET_UNIT.caps 与 GET_CATALOG.classes[id].caps 的 hp 为150，其余八项均为null表示无上限；stats 始终为数字，可超过99。等级仍为1～99，能力药使用次数与成长分配预算不变。数值传承预览 capacity=null、clippedTarget=sourceTotal、lost=0；HP补点仍限制150，其他点按权重分配。旧合同按保存的sourceTotal恢复未截断目标，已有属性和过去随机成长不重算。', '阿波罗个人特性 lightshot（光明神射）：开战时满HP且使用弓，本次有效技巧×2，覆盖主动、反击、连击、追击和战技技巧引用；不改永久stats及射程，最终概率仍限制0～100%，禁止必杀照常生效。单位快照可带personalSkill覆盖形象默认技能；预测双方skl为本次有效技巧。时空副本与固定兑换已接入，见v17变更与GET_CROSS_TIME_RECRUITS。', '');
  lines.push('战斗EXP按敌我保留总等级差计算。击杀首领额外+20（由原+40下调），只在击杀时发放；己方高出敌人5级及以上时，交战／击杀基础经验仍降为1，但首领击杀保留这20点、合计21，普通小怪仍为1。无伤且未击杀为0，单次总经验最多100，累计100升级，不保证击杀首领必升一级；治疗仍为12，竞技场不发战斗经验。战斗预测与实际结算共用公式。', '');
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
    { version: 16, text: 'v16: 规则rules-v15、目录33，引擎1不变。取消力、魔、技、速、运、防、魔防、魅力的99上限，HP仍150、等级仍99；GET_UNIT及GET_CATALOG的caps用null表示无上限，stats保持数值。升级、药品、数值传承与新生成敌军共用新规则；能力药使用额度不变。传承capacity=null、clippedTarget=sourceTotal、lost=0，旧合同以保存的sourceTotal解除旧99截断；已有属性与历史成长不重算。加入光明神射lightshot运行时，满HP持弓的交战有效技巧翻倍；快照personalSkill覆盖形象技能，交战预测skl展示临时技巧。部署前结束活动／战斗／远征并备份；旧规则回放只显示冻结终局。' },
    { version: 17, text: 'v17: 规则rules-v16、目录34，引擎1不变。第1000日起开放全账号共享的时空试炼cross-time-throne，首次START_QUEST可用region选择已开通地区；固定17人、普通48级／困难52级、8日、最多8名玩家、40回合，普通首通开放困难。GET_QUESTS.crossTime提供解锁／完成／奖励与两档敌军预览；GET_BATTLE.crossTimeGroups及state.crossTimeGroups公开分组警戒、激活回合和原因。普通首通自动发3枚时空碎片；后续有效胜利每场独立20%发1枚，重试不重抽；无地区声望／探索奖励，不用CLAIM_QUEST_REWARD。GET_CROSS_TIME_RECRUITS(143)列出17人兑换资格；EXCHANGE_CROSS_TIME_RECRUIT(144)带identityId与commandId消耗3碎片，每身份账号永久仅一次，同时最多3名未轮回在队者。荀彧单体治疗射程及全部个人特性共用合法行动、预测与结算；33%特性每交战抽一次，预测公开分支与加权风险。新档字段缺省不解锁、不补发；部署前结束活动并备份，旧规则回放保持冻结。' },
    { version: 18, text: 'v18: 缔结神约使用独立随机生成的主角形象，前端提供随机形象按钮并按所选性别生成。COMPLETE_SETUP.protagonist.portrait改为random:male|female:seed（seed为1–64位字母、数字、下划线或连字符），须与sex一致；省略时按账号确定，拒绝固定人物头像。GET_STATE.setup.protagonist不再下发固定portraits列表，同伴池不再排除主角形象。形象键随单位、战斗、快照与回放保存；GET_OPPONENT.list补充portrait。已有主角、固定人物头像与战斗规则不变。' },
    { version: 19, text: 'v19: 目录35。新增8个主线任务story-1～story-8（不属于任何地区，章节开放后可接，胜利即完成该章）与雷恩／伊格／米拉的伙伴任务companion-*；任务条件新增requires.chapter／character，GET_STORY返回quest与companions，GET_QUESTS的伙伴任务带companion／epilogue；庆典窗口内GET_SHOP整店打折（price为实付单价，新增basePrice／discount），BUY按折后价扣费。' },
    { version: 20, text: 'v20: 目录36。每章主线增加前置任务：story-N-a派遣（章节开放后出发的一次派遣满天数，返程自动完成）与story-N-b提交材料（新增COMPLETE_STORY_STEP，从仓库扣除）；前置任务全部完成后才能接收尾战story-N，START_QUEST未完成时拒绝。GET_STORY.quest新增steps与prerequisite。旧档已记为完成的章节不受前置任务限制。' },
    { version: 22, text: 'v22: 目录38。主线前置任务不再固定为派遣＋提交：每章两个、类型各章不同（派遣、提交材料、副本宝箱找任务物品、单挑、普通竞技场胜场、酒馆小游戏胜次）。新增START_STORY_DUEL（单挑，真实死亡，借小型经典图只留一人对一名强敌）；COMPLETE_STORY_STEP只用于提交材料类；GET_STORY.quest.steps按类型返回各自字段，前置任务不再有先后顺序。' },
    { version: 24, text: 'v24: 目录40。主线单挑的对手改为随机人物：名字随机，等级为现役名册最高等级加1～2（第3、5章加1，第8章加2），职业是与应战角色同阶级（同一stage）的随机职业，只从有攻击手段的人类职业里按种子挑选。GET_STORY的duel步骤level按同一规则给出。' },
    { version: 25, text: 'v25: 规则rules-v17、目录41，引擎1不变。职业资格购买新增目标允许武器任一种熟练度门槛：初级D／中级C／上级B／最上级A／神将S；年份、金币、种族及月额度不变。切换、PROMOTE和派遣选用其他已购职业也检查，当前／本轮起始职业仅进入、返回与训练免熟练度门槛，新购买不免。旧资格保留，GET_CLASS_MARKET.eligibilityReason公开原因。取消独立短刀类型，相关武器、忍者权限与战技统一归剑；旧档短刀等级与经验分别保留其与剑的较高值，不叠加，物品与战技ID不变。新生成敌军按等级分阶（1／20／47／66／81），经典与增援低等级回退，敌方使用独立阵营姓名。普通野图SORTIE推进2日，随机副本仍每图8日，任务既定耗日不变。部署前结束活动战斗／远征／派遣并备份，保留既有装备与快照，旧规则回放保持冻结。' },
    { version: 26, text: 'v26: 目录42。主线前置任务完成时自动发放奖励：金币按类型和章节递增（派遣／酒馆250+100×章、竞技场／提交材料300+100×章、找物品400+100×章、单挑500+200×章），单挑另给公共经验300和伤药×2。GET_STORY.quest.steps新增reward，COMPLETE_STORY_STEP返回reward与message。' },
    { version: 27, text: 'v27: 目录43，战斗规则不变。新出发的地区副本、地区任务远征和固定经典三图路线统一共8日，逐图3／3／2日。RunRecord冻结stageDayCosts；GET_RUN摘要新增stageDayCosts，stageDays为当前待进入／战斗地图的耗日。PREVIEW_ACTION(dungeon)及实际出发首图均3日，继续第2／3图分别3／2日。旧远征没有stageDayCosts时沿用原stageDays（最早每图8日），已付日期不追退；单图任务与时空试炼耗日不变。' },
    { version: 28, text: 'v28: 目录44。主线前置任务的奖励改为每个任务单独指定：以伤药、特效药、解毒药和各档武器为主，金币只给少量，单挑另有公共经验。新增战斗消耗品特效药(elixir，回复全部HP，1次)与解毒药(antidote，解除战技造成的中毒，不回复HP，2次)，只能持有携带并在战斗中使用，GET_STORY steps.reward.items给出内容。' },
    { version: 29, text: 'v29: 规则rules-v18、目录45，引擎1不变。普通／困难AI攻击评分改为比较行动前后的威胁，避免远程单位被贴身后因下回合仍可能被追上而放弃后退射击；同等威胁与掩护的落点优先较短移动。固守、护卫范围、定身、睡眠和合法移动规则不变。部署前结束活动战斗／远征并备份，旧规则回放保持冻结。' },
    { version: 30, text: 'v30: 目录46。特效药与解毒药进王都商店（解毒药开局就卖，特效药第2年起）；高级物品按年份上架：特效药、完整料理、六种能力药第2年（第500日）起，不朽盾第3年（第1000日）起，GET_SHOP新增locked（尚未上架的物品及openDay），未到日期BUY被拒绝。属性成长药新增任务与宝箱获取：每个地区的第二个核心任务（-8）给一枚（六种按地区轮换）、主线前置任务（六种各一）、三个伙伴任务各一枚；经典图约四分之一的普通宝箱改放成长药。' },
    { version: 31, text: 'v31: 目录47。地区声望商店改为只卖少数高级商品并限购：池子只留C级及以上的武器／法术书、能力药、特效药和传承石，每个地区每季只上架4件（账号＋季度做种子，季内固定，长期每件都会轮到），每件本季限购1件（特效药2件）；GET_QUESTS.regions[].shop每行新增limit/bought/remaining，区域新增shopRefreshDay，BUY_QUEST_ITEM拒绝本季未上架或已买满的商品。E／D级基础装备改由王都军需处按季轮换（每季8件、限量3）。新档起步金币由13,120降为1,500。' },
    { version: 32, text: 'v32: 目录48。新增目标类支线任务（悬赏，bounty-*，11项）：不用接取，满足章节门槛后自动计数——击败指定职业路线的敌军（剑术、弓术、重甲、魔法、飞行或任意）、赢得战斗、完整通关副本，计入普通出战（野外、任务、副本图、挑战塔、单挑），竞技场和年度赛事不计；完成后记入questsDone，用CLAIM_QUEST_REWARD交付，START_QUEST拒绝。GET_QUESTS新增bounties与board（任务板：4～7条现在能做、能交的任务，标明主线／支线、状态与进度）。' },
    { version: 33, text: 'v33: 规则rules-v19、目录49。基础武器按木／铜／铁／钢／银五档统一；草药、矿物、木材各24种，共72种六阶素材，地区产地交叠并含稀有种。野图、扫荡、副本、派遣、任务及宝箱采用区域素材，新增活动出发时冻结随机奖励；旧活动缺少冻结字段时保留旧奖励。锻造按对应原料消耗（钢用铁矿＋煤，银用银矿），工坊增加全部素材的来源和用途。GET_CATALOG新增materials、weaponSeries、recipes；GET_TODAY.sortieRegions新增materials；PLANT支持可选recipeId（默认plant_herb），高阶种植需母株。旧herb／ore／wood物品ID保留。部署前结束活动战斗／远征并备份；旧规则回放保持冻结。' },
    { version: 34, text: 'v34: 规则rules-v21、目录52。TRAIN新增unitIds/groupId分组训练：第1/2/3/4年最多1/3/5/8人，每人200金币，共3日；agility剑/弓/拳、power斧/枪/兽、mystic拳/杖/理/龙，组内每种武器各获3经验。GET_TODAY训练新增maxUnits/groups，报价按总人数计费；保留旧单人单项参数。E到D需50经验，已有等级不降。开局伙伴使用初级职业。人类PROMOTE可跨全部职业，仍检查资格与武器门槛。飞行固定7移动，第3阶起非重甲步行6/骑乘7，龙类武器和战技仅相邻1格。随机野图按可出战人数和章节限制前期3–5敌军，分散布局需8名可用队员；已有远征冻结计划不变。' },
    { version: 35, text: 'v35: 规则rules-v22，目录不变。敌军 AI 改为数据化行为：固守单位不再只挨打，射程内有目标就原地出手；新建战斗的敌军带警戒半径（普通5格／困难7格），己方进入半径前不主动推进会合；困难仍以更多人数、更高属性、备队与更宽警戒为主要手段，并保留原有的有界连续行动搜索；预计能造成伤害且不会阵亡时接受略亏的交换，零伤害或必死仍放弃。旧战斗与回放不受影响。' },
    { version: 36, text: 'v36: 规则rules-v23，目录不变。经典图中原始职业为盗贼／刺客的敌军新增抢宝行为：该图有未开宝箱或未访问村庄时会走向最近的宝物并拿走，物品不进入我方带回清单，战斗记录只显示该单位打开宝箱；主线与一次性任务物件不会被抢。其他敌军仍不能操作物件，旧战斗与回放保持冻结。' },
    { version: 37, text: 'v37: 规则rules-v24，引擎1、目录不变。经典图盗贼改为三阶段抢宝：第3回合（thiefTurn）前原地不动，动手前先发一条提示（战斗记录 scenario 事件「盯上了宝物，准备动手抢夺」），开箱／访问村庄后战利品进入盗贼携带（carrying），随后立刻向最近的边缘格逃跑并在边缘撤离，撤离时提示「带着抢来的东西逃出了地图」，该奖励永久失去；在逃跑途中击杀盗贼，战利品掉回我方带回清单。敌方盗贼可在地图任意边缘撤离，不需要撤离点。战斗记录新增 thief-alert／thief-steal／thief-escape 场景提示。旧战斗与回放保持锁定。' },
    { version: 38, text: 'v38: 目录56，战斗公式和rules-v26不变。王城八章调查主线增加公开背景、逐章背景和56段对白，GET_STORY的quest.scenes与steps[].scenes按前置完成／收尾战胜利下发，未来调查章与未触发结局不会提前返回；章节除日期外依次检查此前调查。第八章收尾战等待本届参赛结束或第4000日，目标为击败邪神化教首，finalBoss指向story-8；通关后postgame开放禁忌之地。tower-3保留奖励键并改编为缚门者，其后新增forbidden-altar、forbidden-abyss，均为hard具名首领战，按前层通关解锁；GET_CHALLENGES新增postgame/briefing/boss/blockedReason。旧战场、完成标记、物品ID和已领奖励不重置，已完成章节不受新增前置阻挡。' },
    { version: 39, text: 'v39: 目录57，战斗规则仍为rules-v26。主线八章、三场单挑、伙伴任务、十二地区野外／副本、挑战塔与禁忌之地使用对应阵营和首领姓名；主线战前对白、GET_STORY单挑enemy与实际敌人一致，单挑重试保留剧情身份，同阶随机职业和等级规则不变。新战斗冻结enemyIdentity，后续脚本增援及困难追加敌兵沿用本场身份，spawn动画事件与实际单位同名；旧战斗与战报保留保存的名字。' },
    { version: 40, text: 'v40: PREVIEW_ACTION 支持 action=quest、questId、region?、unitIds?、aiDifficulty?，预览地区／经典／时空任务首战，costDays 为首图实际耗日，未开放限制列入 blockers，EXECUTE_ACTION 保留 START_QUEST 生命周期校验。任务种子由服务器按账号／日期／任务／地区派生，实际战斗与成长随机流独立。PREVIEW_ACTION 的 sortie/dungeon encounter 新增 enemies：仅含 id、name、classId、level、hp、stats、pos、weapons；副本预览为第 1 图。敌军由实际战斗生成器按固定遭遇种子生成，与同日实际出战一致，刷新和调整名单不重掷；不接受客户端种子，不返回 AI 或战斗随机状态，战斗随机数仍由服务器独立生成，旧战斗不变。' },
  ];
  releases.push({ version: 43, text: 'v43: 目录61，战斗规则不变。十二地区副本、六条固定路线与六十张经典地图使用本地场景名，显示名不带原作标题或章节编号，地图ID、路线与旧存档不变。副本路线条目只展示名称与副本等级；选中时按首图预览敌军平均等级显示，未预览时用≈标记基准估计；耗时仅展示总日数与到达日期。新远征普通首通为固定优质装备×1、能力成长药×1、特效药×2、完整料理×2、转职印×1；困难为更强装备×1、同种成长药×2、特效药×4、完整料理×3、转职印×2，不再按出发等级降档。普通和困难各一次，完整通关自动入库，失败／撤离不发；旧远征保留冻结礼包与名字，历史首通资格不重置。' });
  releases.push({ version: 44, text: 'v44: 目录62，战斗规则仍为rules-v26。新生成的普通野图主将基础等级+4，再叠加既有困难加成，等级上限99；按主将基础等级选最高阶可攻击职业，职业升级窗口比小怪提前4级。全部敌军生成后，各属性取主将自身与小怪对应项较高值再加HP6／其他1，HP上限150，保证主将强于小怪。不将主将强化复制给困难追加敌军。出征预览与实战一致，旧战场不重新强化；任务、副本、经典图、年度赛事及固定首领规则不变。' });
  releases.push({ version: 45, text: 'v45: 目录63，战斗规则不变。普通野图主将改用自身职业模板基础值与普通敌人有效成长率的1.5倍计算属性，再叠加既有困难修正；删除v44的小怪属性取最大值与固定加点，保留职业强弱项，不再保证每项属性最高。基础等级+4、提前进阶、HP150上限和预览一致性保留；普通小怪、困难追加敌军、任务、副本及固定首领不变，已保存战场与回放不重算。' });
  releases.push({ version: 46, text: 'v46: 目录64，战斗规则不变。新普通野图主将本职业允许的武器熟练度取职业上限：初／中／上级S、最上级SS、神将级SSS；已达上限不重复强化，沿用当前武器类别的攻击／命中／必杀／治疗加成，SS／SSS仍使用S档数值。不额外增加基础属性，不升级装备，不改小怪或困难追加敌军的熟练度；任务、副本、经典及固定首领不变，旧战场与回放保持冻结。' });
  releases.push({ version: 47, text: 'v47: 目录65，战斗规则不变。修正v46野图主将直接满熟练度：新普通野图敌军按最终等级沿用每12级升一档的曲线，小怪Lv1/13/25/37/49/61为E/D/C/B/A/S，主将同等级提前一档（Lv1/13/25/37/49为D/C/B/A/S）。不把职业上限或模板S当作实际熟练度；各类型受职业上限约束，并保证能用携带装备。困难追加敌军用普通曲线、不继承首领加档；任务、副本、经典及固定首领不变，旧战场与回放保持冻结。' });
  releases.push({ version: 48, text: 'v48: 目录66，战斗规则不变。新普通随机野图以实际出战均级向下取整分级，小怪固定随机−1／0／+1，困难继续加2～5级；移除原50级限制，仅限1～99。主将按均级＋4继续高成长与熟练度强化，最多99级。同均级换队／重排不重掷，换均级更新敌军但不改变地图和人数；预览与实际出征一致。GET_TODAY.sortieRegions[].level保留日期活动参考，野图准备页改读真实预览等级。任务、副本、经典、赛事、固定首领与材料奖励不变，旧战局和回放保持冻结。' });
  releases.push({ version: 49, text: 'v49: rules-v27、目录67。击杀首领额外经验由40降至20；己方比敌人高5级及以上时，基础交战／击杀经验仍降为1，但首领奖励在衰减后保留，总计21。未击杀不发额外奖励，普通小怪、无伤未击杀0、治疗12、单次100上限与累计100升级不变；战斗预测和结算共用公式。既有经验、等级、背包及已发奖励不重算。部署前结束进行中的战斗／远征并备份，旧规则回放只读冻结快照，不按新规则重模拟。' });
  releases.push({ version: 50, text: 'v50: rules-v28、目录68。新随机野图按章节与可出战上限生成浮动敌军：普通第1章6～10人，末章最多35～39人；第3／5／7章起增加1／2／3波定时援军，困难初始和援军各+50%仅一次。encounter新增可选reinforcements[{turn,count}]和turnLimit，预览展示初始人数、援军回合及人数，全部计划开局冻结。援军提前一回合预警、我方阶段进场，普通小怪等级／成长／熟练度规则和独立种子保持一致；击败主将仍可提前结束。后期地图增大，出生点支持64敌军，原16人以内生成结果不变。旧战场不补人，副本／任务／经典／固定战斗及耗日不变；旧规则回放只展示冻结快照，不以新规则重模拟。' });
  return { from: version, to: DOC_VERSION, changes: releases.filter(release => release.version > version).map(release => release.text) };
}

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG_CLASS_IDS, CLASSES, CLASS_OPEN_YEAR, CLASS_PATHS } from '../../backend/common/data/classes.ts';
import type { CatalogClassId } from '../../backend/common/data/classes.ts';
import { CLASS_GROWTH, CLASS_GROWTH_VERSION, SOURCE_GROWTH_BUFFS } from '../../backend/common/data/class-growth.ts';
import type { GrowthRole, GrowthVector } from '../../backend/common/data/class-growth.ts';
import { FW_CLASS_REFERENCE } from '../../backend/common/data/class-reference.ts';
import { STAT_KEYS, STAT_NAMES, stats } from '../../backend/common/data/types.ts';
import type { Stats } from '../../backend/common/data/types.ts';
import { seedRng } from '../../backend/common/engine/rng.ts';
import { createUnit, gainExperience } from '../../backend/common/game/model.ts';

interface Baseline { version: string; order: string[]; classes: { id: CatalogClassId; name: string; growth: GrowthVector }[] }
const baseline: Baseline = JSON.parse(readFileSync(new URL('./class-growth-nine-stat-baseline.json', import.meta.url), 'utf8'));
assert.deepEqual(baseline.order, STAT_KEYS);
assert.deepEqual(baseline.classes.filter(row => CATALOG_CLASS_IDS.includes(row.id)).map(row => row.id).sort(), [...CATALOG_CLASS_IDS].sort());
const old = new Map(baseline.classes.map(row => [row.id, row.growth]));
for (const ref of FW_CLASS_REFERENCE) {
  assert.deepEqual(old.get(ref.id), [0,1,2,4,3,7,5,6,8].map(index => ref.growth[index]), `${ref.id}: baseline must be the source`);
  const buff = SOURCE_GROWTH_BUFFS[ref.id] ?? {};
  for (const [i, key] of STAT_KEYS.entries()) {
    assert.equal(CLASS_GROWTH[ref.id].values[i], old.get(ref.id)![i] + (buff[key] ?? 0));
    assert.ok((buff[key] ?? 0) >= 0);
  }
}
const current = new Map(CATALOG_CLASS_IDS.map(id => [id, CLASSES[id].growth]));
for (const id of CATALOG_CLASS_IDS.filter(id => CLASSES[id].source !== 'fortunes-weave')) {
  assert.deepEqual(CLASS_GROWTH[id].values, old.get(id), `${id}: extensions are outside this correction`);
}
const SAMPLES = 256;
const YEAR_LEVELS = [11, 24, 35, 48, 61, 74, 87, 99];
const YEAR_GAINS = YEAR_LEVELS.map((level, i) => level - (YEAR_LEVELS[i - 1] ?? 1));
const PERSONAL = stats(65,40,40,45,45,35,30,30,20);
const BASE_STATS = stats(20,5,5,5,5,5,4,4,5);
type AnnualPath = readonly [CatalogClassId, CatalogClassId, CatalogClassId, CatalogClassId, CatalogClassId, CatalogClassId, CatalogClassId, CatalogClassId];
const paths = {
  sword: ['gladiator','swordsman','swordsman','shido','shido','swordmaster','swordmaster','blade'],
  axe: ['gladiator','fighter','fighter','hero','hero','battlemaster','battlemaster','everlord'],
  armor: ['lancer','knight','knight','dreadnought','dreadnought','fortress','fortress','fortress'],
  heavy_cavalry: ['lancer','knight','knight','cataphract','cataphract','great_knight','great_knight','great_knight'],
  cavalry: ['ornius_rider','cavalier','cavalier','paladin','paladin','orichaldia','orichaldia','divine_cavalier'],
  bow: ['hunter','archer','archer','sniper','sniper','marksman','marksman','calamity'],
  magic: ['adept','mage','mage','sage','sage','druid','druid','saint'],
  healing: ['adept','cleric','cleric','bishop','bishop','wiseman','wiseman','saint'],
  hybrid: ['adept','mage','mage','blacksmith','blacksmith','high_epitaph','high_epitaph','high_epitaph'],
  flying: ['ornius_rider','pegasus','pegasus','dragon_knight','dragon_knight','dragon_commander','dragon_commander','dragon_commander'],
  beast: ['beast_cub','beast_fighter','beast_fighter','beast_hero','beast_hero','beast_guard','beast_guard','beast_lord'],
  dragon: ['awakened','dragonkin','dragonkin','ancient_guard','ancient_guard','dragon_sage','dragon_sage','dragon_lord'],
} as const satisfies Record<string, AnnualPath>;
const names: Record<keyof typeof paths, string> = {
  sword: '剑术', axe: '斧战', armor: '重甲步兵', heavy_cavalry: '重甲骑兵', cavalry: '骑乘', bow: '弓术',
  magic: '魔法', healing: '治疗', hybrid: '物魔混合', flying: '飞龙', beast: '兽人', dragon: '龙人',
};
const roleNames: Record<GrowthRole, string> = {
  duelist: '剑术输出', striker: '强攻', marksman: '射击', guardian: '防守', skirmisher: '机动',
  arcanist: '魔攻', healer: '治疗', hybrid: '混合', support: '辅助', dragon: '龙息',
};
// Role weights only prioritize growth for inspection; they are not a combat power formula.
const weights: Record<GrowthRole, GrowthVector> = {
  duelist: [.4,1,0,.65,1,.3,.5,.4,0], striker: [.5,1,0,.7,.7,.25,.6,.3,0],
  marksman: [.35,1,0,1,.8,.3,.4,.4,0], guardian: [.6,.8,.1,.5,.4,.2,1,.6,0],
  skirmisher: [.4,.9,0,.65,1,.3,.5,.5,0], arcanist: [.4,0,1,.7,.8,.3,.4,.7,0],
  healer: [.4,0,1,.5,.6,.5,.4,.9,0], hybrid: [.4,.7,.7,.6,.7,.3,.6,.6,0],
  support: [.4,.2,.2,.5,1,.6,.5,.5,0], dragon: [.6,0,1,.5,.4,.2,.8,.8,0],
};
function score(id: CatalogClassId, values: readonly number[]): number {
  return values.reduce((sum, value, i) => sum + value * weights[CLASS_GROWTH[id].role][i], 0);
}
function dominates(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, i) => value >= b[i]) && a.some((value, i) => value > b[i]);
}
function comparable(a: CatalogClassId, b: CatalogClassId): boolean {
  const x = CLASSES[a], y = CLASSES[b];
  return x.stage === y.stage && CLASS_GROWTH[a].role === CLASS_GROWTH[b].role && x.move === y.move &&
    x.moveType === y.moveType && x.armored === y.armored &&
    Object.keys(x.weapons).sort().join() === Object.keys(y.weapons).sort().join();
}
function dominatedPairs(before: boolean): string[] {
  const vector = (id: CatalogClassId) => before ? old.get(id)! : CLASS_GROWTH[id].values;
  return CATALOG_CLASS_IDS.flatMap(a => CATALOG_CLASS_IDS.flatMap(b =>
    a !== b && comparable(a, b) && dominates(vector(a), vector(b)) ? [`${CLASSES[a].name} > ${CLASSES[b].name}`] : []));
}
function stagnantPromotions(before: boolean): string[] {
  const vector = (id: CatalogClassId) => before ? old.get(id)! : CLASS_GROWTH[id].values;
  const results = new Set<string>();
  for (const routes of Object.values(CLASS_PATHS)) for (const path of routes) for (let i = 1; i < path.length; i++) {
    if (!vector(path[i]).some((value, key) => value > vector(path[i - 1])[key])) results.add(`${path[i - 1]} → ${path[i]}`);
  }
  return [...results];
}
function expectedDelta(path: AnnualPath): number[] {
  return STAT_KEYS.map((_, i) => path.reduce((sum, id, year) =>
    sum + YEAR_GAINS[year] * (CLASS_GROWTH[id].values[i] - old.get(id)![i]) / 100, 0));
}
interface Simulation { mean: Stats; capped: number }
function simulate(path: AnnualPath, before: boolean): Simulation {
  const totals = stats(0,0,0,0,0,0,0,0);
  let capped = 0;
  // This standalone CLI temporarily swaps profiles only in its own process. Always restore them.
  try {
    for (const id of CATALOG_CLASS_IDS) CLASSES[id].growth = before ? stats(...old.get(id)!) : current.get(id)!;
    for (let sample = 0; sample < SAMPLES; sample++) {
      const unit = createUnit('erin', 1, 'growth-simulation', 0, false, { classId: path[0], growthType: 'normal', age: 20 });
      unit.stats = { ...BASE_STATS };
      unit.hp = unit.stats.hp;
      // A fixed personal vector isolates class effects without editing production character data.
      unit.inheritedGrowth = { ...PERSONAL };
      const rng = seedRng(`class-growth-${sample}`);
      for (let year = 0; year < path.length; year++) {
        const id = path[year];
        assert.ok(CLASS_OPEN_YEAR[CLASSES[id].stage] <= year + 1, `${id} unavailable in year ${year + 1}`);
        unit.classId = id;
        unit.age = 20 + year;
        gainExperience(unit, YEAR_GAINS[year] * 100, rng);
        assert.equal(unit.level, YEAR_LEVELS[year]);
      }
      assert.equal(unit.growthLog.length, 98);
      for (const key of STAT_KEYS) {
        assert.ok(unit.stats[key] >= BASE_STATS[key] && unit.stats[key] <= CLASSES[unit.classId].caps[key]);
        totals[key] += unit.stats[key];
        if (unit.stats[key] === CLASSES[unit.classId].caps[key]) capped++;
      }
    }
  } finally {
    for (const id of CATALOG_CLASS_IDS) CLASSES[id].growth = current.get(id)!;
  }
  return { mean: Object.fromEntries(STAT_KEYS.map(key => [key, totals[key] / SAMPLES])) as Stats, capped };
}
const fmt = (values: readonly number[], digits = 0) => values.map(value => value.toFixed(digits)).join('/');
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const beforeStagnant = stagnantPromotions(true), afterStagnant = stagnantPromotions(false);
const beforeDominated = dominatedPairs(true), afterDominated = dominatedPairs(false);
assert.equal(afterStagnant.length, 0, afterStagnant.join(', '));
const routes = Object.entries(paths).map(([key, path]) => ({
  key: key as keyof typeof paths, path, before: simulate(path, true), after: simulate(path, false), delta: expectedDelta(path),
}));
const rows = CATALOG_CLASS_IDS.filter(id => CLASSES[id].stage > 0).map(id => {
  const cls = CLASSES[id], previous = old.get(id)!, next = CLASS_GROWTH[id].values;
  const status = cls.source !== 'fortunes-weave' ? '保留扩展配置' : SOURCE_GROWTH_BUFFS[id as keyof typeof SOURCE_GROWTH_BUFFS] ? '定向加强' : '保留原表';
  return `| ${cls.stage} | ${cls.name} (${id}) | ${status} | ${roleNames[CLASS_GROWTH[id].role]} | ${fmt(previous)} | ${fmt(next)} | ${sum(previous)} → ${sum(next)} | ${score(id, previous).toFixed(1)} → ${score(id, next).toFixed(1)} |`;
});
const reasons: Partial<Record<CatalogClassId, string>> = {
  hunter: '初级物理猎兵力量修正为0；补5力量，不改变原有技巧与速度。',
  ornius_rider: '初级骑乘物理职业力量修正为0；补5力量，保留机动分工。',
  swordsman: '低阶剑士力量修正为0；按保守方案先补5，保留技速优势。',
  archer: '低阶弓箭手力量修正为0；按保守方案先补5，不额外加强技巧和速度。',
  rogue: '低阶轻装剑弓职业力量修正为0；补5力量，保留敏捷型分工。',
  cavalier: '力量和技巧成长偏低，补基础近战培养收益；保留骑乘优势与原有负魔力。',
  armored_ornius: '中级物理骑乘职业力量修正为0；补5力量，保留速度和防御侧重。',
  pegasus: '原本力量、速度修正都是0；力量先保留+5，撤回上轮额外的5；速度沿用既有+10。',
  shido: '与低阶剑客共同保留剑术技速取向；力量+10，技巧与速度随上级提高。',
  paladin: '原表总修正35，近战主攻和技巧偏低；补HP、力量、技巧，保留速度0的取舍。',
  cataphract: '移动5且有双特效弱点，防御却只有+10、速度−10；补耐久并缓和速度惩罚。',
  battlemaster: '力量+25无需再加；技巧、幸运双负修正影响输出稳定性，优先补这两项。',
  monk: '可用拳与治疗杖，原本魔力修正为0；补混合职责需要的魔力和技巧。',
  fortress: '防御+30已经足够鲜明，只把过重的速度惩罚−15缓和至−10。',
  orichaldia: '移动7有价值，技巧成长0、速度+5偏低；只补技巧和速度。',
  great_knight: '最上级防御仅+15，还承受速度−10、魔防−10；补重装长处并缓和魔防短板。',
  dragon_commander: '原成长与驭龙兵相同，仅移动提高；补HP、力量、技巧、防御，保留与天翼的速度魔防分工。',
  wiseman: '治疗系最上级魔力+20、技巧0偏低；提高两项，保留原有幸运+20和魔防+25。',
  valkyrie: '魔力+15与上级游唱诗人相同；只加5魔力，仍以骑乘便利换专精峰值。',
  fist_deity: '拳／治疗双用途的力量、魔力分别只有+10、技巧+5；每项补5，保留混合定位。',
};
const activeReference = FW_CLASS_REFERENCE.filter(ref => CATALOG_CLASS_IDS.includes(ref.id));
const buffRows = activeReference.filter(ref => SOURCE_GROWTH_BUFFS[ref.id]).map(ref => {
  const changes = STAT_KEYS.filter(key => SOURCE_GROWTH_BUFFS[ref.id]?.[key]).map(key => {
    const i = STAT_KEYS.indexOf(key);
    return `${STAT_NAMES[key]} ${old.get(ref.id)![i]} → ${CLASS_GROWTH[ref.id].values[i]}`;
  }).join('；');
  assert.ok(reasons[ref.id], `${ref.id}: explain each targeted buff`);
  return `| ${ref.name} | ${reasons[ref.id]} | ${changes} |`;
});
const routeRows = routes.map(row => `| ${names[row.key]} | ${row.path.map(id => CLASSES[id].name).join(' → ')} | ${fmt(row.delta, 1)} |`);
const simulationRows = routes.flatMap(row => [
  `| ${names[row.key]}：调整前 | ${fmt(STAT_KEYS.map(key => row.before.mean[key]), 1)} | ${row.before.capped} |`,
  `| ${names[row.key]}：调整后 | ${fmt(STAT_KEYS.map(key => row.after.mean[key]), 1)} | ${row.after.capped} |`,
]);
const report = `# 16 职业成长：原表弱项定向加强

便于逐职业审阅的完整成长表、低阶力量对照与累计增幅见[17 职业成长审阅稿](17-class-growth-review.md)。本篇保留数值理由和模拟测算细节。

版本：\`${CLASS_GROWTH_VERSION}\`。当前目录${CATALOG_CLASS_IDS.length}项，原表采用${activeReference.length}项，${buffRows.length}个定向加强，另${activeReference.length - buffRows.length}个保留原值；前作9个、兽／龙10个继续使用独立适配数值。本次删除勇士、上忍、机关师、战斗修士、战象兵；勇士旧编号合并至勇者。保留原始60行参考和历史测算基线用于追溯，不把已删除职业计入现行目录。class-growth.ts只对明确名单的属性加正向修正，未列项原样使用。本文是开发数值资料，不新增玩家提示，也不解释固定成长类型的隐藏年龄曲线。

## 查到的问题与处理

上一轮误把“部分职业成长太弱”扩大成整张表重平衡，又把原表问题与早先统一截断的问题混在一起。该方案已被本文替代。比如战斗将领原本力量就是+25，需要补的是技巧−5与幸运−5；英勇骑士的防御原本就只有+15，才是明确需要增强的本职长处。不能把从截断值恢复原值称为对原表的加强。

德鲁伊魔力+30、重装步兵防御+25、巨型重甲兵防御+30等原表专长直接保留；绝祸神将等原本成长较好的职业不削弱。用户指出剑士等低阶力量偏低，并要求别一次加强太多：剑客、弓箭手、猎兵、飞鸵兵、恶棍、骑甲鸵兵的力量均先从0补至+5；天翼兵撤回上轮额外的5，回到+5。土匪仍为+15、斗拳手+10；剑客保留技巧+10、速度+15。个人40%的通常型剑客，合计力量成长为45%；+5个百分点持续20次升级，额外力量期望约1点，实际仍受随机成长和上限影响。原有个人资质、其他成长项和已获属性不重算。

未使用的魔力负修正不能直接当作物理职业的严重缺陷；高移动、射程、技能也有价值，不按成长合计一刀切。低阶力量复核新增6个加强条目，天翼兵本次回到此前+5的方案；不设“只能加强15职”的数量门槛，仍只修改有明确理由的职业与属性。本次保守调整只回调这三职的力量，不进一步增强任何其他属性。

| 职业 | 判断与处理 | 原表 → 本作（百分点） |
| --- | --- | --- |
${buffRows.join('\n')}

其余成长不变，原表负修正也不会统一抹去。不设置额外的统一成长截断；个人基础、轮回分配和类型曲线继续按原规则计算，不累加历代职业。运行时已补齐魅力为第九属性，现行58个原表职业的魅力修正逐项保留，19个扩展职业的魅力修正暂用0。魅力独立参与成长、99上限、传承和轮回分配；12个示例角色的初始魅力5、个人成长20%是本作首稿数值。计略／骑士团尚未实现，魅力不进入普通武器攻击或招募公式，官方用途及精确系数仍需核对。旧存档缺失魅力补0，已有八项不重算；旧战斗缺失魅力时保留原随机成长序列。

## 检查口径

向量顺序统一为**HP／力／魔／技／速／运／防／魔防／魅力**；数值是百分点。合计只用来发现异常，不代表强度。检查分值按职责对各属性加权，HP权重0.35～0.6，主要攻击或防御约1，未使用攻击属性通常0；魅力战斗机制未接入，检查权重暂为0。完整权重保存在工具中，只能在同职责内辅助排查，不能跨职责排名。移动、射程、特效弱点、技能和装备都不在该分值内。

同阶、同职责、相同武器集合、移动类型／距离和重装特征才比较逐项压制：调整前${beforeDominated.length}对，调整后${afterDominated.length}对。调整前：${beforeDominated.join('；') || '无'}。调整后：${afterDominated.join('；') || '无'}。这不是对完整战斗强度的裁决。

推荐路线中没有任何一项成长改善的升阶：调整前${beforeStagnant.length}组（${beforeStagnant.join('；') || '无'}），调整后${afterStagnant.length}组。只要求有值得培养的优势，允许部分属性下降及路线分工变化。

## 八年培养测算

沿用当前职业开放年份1／2／4／6／8，参考年末等级${YEAR_LEVELS.join('／')}，各年升级次数${YEAR_GAINS.join('／')}，合计98次。假设开放当年已购买资格并及时切换，不模拟金币、每月购买额度和技能训练。无神将的路线继续使用最上级，不强行补造职业。弓系末年可跨到绝祸神将，与已确认的跨路线规则一致。

下表是本次定向加强带来的**理论额外属性**（当前表减原表；扩展职业前后相同），未考虑上限与空级重掷。+10个百分点持续20次升级只相当于期望+2点；不会因为八年99级就把神将加成当作作用了98级，正常主线第八年只有12次升级。主线后长期停留／轮回仍需另测。

| 路线 | 每年职业（重复表示继续使用） | 八年额外属性期望 |
| --- | --- | --- |
${routeRows.join('\n')}

调用实际gainExperience／随机成长引擎，每路线各${SAMPLES}个固定种子，前后共${SAMPLES * routes.length * 2}次完整培养。固定初始属性${fmt(STAT_KEYS.map(key => BASE_STATS[key]))}、个人基础成长${fmt(STAT_KEYS.map(key => PERSONAL[key]))}，通常型、年龄20→27岁；无轮回、药、装备／技能成长加成、传承数值保底。工具借用个人成长覆盖字段构造同一测试人，不代表给所有角色设置该成长；各路线独立试算，不在实际游戏中跨种族转职。两版使用相同种子，随机消费会随空级重掷和触顶变化，不能逐次升级一一对应。

| 路线／版本 | 99级平均属性 | 触顶属性次数（256人×9项） |
| --- | --- | ---: |
${simulationRows.join('\n')}

所有试算均完成98次升级并到达99级，各项不越上限。这只证明这组参考培养计划能正常成长，不能证明所有招募、个人成长、年龄、路线、战斗和八年经济均已平衡。职业数、武器权限、移动、技能配置、年龄曲线与经济规则不在本轮调整范围。竞技场示例AI回归也只是玩法回归，不能替代真实玩家长期对局。

## 完整前后表

基础身份平民／贵族仍为全0。其余${rows.length}个职业如下；待实现的舞者、神乐神将、战车兵3项继续不可用。对照基线class-growth-nine-stat-baseline.json仍保留原表60职和原22个扩展的历史数据，报告只采用当前目录的77项。此前的八属性基线保留作历史记录，不用于本轮加强幅度计算。

| 阶 | 职业（编号） | 本轮处理 | 职责 | 原表／扩展既有配置 | 当前表 | 合计 | 职责检查分 |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## 复现与验证

仓库根目录使用Node24或更新版本，在PowerShell执行：

\`\`\`powershell
node tools/balance/class-growth.ts --check
node --test backend/common/game/class-growth.test.ts backend/common/game/classes.test.ts
npm --prefix backend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
$env:CHROME_BIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
node frontend/test/systems.e2e.mjs
\`\`\`

本轮实际验证：九属性与魅力回归、后端全套、前端类型检查和构建均通过；静态目录版本升至8，客户端可更新职业与成长数据缓存。具体测试计数与浏览器回归见14的最新记录。

预期：测算报告与已保存文件完全一致，12条路线前后各256次培养通过，后续推荐升阶停滞为0；职业针对性测试、后端全套、前端类型检查、构建与浏览器检查全部通过。修改成长配置后运行\`node tools/balance/class-growth.ts\`重新生成本文，必须重新审阅培养结果；\`--check\`只校验不写文件。旧版基线单独保存，不能随新配置一起覆盖。
`;
const output = fileURLToPath(new URL('../../docs/16-class-growth-balance.md', import.meta.url));
if (process.argv.includes('--check')) assert.equal(readFileSync(output, 'utf8').replaceAll('\r\n', '\n'), report, 'Regenerate and review the class growth report');
else writeFileSync(output, report);
console.log(JSON.stringify({ version: CLASS_GROWTH_VERSION, classes: CATALOG_CLASS_IDS.length, routes: routes.length,
  sourceClassesBuffed: buffRows.length, sourceClassesUnchanged: activeReference.length - buffRows.length,
  simulations: SAMPLES * routes.length * 2, stagnantBefore: beforeStagnant.length, stagnantAfter: afterStagnant.length,
  dominatedBefore: beforeDominated, dominatedAfter: afterDominated, report: output }, null, 2));

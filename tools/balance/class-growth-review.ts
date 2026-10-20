import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CATALOG_CLASS_IDS, CLASSES, STAGE_NAMES, classUnavailableReason } from '../../backend/common/data/classes.ts';
import type { CatalogClassId } from '../../backend/common/data/classes.ts';
import { CLASS_GROWTH_VERSION, SOURCE_GROWTH_BUFFS } from '../../backend/common/data/class-growth.ts';
import { FW_CLASS_REFERENCE } from '../../backend/common/data/class-reference.ts';
import { STAT_KEYS, STAT_NAMES } from '../../backend/common/data/types.ts';
import { CATALOG_VERSION } from '../../backend/common/game/catalog.ts';

const source = new Map(FW_CLASS_REFERENCE.map(ref => [ref.id, ref]));
const original = (id: CatalogClassId) => {
  const ref = source.get(id as typeof FW_CLASS_REFERENCE[number]['id']);
  return ref ? [0,1,2,4,3,7,5,6,8].map(i => ref.growth[i]) : null;
};
const format = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
const sourceName = (id: CatalogClassId) => ({ 'fortunes-weave': '原表', legacy: '前作适配', species: '兽／龙扩展' })[CLASSES[id].source];
const stageName = (stage: number) => stage === 0 ? '基础身份' : STAGE_NAMES[stage - 1];
const deltas = CATALOG_CLASS_IDS.filter(id => original(id)).map(id => {
  const before = original(id)!;
  const values = STAT_KEYS.map((key, i) => CLASSES[id].growth[key] - before[i]);
  assert.ok(values.every(value => value >= 0), `${id}: source tuning must not nerf any stat`);
  const configured = SOURCE_GROWTH_BUFFS[id as keyof typeof SOURCE_GROWTH_BUFFS] ?? {};
  assert.deepEqual(values, STAT_KEYS.map(key => configured[key] ?? 0), `${id}: runtime and buff list must agree`);
  return { id, before, values, total: values.reduce((a, b) => a + b, 0) };
});
const changed = deltas.filter(row => row.total > 0);
const unchanged = deltas.filter(row => row.total === 0);
const extensions = CATALOG_CLASS_IDS.filter(id => CLASSES[id].source !== 'fortunes-weave');
const pending = CATALOG_CLASS_IDS.filter(id => classUnavailableReason(id));
assert.equal(new Set(CATALOG_CLASS_IDS).size, CATALOG_CLASS_IDS.length);
assert.equal(changed.length, Object.keys(SOURCE_GROWTH_BUFFS).length);
assert.equal(changed.length + unchanged.length + extensions.length, CATALOG_CLASS_IDS.length);
const totals = [...new Set(changed.map(row => row.total))].sort((a, b) => a - b);
const budgetRows = totals.map(total => `| ${format(total)} | ${changed.filter(row => row.total === total).length} | 约${total / 5}点，分布在所改属性 |`);
const deltaRows = changed.map(({ id, before, values, total }) => {
  const changes = STAT_KEYS.flatMap((key, i) => values[i] > 0
    ? [`${STAT_NAMES[key]} ${format(before[i])}→${format(CLASSES[id].growth[key])}（补${format(values[i])}）`] : []).join('；');
  return `| ${CLASSES[id].name} | ${stageName(CLASSES[id].stage)} | ${changes} | ${format(total)} |`;
});
const earlyIds: CatalogClassId[] = ['gladiator','hunter','lancer','ornius_rider','swordsman','fighter','brawler',
  'archer','rogue','knight','cavalier','armored_ornius','pegasus','mercenary','thief','ninja'];
const earlyRows = earlyIds.map(id => {
  const cls = CLASSES[id], before = original(id);
  const delta = before ? cls.growth.str - before[1] : null;
  return `| ${cls.name} | ${stageName(cls.stage)} | ${format(cls.growth.str)} | ${delta === null ? '独立适配值' : delta === 0 ? '保留原值' : format(delta)} | ${format(cls.growth.skl)} | ${format(cls.growth.spd)} |`;
});
const allRows: CatalogClassId[] = [];
const stageTables = ([0,1,2,3,4,5] as const).map(stage => {
  const ids = CATALOG_CLASS_IDS.filter(id => CLASSES[id].stage === stage);
  const rows = ids.map(id => {
    allRows.push(id);
    const cls = CLASSES[id], before = original(id);
    const values = STAT_KEYS.map((key, i) => {
      const value = format(cls.growth[key]);
      return before && cls.growth[key] !== before[i] ? `**${value}**` : value;
    });
    const total = STAT_KEYS.reduce((sum, key) => sum + cls.growth[key], 0);
    return `| ${cls.name} | ${sourceName(id)} | ${values.join(' | ')} | ${format(total)} |`;
  });
  return `### ${stageName(stage)}（${ids.length}项）\n\n| 职业 | 来源 | HP | 力 | 魔 | 技 | 速 | 幸运 | 防 | 魔防 | 魅力 | 合计 |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}`;
});
assert.deepEqual([...allRows].sort(), [...CATALOG_CLASS_IDS].sort(), 'the full review must contain each canonical class once');
const report = `# 17 职业成长调整方案 · 审阅版

更新日期：2026-10-17。成长版本：\`${CLASS_GROWTH_VERSION}\`；目录版本：${CATALOG_VERSION}。以下数值已写入当前代码，仍属于可继续校准的平衡草案。本稿整理当前结果，供逐职业审阅。

## 当前采用的方案

共${CATALOG_CLASS_IDS.length}个独立职业条目，完整列出HP、力、魔、技、速、幸运、防、魔防、魅力九项：原表${deltas.length}个，其中${changed.length}个定向加强、${unchanged.length}个保留原值；另外${extensions.length}个前作／兽龙扩展使用本作独立适配数值。原表的魅力成长逐项保留，不额外加强；${extensions.length}个扩展职业的魅力修正暂为0，留待内容校准。历史编号只作兼容，不重复算职业。

本次删除勇士、上忍、机关师、战斗修士、战象兵，保留勇者。勇士旧编号合并至勇者，不叠加两套成长；其他四项仅保留旧存档／回放读取兼容，不再出售、转职、招募或新生成敌人。原始60行参考资料保留，现行原表职业为58项，前作补充9项，兽／龙10项；基础身份包含在总数内。

兽人与龙人是封闭的特殊职业链，只能使用当前职业或本族下一阶，不可跳阶、降阶、跨到人类职业或互转。资格购买仍遵守年份、金币和月额度；派遣训练共用同一限制。轮回回到本族第一阶，种族保留，人类仍可跨普通路线购买与切换。

- 兽人：幼战士 → 兽战士 → 兽勇士 → 兽王卫 → 兽神将。
- 龙人：觉醒者 → 龙人 → 古龙卫 → 龙贤者 → 龙神将。

剑士在当前目录中的名字是“剑客”。剑客、弓箭手、猎兵、飞鸵兵、恶棍、骑甲鸵兵、天翼兵，职业力量成长先补到+5个百分点。剑客、弓箭手和天翼兵上次提高到+10的方案已收回到+5，没有叠加保留。剑客原有技巧+10、速度+15照常保留。

这项“先补5”针对低阶力量。**相对原表的累计调整还包含此前的其他属性变化。**例如天翼兵累计力量+5、速度+10；轻骑兵累计力量+5、技巧+5。它们的各项增幅合计分别是+15和+10，不能都记成“这个职业只加5”。所有累计改动见下面清单。

保留职业分工：土匪力量+15、斗拳手+10，剑术侧重技巧与速度；德鲁伊魔力+30、巨型重甲兵防御+30等原有专长保留。魔法角色的低力量不在这次低阶物理补强范围。

## 数值怎么读

本文都是**职业成长修正，单位为百分点**。角色个人成长另算。以没有额外加成的通常型角色为例，个人力量成长40%，职业提供+5个百分点，实际力量成长就是45%。转职仅改变今后的成长，不赠送力量、不重算已获属性。

| 单项成长比原表增加 | 练10级的额外属性期望 | 练20级的额外属性期望 |
| --- | ---: | ---: |
| +5个百分点 | 约0.5点 | 约1点 |
| +10个百分点 | 约1点 | 约2点 |

这是不考虑触顶和空级重掷的近似期望，实际成长仍有随机性。作用了多少次升级就算多少次；高阶职业较晚开放，不能把它的修正当作从一级一直生效。

## 全部累计调整清单

本表统一与未经截断的原表比较。“各项增幅合计”是新增百分点的相加，只帮助检查改动大小，不能代替职业战斗强度；HP、力量、速度的价值不同。这些数字也不是人物最终成长率或升级直接增加的属性点。

| 各项增幅合计 | 职业数 | 持续20次升级的额外总属性期望 |
| --- | ---: | --- |
${budgetRows.join('\n')}

${changed.length}个职业的具体改动如下；没有列出的属性保持原值。

| 职业 | 阶级 | 原表→当前及增加量 | 各项增幅合计 |
| --- | --- | --- | ---: |
${deltaRows.join('\n')}

累计增幅较集中的三个职业是铁甲骑兵、英勇骑士、飞龙将领，每个合计+20，分布在多个属性。它们仍有原有短板；例如铁甲骑兵当前速度−5、魔防−5，英勇骑士速度−10、魔防−5。天翼兵还保留此前的速度+10。这些较大的累计改动应优先观察实战反馈，暂不继续追加。

## 低阶物理职业对照

下表方便先看剑士这类前期培养对象。力量、技巧、速度均为当前职业修正；“力量比原表增加”只表示力量一项，不包含其他属性变化。前作扩展没有本次原表中的对应行，因此单独标注。

| 职业 | 阶级 | 当前力量 | 力量比原表增加 | 当前技巧 | 当前速度 |
| --- | --- | ---: | --- | ---: | ---: |
${earlyRows.join('\n')}

## 全部职业当前成长表

以下覆盖${CATALOG_CLASS_IDS.length}个条目，按阶级排列。**粗体表示该属性相对原表有调整**；未加粗的原表数字保持不变。合计为九项职业成长修正的代数和，负数照常扣除，不含个人成长，也不等同于战斗强度。前作／兽龙的数值是本作适配值，不当作对应原作的官方成长。基础身份也列入表，便于核对总数。

${stageTables.join('\n\n')}

## 实现范围与后续校准

当前引擎已补齐HP、力、魔、技、速、幸运、防、魔防、魅力九项。魅力有独立数值、个人／职业成长且无数值上限（现行rules-v15仅HP封顶150，等级仍封顶99），参与战斗和训练升级、成长传承、数值保底以及轮回的30点成长分配。幸运只列一次，与魅力分别保存。

12个示例角色暂用初始魅力5、个人成长20%的本作草案，尚未逐人设计个性差异。这不是原作人物数据，也没有照搬幸运。旧存档只把缺失的魅力数值／冻结成长补0，已有八项数值与过去成长不重算；旧99上限继承合同在读档或下次保底时按保存的sourceTotal刷新为无总容量上限、target=sourceTotal、lost=0；之后按当前规则成长。旧战斗缺失魅力时保留原升级随机序列。

魅力的计略／骑士团等战斗用途与《万缕千丝》精确系数仍需核对、接入；本次没有给普通武器攻击、必杀回避或招募添加自创魅力效果。[任天堂官方介绍](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-2-games/Fire-Emblem-Fortune-s-Weave-2915498.html)尚未在说明文字中给出这些系数，不把其他作品公式冒充本作已实现规则。

${pending.map(id => CLASSES[id].name).join('、')}共${pending.length}项的专属机制仍未完成，暂不可购买／切换／派遣；表中有成长数值不代表机制已经可用。职业完整固有能力、精通内容及白魔法攻击仍有待完成的部分。前作与兽／龙适配数值也继续接受后续平衡，不把目录齐全当作全机制完成。

九属性培养测算采用12条参考路线、每条前后各256个种子，共6144次；按当前开放年份和参考升级节奏计算。本次按rules-v15无上限规则重新复核，本组培养数值与原99上限报告一致，历史成长配置基线保持不变。魅力成长、无上限传承、轮回和旧数据兼容另有回归检查；完整验证计数见[接入说明](14-integration-handoff.md)。这组参考结果不代表全部角色、装备、技能、轮回和八年经济均已平衡。

## 数据与复核

职业和武器权限见[职业目录](15-class-catalog.md)，改动理由、完整原表对照和培养试算见[技术测算报告](16-class-growth-balance.md)。原始参考是用户指定的[《万缕千丝》职业表](https://fire-emblem-fw.site/classes.html)，本作配置见[成长配置](../backend/common/data/class-growth.ts)和[原始参考数据](../backend/common/data/class-reference.ts)。

仓库根目录使用Node24或更新版本执行：

\`\`\`powershell
node tools/balance/class-growth-review.ts --check
node tools/balance/class-growth.ts --check
\`\`\`

预期两个命令退出码都为0，审阅稿覆盖全部${CATALOG_CLASS_IDS.length}个职业且与代码一致，技术报告的6144次培养校验通过。成长数值以后变动时，分别运行上述命令去掉\`--check\`重新生成文档，再审阅差异。
`;
const output = new URL('../../docs/17-class-growth-review.md', import.meta.url);
if (process.argv.includes('--check')) assert.equal(readFileSync(output, 'utf8').replaceAll('\r\n', '\n'), report, 'Regenerate and review the class growth document');
else writeFileSync(output, report);
console.log(JSON.stringify({ version: CLASS_GROWTH_VERSION, classes: allRows.length, changed: changed.length,
  unchanged: unchanged.length, extensions: extensions.length, pending: pending.length,
  deltaBudgets: Object.fromEntries(totals.map(total => [total, changed.filter(row => row.total === total).length])),
  report: 'docs/17-class-growth-review.md' }, null, 2));

import type { ReactNode } from 'react';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { CLASS_OPEN_YEAR, CLASS_PRICE, STAGE_NAMES } from '@common/data/classes.ts';
import type { ClassStage } from '@common/data/classes.ts';
import { ARENA_GOLD } from '@common/game/arena.ts';
import { ARENA_DAY_OF_MONTH, DAYS_PER_SEASON, SEASONS_PER_YEAR } from '@common/game/calendar.ts';
import { DUNGEON_DAYS, DUNGEON_STAGES, DUNGEON_STAGE_DAYS } from '@common/game/expedition.ts';
import { DRUG_LIMIT_PER_STAT, DRUG_LIMIT_TOTAL } from '@common/game/items.ts';
import { LEGACY_MIN_LEVEL, REINCARNATION_GOLD, REINCARNATION_LEVEL, REINCARNATION_POINTS, REINCARNATION_STAT_MAX } from '@common/game/legacy.ts';
import { ROSTER_LIMIT } from '@common/game/model.ts';
import { DISPATCH_MAX_DAYS, DISPATCH_MAX_UNITS, DISPATCH_MIN_DAYS } from '@common/game/dispatch.ts';
import { MINIGAME_BETS, MINIGAME_PLAYS_PER_QUARTER } from '@common/game/minigames.ts';
import { RECRUIT_UNLOCK_DAY } from '@common/game/random-recruit.ts';
import { CHALLENGE_FLOORS } from '@common/game/challenges.ts';
import { SKILL_SLOTS } from '@common/game/mastery.ts';
import { eraYear, plainDate } from '../ui/calendar.ts';
import { useSession } from '../api/session.ts';
import { featuresOf } from '../model/access.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { itemName } from './SystemParts.tsx';

function Section({ id, title, link, children }: { id: string; title: string; link?: [string, string]; children: ReactNode }) {
  return (
    <section className="panel" aria-labelledby={`r-${id}`} id={id}>
      <div className="ph"><h2 id={`r-${id}`}>{title}</h2>{link && <a className="btn btn-sm btn-ghost" href={link[1]}>{link[0]} ›</a>}</div>
      <ul className="sys-rules">{children}</ul>
    </section>
  );
}

const STAGES: ClassStage[] = [1, 2, 3, 4, 5];

// 规则手册: the confirmed rules a player acts on, in one place. Numbers come from the shared tables
// (backend/common) or from the server, so the manual cannot drift from what the game does. Internal
// growth curves and probabilities stay out on purpose (docs/14).
export function RulesPage() {
  const { state, today, annual, story, production } = useSession();
  const features = featuresOf(state);
  const actions = today?.actions ?? [];
  const maps = Object.values(ARENA_MAPS);
  return (
    <Shell current="rules">
      <div className="brief-head">
        <div>
          <div className="eyebrow">规则手册</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>军团作战守则</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>这里只写已经确定、并且游戏里正在执行的规则；数值都直接取自游戏数据。</p>
        </div>
      </div>
      <nav className="chips rules-toc" aria-label="目录">
        {[['calendar', '日历'], ['battle', '战斗与阵亡'], ['gear', '耐久与法术'], ['arena', '竞技场'], ['annual', '大竞技场'], ['dungeon', '大副本'], ['quests', '任务与挑战塔'], ['dispatch', '派遣'], ['tavern', '酒馆'], ['craft', '生产'], ['growth', '养成'], ['legacy', '传承与轮回']]
          .map(([id, label]) => <a key={id} className="chip" href={`#/rules`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}>{label}</a>)}
      </nav>

      <div className="rules-grid">
        <Section id="calendar" title="个人日历与行动" link={['军营', links.camp]}>
          <li>每个军团有自己的日历：一年 {SEASONS_PER_YEAR} 季、每季 {DAYS_PER_SEASON} 日。只有你的行动会推进日期，离线不会。</li>
          <li>每季第 {ARENA_DAY_OF_MONTH} 日是竞技场日（已报名的军团当天生成对手）。每场进攻推进 1 日；三场都打完，或日历走到下一个竞技场日时，剩余没打的进攻才按落败计。</li>
          {actions.map(a => <li key={a.key}>{a.name}：{a.key === 'rest' ? '自选日数' : `${a.costDays} 日`}{a.costGold ? `、${a.costGold} 金币` : ''}。{a.note}。</li>)}
          <li>整理仓库、买卖、装备、分配公共经验都不推进日期。</li>
        </Section>

        <Section id="battle" title="战斗与阵亡" link={features.field ? ['出击', links.field] : undefined}>
          <li>野外战斗、大副本和年度大竞技场里，倒下的普通角色永久死亡；神主角倒下只撤退。</li>
          <li>普通竞技场与练习是模拟战，没有真实伤亡。</li>
          <li>战死的角色带着的武器与道具回到仓库；达到传承等级的会留下遗产。</li>
          <li>冬季出发的新战斗：草地积雪，河流与浅滩结冰；道路和桥保持原样，战斗中的季节不会随日历变化。</li>
          <li>行动起点在雪地时移动力−1，在冰面时+1；飞行单位不受这两种效果影响。</li>
          <li>重甲（包括重甲骑兵）经过或落脚会踩裂冰面，变回水域；其他单位不会。碎冰不扣血、不会复原，站在碎冰处仍可离开，后来者需绕路或飞越。</li>
          <li>撤退立即判负，已经获得的经验保留，通关奖励不发。</li>
          <li>舞者与神乐神将的「舞蹈」只能让相邻、本阶段已行动的友军再次行动；同一目标每阶段最多一次。</li>
          <li>每名角色最多带 1 枚不朽盾：致命一击时消耗，保留 1 HP 并石化到下个己方阶段；石化期间不能接受任何回复。</li>
        </Section>

        <Section id="gear" title="耐久、法术与功能杖" link={['整备', links.prep()]}>
          <li>普通攻击与反击不消耗耐久；物理武器的主动战技按战技标注的耐久消耗，耐久不足时只能普通攻击。</li>
          <li>魔道书、法术书与杖每本有独立次数，每次施放／使用消耗 1 次：攻击时开场、速度追击、反击各算一次，次数不够就不追击，用完就不能再用这本；放回仓库或交给别人时剩余次数跟着书走。</li>
          <li>施法要现职业有对应魔法权限（黑／暗魔法看理，白魔法看杖）并达到书的级别；芬布尔之夜等三本最上级书另须先用限量教材学会。法术书在仓库「法术书」分类里，每人最多带 5 本。</li>
          <li>状态杖与控场法术（睡眠、沉默、冻结）不进入交战：命中＝基础命中＋技×2＋运÷2−目标回避，首领减半；睡眠杖睡过目标的下 1 个阶段。</li>
          <li>部分武器带特殊效果：魔法武器按魔力对魔防；毒武器命中附毒；反噬剑命中时有（31−幸运）% 改由自己承受；逆枪剑反转克制。交战预测会逐项标出。</li>
          <li>维修（整备或铁匠铺）把武器修回它已有的上限，杖补满次数；旅馆休息 1 日补满一本书，以太口粮恢复 25%、完整料理恢复全部。战斗、远征与年度赛事中不能用旅馆和食物。</li>
          <li>沉默时不能施法或用杖；睡眠时不能行动，受击即醒；复原杖与「休息」可以解除。</li>
          <li>每人共用 {SKILL_SLOTS} 格，选择已学被动技能与战技；基础战技与升级战技分别占格。个人、职业固有能力及装备授予的技能／战技不占格。</li>
        </Section>

        <Section id="arena" title="竞技场" link={features.arena ? ['竞技场', links.arena] : undefined}>
          <li>每张地图决定出战人数、禁用人数与回合上限：{maps.map(m => `${m.name} ${m.deploy} 人、禁 ${m.bans}、${m.turnLimit} 回合`).join('；')}。</li>
          <li>流程：看对手 → 禁用 → 揭晓阵容 → 部署 → 开战。对手的站位在禁用后揭晓，AI 行为始终不公开；每场入场推进 1 日。</li>
          <li>三场进攻可以跨日继续；三场都打完，或日历到达下一个竞技场日时，剩余没打的才按落败计。后台扫描不会在两次进攻之间判负。</li>
          <li>首版只有进攻：不需要设置防守。对手是同一天到达的其他军团快照，不足时由官方队伍补足。</li>
          <li>同一形象只能有一名角色上场；可用形象不足时按实际形象数封顶，不要求用重复形象填满。</li>
          <li>积分：胜利 20，无人阵亡 +5，在回合上限一半以内获胜 +5。</li>
          <li>金币：每胜 {ARENA_GOLD.win}，打完的落败 {ARENA_GOLD.loss}；投降和没打的不发参与金币。普通竞技场是模拟战，没有真实伤亡，也不发等级经验。</li>
          <li>现实月榜按现实月份归档，月末冻结名次与奖励，旧月奖励可以之后再领。</li>
        </Section>

        <Section id="annual" title="年度大竞技场" link={features.annual ? ['赛程', links.annual] : undefined}>
          <li>每年一届，每届都从海选打起：{annual?.qualifierMatches ?? 3} 场至少赢 {annual?.qualifierWins ?? 2} 场进 64 强正赛，正赛单败 6 轮夺冠。</li>
          <li>每场推进 {annual?.costDays ?? 2} 日，真实死亡与消耗跨场保留；局间只恢复存活者的 HP。</li>
          <li>报名锁定名单与快照，按名单顺序出战，第 1 位担任主将；当届出局或退赛不能重报。</li>
          <li>主线每年开一章，名次、海选和地区进度都不挡章节；每章完成后可领一次团队公共经验 {story?.bexp ?? ''}。</li>
        </Section>

        <Section id="dungeon" title="三图大副本" link={features.dungeon ? ['大副本', links.dungeon] : undefined}>
          <li>同一支队伍连打 {DUNGEON_STAGES} 张图，合计 {DUNGEON_DAYS} 日，逐图推进 {DUNGEON_STAGE_DAYS.join('、')} 日；名单出发后固定，不能补人。</li>
          <li>HP、道具与武器跨图沿用上一张图结束时的状态，不恢复；出发后的整备改动不会带进远征，远征中的角色不能轮回或购买职业资格。</li>
          <li>打完一张图可以继续或撤离；只有拿下第 {DUNGEON_STAGES} 张图的首领，掉落和金币才带回，首次完整通关讨伐该地区。</li>
          <li>敌人等级在出发时锁定。</li>
        </Section>

        <Section id="quests" title="地区任务与挑战塔" link={features.quests ? ['任务', links.quests] : undefined}>
          <li>每个地区一条本地任务链，胜利后任务标记完成，金币、物资与声望另行领取；声望永久保留，购买不扣。</li>
          <li>每张图规定出战人数与敌军等级上限；名册上限 {ROSTER_LIMIT} 人，多出的人留作替补。</li>
          <li>挑战塔：{CHALLENGE_FLOORS.filter(f => !f.postgame).map(f => `${f.name.replace('挑战塔 · ', '')} 敌 Lv ${f.level}、${f.costDays} 日`).join('；')}；先通关，再分别领一次首通与一次重复奖励。完成主线第八章后开放禁忌之地，按关卡顺序挑战高难首领。</li>
        </Section>

        <Section id="dispatch" title="后台派遣" link={features.dispatch ? ['派遣', links.dispatch] : undefined}>
          <li>一次最多派 {DISPATCH_MAX_UNITS} 人、{DISPATCH_MIN_DAYS}–{DISPATCH_MAX_DAYS} 日；派遣本身不推进日期，你的日历走到返程日时一次结算。</li>
          <li>返程带回素材（低概率带回武器），每人获得经验、所选职业的精通与武器熟练度；派遣不会阵亡。</li>
          <li>派出期间这些人不能出战、换职、整备或报名大竞技场。</li>
        </Section>

        <Section id="tavern" title="酒馆" link={features.tavern ? ['酒馆', links.tavern] : undefined}>
          <li>第二年（{plainDate(RECRUIT_UNLOCK_DAY)}）开放：每个地区每季度 3 名付费候选，季度内不重掷；游历招募同时开放。</li>
          <li>小游戏每个游戏季度共 {MINIGAME_PLAYS_PER_QUARTER} 局，下注 {MINIGAME_BETS.join('／')} 金币：猜大小押中返还 2 倍（三同点算输），青蛙赛跑押中冠军返还 3.8 倍。不推进日期，属性不影响结果。</li>
          <li>严重损失后的紧急补员免费、不推进日期，每次新的真实伤亡只能领一次。</li>
        </Section>

        <Section id="craft" title="生产" link={features.workshop ? ['生产', links.workshop] : undefined}>
          {(production?.recipes ?? []).map(r => (
            <li key={r.id}>{r.name}：{r.input.map(i => `${itemName(i.item)} ×${i.count}`).join(' + ')} → {itemName(r.output.item)} ×{r.output.count}，{r.days} 日成熟。</li>
          ))}
          <li>工位：{(production?.facilities ?? []).map(f => `${f.name} ${f.slots} 个`).join('、')}。播种花 1 日，炼药和锻造开工不耗日。</li>
          <li>完美锻造另付 1,500 金币：产出的武器第一次交给角色时耐久上限 +10，之后维修回到新上限，不叠第二次。</li>
          <li>成熟靠推进日期；领取不推进日期，每单只领一次。</li>
        </Section>

        <Section id="growth" title="养成" link={['名册', links.roster()]}>
          <li>升级时各项属性按成长率随机增加；成长率是每次升级的概率，不是保证。</li>
          <li>名册上限 {ROSTER_LIMIT} 人。能力药每人每项最多 {DRUG_LIMIT_PER_STAT} 次、合计 {DRUG_LIMIT_TOTAL} 次，不会超过属性上限。</li>
          <li>职业资格按年份开放、可以跨路线购买：{STAGES.map(s => `${STAGE_NAMES[s - 1]}${eraYear(CLASS_OPEN_YEAR[s])} ${CLASS_PRICE[s].toLocaleString()} 金`).join('；')}。</li>
          <li>转职保留等级、经验与已获得的属性；已购资格与本命职业可以免费切回。</li>
          <li>学会战技只加入已学库，不会自动装备；须在精通与技能中选入共享格。装上后仍需满足职业、兼容武器、武器等级与资源要求才能使用。</li>
          <li>游历招募只花行动日：遇到候选后可以接受或拒绝，拒绝不退日期；候选在决定前一直保留。</li>
          <li>随机招募的个人成长在入队时一次掷定并保存；之后升级、战斗、存档和传承来源都使用这份成长，不会退回形象角色的默认值。</li>
        </Section>

        <Section id="legacy" title="传承与轮回" link={features.legacy ? ['传承', links.legacy] : undefined}>
          <li>普通角色达到 {LEGACY_MIN_LEVEL} 级后战死、寿终或正常退役，会留下一份遗产；主角不会。</li>
          <li>遗产交给一名 1 级新角色：成长传承替换个人成长率，数值传承保证属性总和逐级追平来源（超出继承者属性上限的部分不保留）。每人一生只接受一次，接受过的人不能再传。</li>
          <li>轮回：{REINCARNATION_LEVEL} 级、{REINCARNATION_GOLD.toLocaleString()} 金币与一枚轮回核心。回到 1 级与初始职业、16 岁，清空熟练度、职业资格、学习进度、已学技能与已学战技，携带物品回到仓库，另分配 {REINCARNATION_POINTS} 点成长（单项最多 {REINCARNATION_STAT_MAX}）。一生一次。</li>
        </Section>
      </div>
    </Shell>
  );
}

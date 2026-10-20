import { useState } from 'react';
import type { ClassId } from '@common/data/classes.ts';
import { RANKS, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { RANK_EXP } from '@common/game/model.ts';
import { TRAINING_GROUPS, trainingWeaponProgress } from '@common/game/training.ts';
import type { TrainingGroupId } from '@common/game/training.ts';
import type { ServerUnit } from '../api/session.ts';
import { ICONS, weaponIcon } from '../assets.ts';
import { advance } from '../ui/calendar.ts';
import { Modal } from '../ui/Modal.tsx';
import { UnitFace } from './SystemParts.tsx';

export function TrainingDialog({ units, initialUnitId, maxUnits, days, costPerUnit, weaponExp, day, gold, disabled, onCancel, onConfirm }: {
  units: ServerUnit[]; initialUnitId?: string; maxUnits: number; days: number; costPerUnit: number; weaponExp: number; day: number; gold: number;
  disabled: boolean; onCancel: () => void; onConfirm: (unitIds: string[], groupId: TrainingGroupId) => void;
}) {
  const [ids, setIds] = useState<string[]>(initialUnitId ? [initialUnitId] : units[0] ? [units[0].id] : []);
  const [groupId, setGroupId] = useState<TrainingGroupId>('agility');
  const group = TRAINING_GROUPS.find(row => row.id === groupId)!;
  const selected = units.filter(unit => ids.includes(unit.id));
  const costGold = costPerUnit * selected.length;
  const poor = gold < costGold;
  const ready = !disabled && !poor && selected.length > 0 && selected.length <= maxUnits;
  return <Modal title="武器训练" className="training-modal" onClose={onCancel} footer={<>
    <div className="training-total"><img className="px" src={ICONS.coin} width={20} height={20} alt="" /><strong>{costGold}</strong><span>金币</span></div>
    <button type="button" className="btn" onClick={onCancel}>取消</button>
    <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => { if (ready) onConfirm(selected.map(unit => unit.id), groupId); }}>开始训练 · {selected.length}人</button>
  </>}>
    <div className="training-summary">
      <span><img className="px" src={ICONS.train} width={32} height={32} alt="" /><b>共同训练 {days} 日</b></span>
      <span>每种武器 <strong>＋{weaponExp}</strong> 经验</span>
    </div>
    <div className="training-layout">
      <section className="training-roster" aria-label="选择训练队员">
        <div className="training-label"><b>参训队员</b><span>{selected.length} / {maxUnits} 人</span></div>
        <div className="training-units">
          {units.map(unit => {
            const checked = ids.includes(unit.id);
            return <label key={unit.id} className={`training-unit${checked ? ' selected' : ''}`}>
              <input type="checkbox" checked={checked} disabled={disabled || (!checked && selected.length >= maxUnits)}
                onChange={() => setIds(current => checked ? current.filter(id => id !== unit.id) : [...current, unit.id])} />
              <UnitFace unit={unit} size={36} />
              <span><b>{unit.name}</b><small>{unit.className} · Lv {unit.level}</small></span>
            </label>;
          })}
        </div>
        <div className="training-unlocks" aria-label="各年训练人数上限">
          {[1, 3, 5, 8].map((count, index) => <span key={count} className={count === maxUnits ? 'current' : ''}>第{index + 1}年<b>{count}人</b></span>)}
        </div>
      </section>
      <section className="training-detail" aria-label="训练分组与奖励">
        <div className="training-label"><b>武器分组</b><span>组内全部提升</span></div>
        <div className="training-groups" role="group" aria-label="训练分组">
          {TRAINING_GROUPS.map(row => <button key={row.id} type="button" aria-pressed={groupId === row.id} disabled={disabled}
            className={`training-group${groupId === row.id ? ' selected' : ''}`} onClick={() => setGroupId(row.id)}>
            <span aria-hidden="true">{row.weapons.map(type => <img key={type} className="px" src={weaponIcon(type)} width={24} height={24} alt="" />)}</span>
            <b>{row.name}</b>
          </button>)}
        </div>
        <div className="training-previews" aria-label="训练后的武器经验">
          {selected.length === 0 && <p className="muted">请选择参训队员。</p>}
          {selected.map(unit => <div key={unit.id} className="training-preview">
            <b>{unit.name}</b>
            {group.weapons.map(type => {
              const progress = trainingWeaponProgress({ ...unit, classId: unit.classId as ClassId }, type, weaponExp);
              const next = RANKS[RANKS.indexOf(progress.rankBefore) + 1];
              const floor = RANK_EXP[progress.rankBefore];
              const span = next ? RANK_EXP[next] - floor : 1;
              return <div key={type} className="training-weapon">
                <img className="px" src={weaponIcon(type)} width={20} height={20} alt="" />
                <span>{WEAPON_TYPE_NAMES[type]}</span>
                <b className="num">{progress.rankBefore}{progress.rankUp && ` → ${progress.rankAfter}`}</b>
                <div className="training-meter" aria-hidden="true"><i style={{ width: `${next ? Math.min(100, (progress.expAfter - floor) / span * 100) : 100}%` }} /></div>
                <small className="num">{progress.expBefore} → {progress.expAfter}</small>
                <strong>＋{weaponExp}</strong>
              </div>;
            })}
          </div>)}
        </div>
      </section>
    </div>
    <div className="training-receipt">
      <span><small>完成日期</small><b>{advance(day, days).label}</b></span>
      <span><small>{selected.length}人 × {costPerUnit} 金币</small><b className={poor ? 'training-poor' : ''}>剩余 {gold - costGold} 金币</b></span>
    </div>
    {poor && <p role="alert" className="training-poor">金币不足，还差 {costGold - gold}。</p>}
    {disabled && <p role="status" className="muted">当前状态已变化，请关闭后重新选择训练。</p>}
  </Modal>;
}

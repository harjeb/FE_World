import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { classicMap } from '../../backend/common/game/classic-catalog.ts';
import { classicAdaptation } from '../../backend/common/game/classic-adaptation.ts';
import { CLASSES } from '../../backend/common/data/classes.ts';
import { WEAPONS } from '../../backend/common/data/weapons.ts';
import { SPELLBOOKS } from '../../backend/common/data/spellbooks.ts';
import { TERRAINS, MOVEMENT } from '../../backend/common/maps/map.ts';

const plan = JSON.parse(readFileSync(new URL('./map-plan.json', import.meta.url), 'utf8'));
const roster = JSON.parse(readFileSync(new URL('./roster.json', import.meta.url), 'utf8')).units;
const map = classicMap(plan.sourceMapId), adaptation = classicAdaptation(plan.sourceMapId);
const original = JSON.stringify(map);
const objects = adaptation.objects;
const blocked = new Set(objects.filter(o => o.kind === 'door' || o.kind === 'wall').map(o => o.pos.join(',')));
const objectCells = new Set(objects.map(o => o.pos.join(',')));
const pointKey = p => p.join(',');
const groups = Object.fromEntries(plan.groups.map(g => [g.id, g]));
assert.equal(plan.units.length, 17);
assert.deepEqual(plan.units.map(u => u.name).sort(), roster.map(u => u.name).sort());
assert.equal(map.playerSpawns.length, plan.maxDeployment);
assert.deepEqual(plan.removeOriginalEvents, adaptation.events.map(e => e.id));
const taken = new Set(map.playerSpawns.map(pointKey));
function reachable(moveType) {
  const index = MOVEMENT[moveType].index;
  const queue = [map.playerSpawns[0]], seen = new Set(queue.map(pointKey));
  for (const [x, y] of queue) for (const next of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
    const [nx, ny] = next, key = pointKey(next);
    if (nx<0 || ny<0 || nx>=map.width || ny>=map.height || seen.has(key) || blocked.has(key)) continue;
    if (TERRAINS[map.terrain[ny][nx]].costs[index] === null) continue;
    seen.add(key); queue.push(next);
  }
  return seen;
}
for (const unit of plan.units) {
  const data = roster.find(r => r.name === unit.name), cls = CLASSES[data.classId], [x, y] = unit.pos;
  assert.ok(groups[unit.group]);
  assert.ok(x>=0 && y>=0 && x<map.width && y<map.height);
  assert.ok(!taken.has(pointKey(unit.pos)) && !objectCells.has(pointKey(unit.pos)), unit.name);
  taken.add(pointKey(unit.pos));
  assert.notEqual(TERRAINS[map.terrain[y][x]].costs[MOVEMENT[cls.moveType].index], null, unit.name);
  assert.ok(reachable(cls.moveType).has(pointKey(unit.pos)), `${unit.name}: reachable`);
  for (const weapon of unit.weapons) assert.ok(WEAPONS[weapon] && cls.weapons[WEAPONS[weapon].type], `${unit.name}: ${weapon}`);
  for (const [staff, charges] of Object.entries(unit.staffCharges ?? {})) {
    assert.ok(unit.weapons.includes(staff) && WEAPONS[staff].type === 'staff');
    assert.ok(charges>0 && charges<=WEAPONS[staff].maxCharges);
  }
  for (const book of unit.books) {
    const def = SPELLBOOKS.find(b => b.id === book.id);
    assert.ok(def && cls.weapons[def.study === 'whiteMagic' ? 'staff' : 'tome'], `${unit.name}: ${book.id}`);
    assert.ok(book.charges>0 && book.charges<=def.maxCharges);
  }
}
assert.deepEqual(plan.units.filter(u => u.boss).map(u => u.name), ['吕布']);
assert.equal(map.terrain[2][11], 'floor');
assert.equal(JSON.stringify(map), original);
assert.ok(!reachable('foot').has('11,8'), 'known central wall is impassable');
const hash = createHash('sha256').update(JSON.stringify(map.terrain)).digest('hex');
writeFileSync(new URL('./map-validation.json', import.meta.url), JSON.stringify({ status:'design-static-check-only', mapId:map.id,
  terrainSha256:hash, dimensions:[map.width,map.height], playerSpawns:map.playerSpawns, objects,
  units:17, uniqueDeploymentCells:taken.size, reachableCells:reachable('foot').size, weaponAndSpellAccess:'passed',
  originalTerrainUnmodified:true, simulationRun:false }, null, 2)+'\n');

const tile=28, left=46, top=92, right=left+map.width*tile+30;
const width=1100, height=900;
const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:'Noto Sans CJK SC',sans-serif} .small{font-size:12px;fill:#52606b}.name{font-size:15px;fill:#263445}</style><rect width="100%" height="100%" fill="#f7f3e9"/><text x="46" y="38" font-size="26" fill="#263445">时空试炼·终焉诸将 — 部署设计</text><text x="46" y="64" class="small">23×25 · 原地形不改 · 8 人出击 / 17 名将 · 普通 Lv48 · 击败吕布通关 · 设计稿，尚未实装</text>`];
for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++)svg.push(`<rect x="${left+x*tile}" y="${top+y*tile}" width="28" height="28" fill="${{floor:'#e2d7be',plain:'#bac8ac',wall:'#47515c'}[map.terrain[y][x]]}" stroke="#ffffff50" stroke-width=".5"/>`);
for(let x=0;x<map.width;x++)svg.push(`<text x="${left+x*tile+14}" y="${top-8}" text-anchor="middle" class="small">${x}</text>`);
for(let y=0;y<map.height;y++)svg.push(`<text x="${left-9}" y="${top+y*tile+19}" text-anchor="end" class="small">${y}</text>`);
for(const group of plan.groups.filter(g=>g.enterAtOrAboveY!==undefined)) {
 const y=top+(group.enterAtOrAboveY+1)*tile;
 svg.push(`<path d="M${left} ${y}H${left+map.width*tile}" stroke="${group.color}" stroke-width="2" stroke-dasharray="6 4"/>`);
}
for(const object of objects){const [x,y]=object.pos;svg.push(`<rect x="${left+x*tile+3}" y="${top+y*tile+3}" width="22" height="22" fill="${object.kind==='chest'?'#d7a53a':object.kind==='door'?'#9d764b':'#657785'}" stroke="#fff"/><text x="${left+x*tile+14}" y="${top+y*tile+19}" text-anchor="middle" font-size="13" fill="#fff">${{chest:'箱',door:'门',wall:'破'}[object.kind]}</text>`);}
for(const [i,point] of map.playerSpawns.entries()){const [x,y]=point;svg.push(`<rect x="${left+x*tile+2}" y="${top+y*tile+2}" width="24" height="24" rx="4" fill="#36714a" stroke="#fff"/><text x="${left+x*tile+14}" y="${top+y*tile+18}" text-anchor="middle" font-size="11" fill="#fff">P${i+1}</text>`);}
for(const [i,unit] of plan.units.entries()){const [x,y]=unit.pos;svg.push(`<circle cx="${left+x*tile+14}" cy="${top+y*tile+14}" r="12" fill="${groups[unit.group].color}" stroke="${unit.boss?'#f6d365':'#fff'}" stroke-width="${unit.boss?3:1}"/><text x="${left+x*tile+14}" y="${top+y*tile+19}" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">${i+1}</text>`);}
let ly=112;
for(const group of plan.groups){svg.push(`<text x="${right}" y="${ly}" font-size="18" font-weight="bold" fill="${group.color}">${group.id} · ${group.name}</text>`);ly+=26;
 for(const [i,u] of plan.units.entries()){if(u.group!==group.id)continue;const cls=CLASSES[roster.find(r=>r.name===u.name).classId];svg.push(`<text x="${right}" y="${ly}" class="name">${String(i+1).padStart(2,'0')} ${u.name} · ${cls.name} (${u.pos})</text>`);ly+=25;}ly+=20;}
for(const [i,line] of ['绿格：可通行平地；米色：地板；深灰：墙。','虚线：进入该行或更北时，对应组进入警戒。','原图黑暗区已适配成平地，并非不可走深渊。','吕布原首领格是地板，不附赠王座防御或回血。','坐标从左上角 (0,0) 开始；P 编号对应出击顺序。'].entries())svg.push(`<text x="46" y="${top+map.height*tile+20+i*15}" class="small">${line}</text>`);
svg.push('</svg>');
writeFileSync(new URL('./map-preview.svg', import.meta.url), svg.join('\n'));
console.log(`PASS: 17 enemies, 8 spawns, ${reachable('foot').size} reachable cells, legal equipment, original terrain preserved. SVG generated.`);

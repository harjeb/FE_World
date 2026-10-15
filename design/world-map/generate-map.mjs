import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A code-native pixel atlas for design review, not a playable world map.
const regions = [
  { id: '01', name: '晨原', x: 535, y: 625, icon: 'farm', color: '#91ae68', resource: '药草 · 步兵', dungeon: '失守庄园' },
  { id: '02', name: '绿林', x: 705, y: 485, icon: 'tree', color: '#70a486', resource: '木材 · 种植', dungeon: '古树密林' },
  { id: '03', name: '铁丘', x: 355, y: 500, icon: 'mine', color: '#c89a72', resource: '矿石 · 锻造', dungeon: '废弃矿坑' },
  { id: '04', name: '边关', x: 525, y: 360, icon: 'fort', color: '#b6b9a3', resource: '骑兵 · 训练', dungeon: '旧日要塞' },
  { id: '05', name: '水乡', x: 655, y: 730, icon: 'shrine', color: '#79bbbf', resource: '药草 · 炼药', dungeon: '沉水祠堂' },
  { id: '06', name: '古城', x: 825, y: 385, icon: 'ruin', color: '#d0b992', resource: '元素 · 魔法', dungeon: '失落学院' },
  { id: '07', name: '兽岭', x: 220, y: 405, icon: 'beast', color: '#aeab75', resource: '兽人 · 兽石', dungeon: '兽王旧寨' },
  { id: '08', name: '风崖', x: 470, y: 245, icon: 'tower', color: '#a7c3be', resource: '飞行 · 轻金属', dungeon: '风蚀高塔' },
  { id: '09', name: '荒漠', x: 845, y: 745, icon: 'ruin', color: '#d7af72', resource: '商旅 · 配方', dungeon: '沙下王城' },
  { id: '10', name: '龙谷', x: 930, y: 240, icon: 'dragon', color: '#bb9488', resource: '龙人 · 龙石', dungeon: '龙眠遗窟' },
  { id: '11', name: '旧王陵', x: 135, y: 240, icon: 'shrine', color: '#b1aab9', resource: '传承 · 遗迹', dungeon: '无名王陵' },
  { id: '12', name: '天门', x: 610, y: 145, icon: 'gate', color: '#dce5c9', resource: '神迹 · 轮回线索', dungeon: '天门圣所' },
];
const byId = Object.fromEntries(regions.map(region => [region.id, region]));
const city = { x: 540, y: 495 };
const fragments = [];
const add = value => fragments.push(value);
const rect = (x, y, width, height, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`;
const label = (x, y, value, size = 16, fill = '#dce2ce', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${value}</text>`;
const use = (id, x, y, scale = 1) =>
  `<use href="#${id}" transform="translate(${x} ${y}) scale(${scale})"/>`;

add(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000" viewBox="0 0 1400 1000" role="img" aria-labelledby="title description" shape-rendering="crispEdges">
<title id="title">十二地区像素世界地图：自由路线与连战副本</title>
<desc id="description">中央大竞技场连接十二个可自由选择的地区。金色路线示例为铁丘、兽岭、旧王陵，不限制其他路线。敌人按已讨伐地区数成长，每区有三张同主题地图组成的大副本，名单锁定且状态持续。</desc>
<defs>
 <pattern id="sea" width="40" height="32" patternUnits="userSpaceOnUse"><rect width="40" height="32" fill="#152b35"/><path d="M4 12h16m8 12h8" stroke="#203c44" stroke-width="2"/></pattern>
 <pattern id="grass" width="36" height="32" patternUnits="userSpaceOnUse"><rect width="36" height="32" fill="#344c41"/><path d="M4 8h4v-4m16 20h4v-4" stroke="#405a48" stroke-width="2"/></pattern>
 <g id="tree"><path d="M8 2h8v4h4v4h4v10H0V10h4V6h4z" fill="#1e3530"/><path d="M8 3h8v4h4v8H4V7h4z" fill="#638c65"/><path d="M8 7h4v4H4V7z" fill="#8ca56b"/><path d="M10 20h5v7h-5z" fill="#a8885d"/></g>
 <g id="pine"><path d="M10 0h4v4h4v4h4v4h-4v4h6v5H0v-5h6v-4H2V8h4V4h4z" fill="#668579"/><path d="M10 4h4v4h4v4H6V8h4z" fill="#a3b59a"/><path d="M10 21h4v6h-4z" fill="#998a6c"/></g>
 <g id="mountain"><path d="M16 0h8v8h8v8h8v8h8v12H0V24h8V16h8z" fill="#263c39"/><path d="M16 0h8v8h8v8h8v8H24v-8H8v-8h8z" fill="#77918a"/><path d="M16 0h8v8h8v8H16V8H8V8h8z" fill="#c4ccae"/></g>
 <g id="fort"><path d="M0 6h6V0h8v6h10V0h8v6h6v30H0z" fill="#253531"/><path d="M3 9h32v24H3z" fill="#acae92"/><path d="M4 10h30v5H4z" fill="#d4d3ae"/><path d="M15 22h8v14h-8z" fill="#33443b"/><path d="M6 18h4v5H6m22-5h4v5h-4" fill="#64796a"/></g>
 <g id="mine"><path d="M0 20h6V12h6V4h18v8h6v8h6v17H0z" fill="#a08468"/><path d="M6 18h8V9h14v9h8v14H6z" fill="#ccb38d"/><path d="M14 18h14v19H14z" fill="#1a2d2d"/><path d="M10 15h22v4H10m1-1h4v19h-4m16-19h4v19h-4" fill="#715641"/><path d="M20 23h5v5h-5" fill="#80b8bf"/></g>
 <g id="farm"><path d="M3 16h29v20H3z" fill="#c3ad76"/><path d="M0 13h6V7h6V1h10v6h7v6h6v6H0z" fill="#a76f4a"/><path d="M15 24h7v12h-7z" fill="#435143"/><path d="M5 20h6v6H5z" fill="#eee0a9"/><path d="M38 21h4v15h-4m8-19h4v19h-4" stroke="#c0bc74" stroke-width="2"/></g>
 <g id="shrine"><path d="M2 28h36v8H2m4-21h28v7H6m5-18h18v18H11" fill="#aaa99d"/><path d="M0 3h40v6H0m4-6V0h32v3" fill="#d0c8ac"/><path d="M16 11h8v15h-8z" fill="#384c48"/><path d="M17 12h6v5h-6z" fill="#d3b673"/></g>
 <g id="ruin"><path d="M0 31h40v6H0m4-26h8v26H4m16-21h8v21h-8m12-29h7v29h-7" fill="#b6aa88"/><path d="M2 4h12v5H2m16 8h12v5H18m12-17h12v5H30" fill="#e2cf9e"/><path d="M12 27h7v4h-7" fill="#716e55"/></g>
 <g id="beast"><path d="M0 0h8v8h22V0h8v28h-6v8H6v-8H0z" fill="#b4aa7a"/><path d="M5 12h9v5H5m19-5h9v5h-9" fill="#33423a"/><path d="M15 21h8v6h-8z" fill="#5a5944"/><path d="M11 29h4v7h-4m13-7h4v7h-4" fill="#e1d6a7"/></g>
 <g id="tower"><path d="M5 3h28v7H5m4 0h20v27H9m-4-5h28v6H5" fill="#a2b6ae"/><path d="M14 13h10v6H14m1 7h8v11h-8" fill="#3b5756"/><path d="M19 3v-12h15v8H19" stroke="#d2c59c" stroke-width="3" fill="#a5614d"/></g>
 <g id="dragon"><path d="M2 5h8v7h9V5h10V0h7v10h6v15h-8v5H22v7H10V22H2z" fill="#b19388"/><path d="M21 12h6v5h-6z" fill="#f3ce8c"/><path d="M31 20h11v5H31" fill="#4b4341"/><path d="M0 18h8v7H0m12 12h14v5H12" fill="#7d766c"/></g>
 <g id="gate"><path d="M0 28h48v8H0m4-27h11v27H4m29-27h11v27H33m-33-22h48v8H0" fill="#d2d5b5"/><path d="M16 0h16v5H16" fill="#f0ddb0"/><path d="M22 12h4v13h-4z" fill="#d5b56b"/></g>
 <g id="dungeon"><path d="M0 0h7v7H0m10-7h7v7h-7m10-7h7v7h-7" fill="currentColor"/><path d="M7 3h3m7 0h3" stroke="currentColor" stroke-width="1"/></g>
</defs>
<style>text{font-family:'Microsoft YaHei','PingFang SC',sans-serif} .mono{font-family:Consolas,monospace;letter-spacing:2px} .name{font-weight:700;letter-spacing:2px}</style>`);

add(rect(0, 0, 1400, 1000, '#101e24'));
add(rect(24, 24, 1352, 952, 'none', 'stroke="#51685c" stroke-width="2"'));
add(rect(40, 42, 5, 45, '#d6ba78'));
add(label(60, 61, 'THE TWELVE REACHES', 12, '#9da990', 'class="mono"'));
add(label(60, 99, '十二地区 · 自由远征图', 30, '#eee5cb', 'class="name"'));
add(label(1350, 64, 'WORLD ATLAS / 01', 12, '#c7b88c', 'class="mono" text-anchor="end"'));
add(label(1350, 94, '路线与连战副本 · 设计示意', 16, '#9eafa3', 'text-anchor="end"'));
add(rect(40, 122, 1020, 736, 'url(#sea)', 'stroke="#52665a" stroke-width="2"'));
add('<path d="M104 180H320V160H440V132H660V160H850V188H980V236H1020V432H992V560H1016V720H968V800H800V832H600V808H420V760H260V692H144V592H80V392H64V244H104Z" fill="#203b3a" stroke="#6b8170" stroke-width="8"/>');
add('<path d="M120 188H320V172H456V144H648V172H842V200H968V248H1008V420H980V572H1004V708H956V788H800V820H612V796H432V748H272V680H156V580H92V396H76V256H120Z" fill="url(#grass)"/>');
// Pixel terrain blocks distinguish the biomes without locking their level order.
add('<path d="M742 652H932V676H972V768H932V796H786V780H736V724H714V676H742Z" fill="#8c7952"/>');
add('<path d="M750 668h178v16h28v66h-22v30H800v-22h-50v-26h-16v-48h16z" fill="#a68b5d"/>');
add('<path d="M562 132h88v50h-25v37h-60v-30h-32v-33h29z" fill="#78968c"/>');
add('<path d="M846 176h102v42h42v80h-70v-26h-58v-46h-16z" fill="#655e54"/>');
add('<path d="M106 184h108v28h20v76h-90v-24h-38z" fill="#4e5350"/>');
add('<path d="M672 554h28v48h-16v50h14v26h-28v62h-28v35h-30v-70h28v-62h12v-41h20z" fill="#497a7e"/>');
add('<path d="M683 556v48h-18v45h13v30h-24v55h-24" fill="none" stroke="#75a6a2" stroke-width="5"/>');

for (let i = 0; i < 14; i++) {
  const x = 640 + (i % 4) * 42;
  const y = 402 + Math.floor(i / 4) * 31;
  add(use('tree', x, y, 0.9));
}
for (const [x,y,s] of [[220,310,1.5],[285,365,1.1],[300,450,1.3],[410,197,1.1],[490,188,1.1],[558,160,1.2],[875,190,1.2],[922,306,1.2]]) add(use('mountain',x,y,s));
for (const [x,y] of [[175,346],[205,320],[255,448],[280,329],[430,286],[397,318],[590,576],[470,677],[720,586],[832,541]]) add(use('pine',x,y,1));
for (let i=0; i<18; i++) add(rect(758+(i%6)*32,675+Math.floor(i/6)*38,8,3,'#c3a775'));

const routes = [
  [city,byId['01'],byId['05'],byId['09']],
  [city,byId['02'],byId['06'],byId['10']],
  [city,byId['04'],byId['08'],byId['12']],
  [city,byId['03'],byId['07'],byId['11']],
  [byId['03'],byId['04'],byId['02'],byId['01'],byId['03']],
  [byId['07'],byId['08'],byId['06'],byId['05'],byId['07']],
];
for(const [index, route] of routes.entries()) {
  const points = route.map(point=>`${point.x},${point.y}`).join(' ');
  add(`<polyline points="${points}" fill="none" stroke="#243c35" stroke-width="10"/>`);
  add(`<polyline points="${points}" fill="none" stroke="${index<4?'#a4a582':'#6b806d'}" stroke-width="3" stroke-dasharray="7 8"/>`);
}
add(`<polyline points="540,495 355,500 220,405 135,240" fill="none" stroke="#e7c575" stroke-width="5" stroke-dasharray="9 6"/>`);

for (const region of regions) {
  add(`<g id="region-${region.id}" data-region="${region.id}"><title>${region.name}：${region.dungeon}</title>`);
  add(rect(region.x-26,region.y-18,52,40,'#243a34'));
  add(rect(region.x-22,region.y-21,44,36,region.color));
  add(use(region.icon, region.x-22,region.y-30,1.1));
  add(rect(region.x-67,region.y+22,134,31,'#142b2a','stroke="#697b66" stroke-width="1"'));
  add(label(region.x-57,region.y+43,region.id,12,region.color,'class="mono"'));
  add(label(region.x-29,region.y+44,region.name,19,'#eee6ca','class="name"'));
  add(rect(region.x-69,region.y+57,138,21,'#263d35'));
  add(label(region.x,region.y+72,region.resource,12,'#ced8bc','text-anchor="middle"'));
  add(`<g color="${region.color}" transform="translate(${region.x-57} ${region.y+86})">${use('dungeon',0,0)}</g>`);
  add(label(region.x-22,region.y+94,region.dungeon,12,'#bdc6ad'));
  add('</g>');
}

add(rect(city.x-57,city.y-47,114,86,'#1d302d','stroke="#d9ba72" stroke-width="3"'));
add(rect(city.x-48,city.y-40,96,73,'#526356'));
add(use('fort',city.x-32,city.y-38,1.7));
add(rect(city.x-83,city.y+40,166,35,'#dbc38b'));
add(label(city.x,city.y+65,'中央 · 大竞技场',19,'#26362e','text-anchor="middle" class="name"'));
add(label(city.x,city.y+93,'每年一届 / 海选 → 64 强',12,'#e2d1a9','text-anchor="middle"'));

add(label(1088,151,'路线由你决定',23,'#eddfb9','class="name"'));
add(label(1088,181,'编号标记地点，不代表先后。',15,'#9faf9f'));
add(rect(1088,204,264,4,'#65735e'));
add(label(1088,240,'01  选择资源方向',16,'#e4ca8b','class="mono"'));
add(label(1088,274,'铁丘先行：更早建立锻造',16));
add(label(1088,305,'绿林先行：更早种植药草',16));
add(label(1088,336,'龙谷先行：更早接触龙人',16));
add(label(1088,368,'所有地区最终都可走完。',15,'#9faf9f'));

add(rect(1088,396,264,1,'#465d50'));
add(label(1088,435,'02  难度随讨伐推进',16,'#e4ca8b','class="mono"'));
add(label(1088,470,'已讨伐 0 区  →  基础 Lv 5',15));
add(label(1088,501,'已讨伐 6 区  →  基础 Lv 53',15));
add(label(1088,532,'已讨伐 11 区 →  基础 Lv 93',15));
add(label(1088,565,'已通关地区保留原基础难度。',14,'#9faf9f'));

add(rect(1088,593,264,1,'#465d50'));
add(label(1088,632,'03  每区一个连战副本',16,'#e4ca8b','class="mono"'));
add(`<g color="#d8be7e" transform="translate(1090 660) scale(3)">${use('dungeon',0,0)}</g>`);
add(label(1088,719,'三张同主题地图 / 固定名单',16));
add(label(1088,752,'HP · 异常 · 道具 · 耐久持续',15));
add(label(1088,783,'无自动恢复，可用带入药杖。',15,'#9faf9f'));
add(label(1088,815,'允许暂停或撤离；撤离后重开。',14,'#9faf9f'));

add('<path d="M64 899h40" stroke="#e7c575" stroke-width="4" stroke-dasharray="9 6"/>');
add(label(117,905,'示例路线：铁丘 → 兽岭 → 旧王陵',15,'#dbc99b'));
add(`<g color="#a4b79a" transform="translate(572 891) scale(1.5)">${use('dungeon',0,0)}</g>`);
add(label(626,905,'三图大副本',15,'#bac8b3'));
add(label(1347,905,'远境 ≠ 固定高等级',15,'#bac8b3','text-anchor="end"'));
add(label(64,945,'DESIGN DRAFT  /  地区位置、路线、等级公式与副本名称均为草案；尚未接入战斗引擎。',13,'#849889'));
add('</svg>');

const output = fileURLToPath(new URL('./world-map.svg', import.meta.url));
writeFileSync(output, fragments.join('\n'), 'utf8');
console.log(`Created ${output} with ${regions.length} regions.`);

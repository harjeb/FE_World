"""Self-contained terrain preview. Symbols/colors visualize FE8 IDs, not game art."""
from html import escape
import json
from pathlib import Path


def terrain_svg(document: dict) -> str:
    width, height = document['width'], document['height']
    size, margin = 30, 30
    chunks = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {(width + 1) * size} {(height + 1) * size}" role="img" aria-label="FE8第8章地形格子图">',
              '<style>text{font-family:Microsoft YaHei,sans-serif;text-anchor:middle;pointer-events:none}.axis{font-size:11px;fill:#c0c9d8}.glyph{font-size:12px;fill:#18212b}</style>',
              '<rect width="100%" height="100%" fill="#141d29"/>']
    for x in range(width):
        chunks.append(f'<text class="axis" x="{margin + x * size + size / 2}" y="20">{x}</text>')
    for y in range(height):
        chunks.append(f'<text class="axis" x="14" y="{margin + y * size + size / 2 + 4}">{y}</text>')
        for x in range(width):
            value = document['terrainIds'][y][x]
            terrain = document['terrainCatalog'][str(value)]
            px, py = margin + x * size, margin + y * size
            title = escape(f"({x},{y}) {terrain['label']} | {terrain['symbol']} | ID 0x{value:02X}")
            chunks.append(f'<g class="cell" data-x="{x}" data-y="{y}"><title>{title}</title><rect class="tile" x="{px}" y="{py}" width="30" height="30" fill="{terrain["color"]}" stroke="#18212b" stroke-opacity=".3"/><text class="glyph" x="{px + 15}" y="{py + 20}">{escape(terrain["glyph"])}</text></g>')
    chunks.append('<g id="overlays" pointer-events="none"/></svg>')
    return ''.join(chunks)


HTML = r'''<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>圣魔第8章 · 地形与配置</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101722;color:#e4eaf3;font:15px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1260px;margin:auto;padding:28px}h1{margin:0 0 8px;font-size:27px}p{color:#aab8cc;margin:8px 0 20px}a{color:#9bc7ff}nav{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:20px 0}select{background:#243146;color:#edf3fc;padding:8px;border:1px solid #4e607b;border-radius:6px;max-width:100%}.layout{display:grid;grid-template-columns:minmax(400px,780px) minmax(220px,1fr);gap:24px}.board{background:#141d29;border:1px solid #35465e;border-radius:10px;overflow:hidden}svg{display:block;width:100%;height:auto}.cell:hover .tile{stroke:#fff;stroke-width:2}.info{background:#192535;padding:16px;border-radius:8px;min-height:174px;white-space:pre-wrap;overflow-wrap:anywhere}.legend{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-top:18px}.swatch{display:inline-block;width:14px;height:14px;border:1px solid #9aa8b8;margin-right:8px;vertical-align:middle}.notes{font-size:13px;margin-top:18px;color:#acbbcd}@media(max-width:850px){.layout{grid-template-columns:1fr}main{padding:16px}.legend{grid-template-columns:repeat(3,1fr)}}
</style>
<main><h1>圣魔之光石 · 第 8 章</h1>
<p>24 × 24，共 576 格。把鼠标移到格子上，或点击格子，查看地形、物品和单位配置。坐标从左上角 (0,0) 开始。</p>
<nav><label><input id="events" type="checkbox" checked> 事件区域与物件</label>
<label>单位 <select id="units"><option value="">隐藏</option><option value="initialEnemyTemplates">初始敌军模板 · REDA终点</option><option value="playerDeploymentTemplates">我方出击模板 · 非固定阵容</option><option value="turn2PlayerReinforcements">第2回合我方增援 · REDA终点</option><option value="areaEnemyReinforcements">区域触发敌军增援 · REDA终点</option><option value="turn5EnemyReinforcements">第5回合敌军增援 · REDA终点</option></select></label>
<label>地图变化 <select id="change"><option value="">基础地形</option></select></label></nav>
<div class="layout"><div class="board">__SVG__</div><aside><div id="info" class="info" aria-live="polite">指向一个格子查看数据。</div><div class="legend" id="legend"></div><div class="notes">方框：事件物件；绿色虚线：触发范围（含边界）。圆圈：当前选择的单位组。单位的入场坐标可能与移动终点不同。<br><br>单位为静态模板，实际出击和难度效果还受存档、准备画面与事件执行影响。地图变化每次单独预览，不模拟整段剧情。<br><br><a href="chapter.json">完整JSON</a> · <a href="terrain.csv">逐格CSV</a> · <a href="terrain.png">地形PNG</a> · <a href="integration-report.json">接入事项</a><br><a href="__SOURCE__">原始数据来源</a></div></aside></div>
<p class="notes">__PROVENANCE__ 本预览用符号与颜色展示地形编号，不使用原作地图贴图。__ROM__</p>
</main>
<script id="chapter-data" type="application/json">__DATA__</script>
<script>
'use strict';
const d=JSON.parse(document.getElementById('chapter-data').textContent);
const svg=document.querySelector('svg'), info=document.getElementById('info'), units=document.getElementById('units'), change=document.getElementById('change'), events=document.getElementById('events');
const ns='http://www.w3.org/2000/svg';
const changeLabels={0:'门 (20,7)',1:'墙变化 (4,6) 2×3',2:'门 (1,5)',3:'宝箱 (1,3)',4:'宝箱 (2,3)',5:'开场区域 (18,21) 4×3',6:'宝箱 (19,4)'};
for(const c of d.mapChanges){const o=document.createElement('option');o.value=c.id;o.textContent=`变化${c.id} · ${changeLabels[c.id]||c.tiles}`;change.append(o);}
for(const t of Object.values(d.terrainCatalog)){const e=document.createElement('div'),s=document.createElement('span');s.className='swatch';s.style.background=t.color;e.append(s,document.createTextNode(t.label));document.getElementById('legend').append(e);}
let rows=d.terrainIds;
function mark(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.getElementById('overlays').append(e);return e;}
function draw(){
 rows=d.terrainIds.map(r=>r.slice());
 if(change.value!==''){const c=d.mapChanges.find(c=>String(c.id)===change.value);for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++)if(c.terrainIds[y][x]!==null)rows[c.y+y][c.x+x]=c.terrainIds[y][x];}
 for(const cell of svg.querySelectorAll('.cell')){const x=Number(cell.dataset.x),y=Number(cell.dataset.y),id=rows[y][x],t=d.terrainCatalog[id];cell.querySelector('rect').setAttribute('fill',t.color);cell.querySelector('text').textContent=t.glyph;cell.querySelector('title').textContent=`(${x},${y}) ${t.label} | ${t.symbol} | ID 0x${id.toString(16)}`;}
 svg.getElementById('overlays').replaceChildren();
 if(events.checked){const b=d.eventInterpretation.area.boundsInclusive;mark('rect',{x:30+b.min[0]*30,y:30+b.min[1]*30,width:(b.max[0]-b.min[0]+1)*30,height:(b.max[1]-b.min[1]+1)*30,fill:'none',stroke:'#5bf78b','stroke-width':3,'stroke-dasharray':'6 4'});for(const o of d.objects){const[x,y]=o.position;mark('rect',{x:32+x*30,y:32+y*30,width:26,height:26,fill:'none',stroke:o.kind==='seize'?'#fff59b':'#ffe4be','stroke-width':2});}}
 if(units.value)for(const u of d.unitGroups[units.value].units){if(!u.finalPosition)continue;const[x,y]=u.finalPosition;mark('circle',{cx:45+x*30,cy:45+y*30,r:11,fill:u.faction==='enemy'?'#a52e42':'#2f67b4',stroke:'#fff','stroke-width':1.3});mark('text',{x:45+x*30,y:49+y*30,fill:'#fff','font-size':10},String(u.index+1));}
}
function inspect(cell){const x=Number(cell.dataset.x),y=Number(cell.dataset.y),id=rows[y][x],t=d.terrainCatalog[id],cost=t.normalMovementCosts;let text=`坐标 (${x}, ${y})\n${t.label}\n${t.symbol}\n地形ID：0x${id.toString(16).toUpperCase().padStart(2,'0')}\n基础图块编号：${d.metatileIndices[y][x]}\n普通天气移动消耗（-1为不可通行）\n步行 ${cost.foot} / 重甲 ${cost.armored} / 骑兵 ${cost.mounted} / 飞行 ${cost.flying}`;for(const o of d.objects.filter(o=>o.position[0]===x&&o.position[1]===y))text+=`\n事件：${o.kind}${o.item?' · '+o.item.symbol:''}`;if(units.value)for(const u of d.unitGroups[units.value].units.filter(u=>u.finalPosition&&u.finalPosition[0]===x&&u.finalPosition[1]===y))text+=`\n\n单位${u.index+1}：${u.character}\n${u.class} / 模板等级 ${u.level}\n入场 ${u.entryPosition.join(',')} → 终点 ${u.finalPosition.join(',')}\n装备：${u.items.map(i=>i.symbol).join(', ')}\n掉落标志：${u.dropFlag?'是':'否'}`;if(change.value!=='')text+='\n\n当前显示单项变化后的地形；图块编号栏仍为基础地图。';info.textContent=text;}
for(const eventName of ['pointerover','click'])svg.addEventListener(eventName,e=>{const cell=e.target.closest('.cell');if(cell)inspect(cell);});
for(const control of [units,change,events])control.addEventListener('change',()=>{draw();info.textContent='显示已更新，指向一个格子查看数据。';});
draw();
</script></html>
'''


def write_png(document: dict, out: Path):
    from PIL import Image, ImageDraw, ImageFont
    size, margin = 30, 36
    width, height = document['width'], document['height']
    image = Image.new('RGB', (1100, margin + height * size + 36), '#141d29')
    draw = ImageDraw.Draw(image)
    candidates = ['C:/Windows/Fonts/msyh.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    font_path = next((path for path in candidates if Path(path).exists()), None)
    font = ImageFont.truetype(font_path, 12) if font_path else ImageFont.load_default()
    heading = ImageFont.truetype(font_path, 18) if font_path else font
    for x in range(width):
        draw.text((margin + x * size + 9, 10), str(x), font=font, fill='#c0c9d8')
    for y, row in enumerate(document['terrainIds']):
        draw.text((6, margin + y * size + 7), str(y), font=font, fill='#c0c9d8')
        for x, value in enumerate(row):
            terrain = document['terrainCatalog'][str(value)]
            px, py = margin + x * size, margin + y * size
            draw.rectangle((px, py, px + size - 1, py + size - 1), fill=terrain['color'])
            draw.text((px + 8, py + 5), terrain['glyph'], font=font, fill='#18212b')
    lx = margin + width * size + 25
    game_label = document['source'].get('gameCode', 'FE8U')
    draw.text((lx, 18), f'{game_label} 第8章 · 基础地形', font=heading, fill='#e4eaf3')
    draw.text((lx, 48), '24 × 24 / 576格 / 零基坐标', font=font, fill='#aab8cc')
    for i, (key, terrain) in enumerate(document['terrainCatalog'].items()):
        y = 90 + i * 36
        draw.rectangle((lx, y, lx + 18, y + 18), fill=terrain['color'])
        draw.text((lx + 27, y), f"0x{int(key):02X} {terrain['label']}", font=font, fill='#e4eaf3')
    draw.text((lx, 490), '符号图；未叠加单位、攻略标记。', font=font, fill='#aab8cc')
    draw.text((lx, 518), '门/宝箱/剧情变化见 preview.html。', font=font, fill='#aab8cc')
    draw.text((lx, 546), '原始地形编号未合并为项目地形。', font=font, fill='#aab8cc')
    image.save(out / 'terrain.png')


def write_preview(document: dict, out: Path):
    svg = terrain_svg(document)
    (out / 'terrain.svg').write_text(svg + '\n', encoding='utf-8')
    data = json.dumps(document, ensure_ascii=False).replace('<', '\\u003c')
    if document['source'].get('inputKind') == 'local-rom':
        source_link = 'provenance.json'
        provenance = f"提取依据：本地GBA ROM，游戏码 {document['source']['gameCode']}，SHA-1 {document['source']['sha1']}。"
        rom_note = '地图、单位和事件字段直接来自该ROM；未运行模拟器。'
    else:
        source_link = document['source']['repository'] + '/tree/' + document['source']['revision']
        provenance = '提取依据：FE8U公开反编译数据，固定提交 ' + document['source']['revision'][:12] + '.'
        rom_note = '已与本地ROM核对地形和单位模板。' if document['source']['localRomVerified'] else '本次未使用本地ROM。'
    html = HTML.replace('__SVG__', svg).replace('__DATA__', data).replace('__SOURCE__', source_link).replace(
        '__PROVENANCE__', escape(provenance)).replace('__ROM__', rom_note)
    (out / 'preview.html').write_text(html, encoding='utf-8')
    write_png(document, out)

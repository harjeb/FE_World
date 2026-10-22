// Real mouse/touch sorting through the built app and a disposable backend.
// Run after npm run build. CHROME_BIN selects Chrome/Chromium/Edge.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedBrowserAccount } from './fixtures.mjs';
import { stopProcess } from './processes.mjs';
import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';
import { createEnemy, enemyStats } from '../../backend/common/game/enemies.ts';

const temp = mkdtempSync(join(tmpdir(), 'fe-deployment-'));
const dbPath = join(temp, 'test.db'), name = 'deployment-browser';
seedBrowserAccount(dbPath, name);
const store = new Store(openDb(dbPath));
const player = store.getPlayer(store.db.prepare('SELECT id FROM players LIMIT 1').get().id);
player.day = 1601; player.flags.clearedRegions = [2]; player.flags.questsDone = ['gw1']; store.savePlayer(player); store.db.close();
const origin = 'http://127.0.0.1:8617', debug = 'http://127.0.0.1:9417';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message) {
  for (let i = 0; i < 120; i++) { if (await test()) return; await sleep(100); }
  throw new Error(message);
}
const server = spawn(process.execPath, [join(import.meta.dirname, '../../backend/api/server.ts')], {
  env: { ...process.env, API_PORT: '8617', DB_PATH: dbPath }, stdio: 'ignore',
});
let browser, socket;
try {
  await until(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, 'API did not start');
  browser = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9417', `--user-data-dir=${join(temp, 'browser')}`, 'about:blank'], { stdio: 'ignore', detached: true });
  await until(async () => { try { return (await fetch(`${debug}/json/version`)).ok; } catch { return false; } }, 'browser did not start');
  const target = (await (await fetch(`${debug}/json/list`)).json()).find(row => row.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const requests = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { requests.get(message.id)?.(message); requests.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    requests.set(++id, result => result.error ? reject(new Error(result.error.message)) : resolve(result.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const api = (op, data = {}) => evaluate(`fetch('/api/op',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+localStorage.getItem('agent-tactics.token')},body:JSON.stringify({op:${op},seq:1,data:${JSON.stringify(data)}})}).then(r=>r.json()).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`);
  const order = () => evaluate(`Array.from(document.querySelectorAll('.deployment-list > li')).map(el=>el.dataset.unitId)`);
  const preferences = () => evaluate(`localStorage.getItem('agent-tactics.deployment-order.${player.id}')`);
  const checkPreview = async (desktopLayout = false) => {
    await until(() => evaluate(`document.querySelectorAll('.encounter-roster tbody tr').length > 0`), 'enemy preview missing');
    assert.ok(await evaluate(`(() => {
      const preview = document.querySelector('.encounter-preview');
      const fieldset = preview.previousElementSibling;
      return !preview.querySelector('figcaption, .pfoot:not([aria-label="敌方增援计划"])') && fieldset.tagName === 'FIELDSET'
        && fieldset.querySelectorAll('p').length === 0
        && preview.querySelectorAll('[data-enemy-id]').length === preview.querySelectorAll('tbody tr').length;
    })()`), 'only map and enemy list follow the difficulty controls');
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.encounter-roster tbody tr')).every(row => row.children.length === 4 && /\\d+\\/\\d+/.test(row.children[1].textContent) && Number(row.children[2].textContent) > 0 && row.children[3].textContent)`), 'enemy summary includes HP, level and class');
    if (desktopLayout) assert.ok(await evaluate(`(() => {
      const map = document.querySelector('.encounter-map').getBoundingClientRect();
      const list = document.querySelector('.encounter-roster').getBoundingClientRect();
      return list.left >= map.right;
    })()`), 'enemy list sits to the right of the map');
    await evaluate(`document.querySelector('[data-enemy-id]').scrollIntoView({behavior:'instant',block:'center'})`);
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const point = await evaluate(`(() => { const r = document.querySelector('[data-enemy-id]').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await mouse('mouseMoved', point);
    await until(() => evaluate(`document.querySelector('[role="tooltip"]')?.innerText.includes('装备：')`), 'hover must display detailed enemy tooltip');
    await evaluate(`document.querySelector('[data-enemy-id]').focus()`);
    assert.ok(await evaluate(`!!document.querySelector('[role="tooltip"]')`), 'keyboard focus exposes enemy details too');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.ok(await evaluate(`!document.querySelector('[role="tooltip"]')`), 'Escape dismisses enemy details');
    await evaluate(`document.querySelector('[data-enemy-id]').blur()`);
    await mouse('mouseMoved', { x: 1, y: 1 });
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), 'preview does not overflow the viewport');
  };
  const slots = async () => {
    await evaluate(`document.querySelector('.deployment-order').scrollIntoView({block:'center'})`);
    return evaluate(`Array.from(document.querySelectorAll('.deployment-list button')).map(el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+32}})`);
  };
  const mouse = async (type, point, buttons = 0) => send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
  const beginMouseDrag = async (from, to) => {
    const points = await slots();
    await mouse('mouseMoved', points[from]); await mouse('mousePressed', points[from], 1);
    for (let i = 1; i <= 12; i++) {
      await mouse('mouseMoved', { x: points[from].x + (points[to].x - points[from].x) * i / 12, y: points[from].y + (points[to].y - points[from].y) * i / 12 }, 1);
    }
    assert.ok(await evaluate(`!!document.querySelector('.deployment-ghost')`), 'dragged portrait follows the pointer');
    return points[to];
  };
  const dragMouse = async (from, to) => mouse('mouseReleased', await beginMouseDrag(from, to));
  const touch = (type, point) => send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ ...point, id: 1, radiusX: 3, radiusY: 3, force: 1 }] : [] });
  const beginTouchDrag = async (from, to) => {
    const points = await slots();
    await touch('touchStart', points[from]);
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', { x: points[from].x + (points[to].x - points[from].x) * i / 12, y: points[from].y + (points[to].y - points[from].y) * i / 12 });
    }
    assert.ok(await evaluate(`!!document.querySelector('.deployment-ghost')`), 'touch drag starts without scrolling the page');
  };
  const shot = async name => {
    if (!process.env.E2E_ARTIFACT_DIR) return;
    await evaluate(`document.querySelector('.deployment-order').scrollIntoView({block:'center'})`);
    const clip = await evaluate(`(()=>{const r=document.querySelector('.deployment-order').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1}})()`);
    const image = await send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(join(process.env.E2E_ARTIFACT_DIR, name), Buffer.from(image.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin });
  await until(() => evaluate(`!!document.querySelector('input')`), 'login missing');
  await evaluate(`(()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('button[type=submit]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-action=train]')`), 'camp missing');
  await evaluate(`location.hash='#/settings'`);
  await until(() => evaluate(`!!document.querySelector('#ag-h')`), 'Agent settings missing');
  const pressAgent = async label => {
    const point = await evaluate(`(() => { const button=Array.from(document.querySelectorAll('[aria-labelledby="ag-h"] button')).find(b=>b.textContent===${JSON.stringify(label)}); button.scrollIntoView({block:'center'}); const r=button.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
    await mouse('mouseMoved', point); await mouse('mousePressed', point, 1); await mouse('mouseReleased', point);
  };
  await pressAgent('取得接入令牌');
  await until(() => evaluate(`!!document.querySelector('.token-row')`), 'Agent token missing');
  const readAgent = () => evaluate(`fetch('/api/agent-token',{headers:{authorization:'Bearer '+localStorage.getItem('agent-tactics.token')}}).then(r=>r.json())`);
  const initialAgent = await readAgent();
  assert.ok(await evaluate(`document.querySelector('[aria-labelledby="ag-h"]').textContent.includes(${JSON.stringify(origin.replace(/^http/, 'ws') + '/ws')})`), 'settings display the actual browser host');
  await send('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await evaluate(`window.__readAgentClipboard=navigator.clipboard.readText.bind(navigator.clipboard); Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined})`);
  await pressAgent('复制');
  await until(() => evaluate(`document.body.innerText.includes('已复制')`), 'HTTP-compatible token copy did not succeed');
  assert.equal(await evaluate(`window.__readAgentClipboard()`), initialAgent.token, 'copy writes the actual token, not its mask');
  await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})`);
  await pressAgent('复制给 AI');
  const bundle = await evaluate(`window.__readAgentClipboard()`);
  for (const text of [`AGENT_TOKEN=${initialAgent.token}`, `API_URL=${origin}`, `docVersion: ${initialAgent.docVersion}`, `${origin}/agent-api.json`, 'MCP']) assert.ok(bundle.includes(text));
  await evaluate(`window.__agentExecCopy=document.execCommand; document.execCommand=()=>false`);
  await pressAgent('复制');
  await until(() => evaluate(`document.body.innerText.includes('复制失败')`), 'copy failure must not claim success');
  assert.equal(await evaluate(`document.querySelector('.token-row code').textContent`), initialAgent.token, 'manual copying remains possible after failure');
  await evaluate(`document.execCommand=window.__agentExecCopy`);
  await pressAgent('重置令牌');
  await until(() => evaluate(`!!document.querySelector('[role="dialog"]')`), 'token reset requires confirmation');
  assert.equal((await readAgent()).token, initialAgent.token, 'opening confirmation never rotates');
  await evaluate(`document.querySelector('[role="dialog"] .btn-primary').click()`);
  await until(async () => (await readAgent()).token !== initialAgent.token, 'confirmed token reset did not rotate');
  await until(() => evaluate(`!document.querySelector('[role="dialog"]') && !document.querySelector('[aria-labelledby="ag-h"] button:disabled')`), 'token reset did not finish');
  assert.equal(await evaluate(`fetch('/api/op',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+${JSON.stringify(initialAgent.token)}},body:JSON.stringify({op:10,data:{}})}).then(r=>r.status)`), 401, 'old Agent token must stop working');
  const before = await api(10);
  await evaluate(`location.hash='#/field?region=2'`);
  await until(async () => (await order()).length >= 3, 'deployment portraits missing');
  const original = await order();
  await checkPreview(true);
  const initialPreview = await api(38, { action: 'sortie', region: 2, unitIds: original });
  const toggleMember = id => evaluate(`(() => { const row=Array.from(document.querySelectorAll('.team li')).find(row=>row.querySelector('input') && row.innerText.includes(${JSON.stringify(before.units.find(unit => unit.id === id).name)})); row.querySelector('input').click(); })()`);
  for (const id of original.slice(1)) await toggleMember(id);
  await until(async () => (await order()).length === 1 && await evaluate(`!!document.querySelector('.prep-go .btn-primary:not(:disabled)')`), 'solo quote missing');
  const soloPreview = await api(38, { action: 'sortie', region: 2, unitIds: original.slice(0, 1) });
  assert.notDeepEqual(soloPreview.encounter.enemies.map(unit => unit.level), initialPreview.encounter.enemies.map(unit => unit.level), 'changing the selected average refreshes field levels');
  assert.deepEqual(soloPreview.encounter.map, initialPreview.encounter.map, 'team changes never reroll the map');
  assert.ok(await evaluate(`document.querySelector('.prep-go .facts').innerText.includes('主将 Lv ${soloPreview.encounter.enemies.find(unit => unit.id === 'e0').level}')`), 'preparation displays the current quote, not a date level');
  for (const id of original.slice(1)) await toggleMember(id);
  await until(async () => JSON.stringify(await order()) === JSON.stringify(original) && await evaluate(`!!document.querySelector('.prep-go .btn-primary:not(:disabled)')`), 'team quote did not restore');
  assert.ok(await evaluate(`(()=>{const cards=Array.from(document.querySelectorAll('.deployment-list > li'));return cards.every(card=>Math.abs(card.getBoundingClientRect().top-cards[0].getBoundingClientRect().top)<2)})()`), 'desktop portraits form one horizontal row');
  await dragMouse(original.length - 1, 0);
  const desktop = [original.at(-1), ...original.slice(0, -1)];
  await until(async () => JSON.stringify(await order()) === JSON.stringify(desktop), 'mouse drop did not commit');
  assert.deepEqual(JSON.parse(await preferences()), desktop);
  assert.ok(await evaluate(`document.querySelector('.deployment-list button').getAttribute('aria-label').includes('主将')`));
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.deployment-list .tm-ord')).every((badge,i)=>badge.textContent===String(i+1))`));
  await shot('deployment-desktop.png');
  await send('Page.reload', { ignoreCache: true });
  await until(async () => JSON.stringify(await order()) === JSON.stringify(desktop), 'saved drag order did not survive reload');

  await evaluate(`document.querySelector('.deployment-list button').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await until(async () => JSON.stringify(await order()) === JSON.stringify(original), 'keyboard ordering failed');
  const saved = await preferences();
  const releaseAt = await beginMouseDrag(original.length - 1, 0);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await mouse('mouseReleased', releaseAt);
  assert.deepEqual(await order(), original, 'Escape restores the original order');
  assert.equal(await preferences(), saved, 'preview/cancellation never saves');
  await beginMouseDrag(original.length - 1, 0);
  const header = await evaluate(`(()=>{const r=document.querySelector('.deployment-order h2').getBoundingClientRect();return {x:r.left+20,y:r.top+4}})()`);
  await mouse('mouseMoved', header, 1); await mouse('mouseReleased', header);
  assert.deepEqual(await order(), original, 'dropping outside the list cancels');
  assert.equal(await preferences(), saved);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await sleep(100);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth && document.querySelectorAll('.deployment-list > li')[1].getBoundingClientRect().left>document.querySelector('.deployment-list > li').getBoundingClientRect().left`), 'mobile keeps portraits horizontal with no page overflow');
  await beginTouchDrag(original.length - 1, 0);
  await touch('touchCancel');
  assert.deepEqual(await order(), original, 'touch cancellation restores the original order');
  await beginTouchDrag(original.length - 1, 0);
  await touch('touchEnd');
  await until(async () => JSON.stringify(await order()) === JSON.stringify(desktop), 'mobile touch drop across rows did not commit');
  await shot('deployment-mobile.png');
  const unchanged = await api(10);
  assert.equal(unchanged.day, before.day); assert.equal(unchanged.gold, before.gold);

  await evaluate(`location.hash='#/field/dungeon'`);
  await until(async () => (await order()).length >= 2 && await evaluate(`!!document.querySelector('#dtm-h')`), 'dungeon deployment missing');
  const dungeon = await order();
  await checkPreview();
  assert.equal(dungeon[0], desktop[0], 'dungeon shares the saved commander');
  await beginTouchDrag(dungeon.length - 1, 0); await touch('touchEnd');
  const finalOrder = [dungeon.at(-1), ...dungeon.slice(0, -1)];
  await until(async () => JSON.stringify(await order()) === JSON.stringify(finalOrder), 'dungeon drag did not commit');
  await evaluate(`document.querySelector('[aria-label="远征地区"] button:nth-child(2)').click()`);
  await until(() => evaluate(`!!document.querySelector('[aria-label="副本路线"] button:nth-child(2)')`), 'classic dungeon choice missing');
  await evaluate(`document.querySelector('[aria-label="副本路线"] button:nth-child(2)').click()`);
  await until(() => evaluate(`document.querySelector('[aria-label="副本路线"] button:nth-child(2)').getAttribute('aria-checked') === 'true' && !!document.querySelector('.encounter-preview')`), 'classic map preview missing');
  await checkPreview();
  await evaluate(`location.hash='#/quests'`);
  await until(() => evaluate(`!!document.querySelector('[data-quest="cross-time-throne"] button')`), 'cross-time preparation missing');
  await evaluate(`document.querySelector('[data-quest="cross-time-throne"] button').click()`);
  await until(() => evaluate(`document.querySelectorAll('.quest-prep .encounter-roster tbody tr').length === 17`), 'cross-time map must show 17 enemies');
  await checkPreview();
  assert.ok(await evaluate(`!!document.querySelector('#rg-2')`), 'default quest view chooses region with the pending reward');
  const quotes = openDb(dbPath);
  try {
    const stored = JSON.parse(quotes.prepare('SELECT data FROM action_quotes ORDER BY created_at DESC LIMIT 1').get().data);
    assert.equal(stored.payload.region, 2, 'cross-time quote uses the displayed default region');
  } finally { quotes.close(); }
  await evaluate(`location.hash='#/field?region=2'`);
  await until(async () => {
    const field = await order();
    // A larger field deployment appends available units after the saved dungeon order.
    return field.length > 0 && await evaluate(`!!document.querySelector('#tm-h')`)
      && JSON.stringify(field.slice(0, finalOrder.length)) === JSON.stringify(finalOrder.slice(0, field.length));
  }, 'field did not inherit the dungeon order');
  const fieldOrder = await order();
  await until(() => evaluate(`!!document.querySelector('.prep-go .btn-primary:not(:disabled)')`), 'reordered departure quote was not ready');
  const waveText = await evaluate(`document.querySelector('[aria-label="敌方增援计划"]')?.innerText`);
  await evaluate(`document.querySelector('.prep-go .btn-primary').click()`);
  await until(() => evaluate(`!!document.querySelector('.hud')`), 'battle did not start');
  const battle = await api(50, { full: true });
  for (const wave of battle.state.encounter.reinforcements) assert.ok(waveText.includes(`第${wave.turn}回合 ${wave.count}人`), 'the preview exposes frozen reinforcement timing and counts');
  assert.equal(battle.state.turnLimit, battle.state.encounter.turnLimit);
  const enemies = battle.state.units.filter(unit => unit.side === 'enemy');
  const enemyBoss = enemies.find(unit => unit.boss);
  assert.ok(enemyBoss && enemies.filter(unit => !unit.boss).every(unit => enemyBoss.level > unit.level),
    'the deployed field commander has the highest level');
  assert.deepEqual(enemyBoss.stats, enemyStats(enemyBoss.classId, enemyBoss.level, true),
    'the deployed field commander uses its own class with high growth');
  for (const enemy of enemies) assert.deepEqual(enemy.ranks,
    createEnemy(enemy.id, { classId: enemy.classId, level: enemy.level,
      pos: enemy.pos, levelRanks: true, boss: enemy.boss }).ranks,
    'field proficiency follows each enemy level, with the boss one rank ahead');
  const deployed = battle.state.units.filter(unit => unit.side === 'player');
  const baseline = Math.floor(deployed.reduce((sum, unit) => sum + unit.level, 0) / deployed.length);
  assert.equal(enemyBoss.level, Math.min(99, baseline + 4));
  assert.ok(enemies.filter(unit => !unit.boss).every(unit => unit.level >= Math.max(1, baseline - 1) && unit.level <= Math.min(99, baseline + 1)), 'deployed mobs use the selected average with -1/+1 variation');
  assert.deepEqual(deployed.map(unit => unit.id), fieldOrder, 'the server receives the dragged order');
  assert.equal(deployed.find(unit => unit.boss)?.id, fieldOrder[0], 'the first dragged portrait is the actual commander');
  assert.deepEqual(errors, []);
  console.log('PASS: Agent settings copy/fallback/reset and actual addresses; deployment sorting and persistence; field, dungeon, classic and cross-time previews; enemy summaries, hover/focus tooltips and responsive layout; player commander, dynamic field levels and stronger field boss');
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 1000000000, method: 'Browser.close' })); await sleep(200);
  }
  socket?.close();
  await Promise.all([browser, server].filter(Boolean).map(async child => {
    try { await stopProcess(child); }
    catch (error) { try { process.kill(child.pid, 0); } catch (missing) { if (missing.code === 'ESRCH') return; } throw error; }
  }));
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

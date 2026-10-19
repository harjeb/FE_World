// End-to-end check that the built frontend really talks to the backend (docs/07). Starts the Fastify
// API with a throwaway database, serves the built frontend from it, drives headless Chromium through
// login → 军营 → 竞技场 → 名册 and asserts the numbers on screen came from the server.
//
// Usage (from frontend/): npm run build && node test/backend-integration.e2e.mjs
// Needs Node.js 22.18+ and Chromium (CHROME_BIN overrides the binary name).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopProcess } from './processes.mjs';
import { prepareBrowserBattleWin, seedBrowserAccount } from './fixtures.mjs';

const API_PORT = 8611;
let cdpPort = 9411;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`${url} did not start`);
}

async function openPage(profile) {
  const port = cdpPort++;
  const chrome = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, '--window-size=1440,900', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  await waitFor(`http://127.0.0.1:${port}/json/version`);
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value).join(' '));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, msg => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    errors, evaluate,
    viewport: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    async key(key, shift = false) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: key === 'Enter' ? 13 : key === 'Tab' ? 9 : 27, modifiers: shift ? 8 : 0, ...(key === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}) });
    },
    async capture(path, width = 1440, height = 1000) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(150);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    },
    close: async () => { ws.close(); await stopProcess(chrome); },
    async open(url, selector) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !(await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)); i++) await sleep(100);
      await sleep(400);
    },
    async reload(selector) {
      await send('Page.reload', { ignoreCache: true });
      for (let i = 0; i < 150 && !(await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)); i++) await sleep(100);
      await sleep(400);
    },
    async click(selector) {
      const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!at) throw new Error(`no ${selector}`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
    },
    async type(selector, text) {
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
  };
}

// Calls the API with the browser's session token, so checks read exactly what the server stored.
async function api(page, op, data = {}) {
  const token = await page.evaluate(`localStorage.getItem('agent-tactics.token')`);
  const res = await fetch(`http://127.0.0.1:${API_PORT}/api/op`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op, seq: 1, data }),
  });
  const frame = await res.json();
  if (!frame.ok) throw new Error(`op ${op}: ${frame.error?.message}`);
  return frame.data;
}

// Clicks the button labelled `label` inside the first `rows` element whose text includes `row`.
async function press(page, rows, row, label) {
  const ok = await page.evaluate(`(() => {
    const li = [...document.querySelectorAll(${JSON.stringify(rows)})].find(e => e.innerText.includes(${JSON.stringify(row)}));
    const button = li && [...li.querySelectorAll('button')].find(b => b.innerText.includes(${JSON.stringify(label)}));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no enabled "${label}" in ${rows} row "${row}"`);
}

async function until(test) {
  for (let i = 0; i < 60; i++) { if (await test()) return true; await sleep(100); }
  return false;
}

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
}

const profile = mkdtempSync(join(tmpdir(), 'agent-tactics-e2e-'));
const dbDir = mkdtempSync(join(tmpdir(), 'agent-tactics-db-'));
seedBrowserAccount(join(dbDir, 'e2e.db'), 'e2e-seeded');
seedBrowserAccount(join(dbDir, 'e2e.db'), 'duplicates-seeded', true);
const server = spawn('node', [join(import.meta.dirname, '..', '..', 'backend', 'api', 'server.ts')], {
  env: { ...process.env, API_PORT: String(API_PORT), DB_PATH: join(dbDir, 'e2e.db') }, stdio: 'inherit',
});

try {
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`);
  const page = await openPage(profile);
  try {
    await page.open(`http://127.0.0.1:${API_PORT}/`, 'input');
    await page.type('input', 'onboarding-player');
    await page.click('button[type=submit]');
    check('new accounts enter character setup', await until(() => page.evaluate(`document.body.innerText.includes('缔结神约')`)), 'setup shown');
    await page.type('input[placeholder="2–12 字"]', '星海神主');
    const setup = (await api(page, 10)).setup.protagonist;
    check('setup preserves base stats with 10 unspent bonus points',
      await page.evaluate(`document.body.innerText.includes('额外还剩 10 / 10 点') && document.querySelector('[aria-label="HP最终值"]').textContent.includes('20')`), 'base HP 20, extra budget 10');
    await page.evaluate(`[...document.querySelectorAll('section:nth-of-type(2) button')].slice(0, 2).forEach(button => button.click())`);
    check('setup requires all bonus points before confirmation',
      await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.innerText === '确认开局').disabled`), 'unspent points block confirmation');
    for (let point = 0; point < 5; point++) await page.click('[aria-label="魔 +1"]');
    check('one stat cannot receive more than 5 bonus points',
      await page.evaluate(`document.querySelector('[aria-label="魔 +1"]').disabled && document.querySelector('[aria-label="魔最终值"]').textContent.includes('9')`), 'base magic 4 + bonus 5 = 9');
    for (let point = 0; point < 5; point++) await page.click('[aria-label="速 +1"]');
    check('all 10 points are allocated without reducing the base',
      await page.evaluate(`document.body.innerText.includes('额外还剩 0 / 10 点') && document.querySelector('[aria-label="HP −1"]').disabled && ![...document.querySelectorAll('button')].find(button => button.innerText === '确认开局').disabled`), '10 spent, HP base retained');
    await page.evaluate(`[...document.querySelectorAll('button')].find(button => button.innerText === '确认开局').click()`);
    check('completing setup opens the camp with exactly three characters',
      await until(() => page.evaluate(`!!document.querySelector('.topbar')`)) && (await api(page, 10)).units.length === 3, 'three-member party');
    const protagonist = (await api(page, 10)).units.find(unit => unit.isProtagonist);
    check('the custom protagonist retains its identity', protagonist?.id === 'u_protagonist' && protagonist.name === '星海神主', 'custom protagonist');
    const heroDetail = await api(page, 21, { unitId: 'u_protagonist' });
    check('saved hero stats retain every base value and add only the allocated bonuses',
      JSON.stringify(heroDetail.stats) === JSON.stringify({ ...setup.baseStats, mag: setup.baseStats.mag + 5, spd: setup.baseStats.spd + 5 }), JSON.stringify(heroDetail.stats));
    const starters = (await api(page, 10)).units;
    check('the starting three carry all-E ranks and the cheapest wooden/iron basic kit',
      starters.every(unit => Object.values(unit.ranks).every(rank => rank === 'E'))
      && starters.every(unit => ['fw_weapon_1', 'fw_weapon_24', 'fw_weapon_52', 'fw_weapon_72'].includes(unit.equipped)),
      starters.map(unit => `${unit.name}:${unit.equipped}`).join(', '));
    let repeated = false;
    try { await api(page, 127, {}); } catch { repeated = true; }
    check('setup cannot be repeated', repeated, 'second completion rejected');
    const beforeRoute = await api(page, 10);
    check('unopened pages stay out of navigation',
      await page.evaluate(`!document.querySelector('.rail a[href="#/field"], .rail a[href="#/quests"], .rail a[href="#/arena"], .rail a[href="#/story"], .rail a[href="#/workshop"], .rail a[href="#/tavern"], .rail a[href="#/legacy"], .rail a[href="#/replay"]')`), 'only base pages and the world map');
    await page.open(`http://127.0.0.1:${API_PORT}/#/settings`, '#ag-h');
    check('settings keeps unopened report and spectate links hidden',
      await page.evaluate(`!document.querySelector('a[href="#/replay"], a[href="#/spectate"]')`), 'no future-page shortcuts');
    await page.open(`http://127.0.0.1:${API_PORT}/#/rules`, '.rules-grid');
    check('the rules manual only links to currently open pages',
      await page.evaluate(`!document.querySelector('.rules-grid a[href="#/arena"], .rules-grid a[href="#/arena/annual"], .rules-grid a[href="#/quests"], .rules-grid a[href="#/workshop"], .rules-grid a[href="#/field"]')`), 'base rules remain readable');
    await page.open(`http://127.0.0.1:${API_PORT}/#/story`, '.world-map');
    check('locked direct pages render the world map', await page.evaluate(`!!document.querySelector('.world-map') && !document.querySelector('.story-cols')`), 'no locked story component');
    await page.open(`http://127.0.0.1:${API_PORT}/#/world`, '.world-map');
    check('the world map starts with four selectable routes and eight locked regions',
      await page.evaluate(`document.querySelectorAll('.world-node.available').length === 4 && document.querySelectorAll('.world-node:disabled').length === 8`), '4 / 8');
    if (process.env.E2E_ARTIFACT_DIR) {
      mkdirSync(process.env.E2E_ARTIFACT_DIR, { recursive: true });
      await page.capture(join(process.env.E2E_ARTIFACT_DIR, 'world-desktop.png'));
      await page.capture(join(process.env.E2E_ARTIFACT_DIR, 'world-mobile.png'), 390, 1100);
    }
    let lockedRegion = false;
    try { await api(page, 31, { region: 12 }); } catch (error) { lockedRegion = error.message.includes('尚未解锁'); }
    check('direct API calls cannot skip route unlocks', lockedRegion && (await api(page, 10)).day === beforeRoute.day, 'blocked without spending days');
    await page.click('.world-node[data-region="2"]');
    await page.evaluate(`[...document.querySelectorAll('.go-bar button')].find(button => button.innerText.includes('选择此路线')).click()`);
    check('choosing the forest opens exactly one region without spending days',
      await until(() => page.evaluate(`document.querySelectorAll('.world-node.unlocked').length === 1`))
      && JSON.stringify((await api(page, 10)).world.unlockedRegions) === '[2]'
      && (await api(page, 10)).day === beforeRoute.day, 'region 2 at the same date');
    check('route choice reveals field and quest pages while advanced combat stays hidden',
      await page.evaluate(`!!document.querySelector('.rail a[href="#/field"]') && !!document.querySelector('.rail a[href="#/quests"]') && !document.querySelector('.rail a[href="#/arena"]')`), 'progressive navigation');
    await page.open(`http://127.0.0.1:${API_PORT}/#/camp`, '#tasks-h');
    check('choosing a route leads to the first sortie', await page.evaluate(`document.querySelector('#tasks-h').closest('section').innerText.includes('准备首次出击')`), 'first sortie guidance');
    await page.open(`http://127.0.0.1:${API_PORT}/#/world`, '.world-map');
    check('the chosen route survives a browser reload', await page.evaluate(`document.querySelector('.world-node[data-region="2"]').classList.contains('unlocked') && document.querySelectorAll('.world-node.available').length === 0`), 'forest retained');
    check('a newly opened region has an accessible exploration bar at zero',
      await page.evaluate(`(() => { const bar = document.querySelector('.world-node[data-region="2"] progress'); return bar?.value === 0 && bar.max === 100 && bar.getAttribute('aria-label') === '希尔瓦林地探索度'; })()`), '0 / 100');
    await page.click('.world-node[data-region="2"]');
    await page.evaluate(`[...document.querySelectorAll('.go-bar a')].find(link => link.innerText === '前往任务').click()`);
    check('map links carry the selected region', await until(() => page.evaluate(`location.hash === '#/quests?region=2' && !!document.querySelector('[aria-labelledby="rg-2"]')`)), 'forest quest page');
    const quests = await api(page, 123);
    check('quest data only contains opened content',
      quests.regions.length === 1 && quests.regions[0].region === 2
      && quests.regions[0].quests.every(quest => quest.available || quest.done || quest.inProgress), 'unopened regions and prerequisites hidden');
    check('quest pages show the regional bar and both quest reward rules',
      await page.evaluate(`(() => { const panel = document.querySelector('[aria-labelledby="rg-2"]'); return panel.querySelector('progress')?.value === 0 && panel.innerText.includes('单图任务完成 +5') && panel.innerText.includes('首次整本通关 +20'); })()`), 'single-map +5, multi-map first clear +20');
    await page.evaluate(`[...document.querySelectorAll('[aria-label="希尔瓦林地商店分类"] button')].find(button => button.innerText.startsWith('弓')).click()`);
    const regionalWares = await page.evaluate(`document.querySelector('[aria-labelledby="rg-2"] ul.eq').innerText`);
    check('regional shops filter by weapon type', regionalWares.includes('木制弓') && !regionalWares.includes('疾风剑'), regionalWares.slice(0, 90));
    await page.click('.ch-acts button');
    check('quest preparation shows team selection, date, enemy level and permanent-death risk',
      await until(() => page.evaluate(`!!document.querySelector('section[aria-label="任务出征确认"] .team')`)) && await page.evaluate(`(() => { const text = document.querySelector('section[aria-label="任务出征确认"]').innerText; return ['敌军 Lv', '推进', '永久死亡', '确认出征'].every(value => text.includes(value)); })()`), 'preparation shown');
    await page.open(`http://127.0.0.1:${API_PORT}/#/field?region=2`, '#rg-h');
    check('field preparation shows the current bar and three-point reward',
      await page.evaluate(`(() => { const panel = document.querySelector('#rg-h').closest('section'); return panel.querySelector('progress')?.value === 0 && panel.innerText.includes('野外获胜 +3'); })()`), '0 / 100, win +3');
    const explorer = await api(page, 10);
    const explorerTeam = explorer.units.map(unit => unit.id);
    const fieldWin = await api(page, 31, { region: 2, unitIds: explorerTeam });
    const fieldCommand = prepareBrowserBattleWin(join(dbDir, 'e2e.db'), explorer.player.id, fieldWin.battleId);
    await api(page, 54, fieldCommand);
    await api(page, 54, fieldCommand);
    await page.open(`http://127.0.0.1:${API_PORT}/#/world`, '.world-map');
    await page.reload('.world-map');
    check('a real field settlement persists three points without opening neighbours',
      await page.evaluate(`document.querySelector('.world-node[data-region="2"] progress')?.value === 3 && document.querySelectorAll('.world-node.available').length === 0`), '3 / 100 after reload and command replay');
    if (process.env.E2E_ARTIFACT_DIR) {
      await page.capture(join(process.env.E2E_ARTIFACT_DIR, 'exploration-desktop.png'));
      await page.capture(join(process.env.E2E_ARTIFACT_DIR, 'exploration-mobile.png'), 390, 1100);
    }
    await page.open(`http://127.0.0.1:${API_PORT}/#/camp`, '#tasks-h');
    check('first victory leads to exploration with completion-based quest credit', await page.evaluate(`(() => { const tasks = document.querySelector('#tasks-h').closest('section').innerText; return tasks.includes('还需 97 探索度') && tasks.includes('单图任务完成 +5') && !tasks.includes('准备首次出击'); })()`), 'next exploration goal');
    const questWin = await api(page, 124, { questId: 'gw1', unitIds: explorerTeam });
    await api(page, 54, prepareBrowserBattleWin(join(dbDir, 'e2e.db'), explorer.player.id, questWin.battleId));
    await api(page, 125, { questId: 'gw1' });
    await page.open(`http://127.0.0.1:${API_PORT}/#/quests?region=2`, '[aria-labelledby="rg-2"]');
    await page.reload('[aria-labelledby="rg-2"]');
    check('quest completion adds five once and the quest bar refreshes after claiming',
      await page.evaluate(`document.querySelector('[aria-labelledby="rg-2"] progress')?.value === 8`), '3 + 5 = 8');
    for (let attempt = 0; attempt < 2; attempt++) {
      let stage = await api(page, 101, { region: 2, unitIds: explorerTeam });
      for (let index = 0; index < 3; index++) {
        await api(page, 54, prepareBrowserBattleWin(join(dbDir, 'e2e.db'), explorer.player.id, stage.battleId));
        if (index < 2) stage = await api(page, 102);
      }
    }
    await page.open(`http://127.0.0.1:${API_PORT}/#/field/dungeon?region=2`, '#drg-h');
    await page.reload('#drg-h');
    check('dungeon bars reflect only the first full clear across two completed runs',
      await page.evaluate(`(() => { const panel = document.querySelector('#drg-h').closest('section'); return panel.querySelector('progress')?.value === 28 && panel.innerText.includes('仅首次完整通关 +20') && panel.innerText.includes('重复通关不加'); })()`), '8 + 20 = 28');
    await page.evaluate(`localStorage.clear()`);
    await page.open(`http://127.0.0.1:${API_PORT}/`, 'input');
    const name = 'e2e-seeded';
    await page.type('input', name);
    await page.click('button[type=submit]');
    await page.open(`http://127.0.0.1:${API_PORT}/#/camp`, '.topbar');
    const topbar = await page.evaluate(`document.querySelector('.topbar').innerText.replace(/\\s+/g, ' ')`);
    check('login shows server gold', topbar.includes('13,120'), topbar.slice(0, 120));
    check('top bar shows the personal date and next event', topbar.includes('星辉历 1002年12月41日') && topbar.includes('今天 · 竞技场日') && !topbar.includes('赛季'), topbar.slice(0, 160));
    check('login shows the seeded legion', topbar.includes('军团'), topbar.slice(0, 160));
    // The browser never sends agentModel, so no Agent has checked in yet (stateView.agentLastSeen).
    check('agent chip follows the heartbeat', topbar.includes('Agent 离线') && !topbar.includes('Agent 在线'), topbar.slice(-40));
    const acts = await page.evaluate(`[...document.querySelectorAll('.act')].map(li => li.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
    check('camp actions show the GET_TODAY costs',
      ['出击', '训练', '休整', '游历招募'].every(n => acts.includes(n)) && ['8 日 →', '3 日 →', '1 日 →', '4 日 →'].every(c => acts.includes(c)) && !acts.includes('扫荡') && !acts.includes('1 行动日'),
      acts.slice(0, 160));

    await page.open(`http://127.0.0.1:${API_PORT}/#/arena`, '.panel');
    const arena = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('arena lists the server opponents', arena.includes('霜狼骑团') && arena.includes('赤枫商会') && arena.includes('白塔学士团'), arena.slice(0, 160));
    check('arena is attack-only and shows the open set',
      arena.includes('当日对局') && arena.includes('首版只有进攻') && arena.includes('每场入场推进 1 日') && !arena.includes('保存防守') && !arena.includes('24:00'),
      arena.slice(0, 200));

    // 已移除的防守入口会回落到只进攻的竞技场页，而不是再要求编防守队。
    await page.open(`http://127.0.0.1:${API_PORT}/#/arena/defense`, '#atk-h');
    const retired = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('the removed defense route falls back to attack-only arena',
      retired.includes('我方进攻') && retired.includes('首版只有进攻') && !retired.includes('保存防守'), retired.slice(0, 200));

    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/erin/growth`, '#snap-h');
    for (let i = 0; i < 30 && (await page.evaluate(`document.body.innerText.includes('读取快照中')`)); i++) await sleep(100);
    const snaps = await page.evaluate(`document.querySelector('#snap-h').closest('.panel').innerText.replace(/\\s+/g, ' ')`);
    check('roster compares real arena snapshots', snaps.includes('1002年12月41日') && snaps.includes('当前') && !snaps.includes('月末'), snaps.slice(0, 160));

    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/u_erin`, '#eq-h');
    // 基本能力格：数值视图读「值 /上限」，切到成长率视图再读合计成长。
    const charmCell = `(() => { const cell = [...document.querySelectorAll('.ability .ab-cell')].find(c => c.querySelector('.ab-k')?.innerText === '魅力'); return cell ? [cell.querySelector('.ab-v')?.innerText.trim(), cell.querySelector('.ab-cap')?.innerText.trim() ?? null] : null; })()`;
    const charmValue = await page.evaluate(charmCell);
    await page.click('.ability .seg button:nth-child(2)');
    await sleep(150);
    const charmGrowth = await page.evaluate(charmCell);
    await page.click('.ability .seg button:nth-child(1)');
    const charm = [charmValue?.[0], charmValue?.[1], charmGrowth?.[0]];
    const erin = await api(page, 21, { unitId: 'u_erin' });
    check('roster shows independent charm values, cap and growth from the server',
      charm[0] === String(erin.stats.cha) && charm[1] === `/${erin.caps.cha}` && charm[2] === `${erin.totalGrowth.cha}%`, JSON.stringify(charm));

    await page.open(`http://127.0.0.1:${API_PORT}/#/roster`, '.panel');
    const roster = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('roster shows the server units', roster.includes('艾琳') && roster.includes('维克托') && roster.includes('12'), roster.slice(0, 120));

    // Confirmation belongs to one character and must reset even when returning to that character.
    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/u_owen`, '#eq-h');
    await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === '解雇欧文…').click()`);
    await until(() => page.evaluate(`document.body.innerText.includes('确认解雇欧文')`));
    await page.evaluate(`[...document.querySelectorAll('.roster-list button.row')].find(b => b.innerText.includes('古斯塔夫')).click()`);
    check('switching characters clears dismissal confirmation', await until(() => page.evaluate(`document.body.innerText.includes('解雇古斯塔夫…') && !document.body.innerText.includes('确认解雇')`)), 'no inherited confirmation');
    await page.evaluate(`[...document.querySelectorAll('.roster-list button.row')].find(b => b.innerText.includes('欧文')).click()`);
    check('returning to the original character also requires fresh confirmation', await until(() => page.evaluate(`document.body.innerText.includes('解雇欧文…') && !document.body.innerText.includes('确认解雇')`)), 'confirmation cleared');

    // 整备: every button is a server op on the selected unit, and none of them moves the date.
    const owen = async () => (await api(page, 20)).units.find(u => u.id === 'u_owen');
    const dayBefore = (await api(page, 30)).day;
    const owen0 = await owen();
    await page.open(`http://127.0.0.1:${API_PORT}/#/prep/u_owen`, '.gear-shop li .btn');
    await page.viewport(390, 844);
    const mobilePrep = await page.evaluate(`(() => { const chooser = document.querySelector('.gear-picker').getBoundingClientRect(); const warehouse = document.querySelector('#wh-h').getBoundingClientRect(); return { chooser: chooser.top, warehouse: warehouse.top, width: document.documentElement.scrollWidth, selected: document.querySelector('.gear-picker .ph').innerText }; })()`);
    check('mobile prep chooses the target before inventory without horizontal overflow', mobilePrep.chooser < mobilePrep.warehouse && mobilePrep.width === 390 && mobilePrep.selected.includes('欧文'), JSON.stringify(mobilePrep));
    await page.evaluate(`document.querySelector('#wh-h').scrollIntoView()`);
    check('the selected character stays visible while scrolling mobile inventory', await page.evaluate(`document.querySelector('.gear-picker').getBoundingClientRect().top === 0`), 'sticky chooser');
    await page.viewport(1440, 900);
    await page.evaluate(`scrollTo(0, 0)`);
    await page.evaluate(`[...document.querySelectorAll('.chips button')].find(button => button.innerText.startsWith('剑')).click()`);
    const centralWares = await page.evaluate(`document.querySelector('.gear-shop').innerText`);
    check('the central shop filters basic weapons and preserves the selected unit',
      centralWares.includes('木制剑') && !centralWares.includes('木制枪') && !centralWares.includes('铁剑')
      && await page.evaluate(`location.hash === '#/prep/u_owen'`), centralWares.slice(0, 90));
    await page.evaluate(`[...document.querySelectorAll('.chips button')].find(button => button.innerText.startsWith('全部')).click()`);
    await press(page, '.gear-list li', '伤药', '交给欧文');
    check('prep gives a 伤药 to the selected unit', await until(async () => (await owen()).snapshot.items.length === owen0.snapshot.items.length + 1),
      JSON.stringify((await owen()).snapshot.items));
    const gold0 = (await api(page, 10)).gold;
    await press(page, '.gear-shop li', '秘传之书', '买');
    await until(async () => (await page.evaluate(`document.querySelector('#wh-h').closest('.panel').innerText.includes('秘传之书')`)));
    await press(page, '.gear-list li', '秘传之书', '欧文使用');
    check('prep buys a 能力药 and uses it on the unit', await until(async () => (await owen()).snapshot.stats.skl === owen0.snapshot.stats.skl + 2)
      && (await api(page, 10)).gold === gold0 - 8000 && (await owen()).drugCounts.skl === 1, `skl ${owen0.snapshot.stats.skl} → ${(await owen()).snapshot.stats.skl}`);
    const herb0 = (await api(page, 22)).inventory.find(r => r.item === 'herb').count;
    await press(page, '.gear-list li', '药草', '卖');
    await press(page, 'section[aria-labelledby=carry-h] li', '伤药', '放回仓库');
    check('prep sells materials and puts items back', await until(async () => (await api(page, 22)).inventory.find(r => r.item === 'herb').count === herb0 - 1
      && (await owen()).snapshot.items.length === owen0.snapshot.items.length), `herb ${herb0} → ${(await api(page, 22)).inventory.find(r => r.item === 'herb').count}`);
    const bexp0 = (await api(page, 10)).bexp;
    await page.evaluate(`document.querySelector('#bexp-h').closest('.panel').querySelector('button').click()`);
    check('prep assigns shared experience', await until(async () => (await owen()).level === owen0.level + 1) && (await api(page, 10)).bexp === bexp0 - 100,
      `Lv ${owen0.level} → ${(await owen()).level}, 公共经验 ${bexp0} → ${(await api(page, 10)).bexp}`);
    check('prep never moves the date', (await api(page, 30)).day === dayBefore, `day ${dayBefore} → ${(await api(page, 30)).day}`);
    const goldBeforeDisconnect = (await api(page, 10)).gold;
    const purchasePrice = (await api(page, 40)).items.find(row => row.name === '木制剑').price;
    await page.evaluate(`(() => {
      window.originalFetch = window.fetch;
      window.writeCount = 0;
      window.fetch = async (url, options) => {
        const request = JSON.parse(options?.body || '{}');
        if (request.op === 41) { window.writeCount++; const response = await window.originalFetch(url, options); window.failStateRead = true; return response; }
        if (request.op === 10 && window.failStateRead) throw new Error('测试：状态刷新断线');
        return window.originalFetch(url, options);
      };
    })()`);
    await press(page, '.gear-shop li', '木制剑', '买');
    check('a committed purchase with failed refresh still reports success', await until(() => page.evaluate(`document.body.innerText.includes('操作已提交，但状态尚未同步') && document.body.innerText.includes('买下木制剑')`)), 'success toast plus sync notice');
    await page.evaluate(`window.fetch = window.originalFetch`);
    await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === '重新同步').click()`);
    check('reconnecting only refreshes and never repeats the purchase', await until(() => page.evaluate(`!document.body.innerText.includes('操作已提交，但状态尚未同步')`)) && await page.evaluate(`window.writeCount === 1`) && (await api(page, 10)).gold === goldBeforeDisconnect - purchasePrice, 'one purchase, one deduction');
    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/u_owen`, '#eq-h');
    const link = await page.evaluate(`[...document.querySelectorAll('section[aria-labelledby=eq-h] a')].find(a => a.innerText.includes('从仓库放入'))?.getAttribute('href')`);
    check('roster links to prep with the unit picked', link === '#/prep/u_owen', String(link));

    // 休整 through the camp panel: one day passes and the panel's date follows the server.
    await page.open(`http://127.0.0.1:${API_PORT}/#/camp`, '.act[data-action=rest] button');
    const today = () => page.evaluate(`document.querySelector('#acts-h').closest('.panel').querySelector('.ph > span b').innerText`);
    const before = await today();
    await page.click('.act[data-action=rest] button');
    let after = before;
    for (let i = 0; i < 40 && after === before; i++) { await sleep(150); after = await today(); }
    check('camp rest moves the date one day', before.includes('1002年12月41日') && after.includes('星辉历 1003年1月1日'), `${before} → ${after}`);

    // 离开竞技场日后：顶栏倒数，但未打完的进攻不会被后台扫描吞掉，仍可在竞技场页继续。
    const topbar2 = await page.evaluate(`document.querySelector('.topbar').innerText.replace(/\\s+/g, ' ')`);
    check('top bar counts down to the next arena day', topbar2.includes('星辉历 1003年1月1日') && topbar2.includes('124 日后'), topbar2.slice(0, 160));
    const camp2 = await page.evaluate(`document.querySelector('#tasks-h').closest('.panel').innerText.replace(/\\s+/g, ' ')`);
    check('camp keeps the unfinished arena set and counts down', camp2.includes('进攻 0 / 3') && camp2.includes('还有 3 场进攻没打'), camp2.slice(0, 200));
    await page.open(`http://127.0.0.1:${API_PORT}/#/arena`, '#atk-h');
    const arena2 = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('arena still offers the remaining attacks after the date moves',
      arena2.includes('当日对局') && arena2.includes('已打 0 / 3 场') && arena2.includes('下一个竞技场日：星辉历 1003年3月41日') && !arena2.includes('24:00'),
      arena2.slice(0, 200));
    await page.evaluate(`localStorage.clear()`);
    await page.open(`http://127.0.0.1:${API_PORT}/`, 'input');
    await page.type('input', 'duplicates-seeded');
    await page.click('button[type=submit]');
    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/u_owen`, '#ab-h');
    const original = await api(page, 21, { unitId: 'u_owen' });
    // 基本能力切到成长率视图后读「力」格的合计成长。
    const rowValue = async () => {
      if (await page.evaluate(`document.querySelector('.ability .seg button:nth-child(2)').getAttribute('aria-pressed') !== 'true'`)) await page.click('.ability .seg button:nth-child(2)');
      await sleep(150);
      return page.evaluate(`[...document.querySelectorAll('.ability .ab-cell')].find(c => c.querySelector('.ab-k')?.innerText === '力')?.querySelector('.ab-v')?.innerText.trim()`);
    };
    const originalValue = await rowValue();
    check('duplicate templates keep the first instance growth', originalValue === `${original.totalGrowth.str}%`, `first ${originalValue} vs ${original.totalGrowth.str}%`);
    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/u_owen_twin`, '#ab-h');
    const twin = await api(page, 21, { unitId: 'u_owen_twin' });
    const twinValue = await rowValue();
    check('duplicate templates keep the second instance growth', twinValue === `${twin.totalGrowth.str}%` && twinValue !== originalValue, `second ${twinValue} vs ${twin.totalGrowth.str}%`);
    const keyboardParty = (await api(page, 10)).units.filter(u => u.status === 'active').slice(0, 6).map(u => u.id);
    const keyboardBattle = await api(page, 31, { region: 1, unitIds: keyboardParty });
    await page.open(`http://127.0.0.1:${API_PORT}/#/field`, '.battle-shell');
    const openRetreat = () => page.evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('撤退')).click()`);
    await openRetreat();
    await until(() => page.evaluate(`!!document.querySelector('#dlg-title')`));
    check('retreat defaults focus to cancel', await page.evaluate(`document.activeElement.innerText.includes('取消')`), 'cancel focused');
    await page.key('Tab', true);
    check('shift-tab wraps inside the confirmation', await page.evaluate(`document.activeElement.innerText.includes('确认撤退')`), 'focus remains in modal');
    await page.key('Tab');
    await page.key('Enter');
    check('Enter on cancel keeps the battle active', await until(() => page.evaluate(`!document.querySelector('#dlg-title')`)) && !(await api(page, 50, { battleId: keyboardBattle.battleId })).result, 'no retreat command');
    await openRetreat();
    await until(() => page.evaluate(`!!document.querySelector('#dlg-title')`));
    await page.key('Tab');
    await page.key('Enter');
    check('Enter on the focused confirmation still retreats', await until(async () => (await api(page, 50, { battleId: keyboardBattle.battleId })).result?.reason === '全军撤退'), 'explicit confirm works');
    check('no console errors', page.errors.length === 0, page.errors.join(' | ') || 'none');
  } finally {
    await page.close();
  }
} finally {
  await stopProcess(server);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  rmSync(dbDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

const failed = checks.filter(ok => !ok).length;
console.log(failed === 0 ? `\nall ${checks.length} checks passed` : `\n${failed}/${checks.length} checks failed`);
process.exit(failed === 0 ? 0 : 1);

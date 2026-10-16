// End-to-end check that the built frontend really talks to the backend (docs/07). Starts the Fastify
// API with a throwaway database, serves the built frontend from it, drives headless Chromium through
// login → 军营 → 竞技场 → 名册 and asserts the numbers on screen came from the server.
//
// Usage (from frontend/): npm run build && node test/backend-integration.e2e.mjs
// Needs Node.js 22.18+ and Chromium (CHROME_BIN overrides the binary name).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    close: () => { ws.close(); try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill('SIGKILL'); } },
    async open(url, selector) {
      await send('Page.navigate', { url });
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
const server = spawn('node', [join(import.meta.dirname, '..', '..', 'backend', 'api', 'server.ts')], {
  env: { ...process.env, API_PORT: String(API_PORT), DB_PATH: join(dbDir, 'e2e.db') }, stdio: 'inherit',
});

try {
  await waitFor(`http://127.0.0.1:${API_PORT}/api/health`);
  const page = await openPage(profile);
  try {
    await page.open(`http://127.0.0.1:${API_PORT}/`, 'input');
    const name = `e2e${Date.now() % 100000}`;
    await page.type('input', name);
    await page.click('button[type=submit]');
    await page.open(`http://127.0.0.1:${API_PORT}/#/camp`, '.topbar');
    const topbar = await page.evaluate(`document.querySelector('.topbar').innerText.replace(/\\s+/g, ' ')`);
    check('login shows server gold', topbar.includes('13,120'), topbar.slice(0, 120));
    check('top bar shows the personal date and next event', topbar.includes('第 2 年 · 第 3 季 · 第 30 日') && topbar.includes('今天 · 竞技场日') && !topbar.includes('赛季'), topbar.slice(0, 160));
    check('login shows the seeded legion', topbar.includes('军团'), topbar.slice(0, 160));
    // The browser never sends agentModel, so no Agent has checked in yet (stateView.agentLastSeen).
    check('agent chip follows the heartbeat', topbar.includes('Agent 离线') && !topbar.includes('Agent 在线'), topbar.slice(-40));
    const acts = await page.evaluate(`[...document.querySelectorAll('.act')].map(li => li.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
    check('camp actions show the GET_TODAY costs',
      ['出击', '扫荡', '训练', '休整', '游历招募'].every(n => acts.includes(n)) && ['8 日 →', '5 日 →', '3 日 →', '1 日 →', '4 日 →'].every(c => acts.includes(c)) && !acts.includes('1 行动日'),
      acts.slice(0, 160));

    await page.open(`http://127.0.0.1:${API_PORT}/#/arena`, '.panel');
    const arena = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('arena lists the server opponents', arena.includes('霜狼骑团') && arena.includes('赤枫商会') && arena.includes('白塔学士团'), arena.slice(0, 160));
    // Before settlement nothing has attacked the defense yet, so no made-up results or real-clock deadlines.
    check('arena day shows only real results', arena.includes('今日对局与结果') && arena.includes('推进日期结算时') && !arena.includes('苍穹议会') && !arena.includes('24:00'), arena.slice(0, 160));

    await page.open(`http://127.0.0.1:${API_PORT}/#/arena/defense`, '.dfrow');
    const defense = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('defense page shows the server lock', defense.includes('今天的防守已在第 2 年 · 第 3 季 · 第 30 日报名时锁定') && !defense.includes('月末'), defense.slice(0, 200));

    await page.open(`http://127.0.0.1:${API_PORT}/#/roster/erin/growth`, '#snap-h');
    for (let i = 0; i < 30 && (await page.evaluate(`document.body.innerText.includes('读取快照中')`)); i++) await sleep(100);
    const snaps = await page.evaluate(`document.querySelector('#snap-h').closest('.panel').innerText.replace(/\\s+/g, ' ')`);
    check('roster compares real arena snapshots', snaps.includes('2 年 3 季 30 日') && snaps.includes('当前') && !snaps.includes('月末'), snaps.slice(0, 160));

    await page.open(`http://127.0.0.1:${API_PORT}/#/roster`, '.panel');
    const roster = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('roster shows the server units', roster.includes('艾琳') && roster.includes('维克托') && roster.includes('12'), roster.slice(0, 120));

    // 整备: every button is a server op on the selected unit, and none of them moves the date.
    const owen = async () => (await api(page, 20)).units.find(u => u.id === 'u_owen');
    const dayBefore = (await api(page, 30)).day;
    const owen0 = await owen();
    await page.open(`http://127.0.0.1:${API_PORT}/#/prep/u_owen`, '.gear-shop li .btn');
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
    check('camp rest moves the date one day', before.includes('第 30 日') && after.includes('第 4 季 · 第 1 日'), `${before} → ${after}`);

    // Off the arena day: the top bar counts down to the next one and the arena page shows the settled day.
    const topbar2 = await page.evaluate(`document.querySelector('.topbar').innerText.replace(/\\s+/g, ' ')`);
    check('top bar counts down to the next arena day', topbar2.includes('第 2 年 · 第 4 季 · 第 1 日') && topbar2.includes('29 日后'), topbar2.slice(0, 160));
    const camp2 = await page.evaluate(`document.querySelector('#tasks-h').closest('.panel').innerText.replace(/\\s+/g, ' ')`);
    check('camp lists the settled arena day', camp2.includes('上次竞技场 · 第 2 年 · 第 3 季 · 第 30 日') && camp2.includes('下一个竞技场日'), camp2.slice(0, 160));
    await page.open(`http://127.0.0.1:${API_PORT}/#/arena`, '#atk-h');
    const arena2 = await page.evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`);
    check('arena shows the last result and the next date',
      arena2.includes('上次竞技场结果') && arena2.includes('下一个竞技场日：第 2 年 · 第 4 季 · 第 30 日') && arena2.includes('没打，按落败计') && arena2.includes('试攻') && !arena2.includes('24:00'),
      arena2.slice(0, 200));
    check('no console errors', page.errors.length === 0, page.errors.join(' | ') || 'none');
  } finally {
    page.close();
  }
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  rmSync(profile, { recursive: true, force: true });
  rmSync(dbDir, { recursive: true, force: true });
}

const failed = checks.filter(ok => !ok).length;
console.log(failed === 0 ? `\nall ${checks.length} checks passed` : `\n${failed}/${checks.length} checks failed`);
process.exit(failed === 0 ? 0 : 1);

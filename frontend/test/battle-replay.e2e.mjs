// Server-backed browser smoke test for the battle, arena and defense pages (docs/07, docs/11).
// Starts the Fastify API with a throwaway database, serves the built frontend from it, logs in, then
// drives real server battles through the UI: ending a phase in the browser must advance the battle the
// server stores, and saving a defense must reach the server.
//
// Usage (from frontend/): npm run build && node test/battle-replay.e2e.mjs
// Needs Node.js 22.18+ and Chromium (CHROME_BIN overrides the binary name).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API_PORT = 8612;
let cdpPort = 9512;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
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
  const click = async ([x, y]) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  const key = async (key, code, keyCode, text) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    errors, evaluate, key,
    close: () => { ws.close(); try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill('SIGKILL'); } },
    async open(url, selector) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !(await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)); i++) await sleep(100);
      await sleep(700);
    },
    async clickText(selector, text, optional = false) {
      const at = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.includes(${JSON.stringify(text)}));
        if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!at && !optional) throw new Error(`no ${selector} containing "${text}"`);
      if (at) await click(at);
    },
    async type(selector, text) {
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
  };
}

// Skips combat scenes, acknowledges level-ups and waits until the page accepts commands again.
async function settle(page) {
  for (let i = 0; i < 800; i++) {
    const s = await page.evaluate(`({ combat: !!document.querySelector('.combat'),
      dialog: document.querySelector('[role=dialog] h2')?.innerText ?? null, ready: !document.querySelector('.hud button')?.disabled })`);
    if (s.combat) await page.key(' ', 'Space', 32, ' ');
    else if (s.dialog?.includes('升级')) await page.key('Enter', 'Enter', 13, '\r');
    else if (s.dialog) return s.dialog;
    else if (s.ready) return null;
    await sleep(120);
  }
  throw new Error('the page never became ready');
}

// Ends the player phase through the UI: HUD button, then the confirmation dialog. The command travels
// to the server via the same path a real player's click does.
async function endPhase(page) {
  await page.clickText('.hud button', '结束阶段');
  await sleep(300);
  await page.clickText('[role=dialog] button', '结束阶段', true);
  await settle(page);
}

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
}

// Calls the API with the browser's session token, so the test reads exactly what the server stored.
async function serverOp(page, op, data = {}) {
  const token = await page.evaluate(`localStorage.getItem('agent-tactics.token')`);
  const res = await fetch(`http://127.0.0.1:${API_PORT}/api/op`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, seq: 1, data }),
  });
  const frame = await res.json();
  if (!frame.ok) throw new Error(`op ${op}: ${frame.error?.code} ${frame.error?.message}`);
  return frame.data;
}

const profile = mkdtempSync(join(tmpdir(), 'battle-e2e-'));
const dbDir = mkdtempSync(join(tmpdir(), 'battle-db-'));
const server = spawn('node', [join(import.meta.dirname, '..', '..', 'backend', 'api', 'server.ts')], {
  env: { ...process.env, API_PORT: String(API_PORT), DB_PATH: join(dbDir, 'e2e.db') }, stdio: 'ignore',
});
const base = `http://127.0.0.1:${API_PORT}`;

try {
  await waitFor(`${base}/api/health`);
  const page = await openPage(profile);
  try {
    // Log in once; every later navigation reuses the stored token.
    await page.open(`${base}/`, 'input');
    await page.type('input', `battle${Date.now() % 100000}`);
    await page.evaluate(`document.querySelector('button[type=submit]').click()`);
    await page.open(`${base}/#/camp`, '.topbar');

    // 竞技场: ban → deploy → attack; the server owns the battle and the points. Run this before any
    // day-advancing action, because the arena day settles as soon as the calendar moves past it.
    await page.open(`${base}/#/arena/frost/ban`, '.drow');
    const bans = await page.evaluate(`document.querySelectorAll('.slot').length`);
    for (let i = 0; i < bans; i++) await page.clickText('.drow button.ban:not([aria-pressed=true])', '禁用');
    await page.clickText('button', '确认禁用并揭晓阵容', true);
    await sleep(900);
    await page.clickText('.ready button', '开始战斗');
    for (let i = 0; i < 60 && !(await page.evaluate(`!!document.querySelector('.board')`)); i++) await sleep(100);
    await sleep(1400);
    await settle(page);
    const arenaBefore = await serverOp(page, 50, { full: true });
    await endPhase(page);
    const arenaAfter = await serverOp(page, 50, { full: true });
    check('arena attack is server-backed',
      arenaBefore.state.kind === 'arena' && arenaAfter.state.turn > arenaBefore.state.turn && arenaAfter.eventCount > 0 && page.errors.length === 0,
      `kind ${arenaBefore.state.kind}, turn ${arenaBefore.state.turn} → ${arenaAfter.state.turn}, events ${arenaAfter.eventCount} ${page.errors.join(' | ')}`);
    // Surrender so the field sortie below is not blocked by an active battle.
    await serverOp(page, 67, { battleId: arenaAfter.state.id });
    await page.open(`${base}/#/camp`, '.topbar');

    // 出击: 出征准备 spends nothing until confirmed; then the server owns the battle, and ending the
    // phase in the UI advances it.
    const dayBefore = (await serverOp(page, 30)).day;
    await page.open(`${base}/#/field`, '.prep');
    const prep = await page.evaluate(`document.querySelector('.prep').innerText.replace(/\\s+/g, ' ')`);
    const dayOnPrep = (await serverOp(page, 30)).day;
    check('sortie prep shows the rules and spends nothing',
      dayOnPrep === dayBefore && prep.includes('回合上限 20') && prep.includes('永久死亡') && prep.includes('8 日 →') && !(await page.evaluate(`!!document.querySelector('.board')`)),
      `day ${dayBefore} → ${dayOnPrep}; ${prep.slice(0, 140)}`);
    await page.clickText('.rg', '绿林');
    await page.clickText('.go-bar button', '确认出征');
    for (let i = 0; i < 60 && !(await page.evaluate(`!!document.querySelector('.board')`)); i++) await sleep(100);
    await sleep(1400);
    await settle(page);
    const fieldBefore = await serverOp(page, 50, { full: true });
    await endPhase(page);
    const fieldAfter = await serverOp(page, 50, { full: true });
    const dayAfter = (await serverOp(page, 30)).day;
    check('field sortie is server-backed',
      fieldBefore.state.turn === 1 && fieldBefore.state.name.startsWith('绿林') && dayAfter === dayBefore + 8
        && fieldAfter.state.turn > fieldBefore.state.turn && fieldAfter.eventCount > 0 && page.errors.length === 0,
      `${fieldBefore.state.name}, day +${dayAfter - dayBefore}, turn ${fieldBefore.state.turn} → ${fieldAfter.state.turn}, events ${fieldAfter.eventCount} ${page.errors.join(' | ')}`);
    await serverOp(page, 56, { battleId: fieldAfter.state.id });
    await page.open(`${base}/#/camp`, '.topbar');

    // 防守: edit, save to the server, reload and confirm it stuck.
    await page.open(`${base}/#/arena/defense`, '.dfrow');
    await page.clickText('.mapopt', '林中遭遇');
    await page.clickText('.headrow button', '保存防守');
    await sleep(900);
    await page.open(`${base}/#/arena/defense`, '.dfrow');
    const kept = await page.evaluate(`document.querySelector('.mapopt[aria-pressed=true] .mo-n')?.innerText ?? ''`);
    const saved = await serverOp(page, 61);
    check('defense saved to the server', kept.includes('林中遭遇') && saved.defense?.map === 'woods' && page.errors.length === 0,
      `page ${kept}, server map ${saved.defense?.map} ${page.errors.join(' | ')}`);

    // 回放 / 观战: both read the stored battle from the server, no local demo data.
    await page.open(`${base}/#/replay`, '.rp-player');
    const replayText = await page.evaluate(`document.body.innerText.replace(/\\s+/g,' ').slice(0, 240)`);
    check('replay viewer loads a server battle', replayText.includes('历史回放') && replayText.includes('回合') && page.errors.length === 0, replayText.slice(0, 120));
    await page.open(`${base}/#/spectate`, '.live-badge');
    const spectateText = await page.evaluate(`document.body.innerText.replace(/\\s+/g,' ').slice(0, 200)`);
    check('spectate auto-plays a server battle', spectateText.includes('实时观战') && page.errors.length === 0, spectateText.slice(0, 120));
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
process.exitCode = failed === 0 ? 0 : 1;

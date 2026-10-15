// Browser smoke test for the battle and arena pages, with no extra dependencies.
// The rule AI plans the player's moves in Node with the shared engine; headless Chromium replays them by
// clicking through the real UI (select → destination → action → weapon → Enter). Because the engine is
// deterministic, the page must reach exactly the result Node predicted.
//
//   field  黑松隘口 with fixed seeds (?seed=…#/field)
//   arena  ban → reveal → deploy → battle against 赤枫商会; the plan starts from the battle the page
//          saved, and the arena page must show the points Node computed
//
// Usage (from frontend/): npm run build && node test/battle-replay.e2e.mjs
// Needs Node.js 22.18+ and Chromium (CHROME_BIN overrides the binary name).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arenaPoints } from '../../backend/common/arena/rules.ts';
import { createPinepassBattle } from '../../backend/common/battles/pinepass.ts';
import { WEAPONS } from '../../backend/common/data/weapons.ts';
import { decide, living, step, unitById } from '../../backend/common/engine/index.ts';

const WEB_PORT = 8590;
let cdpPort = 9390;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function plan(start) {
  let state = start;
  const moves = [];
  while (!state.result) {
    for (const unit of living(state, 'player')) {
      const current = unitById(state, unit.id);
      if (state.result || !current.alive || current.acted) continue;
      const action = decide(state, current);
      moves.push({ action, from: current.pos, target: 'target' in action ? unitById(state, action.target).name : null });
      state = step(state, action).state;
    }
    if (!state.result) state = step(state, { type: 'endPhase' }).state;
  }
  return { moves, end: state };
}

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
  const page = {
    errors, evaluate, key,
    close: () => { ws.close(); try { process.kill(-chrome.pid, 'SIGKILL'); } catch { chrome.kill('SIGKILL'); } },
    async open(url, selector) {
      await send('Page.navigate', { url });
      for (let i = 0; i < 100 && !(await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)); i++) await sleep(100);
      await sleep(800);
    },
    // Center the tile in the scrollable map, then click it.
    async clickTile([x, y]) {
      const at = await evaluate(`(() => {
        const vp = document.querySelector('.viewport'), board = document.querySelector('.board');
        const c = parseFloat(getComputedStyle(board).getPropertyValue('--cell'));
        vp.scrollTo({ left: (${x} + 0.5) * c - vp.clientWidth / 2, top: (${y} + 0.5) * c - vp.clientHeight / 2 });
        const b = board.getBoundingClientRect();
        return [b.left + (${x} + 0.5) * c, b.top + (${y} + 0.5) * c]; })()`);
      await click(at);
    },
    async clickText(selector, text, optional = false) {
      const at = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.includes(${JSON.stringify(text)}));
        if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!at && !optional) throw new Error(`no ${selector} containing "${text}"`);
      if (at) await click(at);
    },
  };
  return page;
}

// Skips combat scenes, acknowledges level-ups and waits until the page accepts commands again.
async function settle(page) {
  for (let i = 0; i < 600; i++) {
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

async function replay(page, moves) {
  await page.clickText('.seg button', '仅主将战');
  for (const { action, from, target } of moves) {
    await page.clickTile(from);
    await page.clickTile(action.to);
    if (action.act === 'wait') await page.clickText('.acts button', '待机');
    else if (action.act === 'item') { await page.clickText('.acts button', '道具'); await page.clickText('.acts button', '使用'); }
    else {
      await page.clickText('.acts button', action.act === 'attack' ? '攻击' : '治疗');
      await page.clickText('.acts button', target, true);
      await page.clickText('.wopt', WEAPONS[action.weapon].name);
      await page.key('Enter', 'Enter', 13, '\r');
    }
    if (await settle(page)) break;
  }
  return page.evaluate(`document.querySelector('[role=dialog]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
}

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
}

async function fieldBattle(seed, profile) {
  const page = await openPage(profile);
  try {
    await page.open(`http://127.0.0.1:${WEB_PORT}/?seed=${encodeURIComponent(seed)}#/field`, '.board');
    const { moves, end } = plan(createPinepassBattle(seed));
    const shown = await replay(page, moves);
    const expected = end.result.winner === 'player' ? '胜利' : '战败';
    check(`field ${seed}`, shown.includes(expected) && shown.includes(end.result.reason) && page.errors.length === 0,
      `expected ${expected}（${end.result.reason}）, page shows "${shown.slice(0, 40)}" ${page.errors.join(' | ')}`);
  } finally {
    page.close();
  }
}

async function arenaAttack(opponent, profile) {
  const page = await openPage(profile);
  try {
    await page.open(`http://127.0.0.1:${WEB_PORT}/#/arena/${opponent}/ban`, '.drow');
    const bans = await page.evaluate(`document.querySelectorAll('.slot').length`);
    for (let i = 0; i < bans; i++) await page.clickText('.drow button.ban:not([aria-pressed=true])', '禁用');
    await page.clickText('.bottombar button', '确认禁用');
    await sleep(500);
    await page.clickText('.ready button', '开始战斗');
    for (let i = 0; i < 50 && !(await page.evaluate(`!!document.querySelector('.board')`)); i++) await sleep(100);
    await sleep(1200);
    const saved = await page.evaluate(`JSON.parse(localStorage.getItem('agent-tactics.arena-day')).attacks[${JSON.stringify(opponent)}].battle`);
    const { moves, end } = plan(saved);
    const points = arenaPoints(end).total;
    const shown = await replay(page, moves);
    const title = end.result.winner === 'player' ? '进攻胜利' : '进攻失败';
    await page.clickText('[role=dialog] button', '返回竞技场');
    await sleep(600);
    const today = await page.evaluate(`document.querySelector('.sum b')?.innerText`);
    check(`arena ${opponent}`, shown.includes(title) && shown.includes(`本场积分 ${points}`) && today === String(points) && page.errors.length === 0,
      `expected ${title}, ${points} 分; page shows "${shown.slice(0, 40)}", today ${today} ${page.errors.join(' | ')}`);
  } finally {
    page.close();
  }
}

const preview = spawn(join('node_modules', '.bin', 'rsbuild'), ['preview'], { env: { ...process.env, WEB_PORT: String(WEB_PORT) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'battle-e2e-'));
try {
  await waitFor(`http://127.0.0.1:${WEB_PORT}/`);
  for (const seed of ['s0', 's7']) await fieldBattle(seed, join(profile, `field-${seed}`));
  await arenaAttack('maple', join(profile, 'arena'));
} finally {
  preview.kill();
  rmSync(profile, { recursive: true, force: true });
}
process.exitCode = checks.every(Boolean) ? 0 : 1;

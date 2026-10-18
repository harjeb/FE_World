// Browser checks for the 永久军团 pages (docs/12 第四轮 → UI): 年度大竞技场、主线、职业资格、退役与传承、
// 生产与大副本. Starts the API with a throwaway database, serves the built frontend from it, drives headless
// Chromium through each page and asserts what the server stored after every click.
//
// Usage (from frontend/): npm run build && node test/systems.e2e.mjs
// Needs Node.js 22.18+ and Chromium (CHROME_BIN overrides the binary name). The seeded account starts on
// day 209 (an arena day, inside the 大竞技场 registration window), so the order below matters: the annual
// entry comes first, the steps that move the date (planting, resting, the dungeon) come last.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stopProcess } from './processes.mjs';
import { seedBrowserAccount } from './fixtures.mjs';

const API_PORT = 8613;
const BASE = `http://127.0.0.1:${API_PORT}`;
let cdpPort = 9611;
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
  const ready = async selector => {
    for (let i = 0; i < 150 && !(await evaluate(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`)); i++) await sleep(100);
    await sleep(400);
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  return {
    errors, evaluate,
    close: async () => { ws.close(); await stopProcess(chrome); },
    async open(url, selector) {
      await send('Page.navigate', { url });
      await ready(selector);
    },
    // A full reload, so the session re-reads the server after an op made outside the page.
    async reload(selector) {
      await send('Page.reload', { ignoreCache: true });
      await ready(selector);
    },
    async click(selector) {
      const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!at) throw new Error(`no ${selector}`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
    },
    async type(selector, text) {
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    text: () => evaluate(`document.body.innerText.replace(/\\s+/g, ' ')`),
  };
}

async function api(page, op, data = {}) {
  const token = await page.evaluate(`localStorage.getItem('agent-tactics.token')`);
  const res = await fetch(`${BASE}/api/op`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op, seq: 1, data }),
  });
  const frame = await res.json();
  if (!frame.ok) throw new Error(`op ${op}: ${frame.error?.message}`);
  return frame.data;
}

// Clicks the button whose label includes `label`, inside the first `rows` element whose text includes `row`.
// Waits for it to exist and be enabled: after an op the page refreshes the session before buttons unlock.
async function press(page, rows, row, label) {
  for (let i = 0; i < 80; i++) {
    const ok = await page.evaluate(`(() => {
      const box = [...document.querySelectorAll(${JSON.stringify(rows)})].find(e => e.innerText.includes(${JSON.stringify(row)}));
      const button = box && [...box.querySelectorAll('button')].find(b => b.innerText.includes(${JSON.stringify(label)}));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (ok) return;
    await sleep(100);
  }
  const debug = await page.evaluate(`(() => {
    const box = [...document.querySelectorAll(${JSON.stringify(rows)})].find(e => e.innerText.includes(${JSON.stringify(row)}));
    return box ? { text: box.innerText.replace(/\\s+/g, ' ').slice(0, 500),
      buttons: [...box.querySelectorAll('button')].map(b => ({ label: b.innerText.replace(/\\s+/g, ' '), disabled: b.disabled })) } : null;
  })()`);
  throw new Error(`no enabled "${label}" in ${rows} "${row}": ${JSON.stringify(debug)}`);
}

async function until(test, tries = 80) {
  for (let i = 0; i < tries; i++) { if (await test()) return true; await sleep(100); }
  return false;
}

const checks = [];
function check(name, ok, detail) {
  checks.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
}

const OP = {
  GET_STATE: 10, GET_INVENTORY: 22, GET_TODAY: 30, REST: 34, ASSIGN_BEXP: 46, RETREAT: 56, SURRENDER: 67,
  GET_MEMORIAL: 76, GET_CLASS_MARKET: 78, GET_PRODUCTION: 90, GET_RUN: 100, GET_ANNUAL: 110, GET_STORY: 120, GET_LEGACIES: 48,
};
const count = (inventory, item) => inventory.filter(r => r.item === item).reduce((n, r) => n + r.count, 0);

const profile = mkdtempSync(join(tmpdir(), 'agent-tactics-sys-'));
const dbDir = mkdtempSync(join(tmpdir(), 'agent-tactics-sysdb-'));
seedBrowserAccount(join(dbDir, 'e2e.db'), 'systems-seeded');
const server = spawn('node', [join(import.meta.dirname, '..', '..', 'backend', 'api', 'server.ts')], {
  env: { ...process.env, API_PORT: String(API_PORT), DB_PATH: join(dbDir, 'e2e.db') }, stdio: 'inherit',
});

try {
  await waitFor(`${BASE}/api/health`);
  const page = await openPage(profile);
  try {
    await page.open(`${BASE}/`, 'input');
    await page.type('input', 'systems-seeded');
    await page.click('button[type=submit]');
    await page.open(`${BASE}/#/camp`, '.topbar');
    const nav = await page.evaluate(`document.querySelector('.rail nav').innerText.replace(/\\s+/g, ' ')`);
    check('navigation lists the new pages', ['生产', '主线', '传承'].every(n => nav.includes(n)), nav);

    // 年度大竞技场: register, preview the server quote, play into the match, then read the result.
    await page.open(`${BASE}/#/arena/annual`, '#br-h');
    const annual0 = await page.text();
    check('annual page shows the edition and the open window', annual0.includes('第 2 届大竞技场') && annual0.includes('报名第 2 届') && annual0.includes('勾选顺序即出战顺序'), annual0.slice(0, 200));
    await press(page, 'section[aria-labelledby=br-h]', '本届赛程', '报名第');
    check('registering on the page creates the server entry',
      await until(async () => (await api(page, OP.GET_ANNUAL)).entry?.state === 'qualifier'), JSON.stringify((await api(page, OP.GET_ANNUAL)).entry?.unitIds?.length));
    await press(page, '.next-match', '下一场', '预览这一场');
    await until(async () => (await page.text()).includes('确认开打'));
    const quoted = await page.text();
    check('the next match shows the server quote before anything is spent', quoted.includes('推进 2 日') && quoted.includes('永久死亡') && quoted.includes('塔林原野'), quoted.slice(quoted.indexOf('下一场'), quoted.indexOf('下一场') + 160));
    const day0 = (await api(page, OP.GET_STATE)).day;
    await press(page, '.next-match', '下一场', '确认开打');
    check('executing the quote opens the match on the same page',
      await until(async () => (await page.evaluate(`!!document.querySelector('.board')`)) && (await page.text()).includes('大竞技场')), (await page.text()).slice(0, 120));
    check('the match moved the date two days', (await api(page, OP.GET_STATE)).day === day0 + 2, `day ${day0} → ${(await api(page, OP.GET_STATE)).day}`);
    await api(page, OP.SURRENDER);
    await page.reload('#br-h');
    const annual1 = await page.text();
    check('the bracket shows the played qualifier', annual1.includes('0 胜 1 负') && annual1.includes('第 1 场 · 已赛') && annual1.includes('参赛名单'), annual1.slice(annual1.indexOf('本届赛程'), annual1.indexOf('本届赛程') + 160));
    await api(page, 113);
    check('withdrawing releases the annual activity lock', (await api(page, OP.GET_ANNUAL)).entry.state === 'withdrawn', 'entry withdrawn');

    // 主线: complete the open chapter, then claim its shared experience once.
    await page.open(`${BASE}/#/story`, '#ch-h');
    const story0 = await page.text();
    check('story shows the open chapters and keeps later ones hidden', story0.includes('盛会') && story0.includes('裂痕') && story0.includes('可完成') && story0.includes('尚未开放'), story0.slice(0, 160));
    const bexp0 = (await api(page, OP.GET_STATE)).bexp;
    await press(page, '.chap', '盛会', '完成本章事件');
    check('completing the chapter is stored', await until(async () => (await api(page, OP.GET_STORY)).chapters[0].completed), 'chapter 1');
    await press(page, '.chap', '盛会', '领取');
    check('claiming pays the shared experience once', await until(async () => (await api(page, OP.GET_STATE)).bexp === bexp0 + 1350), `bexp ${bexp0} → ${(await api(page, OP.GET_STATE)).bexp}`);
    const story1 = await page.text();
    check('the completed chapter reveals what was learned', story1.includes('本章所得') && story1.includes('神纹') && story1.includes('已完成'), story1.slice(story1.indexOf('盛会'), story1.indexOf('盛会') + 120));

    // 职业资格: pick a class, confirm, and the server records the qualification and the price.
    await page.open(`${BASE}/#/roster/u_victor/classes`, '#mk-h');
    const gold0 = (await api(page, OP.GET_STATE)).gold;
    const picked = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.mk-table button.mk-cls')].find(b => b.innerText.trim() === '剑客'); if (!b) return false; b.click(); return true; })()`);
    await until(async () => (await page.text()).includes('确认购买'));
    await press(page, 'section[aria-labelledby=mk-h]', '职业资格', '确认购买');
    const market = async () => (await api(page, OP.GET_CLASS_MARKET, { unitId: 'u_victor' })).classes.find(c => c.id === 'swordsman');
    check('buying a qualification on the page stores it and charges the price',
      picked && await until(async () => (await market()).owned) && (await api(page, OP.GET_STATE)).gold === gold0 - (await market()).price,
      `gold ${gold0} → ${(await api(page, OP.GET_STATE)).gold}`);
    check('the bought class shows as owned', await until(async () => (await page.text()).includes('✓ 剑客')), 'cell');
    await page.open(`${BASE}/#/roster/u_victor/promote`, '#who-h');
    check('the promotion page requires ownership and explains how to buy a qualification',
      (await page.text()).includes('需要先购买资格') && await page.evaluate(`document.querySelector('.promo-confirm button').disabled`), 'unowned qualification');

    // 退役与传承: lift 欧文 past the legacy level, retire him on the page, see the legacy and the memorial.
    await api(page, OP.ASSIGN_BEXP, { unitId: 'u_owen', amount: 600 });
    await page.open(`${BASE}/#/camp`, '.topbar');
    await page.reload('.topbar');
    await page.open(`${BASE}/#/roster/u_owen/retire`, '#rt-h');
    const retire0 = await page.text();
    check('the retire tab explains the legacy conditions', retire0.includes('会留下遗产') && retire0.includes('退役不能撤销') && retire0.includes('缺少轮回核心'), retire0.slice(retire0.indexOf('退役'), retire0.indexOf('退役') + 160));
    await press(page, 'section[aria-labelledby=rt-h]', '退役', '让欧文退役');
    await press(page, 'section[aria-labelledby=rt-h]', '退役', '确认让欧文退役');
    check('retiring stores the memorial and the legacy',
      await until(async () => (await api(page, OP.GET_MEMORIAL)).memorials.some(m => m.name === '欧文' && m.cause === 'retired'))
        && (await api(page, OP.GET_LEGACIES)).legacies.some(l => l.sourceName === '欧文' && l.state === 'available'), 'u_owen');
    check('the page moves on to the legacies', await until(async () => (await page.evaluate(`location.hash`)) === '#/legacy' && (await page.evaluate(`!!document.querySelector('#lg-h')`))), await page.evaluate(`location.hash`));
    await until(async () => (await page.text()).includes('纪念名册') && (await page.text()).includes('累计战死'));
    const legacy = await page.text();
    check('the legacy page lists the legacy, the memorial and the recruit status',
      legacy.includes('欧文') && legacy.includes('可兑现') && legacy.includes('退役') && legacy.includes('传承尚未解锁') && legacy.includes('个人基础成长'),
      legacy.slice(legacy.indexOf('遗产'), legacy.indexOf('遗产') + 220));

    // 生产: start a brew, plant a seed (one day), rest until it ripens, collect on the page.
    await page.open(`${BASE}/#/workshop`, '[data-facility=apothecary]');
    const vul0 = count((await api(page, OP.GET_INVENTORY)).inventory, 'vulnerary');
    await press(page, '.recipe', '炼制伤药', '开工');
    check('starting a recipe opens a server order', await until(async () => (await api(page, OP.GET_PRODUCTION)).orders.some(o => o.recipeId === 'brew_vulnerary')), 'brew_vulnerary');
    const dayPlant = (await api(page, OP.GET_STATE)).day;
    await press(page, '.recipe', '播种药草', '播种');
    check('planting spends one day', await until(async () => (await api(page, OP.GET_STATE)).day === dayPlant + 1), `day ${dayPlant} → ${(await api(page, OP.GET_STATE)).day}`);
    await api(page, OP.REST, { days: 3 });
    await page.reload('[data-facility=apothecary]');
    await press(page, '.order', '炼制伤药', '领取');
    check('collecting a ripe order puts the output in the warehouse', await until(async () => count((await api(page, OP.GET_INVENTORY)).inventory, 'vulnerary') === vul0 + 1), `vulnerary ${vul0} → ${count((await api(page, OP.GET_INVENTORY)).inventory, 'vulnerary')}`);
    const shop = await page.text();
    check('the garden shows the growing herbs with their ripening date', shop.includes('播种药草') && shop.includes('还要') && shop.includes('生长中'), shop.slice(shop.indexOf('药草田'), shop.indexOf('药草田') + 160));

    // 大副本: preview, set out, retreat, and the page reports the failed run.
    await page.open(`${BASE}/#/field/dungeon`, '#drg-h');
    await press(page, 'section[aria-label=确认出发]', '流程', '预览第 1 图');
    await until(async () => (await page.text()).includes('确认出发'));
    const quote = await page.text();
    check('the dungeon shows the server quote first', quote.includes('推进 8 日') && quote.includes('永久死亡'), quote.slice(quote.indexOf('总耗时'), quote.indexOf('总耗时') + 160));
    await press(page, 'section[aria-label=确认出发]', '流程', '确认出发');
    check('setting out opens the first map', await until(async () => (await page.evaluate(`!!document.querySelector('.board')`)) && (await page.text()).includes('1 / 3 图')), (await page.text()).slice(0, 120));
    const run = (await api(page, OP.GET_RUN)).run;
    check('the run is stored with its fixed team', run?.state === 'battle' && run.unitIds.length > 0, JSON.stringify({ state: run?.state, team: run?.unitIds.length }));
    await api(page, OP.RETREAT);
    await page.reload('#drg-h');
    const after = await page.text();
    check('a retreat ends the run and the page says so', after.includes('上次远征') && after.includes('失败') && (await api(page, OP.GET_RUN)).run.state === 'failed', after.slice(after.indexOf('上次远征'), after.indexOf('上次远征') + 80));

    // 规则手册 and 设置 replace the old 演示版 placeholders.
    await page.open(`${BASE}/#/rules`, '#r-calendar');
    const rules = await page.text();
    check('the rules manual reads its numbers from the game data',
      rules.includes('军团作战守则') && rules.includes('每季第 125 日是竞技场日') && rules.includes('塔林原野 6 人、禁 2、20 回合') && rules.includes('炼制伤药') && !rules.includes('演示版没有'),
      rules.slice(rules.indexOf('个人日历与行动'), rules.indexOf('个人日历与行动') + 160));
    await page.open(`${BASE}/#/settings`, '#ag-h');
    await press(page, 'section[aria-labelledby=ag-h]', 'Agent 接入', '取得接入令牌');
    await until(async () => (await page.text()).includes('连接地址'));
    const settings = await page.text();
    check('settings hands out the Agent token with the connection details',
      settings.includes('sk_') && settings.includes('ws://') && settings.includes('docVersion')
        && !(await page.evaluate(`[...document.querySelectorAll('button')].some(b => b.innerText.includes('取得接入令牌'))`)),
      'Agent connection details present (credential omitted)');
    await press(page, '.set-rows > div', '网格', '显示');
    const saved = await page.evaluate(`localStorage.getItem('agent-tactics.battle-settings')`);
    check('battle display defaults are saved in the browser', !!saved && JSON.parse(saved).grid === false, String(saved));

    // 军营 picks the new systems up.
    await page.open(`${BASE}/#/camp`, '.task');
    const camp = await page.text();
    check('camp lists the waiting legacy and the next harvest', camp.includes('传承 · 1 份遗产待兑现') && camp.includes('播种药草成熟'), camp.slice(camp.indexOf('待办'), camp.indexOf('待办') + 240));
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

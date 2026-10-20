// Focused browser coverage for multi-unit training, group rewards and a narrow viewport.
// Run after npm run build; CHROME_BIN points to Chromium/Chrome/Edge.
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
import { RANK_EXP } from '../../backend/common/game/model.ts';

const temp = mkdtempSync(join(tmpdir(), 'fe-training-'));
const dbPath = join(temp, 'test.db');
const name = 'training-browser';
seedBrowserAccount(dbPath, name);
const store = new Store(openDb(dbPath));
const account = store.db.prepare('SELECT id FROM players LIMIT 1').get();
const player = store.getPlayer(account.id);
player.day = 500;
store.savePlayer(player);
store.db.close();
const origin = 'http://127.0.0.1:8616';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, message) {
  for (let i = 0; i < 120; i++) { if (await test()) return; await sleep(100); }
  throw new Error(message);
}
const server = spawn(process.execPath, [join(import.meta.dirname, '../../backend/api/server.ts')], {
  env: { ...process.env, API_PORT: '8616', DB_PATH: dbPath }, stdio: 'ignore',
});
let browser, socket;
try {
  await until(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, 'API did not start');
  browser = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9416', `--user-data-dir=${join(temp, 'browser')}`, 'about:blank'], { stdio: 'ignore', detached: true });
  await until(async () => { try { return (await fetch('http://127.0.0.1:9416/json/version')).ok; } catch { return false; } }, 'browser did not start');
  const target = (await (await fetch('http://127.0.0.1:9416/json/list')).json()).find(row => row.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const requests = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { requests.get(message.id)?.(message); requests.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
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
  const api = (op, data = {}) => evaluate(`fetch('/api/op', { method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+localStorage.getItem('agent-tactics.token')},body:JSON.stringify({op:${op},seq:1,data:${JSON.stringify(data)}})}).then(r=>r.json()).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`);
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin });
  await until(() => evaluate(`!!document.querySelector('input')`), 'login missing');
  await evaluate(`(() => { const input=document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await evaluate(`document.querySelector('button[type=submit]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-action=train] button')`), 'camp missing');
  const before = await api(10);
  await evaluate(`document.querySelector('[data-action=train] button').click()`);
  await until(() => evaluate(`!!document.querySelector('.training-modal')`), 'training dialog missing');
  assert.equal(await evaluate(`document.querySelectorAll('.training-group').length`), 3);
  assert.ok(await evaluate(`document.querySelector('.training-label').innerText.includes('1 / 3')`));
  await evaluate(`document.querySelectorAll('.training-unit input')[1].click()`);
  await evaluate(`document.querySelectorAll('.training-unit input')[2].click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.training-unit input:checked').length`), 3);
  assert.equal(await evaluate(`document.querySelectorAll('.training-unit input')[3].disabled`), true);
  assert.equal(await evaluate(`document.querySelector('.training-total strong').innerText`), '600');
  await evaluate(`document.querySelectorAll('.training-group')[2].click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.training-preview').length`), 3);
  assert.equal(await evaluate(`document.querySelectorAll('.training-weapon').length`), 12);
  const selectedIds = await evaluate(`Array.from(document.querySelectorAll('.training-unit input')).map((input,index)=>input.checked?${JSON.stringify(before.units.filter(unit => unit.status === 'active' && !unit.lockedRunId && !unit.lockedDispatchId).map(unit => unit.id))}[index]:null).filter(Boolean)`);
  const shotDir = process.env.E2E_ARTIFACT_DIR;
  if (shotDir) {
    const image = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shotDir, 'training-desktop.png'), Buffer.from(image.data, 'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(100);
  assert.equal(await evaluate(`(() => {const panel=document.querySelector('.training-modal'),r=panel.getBoundingClientRect(); return document.documentElement.scrollWidth<=innerWidth && panel.scrollWidth<=panel.clientWidth && r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})()`), true, 'dialog fits mobile without overflow');
  if (shotDir) {
    const image = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shotDir, 'training-mobile.png'), Buffer.from(image.data, 'base64'));
  }
  await evaluate(`document.querySelector('.training-modal footer .btn-primary').click()`);
  await until(async () => (await api(10)).day === before.day + 3, 'training did not commit');
  const after = await api(10);
  assert.equal(after.gold, before.gold - 600);
  for (const unitId of selectedIds) {
    const unitBefore = before.units.find(unit => unit.id === unitId);
    const unitAfter = after.units.find(unit => unit.id === unitId);
    for (const type of ['fist', 'staff', 'tome', 'dragon']) {
      assert.equal(unitAfter.weaponExp[type], Math.max(unitBefore.weaponExp[type] ?? 0, RANK_EXP[unitBefore.ranks[type] ?? 'E']) + 3);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 3-unit selection limit, groups, 12 rewards, 600 gold/3 days, mobile layout and no browser exceptions');
} finally {
  // Let Chromium close its profile and renderers before falling back to process termination.
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 1000000000, method: 'Browser.close' }));
    await sleep(200);
  }
  const children = [browser, server].filter(Boolean);
  socket?.close();
  await Promise.all(children.map(async child => {
    try { await stopProcess(child); }
    catch (error) {
      // Windows may reap an owned process before Node delivers its queued exit event.
      try { process.kill(child.pid, 0); } catch (missing) { if (missing.code === 'ESRCH') return; }
      throw error;
    }
  }));
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

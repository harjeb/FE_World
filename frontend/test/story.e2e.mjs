// Story reveals, readable dialogue and postgame navigation through the built app.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_PASSWORD, seedBrowserAccount } from './fixtures.mjs';
import { stopProcess } from './processes.mjs';
import { openDb } from '../../backend/api/db.ts';
import { Store } from '../../backend/api/store.ts';

const temp = mkdtempSync(join(tmpdir(), 'fe-story-'));
const dbPath = join(temp, 'test.db'), account = 'story-browser';
seedBrowserAccount(dbPath, account);
function progress(chapter = 0, part = false) {
  const store = new Store(openDb(dbPath));
  try {
    const player = store.getPlayer(store.db.prepare('SELECT id FROM players LIMIT 1').get().id);
    player.day = chapter < 5 ? 600 : 4000; player.flags.clearedRegions = [2];
    player.flags.storyCompleted = Array.from({ length: chapter }, (_, i) => i + 1);
    player.flags.questsDone = player.flags.storyCompleted.map(c => `story-${c}`);
    player.flags.storyStepsDone = player.flags.storyCompleted.flatMap(c => [`story-${c}-a`, `story-${c}-b`]);
    if (part) player.flags.storyStepsDone.push('story-1-a');
    store.savePlayer(player);
  } finally { store.db.close(); }
}
progress();
const origin = 'http://127.0.0.1:8618', debug = 'http://127.0.0.1:9418';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  for (let i = 0; i < 120; i++) { if (await check()) return; await sleep(100); }
  throw Error(message);
}
const server = spawn(process.execPath, [join(import.meta.dirname, '../../backend/api/server.ts')], { env: { ...process.env, API_PORT: '8618', DB_PATH: dbPath }, stdio: 'ignore' });
let browser, socket;
try {
  await until(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, 'server did not start');
  browser = spawn(process.env.CHROME_BIN || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9418', `--user-data-dir=${join(temp, 'browser')}`, 'about:blank'], { stdio: 'ignore', detached: true });
  await until(async () => { try { return (await fetch(`${debug}/json/version`)).ok; } catch { return false; } }, 'browser did not start');
  const target = (await (await fetch(`${debug}/json/list`)).json()).find(t => t.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, reply => reply.error ? reject(Error(reply.error.message)) : resolve(reply.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const shot = async name => {
    if (!process.env.E2E_ARTIFACT_DIR) return;
    mkdirSync(process.env.E2E_ARTIFACT_DIR, { recursive: true });
    const image = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(process.env.E2E_ARTIFACT_DIR, name), Buffer.from(image.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin });
  await until(() => evaluate(`!!document.querySelector('input')`), 'login missing');
  await evaluate(`(()=>{const input=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(account)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`(()=>{const input=document.querySelector('input[name=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(TEST_PASSWORD)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate(`document.querySelector('button[type=submit]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-action=train]')`), 'camp missing');
  await evaluate(`location.hash='#/story'`);
  await until(() => evaluate(`!!document.querySelector('[data-scene=story-1-opening]')`), 'story dialogue missing');
  assert.ok(await evaluate(`document.querySelector('.story-prologue').textContent.includes('没有遗体')`));
  assert.equal(await evaluate(`document.querySelectorAll('[data-chapter]').length`), 1);
  assert.ok(await evaluate(`document.querySelector('[data-scene=story-1-opening]').open`));
  assert.equal(await evaluate(`!!document.querySelector('[data-scene=story-1-a-after]')`), false);
  assert.equal(await evaluate(`!!document.querySelector('[data-scene=story-1-ending]')`), false);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('阿扎赫')`), false);
  await shot('story-desktop.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[data-scene=story-1-opening]').scrollIntoView({block:'start'})`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'mobile story does not overflow');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.story-line')).every(el=>el.scrollWidth<=el.clientWidth+1)`), 'dialogue wraps on mobile');
  await evaluate(`document.querySelector('[data-scene=story-1-opening] summary').click()`);
  assert.equal(await evaluate(`document.querySelector('[data-scene=story-1-opening]').open`), false, 'scene folds');
  await evaluate(`document.querySelector('[data-scene=story-1-opening] summary').click()`);
  await shot('story-mobile.png');

  progress(0, true);
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate(`!!document.querySelector('[data-scene=story-1-a-after]')`), 'completed testimony missing after reload');
  assert.equal(await evaluate(`!!document.querySelector('[data-scene=story-1-b-after]')`), false);
  progress(5);
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate(`!!document.querySelector('[data-scene=story-5-ending]')`), 'champion rescue ending missing');
  assert.ok(await evaluate(`document.querySelector('[data-scene=story-5-ending]').textContent.includes('阿尔维恩')`));
  assert.equal(await evaluate(`!!document.querySelector('[data-chapter="7"]')`), false, 'future contract reveal stays hidden');
  assert.equal(await evaluate(`!!document.querySelector('.story-postgame')`), false);
  await evaluate(`document.querySelector('[data-chapter="5"] .story-investigation summary').click()`);
  assert.ok(await evaluate(`document.querySelector('[data-chapter="5"] .story-investigation').open`), 'completed investigation can be reread');

  progress(8);
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate(`!!document.querySelector('.story-postgame')`), 'postgame route missing');
  assert.ok(await evaluate(`document.querySelector('[data-chapter="8"]').textContent.includes('洛德里克已被击败')`));
  await evaluate(`document.querySelector('.story-postgame a').click()`);
  await until(() => evaluate(`!!document.querySelector('#fl-forbidden-abyss')`), 'forbidden land bosses missing');
  assert.ok(await evaluate(`document.body.textContent.includes('魔神·阿扎赫')`));
  assert.ok(await evaluate(`document.querySelector('#fl-forbidden-abyss').closest('section').querySelector('button').disabled`), 'later boss waits for earlier route');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  assert.deepEqual(errors, []);
  console.log('story browser passed: staged testimony, endings, replay, 390px dialogue and forbidden-land navigation');
} finally {
  if (socket?.readyState === 1) { socket.send(JSON.stringify({ id: 1000000000, method: 'Browser.close' })); await sleep(200); socket.close(); }
  for (const proc of [browser, server]) if (proc?.pid) {
    try { await stopProcess(proc); } catch (error) { try { process.kill(proc.pid, 0); throw error; } catch (check) { if (check.code !== 'ESRCH') throw check; } }
  }
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

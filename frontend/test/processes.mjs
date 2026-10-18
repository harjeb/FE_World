import { execFile } from 'node:child_process';

// Chromium owns child processes that can keep its temporary profile locked on Windows.
export async function stopProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  let timer;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    // A renderer can exit while taskkill enumerates the tree. Its nonzero result must not race
    // the parent's queued exit event; force the owned parent if necessary, then await that event.
    await new Promise(resolve => {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        resolve();
      });
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { child.kill('SIGKILL'); }
  }
  try {
    await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Process ${child.pid} did not exit after cleanup`)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

import { execFile } from 'node:child_process';

// Chromium owns child processes that can keep its temporary profile locked on Windows.
export async function stopProcess(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error && child.exitCode === null && child.signalCode === null) reject(error);
        else resolve();
      });
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch { child.kill('SIGKILL'); }
  }
  await exited;
}

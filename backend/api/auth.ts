import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store, Player } from './store.ts';

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('新密码需要 8–128 个字符');
}

// Passwords use scrypt with a per-account salt; Agent credentials never contain a password.
export function hashPassword(password: string): string {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: unknown, stored: string | null): boolean {
  if (typeof password !== 'string' || !password.length || password.length > 128 || !stored) return false;
  const parts = stored.split(':');
  const [salt, hash] = parts;
  if (parts.length !== 2 || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '')) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export interface LoginResult { accountId: string; player: Player; token: string }

// HTTP routes distinguish registration from login; internal probes use the same password checks.
export function loginOrRegister(store: Store, name: string, password: string, legion?: string): LoginResult {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 32) throw new Error('名字需要 2–32 个字符');
  name = name.trim();
  return store.transaction(() => {
    let account = store.accountByName(name);
    if (!account) {
      const hash = hashPassword(password);
      account = { id: store.createAccount(name, hash), name, passwordHash: hash };
    } else {
      if (!account.passwordHash) throw new Error('旧账号尚未设置密码，请联系管理员初始化；存档保留');
      if (!verifyPassword(password, account.passwordHash)) throw new Error('用户名或密码不正确');
    }
    let player = store.getPlayerByAccount(account.id);
    if (!player) player = store.createPlayer(account.id, name, legion ?? `${name}军团`);
    return { accountId: account.id, player, token: store.createSession(account.id) };
  });
}

// Administrator initialization and player changes share atomic credential revocation.
export function setAccountPassword(store: Store, accountId: string, password: string): void {
  const hash = hashPassword(password);
  store.transaction(() => {
    if (!store.accountById(accountId)) throw new Error('账号不存在');
    store.db.prepare('UPDATE accounts SET password_hash = ? WHERE id = ?').run(hash, accountId);
    store.db.prepare('DELETE FROM sessions WHERE account_id = ?').run(accountId);
    store.db.prepare('DELETE FROM tokens WHERE account_id = ?').run(accountId);
    const player = store.getPlayerByAccount(accountId);
    if (player?.flags.controlLease) {
      delete player.flags.controlLease;
      store.savePlayer(player);
    }
  });
}

export function changePassword(store: Store, accountId: string, currentPassword: string, newPassword: string): void {
  validatePassword(newPassword);
  store.transaction(() => {
    const account = store.accountById(accountId);
    if (!account?.passwordHash) throw new Error('旧账号尚未设置密码，请联系管理员初始化');
    if (!verifyPassword(currentPassword, account.passwordHash)) throw new Error('当前密码不正确');
    setAccountPassword(store, accountId, newPassword);
  });
}

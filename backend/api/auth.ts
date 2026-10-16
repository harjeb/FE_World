import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Store } from './store.ts';
import type { Player } from './store.ts';

// Passwords use scrypt with a per-account salt. Agent tokens are separate from passwords (docs/06):
// a player can reset the token without touching the password.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export interface LoginResult { accountId: string; player: Player; token: string }

// Name-only login is allowed for the prototype: it creates the account on first use. Passing a
// password turns the account into a normal password account on creation and is required afterwards.
export function loginOrRegister(store: Store, name: string, password?: string, legion?: string): LoginResult {
  if (!name || name.length < 2 || name.length > 32) throw new Error('名字需要 2–32 个字符');
  let account = store.accountByName(name);
  if (!account) {
    const hash = password ? hashPassword(password) : null;
    account = { id: store.createAccount(name, hash), name, passwordHash: hash };
  } else if (account.passwordHash && !verifyPassword(password ?? '', account.passwordHash)) {
    throw new Error('密码不正确');
  }
  let player = store.getPlayerByAccount(account.id);
  if (!player) player = store.createPlayer(account.id, name, legion ?? `${name}军团`);
  const token = store.createSession(account.id);
  return { accountId: account.id, player, token };
}

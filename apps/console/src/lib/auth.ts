import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { courierEnv } from './runtime';

export const SESSION_COOKIE = 'courier_operator';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function tokenConfigured(): boolean {
  return Boolean(process.env.COURIER_CONSOLE_TOKEN);
}

/** Demo mode without a token is open (mock data only). Live mode always needs one. */
export function consoleIsOpen(): boolean {
  return !tokenConfigured() && courierEnv().COURIER_MODE === 'demo';
}

export function checkToken(candidate: string): boolean {
  const expected = process.env.COURIER_CONSOLE_TOKEN;
  if (!expected) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

/**
 * Authorization lives here, in every page and server action, not in a proxy:
 * approving orders and reading the vault are the two most sensitive actions
 * in the system.
 */
export async function requireOperator(): Promise<string> {
  if (consoleIsOpen()) return 'demo-operator';
  if (!tokenConfigured()) redirect('/login?error=unconfigured');
  const value = (await cookies()).get(SESSION_COOKIE)?.value ?? '';
  if (!checkToken(value)) redirect('/login');
  return 'operator';
}

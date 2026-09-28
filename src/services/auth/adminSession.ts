import type { AstroCookies } from 'astro';
import { deleteCookie, readSignedCookie, writeSignedCookie } from '@/services/auth/signedCookie';
import type { AdminSession } from '@/types/domain';

export const ADMIN_COOKIE = 'admin_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function createAdminSession(cookies: AstroCookies, session: AdminSession): Promise<void> {
  return writeSignedCookie(cookies, ADMIN_COOKIE, session.userId, { username: session.username, name: session.name }, MAX_AGE_SECONDS);
}

export async function readAdminSession(cookies: AstroCookies): Promise<AdminSession | null> {
  const payload = await readSignedCookie(cookies, ADMIN_COOKIE);
  if (!payload?.sub || typeof payload.username !== 'string') return null;
  return { userId: payload.sub, username: payload.username, name: typeof payload.name === 'string' ? payload.name : null };
}

export function destroyAdminSession(cookies: AstroCookies): void {
  deleteCookie(cookies, ADMIN_COOKIE);
}

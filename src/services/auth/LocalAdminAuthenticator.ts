import { createHash, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { deleteCookie, readSignedCookie, writeSignedCookie } from '@/services/auth/signedCookie';
import type { AdminAuthenticator } from '@/services/contracts';
import type { AdminSession } from '@/types/domain';

const ADMIN_COOKIE = 'admin_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

/** Una administradora fija, definida por LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD. Solo desarrollo. */
export class LocalAdminAuthenticator implements AdminAuthenticator {
  constructor(
    private readonly cookies: AstroCookies,
    private readonly credentials: { email: string; password: string },
  ) {}

  async signIn(email: string, password: string): Promise<AdminSession | null> {
    const ok =
      safeEqual(email.trim().toLowerCase(), this.credentials.email.toLowerCase()) &&
      safeEqual(password, this.credentials.password);
    if (!ok) return null;

    const session = { userId: 'local-admin', email: this.credentials.email };
    await writeSignedCookie(this.cookies, ADMIN_COOKIE, session.userId, { email: session.email }, MAX_AGE_SECONDS);
    return session;
  }

  async currentAdmin(): Promise<AdminSession | null> {
    const payload = await readSignedCookie(this.cookies, ADMIN_COOKIE);
    if (!payload?.sub) return null;
    return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
  }

  async signOut(): Promise<void> {
    deleteCookie(this.cookies, ADMIN_COOKIE);
  }
}

function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

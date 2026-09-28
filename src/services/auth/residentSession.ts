import type { AstroCookies } from 'astro';
import { deleteCookie, readSignedCookie, writeSignedCookie } from '@/services/auth/signedCookie';
import type { ResidentSession } from '@/types/domain';

export const RESIDENT_COOKIE = 'resident_session';
// Cero fricción: la sesión dura 90 días para que no tengan que volver a escribir el PIN cada mes.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

export function createResidentSession(cookies: AstroCookies, session: ResidentSession): Promise<void> {
  return writeSignedCookie(
    cookies,
    RESIDENT_COOKIE,
    session.houseId,
    { houseNumber: session.houseNumber, condominiumId: session.condominiumId },
    MAX_AGE_SECONDS,
  );
}

export async function readResidentSession(cookies: AstroCookies): Promise<ResidentSession | null> {
  const payload = await readSignedCookie(cookies, RESIDENT_COOKIE);
  if (!payload?.sub || typeof payload.houseNumber !== 'string' || typeof payload.condominiumId !== 'string') {
    return null;
  }
  return { houseId: payload.sub, houseNumber: payload.houseNumber, condominiumId: payload.condominiumId };
}

export function destroyResidentSession(cookies: AstroCookies): void {
  deleteCookie(cookies, RESIDENT_COOKIE);
}

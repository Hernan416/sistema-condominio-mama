import type { AstroCookies } from 'astro';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '@/services/config';

const secretKey = () => new TextEncoder().encode(config.sessionSecret());

/** Guarda un JWT HS256 en una cookie httpOnly. */
export async function writeSignedCookie(
  cookies: AstroCookies,
  name: string,
  subject: string,
  claims: Record<string, unknown>,
  maxAgeSeconds: number,
): Promise<void> {
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());

  cookies.set(name, token, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

/** Devuelve el payload si la firma y la expiración son válidas; si no, null. */
export async function readSignedCookie(cookies: AstroCookies, name: string): Promise<JWTPayload | null> {
  const token = cookies.get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    return payload.sub ? payload : null;
  } catch {
    return null;
  }
}

export function deleteCookie(cookies: AstroCookies, name: string): void {
  cookies.delete(name, { path: '/' });
}

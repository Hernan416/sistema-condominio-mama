import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Equivalente local de crypt()/bcrypt de pgcrypto. Formato: "scrypt$<salt>$<hash>".

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(pin, salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPinHash(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(pin, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

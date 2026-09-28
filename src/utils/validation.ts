export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export type IdentifierKind = 'email' | 'username' | 'invalid';

/**
 * Login unificado: un correo es un administrador; cualquier otro usuario es un residente.
 * (Los usuarios de residentes nunca contienen "@": lo impide el CHECK de la base.)
 */
export function classifyIdentifier(raw: string): IdentifierKind {
  const value = raw.trim();
  if (value.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'email' : 'invalid';
  return isValidUsername(value) ? 'username' : 'invalid';
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  const value = normalizeUsername(raw);
  return value.length > 0 && value.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

export function isValidPeriod(month: unknown, year: unknown): boolean {
  return (
    Number.isInteger(month) && (month as number) >= 1 && (month as number) <= 12 &&
    Number.isInteger(year) && (year as number) >= 2000 && (year as number) <= 2100
  );
}

export function isValidAmount(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

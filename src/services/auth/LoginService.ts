import type { AstroCookies } from 'astro';
import type { HouseRepository, UserRepository } from '@/services/contracts';
import type { UserCredentials } from '@/types/domain';
import { createResidentSession, destroyResidentSession } from '@/services/auth/residentSession';
import { createAdminSession, destroyAdminSession } from '@/services/auth/adminSession';
import { hashPin, verifyPinHash } from '@/services/auth/pinHasher';
import { isValidPin, isValidUsername, normalizeUsername } from '@/utils/validation';

export type LoginResult =
  | { status: 'admin' }
  | { status: 'resident' }
  /** Residente que todavía no tiene PIN: debe crearlo. */
  | { status: 'needs_pin'; username: string }
  | { status: 'invalid' | 'locked' | 'format' };

/** crear = primera vez (no tenía PIN) · olvido = poner uno nuevo aunque ya tuviera. */
export type PinMode = 'crear' | 'olvido';

export type PinResult =
  | { status: 'ok' }
  | { status: 'unknown' | 'mismatch' | 'format' | 'already_set' | 'not_allowed' };

// Tras 5 PIN equivocados seguidos, el usuario queda bloqueado 15 minutos.
const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
// Hash de referencia para gastar el mismo tiempo cuando el usuario no existe.
const DUMMY_HASH = hashPin('0000');

/**
 * Acceso con la tabla de usuarios: usuario + PIN para todos; el rol decide a dónde va.
 * Los residentes empiezan SIN PIN: al entrar la primera vez lo crean, y si lo olvidan
 * ponen uno nuevo escribiendo su usuario (sistema cerrado: sin correo ni verificaciones).
 * La administradora no puede usar "olvidé mi PIN" (si no, cualquiera tomaría el panel).
 */
export class LoginService {
  constructor(
    private readonly users: UserRepository,
    private readonly houses: HouseRepository,
    private readonly cookies: AstroCookies,
  ) {}

  async login(identifier: string, secret: string): Promise<LoginResult> {
    const username = normalizeUsername(identifier);
    if (!isValidUsername(username)) return { status: 'format' };

    const user = await this.users.findByUsername(username);
    // Primera vez: el residente aún no tiene PIN → a crearlo (no importa lo que escribió).
    if (user?.role === 'resident' && !user.pinHash) return { status: 'needs_pin', username: user.username };

    const pin = secret.trim();
    if (!pin) return { status: 'format' };
    if (!isValidPin(pin)) return { status: 'invalid' };
    // Misma respuesta si el usuario no existe o el PIN es incorrecto: no revela quién existe.
    if (!user || !user.pinHash) {
      verifyPinHash(pin, DUMMY_HASH);
      return { status: 'invalid' };
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return { status: 'locked' };

    if (!verifyPinHash(pin, user.pinHash)) {
      const failed = user.failedAttempts + 1;
      const locked = failed >= MAX_ATTEMPTS;
      await this.users.saveAttempts(user.id, locked ? 0 : failed, locked ? new Date(Date.now() + LOCK_WINDOW_MS) : null);
      return { status: locked ? 'locked' : 'invalid' };
    }
    if (user.failedAttempts > 0 || user.lockedUntil) await this.users.saveAttempts(user.id, 0, null);
    return this.startSession(user);
  }

  /** Crea (primera vez) o reemplaza (olvido) el PIN de un residente y lo deja con la sesión abierta. */
  async setResidentPin(mode: PinMode, identifier: string, pin: string, confirm: string): Promise<PinResult> {
    const username = normalizeUsername(identifier);
    if (!isValidUsername(username)) return { status: 'unknown' };
    const user = await this.users.findByUsername(username);
    if (!user) return { status: 'unknown' };
    if (user.role !== 'resident') return { status: 'not_allowed' };
    if (mode === 'crear' && user.pinHash) return { status: 'already_set' };

    const clean = pin.trim();
    if (!isValidPin(clean)) return { status: 'format' };
    if (clean !== confirm.trim()) return { status: 'mismatch' };

    await this.users.setPin(user.id, hashPin(clean));
    const result = await this.startSession(user);
    return result.status === 'resident' ? { status: 'ok' } : { status: 'unknown' };
  }

  logout(): void {
    destroyResidentSession(this.cookies);
    destroyAdminSession(this.cookies);
  }

  /** Una sola sesión activa: entrar como uno cierra la del otro. */
  private async startSession(user: UserCredentials): Promise<LoginResult> {
    if (user.role === 'admin') {
      destroyResidentSession(this.cookies);
      await createAdminSession(this.cookies, { userId: user.id, username: user.username, name: user.displayName });
      return { status: 'admin' };
    }
    const house = user.houseId ? await this.houses.findById(user.houseId) : null;
    if (!house) return { status: 'invalid' };
    destroyAdminSession(this.cookies);
    await createResidentSession(this.cookies, { houseId: house.id, houseNumber: house.number, condominiumId: house.condominiumId });
    return { status: 'resident' };
  }
}

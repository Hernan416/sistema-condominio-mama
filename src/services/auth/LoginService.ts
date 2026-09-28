import type { AstroCookies } from 'astro';
import type { HouseRepository, UserRepository } from '@/services/contracts';
import { createResidentSession, destroyResidentSession } from '@/services/auth/residentSession';
import { createAdminSession, destroyAdminSession } from '@/services/auth/adminSession';
import { hashPin, verifyPinHash } from '@/services/auth/pinHasher';
import { isValidPin, isValidUsername, normalizeUsername } from '@/utils/validation';

export type LoginResult =
  | { status: 'admin' }
  | { status: 'resident' }
  | { status: 'invalid' | 'locked' | 'format' };

// Tras 5 PIN equivocados seguidos, el usuario queda bloqueado 15 minutos.
const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
// Hash de referencia para gastar el mismo tiempo cuando el usuario no existe.
const DUMMY_HASH = hashPin('0000');

/**
 * Login único con la tabla de usuarios: usuario + PIN para todos. El rol decide a dónde va:
 * administradora al panel, residente a su cuenta. Igual en modo local y en Supabase.
 */
export class LoginService {
  constructor(
    private readonly users: UserRepository,
    private readonly houses: HouseRepository,
    private readonly cookies: AstroCookies,
  ) {}

  async login(identifier: string, secret: string): Promise<LoginResult> {
    const username = normalizeUsername(identifier);
    const pin = secret.trim();
    if (!isValidUsername(username) || !pin) return { status: 'format' };
    if (!isValidPin(pin)) return { status: 'invalid' };

    const user = await this.users.findByUsername(username);
    // Misma respuesta si el usuario no existe o el PIN es incorrecto: no revela quién existe.
    if (!user) {
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

    // Una sola sesión activa: entrar como uno cierra la del otro.
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

  logout(): void {
    destroyResidentSession(this.cookies);
    destroyAdminSession(this.cookies);
  }
}

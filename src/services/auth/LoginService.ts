import type { AstroCookies } from 'astro';
import type { AdminAuthenticator, PinVerifier } from '@/services/contracts';
import { createResidentSession, destroyResidentSession } from '@/services/auth/residentSession';
import { classifyIdentifier, isValidPin, normalizeUsername } from '@/utils/validation';

export type LoginResult =
  | { status: 'admin' }
  | { status: 'resident' }
  | { status: 'invalid' | 'locked' | 'format' };

/**
 * Login unificado. Un correo se autentica como administrador; cualquier otro
 * usuario, como residente con PIN. El formulario no necesita saber cuál es cuál.
 */
export class LoginService {
  constructor(
    private readonly adminAuth: AdminAuthenticator,
    private readonly pins: PinVerifier,
    private readonly cookies: AstroCookies,
  ) {}

  async login(identifier: string, secret: string): Promise<LoginResult> {
    const kind = classifyIdentifier(identifier);
    if (kind === 'invalid' || !secret) return { status: 'format' };

    // Una sola sesión activa: entrar como uno cierra la del otro.
    if (kind === 'email') {
      const admin = await this.adminAuth.signIn(identifier.trim(), secret);
      if (!admin) return { status: 'invalid' };
      destroyResidentSession(this.cookies);
      return { status: 'admin' };
    }

    if (!isValidPin(secret.trim())) return { status: 'invalid' };
    const result = await this.pins.verify(normalizeUsername(identifier), secret.trim());
    if (result.status !== 'ok') return { status: result.status };

    await this.adminAuth.signOut();
    await createResidentSession(this.cookies, result.session);
    return { status: 'resident' };
  }

  async logout(): Promise<void> {
    destroyResidentSession(this.cookies);
    await this.adminAuth.signOut();
  }
}

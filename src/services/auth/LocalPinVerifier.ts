import { verifyPinHash } from '@/services/local/pinHasher';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { PinVerifier } from '@/services/contracts';
import type { PinVerificationResult } from '@/types/domain';
import { normalizeUsername } from '@/utils/validation';

// Mismas reglas que la función SQL verify_house_pin.
const MAX_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

export class LocalPinVerifier implements PinVerifier {
  constructor(private readonly store: LocalJsonStore) {}

  verify(username: string, pin: string): Promise<PinVerificationResult> {
    return this.store.transaction((db): PinVerificationResult => {
      const house = db.houses.find((h) => h.username === normalizeUsername(username));
      if (!house) return { status: 'invalid' };

      const now = Date.now();
      if (house.locked_until && Date.parse(house.locked_until) > now) {
        return { status: 'locked', lockedUntil: new Date(house.locked_until) };
      }

      if (verifyPinHash(pin, house.pin_hash)) {
        house.failed_attempts = 0;
        house.locked_until = null;
        return {
          status: 'ok',
          session: { houseId: house.id, houseNumber: house.number, condominiumId: house.condominium_id },
        };
      }

      house.failed_attempts += 1;
      if (house.failed_attempts >= MAX_ATTEMPTS) {
        house.failed_attempts = 0;
        house.locked_until = new Date(now + LOCK_WINDOW_MS).toISOString();
        return { status: 'locked', lockedUntil: new Date(house.locked_until) };
      }
      house.locked_until = null;
      return { status: 'invalid' };
    });
  }
}

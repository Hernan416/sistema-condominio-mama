import type { PinVerificationResult } from '@/types/domain';
import type { VerifyPinRow } from '@/types/database';

export function supabasePinRowToResult(row: VerifyPinRow | undefined): PinVerificationResult {
  if (row?.status === 'ok' && row.house_id && row.house_number && row.condominium_id) {
    return {
      status: 'ok',
      session: { houseId: row.house_id, houseNumber: row.house_number, condominiumId: row.condominium_id },
    };
  }
  if (row?.status === 'locked' && row.locked_until) {
    return { status: 'locked', lockedUntil: new Date(row.locked_until) };
  }
  return { status: 'invalid' };
}

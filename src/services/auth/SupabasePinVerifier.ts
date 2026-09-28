import type { SupabaseClient } from '@supabase/supabase-js';
import { supabasePinRowToResult } from '@/adapters/pinVerificationAdapter';
import type { VerifyPinRow } from '@/types/database';
import type { PinVerificationResult } from '@/types/domain';
import type { PinVerifier } from '@/services/contracts';

/** Delegamos hash + bloqueo por intentos a la función SQL `verify_house_pin` (atómica). */
export class SupabasePinVerifier implements PinVerifier {
  constructor(private readonly db: SupabaseClient) {}

  async verify(username: string, pin: string): Promise<PinVerificationResult> {
    const { data, error } = await this.db.rpc('verify_house_pin', { p_username: username, p_pin: pin });
    if (error) throw new Error(`No se pudo verificar el PIN: ${error.message}`);
    // La función SQL devuelve `returns table (...)`: siempre un arreglo de 0 o 1 filas.
    const rows = (data ?? []) as VerifyPinRow[];
    return supabasePinRowToResult(rows[0]);
  }
}

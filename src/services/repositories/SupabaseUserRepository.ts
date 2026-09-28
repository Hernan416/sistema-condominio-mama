import type { SupabaseClient } from '@supabase/supabase-js';
import { userRowToCredentials } from '@/adapters/userAdapter';
import type { UserRow } from '@/types/database';
import type { UserRepository } from '@/services/contracts';
import type { UserCredentials } from '@/types/domain';
import { normalizeUsername } from '@/utils/validation';

const USER_COLUMNS = 'id, username, pin_hash, role, display_name, house_id, failed_attempts, locked_until, created_at';

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByUsername(username: string): Promise<UserCredentials | null> {
    const { data, error } = await this.db.from('users').select(USER_COLUMNS).eq('username', normalizeUsername(username)).maybeSingle<UserRow>();
    if (error) throw new Error(`No se pudo leer el usuario: ${error.message}`);
    return data ? userRowToCredentials(data) : null;
  }

  async saveAttempts(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    const { error } = await this.db
      .from('users')
      .update({ failed_attempts: failedAttempts, locked_until: lockedUntil?.toISOString() ?? null })
      .eq('id', userId);
    if (error) throw new Error(`No se pudo actualizar el usuario: ${error.message}`);
  }

  async setPin(userId: string, pinHash: string): Promise<void> {
    const { error } = await this.db.from('users').update({ pin_hash: pinHash, failed_attempts: 0, locked_until: null }).eq('id', userId);
    if (error) throw new Error(`No se pudo guardar el PIN: ${error.message}`);
  }
}

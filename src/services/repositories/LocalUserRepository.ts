import { userRowToCredentials } from '@/adapters/userAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { UserRepository } from '@/services/contracts';
import type { UserCredentials } from '@/types/domain';
import { normalizeUsername } from '@/utils/validation';

/** Misma semántica que SupabaseUserRepository, sobre el archivo JSON local. */
export class LocalUserRepository implements UserRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findByUsername(username: string): Promise<UserCredentials | null> {
    const { users } = await this.store.read();
    const row = users.find((u) => u.username === normalizeUsername(username));
    return row ? userRowToCredentials(row) : null;
  }

  async saveAttempts(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.store.transaction((db) => {
      const row = db.users.find((u) => u.id === userId);
      if (row) Object.assign(row, { failed_attempts: failedAttempts, locked_until: lockedUntil?.toISOString() ?? null });
    });
  }

  async setPin(userId: string, pinHash: string): Promise<void> {
    await this.store.transaction((db) => {
      const row = db.users.find((u) => u.id === userId);
      if (row) Object.assign(row, { pin_hash: pinHash, failed_attempts: 0, locked_until: null });
    });
  }
}

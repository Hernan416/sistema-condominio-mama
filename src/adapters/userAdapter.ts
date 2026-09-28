import type { UserRow } from '@/types/database';
import type { UserCredentials } from '@/types/domain';

export function userRowToCredentials(row: UserRow): UserCredentials {
  return {
    id: row.id,
    username: row.username,
    pinHash: row.pin_hash,
    role: row.role,
    displayName: row.display_name,
    houseId: row.house_id,
    failedAttempts: row.failed_attempts ?? 0,
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
  };
}

/** Usuario del residente de una casa (el primero con rol residente), para mostrarlo en el panel. */
export function residentUsernameOf(users: { username: string; role: string }[] | null | undefined): string | null {
  return users?.find((u) => u.role === 'resident')?.username ?? null;
}

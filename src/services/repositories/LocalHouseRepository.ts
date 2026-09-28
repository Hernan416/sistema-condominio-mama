import { houseUpdateToRow, supabaseHouseToDomainHouse, type HouseUpdate } from '@/adapters/houseAdapter';
import type { LocalDatabase, LocalHouseRecord, LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { HouseRepository } from '@/services/contracts';
import type { House } from '@/types/domain';

export class LocalHouseRepository implements HouseRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findById(id: string): Promise<House | null> {
    const db = await this.store.read();
    const row = db.houses.find((h) => h.id === id);
    return row ? toDomain(db, row) : null;
  }

  async listByCondominium(condominiumId: string): Promise<House[]> {
    const db = await this.store.read();
    return db.houses
      .filter((h) => h.condominium_id === condominiumId)
      .map((row) => toDomain(db, row))
      .sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }));
  }

  updateMany(updates: ({ id: string } & HouseUpdate)[]): Promise<House[]> {
    return this.store.transaction((db) =>
      updates.map(({ id, ...update }) => {
        const row = db.houses.find((h) => h.id === id);
        if (!row) throw new Error('La unidad no existe');
        Object.assign(row, houseUpdateToRow(update));
        return toDomain(db, row);
      }),
    );
  }
}

/** Simula el join `users(username, role)` de Supabase y pasa por el mismo adapter. */
function toDomain(db: LocalDatabase, row: LocalHouseRecord): House {
  const users = db.users.filter((u) => u.house_id === row.id).map(({ username, role }) => ({ username, role }));
  return supabaseHouseToDomainHouse({ ...row, users });
}

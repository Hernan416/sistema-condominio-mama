import { houseUpdateToRow, supabaseHouseToDomainHouse, type HouseUpdate } from '@/adapters/houseAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { HouseRepository } from '@/services/contracts';
import type { House } from '@/types/domain';

export class LocalHouseRepository implements HouseRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findById(id: string): Promise<House | null> {
    const { houses } = await this.store.read();
    const row = houses.find((h) => h.id === id);
    return row ? supabaseHouseToDomainHouse(row) : null;
  }

  async listByCondominium(condominiumId: string): Promise<House[]> {
    const { houses } = await this.store.read();
    return houses
      .filter((h) => h.condominium_id === condominiumId)
      .map(supabaseHouseToDomainHouse)
      .sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }));
  }

  updateMany(updates: ({ id: string } & HouseUpdate)[]): Promise<House[]> {
    return this.store.transaction((db) =>
      updates.map(({ id, ...update }) => {
        const row = db.houses.find((h) => h.id === id);
        if (!row) throw new Error('La unidad no existe');
        Object.assign(row, houseUpdateToRow(update));
        return supabaseHouseToDomainHouse(row);
      }),
    );
  }
}

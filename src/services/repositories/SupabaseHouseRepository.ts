import type { SupabaseClient } from '@supabase/supabase-js';
import { houseUpdateToRow, supabaseHouseToDomainHouse, type HouseUpdate } from '@/adapters/houseAdapter';
import type { HouseRow } from '@/types/database';
import type { House } from '@/types/domain';
import type { HouseRepository } from '@/services/contracts';

const HOUSE_COLUMNS = 'id, condominium_id, number, owner_name, owner_document, owner_email, aliquot, aliquot_category_id, owner_phone, occupancy, occupant_name, occupant_phone, notes, users(username, role)';

export class SupabaseHouseRepository implements HouseRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: string): Promise<House | null> {
    const { data, error } = await this.db
      .from('houses')
      .select(HOUSE_COLUMNS)
      .eq('id', id)
      .maybeSingle<HouseRow>();
    if (error) throw new Error(`No se pudo leer la casa: ${error.message}`);
    return data ? supabaseHouseToDomainHouse(data) : null;
  }

  async listByCondominium(condominiumId: string): Promise<House[]> {
    const { data, error } = await this.db
      .from('houses')
      .select(HOUSE_COLUMNS)
      .eq('condominium_id', condominiumId)
      .overrideTypes<HouseRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron listar las casas: ${error.message}`);
    return (data ?? [])
      .map(supabaseHouseToDomainHouse)
      .sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }));
  }

  /** Una actualización por unidad (PostgREST no hace UPDATE masivo con valores distintos por fila). */
  async updateMany(updates: ({ id: string } & HouseUpdate)[]): Promise<House[]> {
    return Promise.all(
      updates.map(async ({ id, ...update }) => {
        const { data, error } = await this.db
          .from('houses')
          .update(houseUpdateToRow(update))
          .eq('id', id)
          .select(HOUSE_COLUMNS)
          .single<HouseRow>();
        if (error) throw new Error(`No se pudo guardar la unidad: ${error.message}`);
        return supabaseHouseToDomainHouse(data);
      }),
    );
  }
}

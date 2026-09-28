import type { SupabaseClient } from '@supabase/supabase-js';
import { condominiumUpdateToRow, supabaseCondominiumToDomain, supabaseCondominiumWithSettings } from '@/adapters/condominiumAdapter';
import type { CondominiumRow } from '@/types/database';
import type { Condominium, CondominiumSettings, CondominiumWithSettings } from '@/types/domain';
import type { AliquotScheme } from '@/utils/aliquotScheme';
import type { CondominiumRepository } from '@/services/contracts';

const COLUMNS = 'id, name, slug, city';
const FULL_COLUMNS = `${COLUMNS}, rif, address, administrator_name, administrator_rif, payment_instructions, default_reserve_fund_percent, due_day, late_interest_monthly_percent, aliquot_scheme, opening_balance, opening_balance_date`;

export class SupabaseCondominiumRepository implements CondominiumRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: string): Promise<Condominium | null> {
    const { data, error } = await this.db.from('condominiums').select(COLUMNS).eq('id', id).maybeSingle<CondominiumRow>();
    if (error) throw new Error(`No se pudo leer el condominio: ${error.message}`);
    return data ? supabaseCondominiumToDomain(data) : null;
  }

  async findBySlug(slug: string): Promise<Condominium | null> {
    const { data, error } = await this.db.from('condominiums').select(COLUMNS).eq('slug', slug).maybeSingle<CondominiumRow>();
    if (error) throw new Error(`No se pudo leer el condominio: ${error.message}`);
    return data ? supabaseCondominiumToDomain(data) : null;
  }

  async listForAdmin(adminUserId: string): Promise<Condominium[]> {
    const { data, error } = await this.db
      .from('condominium_admins')
      .select(`condominiums(${COLUMNS})`)
      .eq('user_id', adminUserId)
      .overrideTypes<{ condominiums: CondominiumRow | null }[], { merge: false }>();
    if (error) throw new Error(`No se pudieron listar los condominios: ${error.message}`);
    return (data ?? [])
      .flatMap((r) => (r.condominiums ? [supabaseCondominiumToDomain(r.condominiums)] : []))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async findWithSettings(id: string): Promise<CondominiumWithSettings | null> {
    const { data, error } = await this.db.from('condominiums').select(FULL_COLUMNS).eq('id', id).maybeSingle<CondominiumRow>();
    if (error) throw new Error(`No se pudo leer el condominio: ${error.message}`);
    return data ? supabaseCondominiumWithSettings(data) : null;
  }

  async update(id: string, update: { name: string; city: string | null; settings: CondominiumSettings }): Promise<CondominiumWithSettings> {
    const { data, error } = await this.db
      .from('condominiums')
      .update(condominiumUpdateToRow(update))
      .eq('id', id)
      .select(FULL_COLUMNS)
      .single<CondominiumRow>();
    if (error) throw new Error(`No se pudo guardar el condominio: ${error.message}`);
    return supabaseCondominiumWithSettings(data);
  }

  async saveAliquotScheme(id: string, scheme: AliquotScheme): Promise<void> {
    const { error } = await this.db.from('condominiums').update({ aliquot_scheme: scheme }).eq('id', id);
    if (error) throw new Error(`No se pudieron guardar los tipos de alícuota: ${error.message}`);
  }
}

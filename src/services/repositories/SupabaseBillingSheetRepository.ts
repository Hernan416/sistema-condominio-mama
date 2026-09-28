import type { SupabaseClient } from '@supabase/supabase-js';
import { billingSheetRowToDomain, billingSheetToRow } from '@/adapters/billingSheetAdapter';
import type { BillingSheetRow } from '@/types/database';
import type { BillingSheet } from '@/types/billing';
import type { BillingPeriod } from '@/types/domain';
import type { BillingSheetRepository } from '@/services/contracts';

const COLUMNS = 'condominium_id, year, month, reserve_fund_percent, due_date, general_note, unit_notes, expenses, unit_charges, updated_at';

export class SupabaseBillingSheetRepository implements BillingSheetRepository {
  constructor(private readonly db: SupabaseClient) {}

  async find(condominiumId: string, { month, year }: BillingPeriod): Promise<BillingSheet | null> {
    const { data, error } = await this.db
      .from('billing_sheets')
      .select(COLUMNS)
      .eq('condominium_id', condominiumId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle<BillingSheetRow>();
    if (error) throw new Error(`No se pudo leer la relación de gastos: ${error.message}`);
    return data ? billingSheetRowToDomain(data) : null;
  }

  async findLatestBefore(condominiumId: string, { month, year }: BillingPeriod): Promise<BillingSheet | null> {
    const { data, error } = await this.db
      .from('billing_sheets')
      .select(COLUMNS)
      .eq('condominium_id', condominiumId)
      .or(`year.lt.${year},and(year.eq.${year},month.lt.${month})`)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle<BillingSheetRow>();
    if (error) throw new Error(`No se pudo leer la relación de gastos: ${error.message}`);
    return data ? billingSheetRowToDomain(data) : null;
  }

  async listByCondominium(condominiumId: string): Promise<BillingSheet[]> {
    const { data, error } = await this.db.from('billing_sheets').select(COLUMNS).eq('condominium_id', condominiumId).overrideTypes<BillingSheetRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron leer las relaciones de gastos: ${error.message}`);
    return (data ?? []).map(billingSheetRowToDomain);
  }

  async save(sheet: BillingSheet): Promise<BillingSheet> {
    const { data, error } = await this.db
      .from('billing_sheets')
      .upsert(billingSheetToRow(sheet), { onConflict: 'condominium_id,year,month' })
      .select(COLUMNS)
      .single<BillingSheetRow>();
    if (error) throw new Error(`No se pudo guardar la relación de gastos: ${error.message}`);
    return billingSheetRowToDomain(data);
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { exchangeRateRowToDomain, exchangeRateToRow } from '@/adapters/exchangeRateAdapter';
import type { ExchangeRateRow } from '@/types/database';
import type { ExchangeRate } from '@/types/domain';
import type { ExchangeRateRepository } from '@/services/contracts';

const COLUMNS = 'day, usd_to_ves, source, published_at, fetched_at';

export class SupabaseExchangeRateRepository implements ExchangeRateRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findByDay(day: string): Promise<ExchangeRate | null> {
    const { data, error } = await this.db.from('exchange_rates').select(COLUMNS).eq('day', day).maybeSingle<ExchangeRateRow>();
    if (error) throw new Error(`No se pudo leer la tasa: ${error.message}`);
    return data ? exchangeRateRowToDomain(data) : null;
  }

  async findLatest(): Promise<ExchangeRate | null> {
    const { data, error } = await this.db
      .from('exchange_rates')
      .select(COLUMNS)
      .order('day', { ascending: false })
      .limit(1)
      .maybeSingle<ExchangeRateRow>();
    if (error) throw new Error(`No se pudo leer la tasa: ${error.message}`);
    return data ? exchangeRateRowToDomain(data) : null;
  }

  async saveForDay(day: string, rate: ExchangeRate): Promise<void> {
    const { error } = await this.db.from('exchange_rates').upsert(exchangeRateToRow(day, rate), { onConflict: 'day' });
    if (error) throw new Error(`No se pudo guardar la tasa: ${error.message}`);
  }
}

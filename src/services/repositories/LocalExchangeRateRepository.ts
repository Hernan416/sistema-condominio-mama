import { exchangeRateRowToDomain, exchangeRateToRow } from '@/adapters/exchangeRateAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { ExchangeRateRepository } from '@/services/contracts';
import type { ExchangeRate } from '@/types/domain';

export class LocalExchangeRateRepository implements ExchangeRateRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findByDay(day: string): Promise<ExchangeRate | null> {
    const { exchange_rates } = await this.store.read();
    const row = exchange_rates.find((r) => r.day === day);
    return row ? exchangeRateRowToDomain(row) : null;
  }

  async findLatest(): Promise<ExchangeRate | null> {
    const { exchange_rates } = await this.store.read();
    const row = [...exchange_rates].sort((a, b) => b.day.localeCompare(a.day))[0];
    return row ? exchangeRateRowToDomain(row) : null;
  }

  saveForDay(day: string, rate: ExchangeRate): Promise<void> {
    return this.store.transaction((db) => {
      db.exchange_rates = [...db.exchange_rates.filter((r) => r.day !== day), exchangeRateToRow(day, rate)];
    });
  }
}

import type { ExchangeRateProvider } from '@/services/contracts';
import type { ExchangeRate } from '@/types/domain';

/** Tasa fija (EXCHANGE_RATE_PROVIDER=fixed): para trabajar sin internet o en pruebas. */
export class FixedRateProvider implements ExchangeRateProvider {
  constructor(private readonly usdToVes: number) {}

  async fetchUsdToVes(): Promise<ExchangeRate> {
    return { usdToVes: this.usdToVes, source: 'Tasa fija', publishedAt: new Date() };
  }
}

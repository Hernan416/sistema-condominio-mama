import type { CurrencyRatesFacade } from '@/services/exchange/CurrencyRatesFacade';
import type { CurrencyRates } from '@/types/domain';

const TTL_MS = 5 * 60 * 1000;

/**
 * Tasas para la calculadora pública: se cachean en memoria unos minutos para no golpear
 * las 3 APIs externas en cada visita. No se persiste en base de datos (no es facturación).
 */
export class CurrencyRatesService {
  private cached: { at: number; rates: CurrencyRates } | null = null;
  private inFlight: Promise<CurrencyRates> | null = null;

  constructor(
    private readonly facade: CurrencyRatesFacade,
    private readonly now: () => number = () => Date.now(),
  ) {}

  current(): Promise<CurrencyRates> {
    if (this.cached && this.now() - this.cached.at < TTL_MS) return Promise.resolve(this.cached.rates);
    this.inFlight ??= this.refresh().finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  private async refresh(): Promise<CurrencyRates> {
    try {
      const rates = await this.facade.fetchRates();
      this.cached = { at: this.now(), rates };
      return rates;
    } catch (error) {
      if (this.cached) {
        console.warn('[currency-rates] No se pudieron actualizar las tasas; se usan las últimas guardadas.', error);
        return this.cached.rates;
      }
      throw error;
    }
  }
}

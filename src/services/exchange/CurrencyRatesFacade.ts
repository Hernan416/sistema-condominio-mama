import { toCurrencyRates } from '@/adapters/currencyRatesAdapter';
import type { CurrencyRates } from '@/types/domain';
import type { DolarApiQuote, UsdtRatesQuote } from '@/types/external';
import { withRetry } from '@/utils/retry';

const DOLARES_URL = 'https://ve.dolarapi.com/v1/dolares';
const EUROS_URL = 'https://ve.dolarapi.com/v1/euros';
const USDT_URL = 'https://www.usdt.com.ve/api/v1/rates/current';

/**
 * FACADE sobre ve.dolarapi.com (BCV/paralelo, USD y EUR) y usdt.com.ve (Binance P2P).
 * Oculta las 3 llamadas HTTP, los timeouts y los reintentos: quien la usa solo pide `fetchRates()`.
 */
export class CurrencyRatesFacade {
  constructor(private readonly timeoutMs = 4000) {}

  async fetchRates(): Promise<CurrencyRates> {
    const [dolares, euros, usdt] = await Promise.all([
      this.getJson<DolarApiQuote[]>(DOLARES_URL),
      this.getJson<DolarApiQuote[]>(EUROS_URL),
      this.getJson<UsdtRatesQuote>(USDT_URL),
    ]);
    return toCurrencyRates(dolares, euros, usdt);
  }

  private getJson<T>(url: string): Promise<T> {
    return withRetry(
      async () => {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
        return (await res.json()) as T;
      },
      { attempts: 2, baseDelayMs: 300 },
    );
  }
}

import { dolarApiToExchangeRate } from '@/adapters/exchangeRateAdapter';
import type { ExchangeRateProvider } from '@/services/contracts';
import type { ExchangeRate } from '@/types/domain';
import type { DolarApiQuote } from '@/types/external';
import { withRetry } from '@/utils/retry';

/**
 * FACADE sobre DolarApi (https://ve.dolarapi.com), que publica la tasa oficial del BCV.
 * Oculta la URL, el timeout, los reintentos y la forma de la respuesta.
 * Para cambiar de proveedor (p. ej. scraping del BCV), se escribe otra clase con esta interfaz.
 */
export class DolarApiFacade implements ExchangeRateProvider {
  constructor(
    private readonly url: string,
    private readonly timeoutMs = 4000,
  ) {}

  fetchUsdToVes(): Promise<ExchangeRate> {
    return withRetry(
      async () => {
        const res = await fetch(this.url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`DolarApi respondió ${res.status}`);
        return dolarApiToExchangeRate((await res.json()) as DolarApiQuote);
      },
      { attempts: 2, baseDelayMs: 300 },
    );
  }
}

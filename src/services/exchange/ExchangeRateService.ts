import type { CurrentExchangeRate, ExchangeRateProvider, ExchangeRateRepository } from '@/services/contracts';
import type { ExchangeRate } from '@/types/domain';
import { isoDateInCaracas } from '@/utils/dates';

const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;

/**
 * Tasa del día: se consulta a la API UNA vez por día (fecha de Caracas) y se guarda en la
 * base de datos, compartida por todas las instancias del servidor.
 *
 *   1. Memoria de esta instancia, si ya es la de hoy.
 *   2. Fila de hoy en la base (la dejó el cron diario u otra instancia).
 *   3. Nadie la ha traído hoy → se consulta la API y se guarda para hoy.
 *   4. Si la API falla → la última tasa guardada (se reintenta como mucho cada 15 min).
 *   5. Si nunca hubo tasa → null: las pantallas muestran solo USD.
 */
export class ExchangeRateService implements CurrentExchangeRate {
  private memory: { day: string; rate: ExchangeRate } | null = null;
  private inFlight: Promise<ExchangeRate | null> | null = null;
  private lastFailureAt = 0;

  constructor(
    private readonly provider: ExchangeRateProvider,
    private readonly repository: ExchangeRateRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  current(): Promise<ExchangeRate | null> {
    const today = isoDateInCaracas(this.now());
    if (this.memory?.day === today) return Promise.resolve(this.memory.rate);
    // Varias peticiones simultáneas comparten una sola resolución.
    this.inFlight ??= this.resolve(today).finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  /** Consulta la API y guarda la tasa de hoy, aunque ya exista (lo usa el cron diario). */
  async refreshToday(): Promise<ExchangeRate> {
    const today = isoDateInCaracas(this.now());
    const rate = await this.provider.fetchUsdToVes();
    await this.repository.saveForDay(today, rate);
    this.memory = { day: today, rate };
    return rate;
  }

  private async resolve(today: string): Promise<ExchangeRate | null> {
    const stored = await this.safely(() => this.repository.findByDay(today));
    if (stored) {
      this.memory = { day: today, rate: stored };
      return stored;
    }

    if (this.now().getTime() - this.lastFailureAt >= RETRY_AFTER_FAILURE_MS) {
      try {
        return await this.refreshToday();
      } catch (error) {
        this.lastFailureAt = this.now().getTime();
        console.warn('[exchange-rate] No se pudo obtener la tasa de hoy; se usa la última guardada.', error);
      }
    }
    return (await this.safely(() => this.repository.findLatest())) ?? this.memory?.rate ?? null;
  }

  private async safely<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      console.error('[exchange-rate] Error leyendo la tasa guardada', error);
      return null;
    }
  }
}

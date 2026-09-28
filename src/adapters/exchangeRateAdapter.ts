import type { ExchangeRate } from '@/types/domain';
import type { ExchangeRateRow } from '@/types/database';
import type { DolarApiQuote } from '@/types/external';

const SOURCE_LABELS: Record<string, string> = { oficial: 'BCV', paralelo: 'Paralelo' };

/** DolarApi → dominio. Lanza si la respuesta no trae una tasa utilizable. */
export function dolarApiToExchangeRate(raw: DolarApiQuote): ExchangeRate {
  const rate = raw.promedio ?? raw.venta ?? raw.compra;
  const publishedAt = new Date(raw.fechaActualizacion);
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || Number.isNaN(publishedAt.getTime())) {
    throw new Error('Respuesta de DolarApi sin una tasa válida');
  }
  return { usdToVes: rate, source: SOURCE_LABELS[raw.fuente] ?? raw.fuente, publishedAt };
}

/** Fila de la tabla `exchange_rates` → dominio. */
export function exchangeRateRowToDomain(row: ExchangeRateRow): ExchangeRate {
  return { usdToVes: Number(row.usd_to_ves), source: row.source, publishedAt: new Date(row.published_at) };
}

/** Dominio → fila de `exchange_rates` para el día indicado (YYYY-MM-DD, Caracas). */
export function exchangeRateToRow(day: string, rate: ExchangeRate): ExchangeRateRow {
  return {
    day,
    usd_to_ves: rate.usdToVes,
    source: rate.source,
    published_at: rate.publishedAt.toISOString(),
    fetched_at: new Date().toISOString(),
  };
}

import type { ExchangeRate } from '@/types/domain';
import type { ExchangeRateDto } from '@/types/dto';
import { formatVes } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';

export interface ExchangeRateView {
  rateLabel: string; // "Bs. 855,66"
  source: string; // "BCV"
  dateLabel: string; // "25/09/2026"
}

export function toExchangeRateView(rate: ExchangeRate | null): ExchangeRateView | null {
  if (!rate) return null;
  return { rateLabel: formatVes(rate.usdToVes), source: rate.source, dateLabel: formatDateVe(rate.publishedAt) };
}

/** Para la isla React del panel (JSON serializable). */
export function toExchangeRateDto(rate: ExchangeRate | null): ExchangeRateDto | null {
  if (!rate) return null;
  return { usdToVes: rate.usdToVes, source: rate.source, publishedAt: rate.publishedAt.toISOString() };
}

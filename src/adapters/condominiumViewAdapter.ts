import type { CondominiumOverview, ExchangeRate } from '@/types/domain';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';

/** Dominio → modelo de vista del resumen de condominios (total en USD y su referencia en Bs.). */
export function toCondominiumOverviewView({ condominium, ...stats }: CondominiumOverview, rate: ExchangeRate | null) {
  return {
    slug: condominium.slug,
    name: condominium.name,
    city: condominium.city,
    houseCount: stats.houseCount,
    generatedCount: stats.generatedCount,
    pendingCount: stats.pendingCount,
    totalLabel: formatUsd(stats.totalAmount),
    totalVesLabel: rate ? formatVes(usdToVes(stats.totalAmount, rate.usdToVes)) : null,
  };
}

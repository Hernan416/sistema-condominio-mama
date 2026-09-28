import type { ExchangeRate, Invoice } from '@/types/domain';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import { formatPeriod, monthName } from '@/utils/months';
import { toExchangeRateView } from '@/adapters/exchangeRateViewAdapter';

/**
 * Dominio → modelo de vista del residente. El monto en Bs. se calcula con la tasa de HOY
 * (así se paga en Venezuela), no con la que quedó impresa en el PDF.
 */
export function toResidentInvoiceView(invoice: Invoice, todayRate: ExchangeRate | null) {
  return {
    periodLabel: formatPeriod(invoice.month, invoice.year),
    monthLabel: monthName(invoice.month).toLowerCase(),
    amountLabel: formatUsd(invoice.amount),
    vesLabel: todayRate ? formatVes(usdToVes(invoice.amount, todayRate.usdToVes)) : null,
    rate: toExchangeRateView(todayRate),
  };
}

export type ResidentInvoiceView = ReturnType<typeof toResidentInvoiceView>;

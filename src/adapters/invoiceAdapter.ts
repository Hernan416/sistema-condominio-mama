import type { BillingPeriod, ExchangeRate, Invoice } from '@/types/domain';
import type { InvoiceBreakdown } from '@/types/billing';
import type { InvoiceRow } from '@/types/database';
import { isoDateInCaracas } from '@/utils/dates';

export function supabaseInvoiceToDomainInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    houseId: row.house_id,
    houseNumber: row.houses?.number ?? null,
    month: row.month,
    year: row.year,
    amount: Number(row.amount),
    exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate),
    // "YYYY-MM-DD" a mediodía de Caracas: evita que la zona horaria cambie el día.
    exchangeRateDate: row.exchange_rate_date ? new Date(`${row.exchange_rate_date}T12:00:00-04:00`) : null,
    status: row.status,
    generatedAt: row.generated_at ? new Date(row.generated_at) : null,
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    detail: isBreakdown(row.detail) ? row.detail : null,
  };
}

/** El jsonb viene de la base: se acepta solo si tiene la forma esperada. */
function isBreakdown(value: unknown): value is InvoiceBreakdown {
  return typeof value === 'object' && value !== null && Array.isArray((value as InvoiceBreakdown).lines) && typeof (value as InvoiceBreakdown).monthTotal === 'number';
}

export interface GeneratedInvoice {
  houseId: string;
  period: BillingPeriod;
  detail: InvoiceBreakdown;
  rate: ExchangeRate | null;
}

/** Fila completa de una factura recién emitida (upsert por casa + periodo). */
export function generatedInvoiceToRow({ houseId, period, detail, rate }: GeneratedInvoice) {
  return {
    house_id: houseId,
    month: period.month,
    year: period.year,
    // `amount` = lo facturado ESTE mes; la deuda anterior va en el desglose, no se acumula aquí.
    amount: detail.monthTotal,
    detail,
    status: 'generated' as const,
    generated_at: new Date().toISOString(),
    paid_at: null,
    exchange_rate: rate?.usdToVes ?? null,
    exchange_rate_date: rate ? isoDateInCaracas(rate.publishedAt) : null,
  };
}

/** Tasa con la que se emitió el recibo (para volver a dibujar su PDF idéntico). */
export function issuedRateOf(invoice: Invoice): ExchangeRate | null {
  if (invoice.exchangeRate === null) return null;
  return { usdToVes: invoice.exchangeRate, source: 'BCV', publishedAt: invoice.exchangeRateDate ?? invoice.generatedAt ?? new Date() };
}

import type { BillingPeriod, ExchangeRate, Invoice, IssuedReceiptHeader } from '@/types/domain';
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
    issued: issuedHeaderOf(row),
  };
}

/** El jsonb viene de la base: se acepta solo si tiene la forma esperada. */
function isBreakdown(value: unknown): value is InvoiceBreakdown {
  return typeof value === 'object' && value !== null && Array.isArray((value as InvoiceBreakdown).lines) && typeof (value as InvoiceBreakdown).monthTotal === 'number';
}

/** Encabezado congelado; null si el recibo se emitió antes de guardarlo (sin nombre del condominio). */
function issuedHeaderOf(row: InvoiceRow): IssuedReceiptHeader | null {
  if (!row.issued_condominium_name || !row.issued_house_number || !row.issued_receipt_number) return null;
  return {
    condominiumName: row.issued_condominium_name,
    houseNumber: row.issued_house_number,
    ownerName: row.issued_owner_name ?? null,
    ownerDocument: row.issued_owner_document ?? null,
    receiptNumber: row.issued_receipt_number,
    settings: {
      rif: row.issued_rif ?? null,
      address: row.issued_address ?? null,
      administratorName: row.issued_administrator_name ?? null,
      administratorRif: row.issued_administrator_rif ?? null,
      paymentInstructions: row.issued_payment_instructions ?? null,
    },
    exchangeRateSource: row.exchange_rate_source ?? null,
  };
}

export interface GeneratedInvoice {
  houseId: string;
  period: BillingPeriod;
  detail: InvoiceBreakdown;
  rate: ExchangeRate | null;
  /** Encabezado del recibo tal como está en el momento de emitir. */
  header: IssuedReceiptHeader;
  issuedAt: Date;
}

/** Fila completa de un recibo recién emitido (upsert por casa + periodo). Todo queda congelado. */
export function generatedInvoiceToRow({ houseId, period, detail, rate, header, issuedAt }: GeneratedInvoice) {
  return {
    house_id: houseId,
    month: period.month,
    year: period.year,
    // `amount` = lo facturado ESTE mes; la deuda anterior va en el desglose, no se acumula aquí.
    amount: detail.monthTotal,
    detail,
    status: 'generated' as const,
    generated_at: issuedAt.toISOString(),
    paid_at: null,
    exchange_rate: rate?.usdToVes ?? null,
    exchange_rate_date: rate ? isoDateInCaracas(rate.publishedAt) : null,
    exchange_rate_source: rate?.source ?? null,
    issued_condominium_name: header.condominiumName,
    issued_house_number: header.houseNumber,
    issued_owner_name: header.ownerName,
    issued_owner_document: header.ownerDocument,
    issued_receipt_number: header.receiptNumber,
    issued_rif: header.settings.rif,
    issued_address: header.settings.address,
    issued_administrator_name: header.settings.administratorName,
    issued_administrator_rif: header.settings.administratorRif,
    issued_payment_instructions: header.settings.paymentInstructions,
  };
}

/** Tasa con la que se emitió el recibo (para volver a dibujar su PDF idéntico, con los mismos Bs.). */
export function issuedRateOf(invoice: Invoice): ExchangeRate | null {
  if (invoice.exchangeRate === null) return null;
  return {
    usdToVes: invoice.exchangeRate,
    source: invoice.issued?.exchangeRateSource ?? 'BCV',
    publishedAt: invoice.exchangeRateDate ?? invoice.generatedAt ?? new Date(),
  };
}

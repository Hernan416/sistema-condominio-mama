import type { InvoiceRowDto } from '@/types/dto';
import { roundCents } from '@/utils/billingCalculator';

export interface PeriodStats {
  units: number;
  issued: number;
  paid: number;
  /** Sin emitir o desactualizadas. */
  pending: number;
  /** Lo facturado en el mes (sin deuda anterior). */
  monthTotal: number;
  /** Deuda de meses anteriores de todas las unidades. */
  previousDebt: number;
  delinquentUnits: number;
}

/** Resumen del periodo a partir de las filas del panel. */
export function summarizeRows(rows: InvoiceRowDto[]): PeriodStats {
  const issued = rows.filter((r) => r.invoice && r.invoice.status !== 'pending');
  return {
    units: rows.length,
    issued: issued.length,
    paid: rows.filter((r) => r.payment?.status === 'paid').length,
    pending: rows.filter((r) => !r.invoice || r.invoice.status === 'pending' || r.outdated).length,
    monthTotal: roundCents(rows.reduce((s, r) => s + r.breakdown.monthTotal, 0)),
    previousDebt: roundCents(rows.reduce((s, r) => s + r.breakdown.previousDebt, 0)),
    delinquentUnits: rows.filter((r) => !r.breakdown.solvent).length,
  };
}

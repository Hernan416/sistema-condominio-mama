// Contratos JSON entre los endpoints /api/admin/* y las islas React del panel.
import type { InvoiceStatus } from '@/types/domain';
import type { BuildingExpense, InvoiceBreakdown, UnitCharge } from '@/types/billing';

export interface PeriodDto {
  month: number;
  year: number;
}

export interface InvoiceDto {
  id: string;
  amount: number; // USD, lo facturado en el mes
  status: InvoiceStatus;
  driveFileUrl: string | null;
  generatedAt: string | null; // ISO
  paidAt: string | null; // ISO
}

/** Fila de la pestaña "Facturas": cálculo actual + factura emitida. */
export interface InvoiceRowDto {
  houseId: string;
  houseNumber: string;
  /** Usuario con el que entra el residente (la administradora se lo comunica). */
  username: string;
  ownerName: string | null;
  aliquot: number;
  /** InvoiceBreakdown ya es JSON puro (números y textos). */
  breakdown: InvoiceBreakdown;
  invoice: InvoiceDto | null;
  outdated: boolean;
  /** Pagado / pendiente del recibo emitido, según el libro de pagos. */
  payment: { paid: number; outstanding: number; status: 'paid' | 'partial' | 'unpaid' } | null;
}

export type SheetOriginDto = 'saved' | 'copied' | 'new';

export interface BillingSheetDto {
  reserveFundPercent: number;
  dueDate: string | null;
  generalNote: string | null;
  unitNotes: Record<string, string>;
  expenses: BuildingExpense[];
  unitCharges: UnitCharge[];
  updatedAt: string | null;
}

export interface UnitDto {
  id: string;
  number: string;
  username: string;
  ownerName: string | null;
  ownerDocument: string | null;
  ownerEmail: string | null;
  aliquot: number;
  aliquotCategoryId: string | null;
}

export interface ExchangeRateDto {
  usdToVes: number;
  source: string;
  publishedAt: string; // ISO
}

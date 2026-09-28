// Modelo de facturación de condominio (Venezuela). Todos los montos en USD.

/**
 * ordinary: gasto común del mes (base del fondo de reserva).
 * extraordinary: cuota especial aprobada en asamblea.
 * income: ingreso de la comunidad (alquiler de áreas, reintegros…) que se descuenta del total a repartir.
 * Fórmula usual: (gastos + fondos − ingresos) × alícuota + cargos individuales − abonos individuales.
 */
export type ExpenseKind = 'ordinary' | 'extraordinary' | 'income';

/** Cómo se reparte un gasto del condominio entre las unidades. */
export type Distribution = 'aliquot' | 'equal';

/**
 * Ajuste de un gasto del condominio para una unidad concreta:
 * - exempt: la unidad no paga este concepto; su parte se reparte entre las demás.
 * - fixed: la unidad paga un monto fijo; el resto del gasto se reparte entre las demás.
 */
export type ExpenseOverride = { mode: 'exempt' } | { mode: 'fixed'; amount: number };

/** Gasto del condominio completo (se reparte entre todas las unidades). */
export interface BuildingExpense {
  id: string;
  concept: string;
  amount: number;
  kind: ExpenseKind;
  distribution: Distribution;
  /** Ajustes por unidad (clave: houseId). Las unidades sin ajuste pagan según el reparto. */
  overrides?: Record<string, ExpenseOverride>;
}

/** Cargo a una sola unidad (gasto no común): multas, reparaciones… Un monto negativo es un abono (crédito) a esa unidad. */
export interface UnitCharge {
  id: string;
  houseId: string;
  concept: string;
  amount: number;
  /** Se copia automáticamente al mes siguiente (ej. puesto de estacionamiento adicional). */
  recurring?: boolean;
}

/** "Relación de gastos" de un condominio en un mes: la fuente de todas sus facturas. */
export interface BillingSheet {
  condominiumId: string;
  month: number;
  year: number;
  /** % del fondo de reserva sobre los gastos comunes ordinarios. */
  reserveFundPercent: number;
  /** Fecha de vencimiento del recibo (YYYY-MM-DD) o null. */
  dueDate: string | null;
  /** Mensaje que aparece en todas las facturas del mes. */
  generalNote: string | null;
  /** Mensaje personalizado por unidad (clave: houseId). */
  unitNotes: Record<string, string>;
  expenses: BuildingExpense[];
  unitCharges: UnitCharge[];
  updatedAt: Date | null;
}

export type InvoiceLineKind = 'ordinary' | 'reserve' | 'income' | 'extraordinary' | 'unit' | 'interest';

export interface InvoiceLine {
  concept: string;
  kind: InvoiceLineKind;
  /** Total del condominio (null en cargos individuales y en el fondo de reserva). */
  buildingAmount: number | null;
  /** Lo que le corresponde a esta unidad. */
  unitAmount: number;
}

/** Desglose calculado de una factura. Se guarda tal cual al generarla (el PDF no cambia después). */
export interface InvoiceBreakdown {
  aliquot: number;
  lines: InvoiceLine[];
  commonSubtotal: number;
  reserveFund: number;
  reserveFundPercent: number;
  /** Ingresos de la comunidad descontados a esta unidad (≤ 0). */
  incomeSubtotal: number;
  extraordinarySubtotal: number;
  unitChargesSubtotal: number;
  /** Interés de mora sobre la deuda anterior (simple: nunca sobre intereses). */
  lateInterest: number;
  lateInterestMonthlyPercent: number;
  /** Lo facturado este mes (sin deuda anterior). */
  monthTotal: number;
  previousDebt: number;
  previousDebtCount: number;
  /** monthTotal + previousDebt */
  totalDue: number;
  /** Solvente = sin recibos anteriores pendientes. */
  solvent: boolean;
  dueDate: string | null;
  generalNote: string | null;
  unitNote: string | null;
}

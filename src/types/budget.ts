// Presupuesto de un proyecto (ej. "Pintura de fachada: $250"): se reparte por alícuota entre
// las casas, facturado en un mes o repartido en varios, y se sigue cuánto se ha recaudado.

/** single: se factura todo de una vez en un mes. spread: en partes iguales a lo largo de varios meses. */
export type BudgetBillingMode = 'single' | 'spread';

/**
 * Cómo contar "recaudado" cuando el recibo de una casa (que mezcla el gasto común con la cuota
 * del proyecto) no está pagado del todo:
 * - proportional: se cuenta la misma proporción de la cuota que se pagó del recibo completo.
 * - all_or_nothing: la cuota del proyecto solo se cuenta recaudada cuando el recibo de ese mes
 *   queda 100 % pagado.
 */
export type BudgetCollectionMode = 'proportional' | 'all_or_nothing';

export interface BudgetProject {
  id: string;
  condominiumId: string;
  name: string;
  targetAmount: number;
  billingMode: BudgetBillingMode;
  collectionMode: BudgetCollectionMode;
  /** Primer mes en que se factura (y único mes si billingMode = 'single'). */
  startYear: number;
  startMonth: number;
  /** Cuántos meses dura la facturación (1 si billingMode = 'single'). */
  monthsCount: number;
  createdAt: Date | null;
}

/** Un mes programado del proyecto: cuánto se factura ese mes en concreto. */
export interface BudgetScheduleMonth {
  year: number;
  month: number;
  amount: number;
}

/** Progreso de una casa dentro de un proyecto, al corte elegido. */
export interface BudgetHouseProgress {
  houseId: string;
  houseNumber: string;
  ownerName: string | null;
  aliquot: number;
  /** Su parte de la meta total, según su alícuota. */
  target: number;
  /** Lo que se le ha facturado hasta el corte (según los meses ya emitidos). */
  billed: number;
  /** Lo que se ha recaudado de verdad, según el modo de cálculo del proyecto. */
  collected: number;
}

export interface BudgetProjectProgress {
  project: BudgetProject;
  /** Mes de corte (año-mes) hasta el cual se cuenta lo facturado/recaudado. */
  asOfYear: number;
  asOfMonth: number;
  schedule: BudgetScheduleMonth[];
  houses: BudgetHouseProgress[];
  targetTotal: number;
  billedTotal: number;
  collectedTotal: number;
}

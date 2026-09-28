// Cálculo de las facturas de un condominio a partir de la relación de gastos del mes.
// Funciones puras: sin base de datos ni fecha del sistema. Todos los montos en USD.
//
// Cada gasto se reparte entre TODAS las unidades a la vez con el método del resto mayor,
// de modo que la suma de lo facturado a las unidades es exactamente el gasto del condominio
// (sin céntimos perdidos por redondeo: la administradora cuadra contra el banco).
import type { BillingSheet, BuildingExpense, Distribution, InvoiceBreakdown, InvoiceLine } from '@/types/billing';

export interface UnitInput {
  id: string;
  /** Porcentaje de participación (alícuota), p. ej. 8.3333. */
  aliquot: number;
}

export interface PreviousDebt {
  /** Total adeudado de recibos anteriores (incluye intereses ya facturados). */
  amount: number;
  count: number;
  /** Parte de la deuda sobre la que corre interés: excluye intereses ya facturados (sin anatocismo). */
  interestBase: number;
}

export interface CalculationOptions {
  /** % mensual de interés de mora sobre la deuda anterior; 0 = no se cobra. */
  lateInterestMonthlyPercent?: number;
}

/** Redondeo al céntimo (evita 0.1 + 0.2 = 0.30000000000000004). */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reparte `amount` en céntimos según `weights`, de forma que la suma sea exacta.
 * Cada unidad recibe el piso de su parte y los céntimos sobrantes se asignan por prioridad:
 * fracción descartada + `carry`, el error de redondeo que la unidad acumula de repartos
 * anteriores (en céntimos). Así el céntimo extra va a quien más se ha redondeado a la baja
 * y el total de cada unidad nunca se aleja más de 1 céntimo de su parte exacta: casas con
 * la misma alícuota pagan lo mismo aunque haya muchos gastos. Devuelve el nuevo `carry`.
 */
export function allocateFair(amount: number, weights: number[], carry: number[] = weights.map(() => 0)): { shares: number[]; carry: number[] } {
  const totalCents = Math.round(amount * 100);
  const weightSum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (weights.length === 0 || totalCents === 0) return { shares: weights.map(() => 0), carry };
  if (weightSum <= 0) return allocateFair(amount, weights.map(() => 1), carry);

  const exact = weights.map((w) => (totalCents * Math.max(0, w)) / weightSum);
  const cents = exact.map(Math.floor);
  let leftover = totalCents - cents.reduce((s, c) => s + c, 0);
  // Redondeo a 1e-9 para que diferencias de coma flotante cuenten como empate (desempate por orden).
  const priority = exact.map((x, i) => Math.round((x - cents[i] + carry[i]) * 1e9) / 1e9);
  // Solo compiten por el céntimo las unidades que participan (peso > 0): una exenta o con monto
  // fijo nunca lo recibe, aunque arrastre error de repartos anteriores.
  const order = priority
    .map((p, i) => ({ i, p }))
    .filter(({ i }) => weights[i] > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    cents[i] += 1;
    leftover -= 1;
  }
  return { shares: cents.map((c) => c / 100), carry: exact.map((x, i) => carry[i] + x - cents[i]) };
}

/** Reparto exacto de un solo monto (sin arrastre de redondeo). */
export function allocate(amount: number, weights: number[]): number[] {
  return allocateFair(amount, weights).shares;
}

function weightsFor(distribution: Distribution, units: UnitInput[]): number[] {
  return distribution === 'equal' ? units.map(() => 1) : units.map((u) => u.aliquot);
}

/** Calcula las facturas de todas las unidades del condominio para la relación de gastos dada. */
export function calculateCondominiumInvoices(
  sheet: BillingSheet,
  units: UnitInput[],
  debts: Map<string, PreviousDebt> = new Map(),
  { lateInterestMonthlyPercent = 0 }: CalculationOptions = {},
): Map<string, InvoiceBreakdown> {
  const lines = new Map<string, InvoiceLine[]>(units.map((u) => [u.id, []]));
  const common = new Map<string, number>(units.map((u) => [u.id, 0]));
  const extraordinary = new Map<string, number>(units.map((u) => [u.id, 0]));
  const income = new Map<string, number>(units.map((u) => [u.id, 0]));
  const add = (m: Map<string, number>, id: string, v: number) => m.set(id, roundCents((m.get(id) ?? 0) + v));
  // Error de redondeo acumulado por unidad (céntimos), compartido por todos los repartos del mes.
  let carry = units.map(() => 0);
  const split = (amount: number, weights: number[]) => {
    const result = allocateFair(amount, weights, carry);
    carry = result.carry;
    return result.shares;
  };

  /**
   * Parte de cada unidad en un gasto, respetando sus ajustes: las de monto fijo pagan ese
   * monto, las exentas no pagan, y el resto del gasto se reparte entre las demás según el
   * reparto elegido. null = exenta (el concepto no aparece en su recibo).
   */
  const shareExpense = (e: BuildingExpense): (number | null)[] => {
    const overrides = e.overrides ?? {};
    const fixedSum = units.reduce((sum, u) => {
      const o = overrides[u.id];
      return sum + (o?.mode === 'fixed' ? roundCents(o.amount) : 0);
    }, 0);
    const rest = Math.max(0, roundCents(Math.abs(e.amount) - fixedSum));
    const weights = weightsFor(e.distribution, units).map((w, i) => (overrides[units[i].id] ? 0 : w));
    const shares = weights.some((w) => w > 0) ? split(rest, weights) : units.map(() => 0);
    return units.map((u, i) => {
      const o = overrides[u.id];
      if (o?.mode === 'exempt') return null;
      if (o?.mode === 'fixed') return roundCents(o.amount);
      return shares[i];
    });
  };

  // 1. Gastos comunes ordinarios.
  for (const e of sheet.expenses.filter((x) => x.kind === 'ordinary')) {
    shareExpense(e).forEach((share, i) => {
      if (share === null) return;
      const id = units[i].id;
      add(common, id, share);
      lines.get(id)!.push({ concept: e.concept, kind: 'ordinary', buildingAmount: e.amount, unitAmount: share });
    });
  }

  // 2. Fondo de reserva: % del total de gastos comunes ordinarios, repartido en proporción
  //    a lo que cada unidad aporta a esos gastos.
  const commonTotal = roundCents([...common.values()].reduce((s, v) => s + v, 0));
  const reserveTotal = roundCents((commonTotal * sheet.reserveFundPercent) / 100);
  const reserves = split(reserveTotal, units.map((u) => common.get(u.id) ?? 0));

  // 3. Ingresos de la comunidad: se descuentan con el mismo reparto (fuera de la base del fondo).
  for (const e of sheet.expenses.filter((x) => x.kind === 'income')) {
    shareExpense(e).forEach((share, i) => {
      if (share === null) return;
      const id = units[i].id;
      add(income, id, -share);
      lines.get(id)!.push({ concept: e.concept, kind: 'income', buildingAmount: -Math.abs(e.amount), unitAmount: -share });
    });
  }

  // 4. Cuotas extraordinarias (fuera de la base del fondo de reserva).
  for (const e of sheet.expenses.filter((x) => x.kind === 'extraordinary')) {
    shareExpense(e).forEach((share, i) => {
      if (share === null) return;
      const id = units[i].id;
      add(extraordinary, id, share);
      lines.get(id)!.push({ concept: e.concept, kind: 'extraordinary', buildingAmount: e.amount, unitAmount: share });
    });
  }

  const result = new Map<string, InvoiceBreakdown>();
  units.forEach((unit, i) => {
    const unitLines = lines.get(unit.id)!;
    const reserveFund = reserves[i];
    if (reserveFund > 0) {
      // El fondo va justo después de los gastos ordinarios.
      const at = unitLines.filter((l) => l.kind === 'ordinary').length;
      unitLines.splice(at, 0, {
        concept: `Fondo de reserva (${formatPercent(sheet.reserveFundPercent)})`,
        kind: 'reserve',
        buildingAmount: reserveTotal,
        unitAmount: reserveFund,
      });
    }

    // 5. Cargos individuales (gastos no comunes) y abonos (montos negativos) de esta unidad.
    let unitChargesSubtotal = 0;
    for (const c of sheet.unitCharges.filter((x) => x.houseId === unit.id)) {
      const amount = roundCents(c.amount);
      unitChargesSubtotal = roundCents(unitChargesSubtotal + amount);
      unitLines.push({ concept: c.concept, kind: 'unit', buildingAmount: null, unitAmount: amount });
    }

    // 6. Interés de mora: simple, sobre la deuda anterior sin intereses previos.
    const debt = debts.get(unit.id) ?? { amount: 0, count: 0, interestBase: 0 };
    const lateInterest = roundCents((Math.max(0, debt.interestBase) * lateInterestMonthlyPercent) / 100);
    if (lateInterest > 0) {
      unitLines.push({
        concept: `Interés de mora (${formatPercent(lateInterestMonthlyPercent)} mensual sobre deuda anterior)`,
        kind: 'interest',
        buildingAmount: null,
        unitAmount: lateInterest,
      });
    }

    const commonSubtotal = common.get(unit.id) ?? 0;
    const incomeSubtotal = income.get(unit.id) ?? 0;
    const extraordinarySubtotal = extraordinary.get(unit.id) ?? 0;
    // Nunca negativo: si los abonos superan lo facturado, el recibo queda en cero.
    const monthTotal = Math.max(0, roundCents(commonSubtotal + reserveFund + incomeSubtotal + extraordinarySubtotal + unitChargesSubtotal + lateInterest));
    const previousDebt = roundCents(debt.amount);

    result.set(unit.id, {
      aliquot: unit.aliquot,
      lines: unitLines,
      commonSubtotal,
      reserveFund,
      reserveFundPercent: sheet.reserveFundPercent,
      incomeSubtotal,
      extraordinarySubtotal,
      unitChargesSubtotal,
      lateInterest,
      lateInterestMonthlyPercent,
      monthTotal,
      previousDebt,
      previousDebtCount: debt.count,
      totalDue: roundCents(monthTotal + previousDebt),
      solvent: debt.count === 0,
      dueDate: sheet.dueDate,
      generalNote: sheet.generalNote?.trim() || null,
      unitNote: sheet.unitNotes[unit.id]?.trim() || null,
    });
  });
  return result;
}

/** Suma de alícuotas del condominio (debe ser 100 %). */
export function aliquotTotal(aliquots: number[]): number {
  return Math.round(aliquots.reduce((s, a) => s + a, 0) * 10000) / 10000;
}

/** 100 % en partes iguales con 4 decimales; el residuo va a la primera unidad para sumar exactamente 100. */
export function equalAliquots(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor((100 / count) * 10000) / 10000;
  const rest = Math.round((100 - base * count) * 10000) / 10000;
  return Array.from({ length: count }, (_, i) => (i === 0 ? Math.round((base + rest) * 10000) / 10000 : base));
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 }).format(value)} %`;
}

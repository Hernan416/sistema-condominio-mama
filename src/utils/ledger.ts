// Libro de cuenta de una casa: cargos (recibos emitidos y deudas registradas) y pagos.
// Función pura. Regla de imputación: cada pago cubre primero el cargo MÁS ANTIGUO pendiente
// (práctica habitual en condominios; así la deuda vieja nunca queda "escondida").
// Lo que sobra de los pagos queda como saldo a favor y cubre los cargos siguientes.

export type ChargeSource = 'invoice' | 'debt';

export interface LedgerCharge {
  id: string;
  source: ChargeSource;
  /** Fecha del cargo "YYYY-MM-DD" (recibo: día 1 de su mes; deuda: fecha de origen). */
  date: string;
  amount: number;
  /** Parte de intereses de mora incluida en `amount` (no genera nuevos intereses). */
  interest: number;
}

export interface LedgerPayment {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  /** Momento en que se registró (ms): ordena los pagos del mismo día. */
  recordedAt?: number;
}

export interface ChargeState {
  paid: number;
  outstanding: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export interface Allocation {
  chargeId: string;
  amount: number;
}

export interface LedgerResult {
  charges: Map<string, ChargeState>;
  /** A qué cargos se aplicó cada pago. */
  allocations: Map<string, Allocation[]>;
  totalCharged: number;
  totalPaid: number;
  /** Deuda pendiente (≥ 0). */
  outstanding: number;
  /** Saldo a favor: pagado de más que aún no cubre ningún cargo (≥ 0). */
  credit: number;
}

const cents = (n: number) => Math.round(n * 100);
const usd = (c: number) => c / 100;

// Mismo día: la deuda registrada va antes que el recibo; el id solo desempata (orden estable).
const chargeOrder = (a: LedgerCharge, b: LedgerCharge) =>
  a.date.localeCompare(b.date) || (a.source === b.source ? 0 : a.source === 'debt' ? -1 : 1) || a.id.localeCompare(b.id);
// Mismo día: en el orden en que se registraron.
const paymentOrder = (a: LedgerPayment, b: LedgerPayment) =>
  a.date.localeCompare(b.date) || (a.recordedAt ?? 0) - (b.recordedAt ?? 0) || a.id.localeCompare(b.id);

export function applyPayments(charges: LedgerCharge[], payments: LedgerPayment[]): LedgerResult {
  const orderedCharges = [...charges].sort(chargeOrder);
  const orderedPayments = [...payments].sort(paymentOrder);

  const due = orderedCharges.map((c) => Math.max(0, cents(c.amount)));
  const paid = orderedCharges.map(() => 0);
  const allocations = new Map<string, Allocation[]>(orderedPayments.map((p) => [p.id, []]));

  let cursor = 0;
  let unapplied = 0;
  for (const p of orderedPayments) {
    let left = Math.max(0, cents(p.amount));
    while (left > 0 && cursor < orderedCharges.length) {
      const room = due[cursor] - paid[cursor];
      if (room <= 0) {
        cursor++;
        continue;
      }
      const take = Math.min(room, left);
      paid[cursor] += take;
      left -= take;
      allocations.get(p.id)!.push({ chargeId: orderedCharges[cursor].id, amount: usd(take) });
    }
    unapplied += left;
  }

  const states = new Map<string, ChargeState>();
  orderedCharges.forEach((c, i) => {
    const outstanding = due[i] - paid[i];
    states.set(c.id, {
      paid: usd(paid[i]),
      outstanding: usd(outstanding),
      status: outstanding === 0 ? 'paid' : paid[i] > 0 ? 'partial' : 'unpaid',
    });
  });

  const totalCharged = due.reduce((s, d) => s + d, 0);
  const totalPaid = orderedPayments.reduce((s, p) => s + Math.max(0, cents(p.amount)), 0);
  return {
    charges: states,
    allocations,
    totalCharged: usd(totalCharged),
    totalPaid: usd(totalPaid),
    outstanding: usd(totalCharged - (totalPaid - unapplied)),
    credit: usd(unapplied),
  };
}

/**
 * Deuda de una casa hasta cierto punto (para la "deuda anterior" del recibo): suma lo pendiente
 * de los cargos que cumplen `isPrevious`, y la parte de esa deuda que genera intereses
 * (la pendiente sin los intereses ya facturados, en proporción).
 */
export function previousDebt(
  charges: LedgerCharge[],
  states: Map<string, ChargeState>,
  isPrevious: (c: LedgerCharge) => boolean,
): { amount: number; count: number; interestBase: number } {
  let amount = 0;
  let count = 0;
  let base = 0;
  for (const c of charges) {
    if (!isPrevious(c)) continue;
    const state = states.get(c.id);
    if (!state || state.outstanding <= 0) continue;
    amount += cents(state.outstanding);
    count += 1;
    const principalShare = c.amount > 0 ? Math.max(0, c.amount - c.interest) / c.amount : 1;
    base += cents(state.outstanding) * principalShare;
  }
  return { amount: usd(amount), count, interestBase: Math.round(base) / 100 };
}

/** Días transcurridos desde una fecha "YYYY-MM-DD" hasta `today` (para antigüedad de deuda). */
export function daysSince(date: string, today: string): number {
  const ms = Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Antigüedad legible de una deuda: "hace 12 días", "desde hoy" o "aún no vence" (recibo del mes próximo). */
export function debtAgeLabel(date: string, today: string): string {
  const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return 'aún no vence';
  if (days === 0) return 'desde hoy';
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

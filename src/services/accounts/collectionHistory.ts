// Historial de cobranza (función pura sobre los estados de cuenta): recibos y deudas con su
// estado de pago, y pagos recibidos. Lo usa la pestaña "Cobranza".
import type { AccountCharge, AccountPayment, HouseAccount } from '@/services/accounts/AccountService';
import type { House } from '@/types/domain';
import { roundCents } from '@/utils/billingCalculator';

export type ChargeFilter = 'all' | 'pending' | 'partial' | 'paid';

export interface HistoryFilters {
  status: ChargeFilter;
  /** "YYYY" o null = todos los años. */
  year: string | null;
  houseId: string | null;
}

export interface ChargeHistoryRow {
  house: House;
  charge: AccountCharge;
}

export interface PaymentHistoryRow {
  house: House;
  payment: AccountPayment;
}

export function chargeHistory(accounts: HouseAccount[], f: HistoryFilters) {
  const rows: ChargeHistoryRow[] = [];
  for (const a of accounts) {
    if (f.houseId && a.house.id !== f.houseId) continue;
    for (const c of a.charges) {
      if (f.year && !c.date.startsWith(f.year)) continue;
      if (f.status === 'pending' && c.outstanding <= 0) continue;
      if (f.status === 'partial' && c.status !== 'partial') continue;
      if (f.status === 'paid' && c.status !== 'paid') continue;
      rows.push({ house: a.house, charge: c });
    }
  }
  rows.sort((x, y) => y.charge.date.localeCompare(x.charge.date) || x.house.number.localeCompare(y.house.number, 'es', { numeric: true }));
  return {
    rows,
    totals: {
      charged: roundCents(rows.reduce((s, r) => s + r.charge.amount, 0)),
      paid: roundCents(rows.reduce((s, r) => s + r.charge.paid, 0)),
      outstanding: roundCents(rows.reduce((s, r) => s + r.charge.outstanding, 0)),
      count: rows.length,
      paidCount: rows.filter((r) => r.charge.status === 'paid').length,
    },
  };
}

export function paymentHistory(accounts: HouseAccount[], f: Pick<HistoryFilters, 'year' | 'houseId'>) {
  const rows: PaymentHistoryRow[] = [];
  for (const a of accounts) {
    if (f.houseId && a.house.id !== f.houseId) continue;
    for (const p of a.payments) if (!f.year || p.date.startsWith(f.year)) rows.push({ house: a.house, payment: p });
  }
  rows.sort((x, y) => y.payment.date.localeCompare(x.payment.date));
  return { rows, total: roundCents(rows.reduce((s, r) => s + r.payment.amount, 0)) };
}

/** Años con movimientos (para el filtro). */
export function yearsWithActivity(accounts: HouseAccount[]): string[] {
  const years = new Set<string>();
  for (const a of accounts) {
    for (const c of a.charges) years.add(c.date.slice(0, 4));
    for (const p of a.payments) years.add(p.date.slice(0, 4));
  }
  return [...years].sort().reverse();
}

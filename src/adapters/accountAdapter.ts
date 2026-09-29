import type { HouseDebt, Payment } from '@/types/accounts';
import type { HouseDebtRow, PaymentRow } from '@/types/database';

const numOrNull = (v: number | string | null) => (v == null ? null : Number(v));

export function paymentRowToDomain(row: PaymentRow): Payment {
  return {
    id: row.id,
    houseId: row.house_id,
    date: row.paid_on,
    amount: Number(row.amount),
    method: row.method,
    reference: row.reference,
    amountVes: numOrNull(row.amount_ves),
    exchangeRate: numOrNull(row.exchange_rate),
    note: row.note,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export type NewPayment = Omit<Payment, 'id' | 'createdAt'>;

export function newPaymentToRow(p: NewPayment): Omit<PaymentRow, 'id' | 'created_at'> {
  return {
    house_id: p.houseId,
    paid_on: p.date,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    amount_ves: p.amountVes,
    exchange_rate: p.exchangeRate,
    note: p.note,
  };
}

export function debtRowToDomain(row: HouseDebtRow): HouseDebt {
  return {
    id: row.id,
    houseId: row.house_id,
    concept: row.concept,
    detail: row.detail,
    date: row.origin_date,
    amount: Number(row.amount),
    months: row.months == null ? null : Number(row.months),
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export type NewDebt = Omit<HouseDebt, 'id' | 'createdAt'>;

export function newDebtToRow(d: NewDebt): Omit<HouseDebtRow, 'id' | 'created_at'> {
  return { house_id: d.houseId, concept: d.concept, detail: d.detail, origin_date: d.date, amount: d.amount, months: d.months };
}

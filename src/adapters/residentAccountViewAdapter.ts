import type { ExchangeRate } from '@/types/domain';
import { PAYMENT_METHOD_LABELS } from '@/types/accounts';
import type { HouseAccount } from '@/services/accounts/AccountService';
import type { ChargeState } from '@/utils/ledger';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';

const dateLabel = (iso: string) => formatDateVe(new Date(`${iso}T12:00:00-04:00`));

/**
 * Estado de cuenta → vista del residente: solo lo que necesita saber (cuánto debe,
 * de qué, y sus últimos pagos). Los montos en Bs. van a la tasa de hoy.
 */
export function toResidentAccountView(account: HouseAccount, todayRate: ExchangeRate | null) {
  const ves = (usd: number) => (todayRate ? formatVes(usdToVes(usd, todayRate.usdToVes)) : null);
  return {
    upToDate: account.outstanding === 0,
    outstandingLabel: formatUsd(account.outstanding),
    outstandingVesLabel: account.outstanding > 0 ? ves(account.outstanding) : null,
    creditLabel: account.credit > 0 ? formatUsd(account.credit) : null,
    pending: account.charges
      .filter((c) => c.outstanding > 0)
      .map((c) => ({
        id: c.id,
        label: c.label,
        amountLabel: formatUsd(c.outstanding),
        paidLabel: c.paid > 0 ? formatUsd(c.paid) : null,
      })),
    payments: account.payments.slice(0, 5).map((p) => ({
      id: p.id,
      dateLabel: dateLabel(p.date),
      amountLabel: formatUsd(p.amount),
      methodLabel: PAYMENT_METHOD_LABELS[p.method],
    })),
  };
}

export type ResidentAccountView = ReturnType<typeof toResidentAccountView>;

/** Estado de pago de un recibo tal como lo ve el residente (lo que falta, también en Bs. de hoy). */
export function toResidentPaymentState(state: ChargeState | null, todayRate: ExchangeRate | null) {
  if (!state) return null;
  return {
    status: state.status,
    paidLabel: formatUsd(state.paid),
    outstandingLabel: formatUsd(state.outstanding),
    outstandingVesLabel: todayRate ? formatVes(usdToVes(state.outstanding, todayRate.usdToVes)) : null,
  };
}

export type ResidentPaymentState = ReturnType<typeof toResidentPaymentState>;

import type { BillingPeriod, Condominium, House } from '@/types/domain';
import type { BillingSheetRepository, CondominiumRepository, InvoiceRepository, PaymentRepository } from '@/services/contracts';
import type { AccountService } from '@/services/accounts/AccountService';
import { DEFAULT_SETTINGS } from '@/adapters/condominiumAdapter';
import { roundCents } from '@/utils/billingCalculator';
import { agingBucket, daysSince, type AgingBucket } from '@/utils/ledger';
import { monthName } from '@/utils/months';

export interface MonthFigures {
  month: number;
  year: number;
  label: string;
  /** Recibos emitidos del mes (USD). */
  billed: number;
  /** Pagos recibidos con fecha en el mes. */
  collected: number;
  /** Gastos del condominio (comunes + extraordinarios) de la relación de gastos guardada. */
  expenses: number;
  /** Ingresos de la comunidad (alquileres, reintegros…) de la relación de gastos. */
  communityIncome: number;
}

export interface Debtor {
  house: House;
  outstanding: number;
  /** Fecha del cargo pendiente más antiguo. */
  oldestDate: string | null;
  /** A cuántos meses de condominio equivale lo que debe. */
  monthsOwed: number;
}

export interface CondominiumMetrics {
  period: MonthFigures & {
    issuedCount: number;
    unitCount: number;
    paymentsCount: number;
    reserveBilled: number;
    /** Cobrado ÷ facturado del mes (null si no se facturó). */
    collectionRate: number | null;
  };
  cash: {
    openingBalance: number;
    openingBalanceDate: string | null;
    collected: number;
    communityIncome: number;
    expenses: number;
    /** Saldo inicial + cobrado + ingresos − gastos (desde la fecha del saldo inicial). */
    balance: number;
    /** Fondo de reserva facturado acumulado. */
    reserveFundBilled: number;
  };
  receivables: {
    outstanding: number;
    credit: number;
    housesWithDebt: number;
    unitCount: number;
    aging: Record<AgingBucket, number>;
    topDebtors: Debtor[];
  };
  /** Últimos 6 meses hasta el periodo, del más antiguo al más reciente. */
  trend: MonthFigures[];
}

const inMonth = (date: string, { month, year }: BillingPeriod) => date.startsWith(`${year}-${String(month).padStart(2, '0')}`);
const shiftMonth = ({ month, year }: BillingPeriod, delta: number): BillingPeriod => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
const sameMonth = (a: BillingPeriod, b: BillingPeriod) => a.month === b.month && a.year === b.year;

/** Consolidado financiero de un condominio: facturado, cobrado, gastos, caja y cuentas por cobrar. */
export class MetricsService {
  constructor(
    private readonly condominiums: CondominiumRepository,
    private readonly invoices: InvoiceRepository,
    private readonly payments: PaymentRepository,
    private readonly sheets: BillingSheetRepository,
    private readonly accounts: AccountService,
  ) {}

  async forCondominium(condominium: Condominium, period: BillingPeriod, today: string): Promise<CondominiumMetrics> {
    const [full, invoices, payments, sheets, accounts] = await Promise.all([
      this.condominiums.findWithSettings(condominium.id),
      this.invoices.listIssuedByCondominium(condominium.id),
      this.payments.listByCondominium(condominium.id),
      this.sheets.listByCondominium(condominium.id),
      this.accounts.accountsFor(condominium.id),
    ]);
    const settings = full?.settings ?? DEFAULT_SETTINGS;

    const figures = (p: BillingPeriod): MonthFigures => {
      const sheet = sheets.find((s) => sameMonth(s, p));
      const sum = (kinds: string[]) => roundCents((sheet?.expenses ?? []).filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.amount, 0));
      return {
        ...p,
        label: `${monthName(p.month).slice(0, 3)} ${String(p.year).slice(2)}`,
        billed: roundCents(invoices.filter((i) => sameMonth(i, p)).reduce((s, i) => s + i.amount, 0)),
        collected: roundCents(payments.filter((x) => inMonth(x.date, p)).reduce((s, x) => s + x.amount, 0)),
        expenses: sum(['ordinary', 'extraordinary']),
        communityIncome: sum(['income']),
      };
    };

    const current = figures(period);
    const periodInvoices = invoices.filter((i) => sameMonth(i, period));

    // Caja: desde la fecha del saldo inicial (o desde siempre si no se indicó) hasta el mes
    // de hoy. Una relación de gastos de un mes futuro todavía es un presupuesto, no un gasto.
    const since = settings.openingBalanceDate;
    const monthKey = (iso: string) => Number(iso.slice(0, 4)) * 100 + Number(iso.slice(5, 7));
    const sinceKey = since ? monthKey(since) : 0;
    const todayKey = monthKey(today);
    const counted = sheets.filter((s) => s.year * 100 + s.month >= sinceKey && s.year * 100 + s.month <= todayKey);
    const cashCollected = roundCents(payments.filter((p) => !since || p.date >= since).reduce((s, p) => s + p.amount, 0));
    const cashIncome = roundCents(counted.flatMap((s) => s.expenses).filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0));
    const cashExpenses = roundCents(counted.flatMap((s) => s.expenses).filter((e) => e.kind !== 'income').reduce((s, e) => s + e.amount, 0));

    // Cuentas por cobrar con antigüedad por cargo pendiente.
    const aging: Record<AgingBucket, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const debtors: Debtor[] = [];
    let outstanding = 0;
    let credit = 0;
    for (const account of accounts.values()) {
      outstanding += account.outstanding;
      credit += account.credit;
      for (const c of account.charges) if (c.outstanding > 0) aging[agingBucket(daysSince(c.date, today))] += c.outstanding;
      if (account.outstanding > 0) {
        debtors.push({ house: account.house, outstanding: account.outstanding, oldestDate: account.oldestPendingDate, monthsOwed: account.monthsOwed });
      }
    }
    for (const k of Object.keys(aging) as AgingBucket[]) aging[k] = roundCents(aging[k]);

    return {
      period: {
        ...current,
        issuedCount: periodInvoices.length,
        unitCount: accounts.size,
        paymentsCount: payments.filter((p) => inMonth(p.date, period)).length,
        reserveBilled: roundCents(periodInvoices.reduce((s, i) => s + (i.detail?.reserveFund ?? 0), 0)),
        collectionRate: current.billed > 0 ? current.collected / current.billed : null,
      },
      cash: {
        openingBalance: settings.openingBalance,
        openingBalanceDate: since,
        collected: cashCollected,
        communityIncome: cashIncome,
        expenses: cashExpenses,
        balance: roundCents(settings.openingBalance + cashCollected + cashIncome - cashExpenses),
        reserveFundBilled: roundCents(invoices.reduce((s, i) => s + (i.detail?.reserveFund ?? 0), 0)),
      },
      receivables: {
        outstanding: roundCents(outstanding),
        credit: roundCents(credit),
        housesWithDebt: debtors.length,
        unitCount: accounts.size,
        aging,
        topDebtors: debtors.sort((a, b) => b.outstanding - a.outstanding).slice(0, 6),
      },
      trend: Array.from({ length: 6 }, (_, i) => figures(shiftMonth(period, i - 5))),
    };
  }
}

import type { BillingPeriod, Condominium, House, Invoice } from '@/types/domain';
import { EXTRAJUDICIAL_FEE_CONCEPT, EXTRAJUDICIAL_FEE_PERCENT, type HouseDebt, type Payment, type PaymentMethod } from '@/types/accounts';
import type { AccountLedger, HouseDebtRepository, HouseRepository, InvoiceRepository, PaymentRepository } from '@/services/contracts';
import { NotFoundError, ValidationError } from '@/services/errors';
import { applyPayments, previousDebt, type ChargeState, type LedgerCharge } from '@/utils/ledger';
import type { PreviousDebt } from '@/utils/billingCalculator';
import { roundCents } from '@/utils/billingCalculator';
import { formatPeriod } from '@/utils/months';
import { isoDateInCaracas } from '@/utils/dates';

/** Un cargo del estado de cuenta, con lo pagado y lo pendiente. */
export interface AccountCharge extends LedgerCharge, ChargeState {
  label: string;
  invoice: Invoice | null;
  debt: HouseDebt | null;
}

export interface AccountPayment extends Payment {
  /** A qué cargos se aplicó (lo más antiguo primero). */
  appliedTo: { chargeId: string; label: string; amount: number }[];
}

/** Estado de cuenta de una casa. */
export interface HouseAccount {
  house: House;
  /** Cargos del más antiguo al más reciente. */
  charges: AccountCharge[];
  /** Pagos del más reciente al más antiguo. */
  payments: AccountPayment[];
  totalCharged: number;
  totalPaid: number;
  outstanding: number;
  credit: number;
  /** Fecha del cargo pendiente más antiguo (antigüedad de la deuda). */
  oldestPendingDate: string | null;
  /** A cuántos meses de condominio equivale lo que debe (ver monthsOwed). */
  monthsOwed: number;
}

export interface PaymentInput {
  date: string;
  currency: 'USD' | 'VES';
  /** En la moneda indicada. */
  amount: number;
  /** Bs. por USD, obligatoria si currency = 'VES'. */
  exchangeRate: number | null;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}

/** Una fila del estado de cuenta mensual exportable. */
export interface MonthlyStatementRow {
  house: House;
  /** Facturado SOLO en el mes elegido (no acumulado). */
  totalCharged: number;
  /** Pagado SOLO en el mes elegido (no acumulado). */
  totalPaid: number;
  /** Saldo pendiente real al cierre del mes (acumulado: la deuda arrastra meses anteriores). */
  outstanding: number;
  pendingCount: number;
  oldestPendingDate: string | null;
}

export interface DebtInput {
  concept: string;
  detail: string | null;
  date: string;
  amount: number;
  /** Meses de condominio que representa (vacío si no son meses). */
  months: number | null;
}

const METHODS: PaymentMethod[] = ['transfer', 'mobile', 'zelle', 'cash_usd', 'cash_ves', 'other'];
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`));
const periodKey = (year: number, month: number) => year * 100 + month;

/**
 * Libro de cuentas de cada casa: recibos emitidos + deudas registradas (cargos) y pagos.
 * Los pagos se imputan a lo más antiguo primero (utils/ledger). Implementa AccountLedger,
 * que es lo único que la facturación necesita saber de las cuentas.
 */
export class AccountService implements AccountLedger {
  constructor(
    private readonly houses: HouseRepository,
    private readonly invoices: InvoiceRepository,
    private readonly debts: HouseDebtRepository,
    private readonly payments: PaymentRepository,
  ) {}

  /** Estado de cuenta de todas las casas del condominio. */
  async accountsFor(condominiumId: string): Promise<Map<string, HouseAccount>> {
    const [houses, invoices, debts, payments] = await Promise.all([
      this.houses.listByCondominium(condominiumId),
      this.invoices.listIssuedByCondominium(condominiumId),
      this.debts.listByCondominium(condominiumId),
      this.payments.listByCondominium(condominiumId),
    ]);
    const result = new Map<string, HouseAccount>();
    for (const house of houses) {
      result.set(
        house.id,
        buildAccount(
          house,
          invoices.filter((i) => i.houseId === house.id),
          debts.filter((d) => d.houseId === house.id),
          payments.filter((p) => p.houseId === house.id),
        ),
      );
    }
    return result;
  }

  async houseAccount(condominium: Condominium, houseId: string): Promise<HouseAccount> {
    const account = (await this.accountsFor(condominium.id)).get(houseId);
    if (!account) throw new NotFoundError('La casa no existe en este condominio');
    return account;
  }

  /** Estado de cuenta que ve el residente (su sesión ya trae casa y condominio). */
  async residentAccount(houseId: string, condominiumId: string): Promise<HouseAccount | null> {
    return (await this.accountsFor(condominiumId)).get(houseId) ?? null;
  }

  // ── AccountLedger ──────────────────────────────────────────
  async previousDebts(condominiumId: string, period: BillingPeriod): Promise<Map<string, PreviousDebt>> {
    const accounts = await this.accountsFor(condominiumId);
    const current = periodKey(period.year, period.month);
    const out = new Map<string, PreviousDebt>();
    for (const [houseId, account] of accounts) {
      // Anterior = recibos de meses previos + deudas registradas con origen hasta este mes.
      const isPrevious = (c: LedgerCharge) => {
        const [y, m] = c.date.split('-').map(Number);
        return c.source === 'invoice' ? periodKey(y, m) < current : periodKey(y, m) <= current;
      };
      out.set(houseId, previousDebt(account.charges, new Map(account.charges.map((c) => [c.id, c])), isPrevious));
    }
    return out;
  }

  /**
   * Estado de cuenta de todas las casas para UN mes: lo facturado y lo pagado son solo los
   * movimientos de ese mes (no acumulado desde siempre), mientras que lo pendiente es el saldo
   * real que arrastra la casa al cierre del mes (la deuda sí es acumulada por naturaleza). Para
   * exportar.
   */
  async monthlyStatement(condominiumId: string, period: BillingPeriod): Promise<MonthlyStatementRow[]> {
    const accounts = await this.accountsFor(condominiumId);
    const current = periodKey(period.year, period.month);
    const monthStart = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    // Primer día del mes SIGUIENTE: incluye pagos y cargos de cualquier día del mes elegido.
    const cutoff = period.month === 12 ? `${period.year + 1}-01-01` : `${period.year}-${String(period.month + 1).padStart(2, '0')}-01`;
    const isThroughThisMonth = (c: LedgerCharge) => {
      const [y, m] = c.date.split('-').map(Number);
      return periodKey(y, m) <= current;
    };
    const inThisMonth = (date: string) => date >= monthStart && date < cutoff;

    const rows: MonthlyStatementRow[] = [];
    for (const account of accounts.values()) {
      // Saldo (pendiente) al cierre del mes: necesita TODO el historial hasta el corte, porque
      // una deuda vieja sin pagar sigue pendiente aunque no sea de este mes.
      const charges = account.charges.filter(isThroughThisMonth);
      const payments = account.payments.filter((p) => p.date < cutoff).map((p) => ({ id: p.id, date: p.date, amount: p.amount, recordedAt: p.createdAt?.getTime() }));
      const ledger = applyPayments(charges, payments);
      const pending = charges.filter((c) => (ledger.charges.get(c.id)?.outstanding ?? 0) > 0).sort((a, b) => a.date.localeCompare(b.date));

      // Facturado y pagado: solo lo que pasó ESTE mes (no todo lo acumulado hasta él).
      const monthCharged = roundCents(account.charges.filter((c) => inThisMonth(c.date)).reduce((s, c) => s + c.amount, 0));
      const monthPaid = roundCents(account.payments.filter((p) => inThisMonth(p.date)).reduce((s, p) => s + p.amount, 0));

      rows.push({
        house: account.house,
        totalCharged: monthCharged,
        totalPaid: monthPaid,
        outstanding: ledger.outstanding,
        pendingCount: pending.length,
        oldestPendingDate: pending[0]?.date ?? null,
      });
    }
    return rows.sort((a, b) => a.house.number.localeCompare(b.house.number, 'es', { numeric: true }));
  }

  /** Honorarios de cobranza extrajudicial: 20 % de la deuda ACTUAL de esta casa, como un cargo
   * nuevo solo para ella (sin alícuotas, no lo pagan las demás casas). No se cobra dos veces
   * mientras haya unos pendientes de pago, para no componer honorarios sobre honorarios. */
  async applyExtrajudicialFee(condominium: Condominium, houseId: string): Promise<{ debt: HouseDebt; base: number }> {
    const account = await this.houseAccount(condominium, houseId);
    if (account.outstanding <= 0) throw new ValidationError('Esta casa no tiene deuda pendiente: no corresponde cobranza extrajudicial');
    const pending = account.charges.find((c) => c.debt?.concept === EXTRAJUDICIAL_FEE_CONCEPT && c.outstanding > 0);
    if (pending) throw new ValidationError('Ya hay honorarios de cobranza extrajudicial pendientes de pago para esta casa');

    const base = account.outstanding;
    const amount = roundCents((base * EXTRAJUDICIAL_FEE_PERCENT) / 100);
    const debt = await this.addDebt(condominium, houseId, {
      concept: EXTRAJUDICIAL_FEE_CONCEPT,
      detail: `${EXTRAJUDICIAL_FEE_PERCENT}% sobre $${base.toFixed(2)} de deuda pendiente al registrar este cargo.`,
      date: isoDateInCaracas(new Date()),
      amount,
      months: null,
    });
    return { debt, base };
  }

  async invoiceStates(condominiumId: string): Promise<Map<string, ChargeState>> {
    const accounts = await this.accountsFor(condominiumId);
    const out = new Map<string, ChargeState>();
    for (const account of accounts.values()) {
      for (const c of account.charges) if (c.source === 'invoice') out.set(c.id, { paid: c.paid, outstanding: c.outstanding, status: c.status });
    }
    return out;
  }

  // ── Pagos ──────────────────────────────────────────────────
  async registerPayment(condominium: Condominium, houseId: string, input: PaymentInput): Promise<Payment> {
    await this.requireHouse(condominium, houseId);
    if (!isDate(input.date)) throw new ValidationError('Fecha de pago inválida');
    if (input.date > isoDateInCaracas(new Date(Date.now() + 86_400_000))) throw new ValidationError('La fecha del pago no puede ser futura');
    if (!METHODS.includes(input.method)) throw new ValidationError('Forma de pago inválida');
    if (!(Number.isFinite(input.amount) && input.amount > 0 && input.amount <= 1e9)) throw new ValidationError('El monto del pago debe ser mayor que 0');

    let amountUsd = input.amount;
    let amountVes: number | null = null;
    let rate: number | null = null;
    if (input.currency === 'VES') {
      if (!(input.exchangeRate && Number.isFinite(input.exchangeRate) && input.exchangeRate > 0)) {
        throw new ValidationError('Indique la tasa (Bs. por USD) del día del pago');
      }
      rate = input.exchangeRate;
      amountVes = roundCents(input.amount);
      amountUsd = roundCents(input.amount / rate);
      if (amountUsd <= 0) throw new ValidationError('El monto en Bs. es demasiado pequeño');
    }

    return this.payments.create({
      houseId,
      date: input.date,
      amount: roundCents(amountUsd),
      method: input.method,
      reference: input.reference?.trim().slice(0, 60) || null,
      amountVes,
      exchangeRate: rate,
      note: input.note?.trim().slice(0, 300) || null,
    });
  }

  async deletePayment(condominium: Condominium, paymentId: string): Promise<void> {
    const payments = await this.payments.listByCondominium(condominium.id);
    if (!payments.some((p) => p.id === paymentId)) throw new NotFoundError('El pago no existe en este condominio');
    await this.payments.delete(paymentId);
  }

  // ── Deudas registradas ─────────────────────────────────────
  async addDebt(condominium: Condominium, houseId: string, input: DebtInput): Promise<HouseDebt> {
    await this.requireHouse(condominium, houseId);
    const concept = input.concept.trim();
    if (!concept) throw new ValidationError('La deuda necesita un concepto');
    if (!isDate(input.date)) throw new ValidationError('Fecha de origen inválida');
    if (!(Number.isFinite(input.amount) && input.amount > 0 && input.amount <= 1e9)) throw new ValidationError('El monto de la deuda debe ser mayor que 0');
    if (input.months !== null && !(Number.isInteger(input.months) && input.months >= 1 && input.months <= 600)) {
      throw new ValidationError('Los meses deben ser un número entero entre 1 y 600 (o dejarlo vacío)');
    }
    return this.debts.create({
      houseId,
      concept: concept.slice(0, 120),
      detail: input.detail?.trim().slice(0, 500) || null,
      date: input.date,
      amount: roundCents(input.amount),
      months: input.months,
    });
  }

  async deleteDebt(condominium: Condominium, debtId: string): Promise<void> {
    const debts = await this.debts.listByCondominium(condominium.id);
    if (!debts.some((d) => d.id === debtId)) throw new NotFoundError('La deuda no existe en este condominio');
    await this.debts.delete(debtId);
  }

  private async requireHouse(condominium: Condominium, houseId: string): Promise<House> {
    const house = await this.houses.findById(houseId);
    if (!house || house.condominiumId !== condominium.id) throw new NotFoundError('La casa no existe en este condominio');
    return house;
  }
}

/** Arma el estado de cuenta de una casa a partir de sus recibos, deudas y pagos. */
export function buildAccount(house: House, invoices: Invoice[], debts: HouseDebt[], payments: Payment[]): HouseAccount {
  const meta = new Map<string, { label: string; invoice: Invoice | null; debt: HouseDebt | null }>();
  const charges: LedgerCharge[] = [];
  for (const inv of invoices) {
    charges.push({
      id: inv.id,
      source: 'invoice',
      date: `${inv.year}-${String(inv.month).padStart(2, '0')}-01`,
      amount: inv.amount,
      interest: inv.detail?.lateInterest ?? 0,
    });
    meta.set(inv.id, { label: `Recibo de ${formatPeriod(inv.month, inv.year).toLowerCase()}`, invoice: inv, debt: null });
  }
  for (const d of debts) {
    charges.push({ id: d.id, source: 'debt', date: d.date, amount: d.amount, interest: 0 });
    meta.set(d.id, { label: d.concept, invoice: null, debt: d });
  }

  const ledger = applyPayments(charges, payments.map((p) => ({ id: p.id, date: p.date, amount: p.amount, recordedAt: p.createdAt?.getTime() })));
  const accountCharges: AccountCharge[] = charges
    .map((c) => ({ ...c, ...ledger.charges.get(c.id)!, ...meta.get(c.id)! }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const labelOf = new Map(accountCharges.map((c) => [c.id, c.label]));

  return {
    house,
    charges: accountCharges,
    payments: [...payments]
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .map((p) => ({
        ...p,
        appliedTo: (ledger.allocations.get(p.id) ?? []).map((a) => ({ ...a, label: labelOf.get(a.chargeId) ?? '—' })),
      })),
    totalCharged: ledger.totalCharged,
    totalPaid: ledger.totalPaid,
    outstanding: ledger.outstanding,
    credit: ledger.credit,
    oldestPendingDate: accountCharges.find((c) => c.outstanding > 0)?.date ?? null,
    monthsOwed: monthsOwed(accountCharges),
  };
}

/**
 * A cuántos meses de condominio equivale lo que debe: cada recibo mensual pendiente
 * (aunque tenga abono) cuenta 1 mes; una deuda registrada cuenta los meses que representa,
 * en proporción a lo que falta (14 meses con la mitad pagada → 7). Multas y otros cargos
 * sin meses no suman.
 */
export function monthsOwed(charges: AccountCharge[]): number {
  let months = 0;
  for (const c of charges) {
    if (c.outstanding <= 0) continue;
    if (c.invoice) months += 1;
    else if (c.debt?.months) months += Math.ceil((c.debt.months * c.outstanding) / c.amount - 1e-9);
  }
  return months;
}

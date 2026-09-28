import { randomUUID } from 'node:crypto';
import type { BillingSheet, BuildingExpense, InvoiceBreakdown, UnitCharge } from '@/types/billing';
import type { BillingPeriod, Condominium, House, Invoice } from '@/types/domain';
import type { AccountLedger, BillingSheetRepository, CondominiumRepository, HouseRepository, InvoiceRepository } from '@/services/contracts';
import type { ChargeState } from '@/utils/ledger';
import { NotFoundError, ValidationError } from '@/services/errors';
import { DEFAULT_SETTINGS } from '@/adapters/condominiumAdapter';
import { calculateCondominiumInvoices } from '@/utils/billingCalculator';
import { dueDateFor } from '@/utils/dueDate';

export type SheetOrigin = 'saved' | 'copied' | 'new';

/** Lo que la administradora puede editar de la relación de gastos. */
export interface BillingSheetInput {
  reserveFundPercent: number;
  dueDate: string | null;
  generalNote: string | null;
  unitNotes: Record<string, string>;
  expenses: (Omit<BuildingExpense, 'id'> & { id?: string })[];
  unitCharges: (Omit<UnitCharge, 'id'> & { id?: string })[];
}

export interface UnitPreview {
  house: House;
  /** Factura ya emitida de este periodo (si existe). */
  invoice: Invoice | null;
  /** Cálculo actual con la relación de gastos vigente. */
  breakdown: InvoiceBreakdown;
  /** Emitida, pero la relación de gastos cambió desde entonces (conviene regenerar). */
  outdated: boolean;
  /** Cuánto se ha pagado del recibo emitido (según el libro de pagos). */
  payment: ChargeState | null;
}

/**
 * Relación de gastos del mes y cálculo de las facturas del condominio.
 * Solo depende de interfaces; el cálculo es la función pura `calculateCondominiumInvoices`.
 */
export class BillingService {
  constructor(
    private readonly condominiums: CondominiumRepository,
    private readonly houses: HouseRepository,
    private readonly invoices: InvoiceRepository,
    private readonly sheets: BillingSheetRepository,
    private readonly accounts: AccountLedger,
  ) {}

  /**
   * La relación de gastos del periodo. Si aún no existe, se propone una copia del último mes
   * con gastos (casi todos se repiten), sin guardarla hasta que la administradora la confirme.
   */
  async getSheet(condominium: Condominium, period: BillingPeriod): Promise<{ sheet: BillingSheet; origin: SheetOrigin }> {
    const saved = await this.sheets.find(condominium.id, period);
    if (saved) return { sheet: saved, origin: 'saved' };

    const settings = (await this.condominiums.findWithSettings(condominium.id))?.settings ?? DEFAULT_SETTINGS;
    const previous = await this.sheets.findLatestBefore(condominium.id, period);
    const base: BillingSheet = {
      condominiumId: condominium.id,
      ...period,
      reserveFundPercent: previous?.reserveFundPercent ?? settings.defaultReserveFundPercent,
      dueDate: dueDateFor(period, settings.dueDay),
      generalNote: null,
      unitNotes: {},
      // Se copian los gastos del condominio (con sus ajustes por casa) y los cargos marcados
      // como "cada mes". Los demás cargos y las notas son solo del mes en que se crearon.
      expenses: (previous?.expenses ?? []).map((e) => ({ ...e, id: randomUUID(), overrides: { ...(e.overrides ?? {}) } })),
      unitCharges: (previous?.unitCharges ?? []).filter((c) => c.recurring).map((c) => ({ ...c, id: randomUUID() })),
      updatedAt: null,
    };
    return { sheet: base, origin: previous ? 'copied' : 'new' };
  }

  async saveSheet(condominium: Condominium, period: BillingPeriod, input: BillingSheetInput): Promise<BillingSheet> {
    const houses = await this.houses.listByCondominium(condominium.id);
    const houseIds = new Set(houses.map((h) => h.id));
    const sheet: BillingSheet = {
      condominiumId: condominium.id,
      ...period,
      reserveFundPercent: input.reserveFundPercent,
      dueDate: input.dueDate,
      generalNote: input.generalNote?.trim() || null,
      unitNotes: Object.fromEntries(
        Object.entries(input.unitNotes)
          .map(([id, note]) => [id, note.trim()] as const)
          .filter(([id, note]) => houseIds.has(id) && note.length > 0),
      ),
      expenses: input.expenses.map((e) => ({
        ...e,
        id: e.id ?? randomUUID(),
        concept: e.concept.trim(),
        // Ajustes de casas que ya no son del condominio se descartan.
        overrides: Object.fromEntries(Object.entries(e.overrides ?? {}).filter(([id]) => houseIds.has(id))),
      })),
      unitCharges: input.unitCharges.map((c) => ({ ...c, id: c.id ?? randomUUID(), concept: c.concept.trim(), recurring: !!c.recurring })),
      updatedAt: null,
    };
    validateSheet(sheet, houseIds);
    return this.sheets.save(sheet);
  }

  /** Cálculo de todas las unidades del periodo, junto a la factura ya emitida (si hay). */
  async preview(condominium: Condominium, period: BillingPeriod): Promise<{ sheet: BillingSheet; origin: SheetOrigin; units: UnitPreview[] }> {
    const [{ sheet, origin }, houses, issued, settings, states] = await Promise.all([
      this.getSheet(condominium, period),
      this.houses.listByCondominium(condominium.id),
      this.invoices.listByCondominiumAndPeriod(condominium.id, period),
      this.condominiums.findWithSettings(condominium.id),
      this.accounts.invoiceStates(condominium.id),
    ]);
    const breakdowns = await this.calculate(condominium, period, sheet, houses, settings?.settings.lateInterestMonthlyPercent ?? 0);
    const byHouse = new Map(issued.map((i) => [i.houseId, i]));

    const units = houses.map((house) => {
      const invoice = byHouse.get(house.id) ?? null;
      const breakdown = breakdowns.get(house.id)!;
      const outdated = !!invoice && invoice.status === 'generated' && Math.abs(invoice.amount - breakdown.monthTotal) >= 0.005;
      return { house, invoice, breakdown, outdated, payment: invoice ? (states.get(invoice.id) ?? null) : null };
    });
    return { sheet, origin, units };
  }

  /** Desglose de una unidad (para emitir su factura). */
  async breakdownFor(condominium: Condominium, period: BillingPeriod, houseId: string): Promise<{ house: House; breakdown: InvoiceBreakdown }> {
    const houses = await this.houses.listByCondominium(condominium.id);
    const house = houses.find((h) => h.id === houseId);
    if (!house) throw new NotFoundError('La unidad no existe en este condominio');
    const [{ sheet, origin }, settings] = await Promise.all([this.getSheet(condominium, period), this.condominiums.findWithSettings(condominium.id)]);
    // Nunca se emite con una propuesta copiada del mes anterior sin que nadie la revise.
    if (origin !== 'saved') throw new ValidationError('Revise y guarde la relación de gastos de este mes antes de emitir recibos');
    if (sheet.expenses.length === 0 && sheet.unitCharges.every((c) => c.houseId !== houseId)) {
      throw new ValidationError('La relación de gastos del mes está vacía');
    }
    const breakdowns = await this.calculate(condominium, period, sheet, houses, settings?.settings.lateInterestMonthlyPercent ?? 0);
    return { house, breakdown: breakdowns.get(houseId)! };
  }

  private async calculate(condominium: Condominium, period: BillingPeriod, sheet: BillingSheet, houses: House[], lateInterest: number) {
    // Deuda anterior según el libro de cuentas: recibos previos y deudas registradas, menos pagos.
    const debts = await this.accounts.previousDebts(condominium.id, period);
    return calculateCondominiumInvoices(sheet, houses.map((h) => ({ id: h.id, aliquot: h.aliquot })), debts, {
      lateInterestMonthlyPercent: lateInterest,
    });
  }
}

/** Reglas de negocio de una relación de gastos. */
function validateSheet(sheet: BillingSheet, houseIds: Set<string>): void {
  const money = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e9;
  if (!money(sheet.reserveFundPercent) || sheet.reserveFundPercent < 0 || sheet.reserveFundPercent > 100) {
    throw new ValidationError('El fondo de reserva debe estar entre 0 % y 100 %');
  }
  if (sheet.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(sheet.dueDate)) throw new ValidationError('Fecha de vencimiento inválida');
  for (const e of sheet.expenses) {
    if (!e.concept) throw new ValidationError('Cada gasto necesita un concepto');
    if (!money(e.amount) || e.amount < 0) throw new ValidationError(`Monto inválido en "${e.concept}"`);
    if (!['ordinary', 'extraordinary', 'income'].includes(e.kind)) throw new ValidationError(`Tipo inválido en "${e.concept}"`);
    if (!['aliquot', 'equal'].includes(e.distribution)) throw new ValidationError(`Reparto inválido en "${e.concept}"`);
    const overrides = Object.values(e.overrides ?? {});
    let fixedSum = 0;
    for (const o of overrides) {
      if (o.mode === 'fixed') {
        if (!money(o.amount) || o.amount < 0) throw new ValidationError(`Monto fijo inválido en "${e.concept}"`);
        fixedSum += o.amount;
      }
    }
    if (fixedSum > e.amount + 0.001) {
      throw new ValidationError(`En "${e.concept}" los montos fijos por casa (${fixedSum.toFixed(2)}) superan el total del gasto (${e.amount.toFixed(2)})`);
    }
    // Si todas las casas tienen ajuste, lo que sobre del gasto no le tocaría a nadie.
    if (overrides.length >= houseIds.size && e.amount - fixedSum > 0.005) {
      throw new ValidationError(`En "${e.concept}" todas las casas tienen ajuste y quedan ${(e.amount - fixedSum).toFixed(2)} sin repartir`);
    }
  }
  for (const c of sheet.unitCharges) {
    if (!houseIds.has(c.houseId)) throw new ValidationError('Hay un cargo para una unidad que no es de este condominio');
    if (!c.concept) throw new ValidationError('Cada cargo individual necesita un concepto');
    if (!money(c.amount) || c.amount === 0) throw new ValidationError(`Monto inválido en "${c.concept}"`);
  }
}

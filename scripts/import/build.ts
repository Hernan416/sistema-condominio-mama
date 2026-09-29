// Paso 2 de la carga histórica: de la PLANTILLA a filas de la base, con conciliación.
// Función pura: no lee ni escribe archivos (lo hace run.ts). Se puede probar sola.
import { randomUUID } from 'node:crypto';
import type { InvoiceBreakdown, InvoiceLineKind } from '@/types/billing';
import type { BillingSheetRow, CondominiumRow, HouseDebtRow, PaymentRow } from '@/types/database';
import type { LocalDatabase, LocalHouseRecord, LocalInvoiceRecord } from '@/services/local/localSchema';
import { applyPayments, type LedgerCharge, type LedgerPayment } from '@/utils/ledger';
import { receiptNumber } from '@/utils/dueDate';
import { formatPeriod } from '@/utils/months';
import type { Plantilla, PlantillaCondominium, PlantillaReceipt } from './plantilla';

const TOLERANCE = 0.011; // un céntimo de diferencia por redondeo se acepta
const cents = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;
const key = (n: string) => n.trim().toUpperCase();
const periodKey = (y: number, m: number) => y * 100 + m;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
const firstDay = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
const minDate = (a: string, b: string) => (a < b ? a : b);

export interface HouseReport {
  condominio: string;
  casa: string;
  recibos: number;
  facturado: number;
  pagado: number;
  deudaCalculada: number;
  deudaArchivo: number | null;
  mesesCalculados: number;
  mesesArchivo: number | null;
  ok: boolean;
  notas: string[];
}

export interface ImportPlan {
  batch: string;
  condominiumUpdates: { id: string; fields: Partial<CondominiumRow> }[];
  houseUpdates: { id: string; fields: Partial<LocalHouseRecord> }[];
  billingSheets: BillingSheetRow[];
  invoices: LocalInvoiceRecord[];
  debts: HouseDebtRow[];
  payments: PaymentRow[];
  houses: HouseReport[];
  /** Impiden importar (condominio o casa inexistente, recibos que no cuadran…). */
  errors: string[];
  /** No impiden importar pero hay que revisarlos. */
  warnings: string[];
}

/**
 * Pagos implícitos en la cadena de recibos de una casa: lo pagado entre el recibo i y el i+1
 * es (deuda anterior_i + total del mes_i) − deuda anterior_{i+1}. Para el último recibo se usa
 * la deuda al corte del archivo de deudas (si no hay, se asume que no pagó después).
 */
export function paymentsFromChain(receipts: PlantillaReceipt[], debtAtCutoff: number | null) {
  const sorted = [...receipts].sort((a, b) => periodKey(a.year, a.month) - periodKey(b.year, b.month));
  const result: { year: number; month: number; amount: number; source: string }[] = [];
  const anomalies: string[] = [];
  sorted.forEach((r, i) => {
    const next = sorted[i + 1];
    const owedAfter = next ? next.previousDebt : debtAtCutoff;
    if (owedAfter === null) return;
    if (next && periodKey(next.year, next.month) !== periodKey(r.year, r.month) + (r.month === 12 ? 89 : 1)) {
      anomalies.push(`falta el recibo entre ${formatPeriod(r.month, r.year)} y ${formatPeriod(next.month, next.year)}`);
    }
    const paid = cents(r.previousDebt + r.monthTotal - owedAfter);
    if (paid < -TOLERANCE) anomalies.push(`en ${formatPeriod(r.month, r.year)} la deuda subió ${cents(-paid)} más que el recibo (¿cargo fuera del recibo?)`);
    else if (paid > TOLERANCE) result.push({ year: r.year, month: r.month, amount: paid, source: next ? `${r.source} → ${next.source}` : `${r.source} → deuda al corte` });
  });
  return { payments: result, anomalies };
}

/** Meses que equivale lo pendiente (misma regla que el sistema: monthsOwed). */
function monthsOf(charges: (LedgerCharge & { months: number | null; isInvoice: boolean })[], states: Map<string, { outstanding: number }>) {
  let m = 0;
  for (const c of charges) {
    const out = states.get(c.id)?.outstanding ?? 0;
    if (out <= 0) continue;
    if (c.isInvoice) m += 1;
    else if (c.months) m += Math.ceil((c.months * out) / c.amount - 1e-9);
  }
  return m;
}

function breakdownOf(r: PlantillaReceipt, aliquot: number, fallbackDue: string | null): InvoiceBreakdown {
  const sum = (k: InvoiceLineKind) => cents(r.lines.filter((l) => l.kind === k).reduce((s, l) => s + l.unitAmount, 0));
  const [generalNote = null, unitNote = null] = r.notes ?? [];
  return {
    aliquot,
    // Conceptos EXACTOS del PDF: cada mes puede traer conceptos distintos y todos se guardan.
    lines: r.lines.map((l) => ({ concept: l.concept.trim(), kind: l.kind, buildingAmount: l.buildingAmount, unitAmount: cents(l.unitAmount) })),
    commonSubtotal: sum('ordinary'),
    reserveFund: sum('reserve'),
    reserveFundPercent: r.reserveFundPercent ?? 0,
    incomeSubtotal: sum('income'),
    extraordinarySubtotal: sum('extraordinary'),
    unitChargesSubtotal: sum('unit'),
    lateInterest: sum('interest'),
    lateInterestMonthlyPercent: r.lateInterestMonthlyPercent ?? 0,
    monthTotal: cents(r.monthTotal),
    previousDebt: cents(r.previousDebt),
    previousDebtCount: r.previousDebtCount ?? 0,
    totalDue: cents(r.totalDue),
    solvent: r.previousDebt <= TOLERANCE,
    dueDate: r.dueOn ?? fallbackDue,
    generalNote,
    unitNote,
  };
}

export function buildImport(p: Plantilla, db: LocalDatabase): ImportPlan {
  const plan: ImportPlan = { batch: p.batch, condominiumUpdates: [], houseUpdates: [], billingSheets: [], invoices: [], debts: [], payments: [], houses: [], errors: [], warnings: [] };
  const now = new Date().toISOString();
  const tag = { import_batch: p.batch };

  for (const pc of p.condominiums) {
    const condo = db.condominiums.find((c) => c.slug === pc.slug);
    if (!condo) {
      plan.errors.push(`No existe el condominio "${pc.slug}"`);
      continue;
    }
    buildCondominium(pc, condo);
  }
  return plan;

  function buildCondominium(pc: PlantillaCondominium, condo: CondominiumRow) {
    const name = condo.name;
    const houses = db.houses.filter((h) => h.condominium_id === condo.id);
    const byNumber = new Map(houses.map((h) => [key(h.number), h]));
    const findHouse = (n: string, where: string) => {
      const h = byNumber.get(key(n));
      if (!h) plan.errors.push(`${name}: la casa "${n}" no existe (${where})`);
      return h;
    };

    // ── Datos del recibo y caja ────────────────────────────────────────────
    const s = pc.settings ?? {};
    const condoFields: Partial<CondominiumRow> = {};
    if ('rif' in s) condoFields.rif = s.rif ?? null;
    if ('address' in s) condoFields.address = s.address ?? null;
    if ('administratorName' in s) condoFields.administrator_name = s.administratorName ?? null;
    if ('administratorRif' in s) condoFields.administrator_rif = s.administratorRif ?? null;
    if ('paymentInstructions' in s) condoFields.payment_instructions = s.paymentInstructions ?? null;
    if (s.dueDay !== undefined) condoFields.due_day = s.dueDay;
    if (s.defaultReserveFundPercent !== undefined) condoFields.default_reserve_fund_percent = s.defaultReserveFundPercent;
    if (s.lateInterestMonthlyPercent !== undefined) condoFields.late_interest_monthly_percent = s.lateInterestMonthlyPercent;
    if (pc.openingCash) Object.assign(condoFields, { opening_balance: cents(pc.openingCash.amount), opening_balance_date: pc.openingCash.date });
    if (Object.keys(condoFields).length) plan.condominiumUpdates.push({ id: condo.id, fields: condoFields });
    const header = { ...condo, ...condoFields };

    // ── Casas: alícuotas y dueños ─────────────────────────────────────────
    const aliquotOf = new Map(houses.map((h) => [h.id, Number(h.aliquot)]));
    const ownerOf = new Map(houses.map((h) => [h.id, { name: h.owner_name, doc: h.owner_document ?? null }]));
    for (const ph of pc.houses ?? []) {
      const h = findHouse(ph.number, ph.source ?? 'archivo de alícuotas');
      if (!h) continue;
      const fields: Partial<LocalHouseRecord> = {};
      if (ph.aliquot !== undefined) {
        fields.aliquot = ph.aliquot;
        fields.aliquot_category_id = null;
        aliquotOf.set(h.id, ph.aliquot);
      }
      if (ph.ownerName !== undefined) fields.owner_name = ph.ownerName;
      if (ph.ownerDocument !== undefined) fields.owner_document = ph.ownerDocument;
      if (ph.ownerPhone !== undefined) fields.owner_phone = ph.ownerPhone;
      if (ph.ownerEmail !== undefined) fields.owner_email = ph.ownerEmail;
      ownerOf.set(h.id, { name: fields.owner_name ?? h.owner_name, doc: fields.owner_document ?? h.owner_document ?? null });
      if (Object.keys(fields).length) plan.houseUpdates.push({ id: h.id, fields });
    }
    if (pc.houses?.some((h) => h.aliquot !== undefined)) {
      const total = Math.round([...aliquotOf.values()].reduce((a, b) => a + b, 0) * 10000) / 10000;
      if (Math.abs(total - 100) > 0.01) plan.warnings.push(`${name}: las alícuotas suman ${total} % (deberían sumar 100 %)`);
      const missing = houses.filter((h) => !pc.houses!.some((ph) => key(ph.number) === key(h.number)));
      if (missing.length) plan.warnings.push(`${name}: el archivo de alícuotas no trae las casas ${missing.map((h) => h.number).join(', ')}`);
    }

    // ── Balances generales → relaciones de gastos del mes ────────────────
    for (const b of pc.balances ?? []) {
      plan.billingSheets.push({
        condominium_id: condo.id,
        year: b.year,
        month: b.month,
        reserve_fund_percent: b.reserveFundPercent ?? Number(header.default_reserve_fund_percent ?? 10),
        due_date: b.dueDate ?? null,
        general_note: b.generalNote ?? null,
        unit_notes: {},
        expenses: b.expenses.map((e) => ({ id: randomUUID(), concept: e.concept.trim(), amount: cents(e.amount), kind: e.kind, distribution: e.distribution ?? 'aliquot' })),
        unit_charges: [],
        updated_at: now,
        source: b.source,
        ...tag,
      });
    }

    // ── Recibos, deuda anterior a 2026 y pagos, casa por casa ─────────────
    const receiptsByHouse = new Map<string, PlantillaReceipt[]>();
    for (const r of pc.receipts ?? []) {
      const h = findHouse(r.house, r.source);
      if (!h) continue;
      receiptsByHouse.set(h.id, [...(receiptsByHouse.get(h.id) ?? []), r]);
    }
    const debtFile = new Map<string, { amount: number; months: number; source: string; detail?: string | null }>();
    for (const d of pc.debtsAtCutoff ?? []) {
      const h = findHouse(d.house, d.source);
      if (h) debtFile.set(h.id, d);
    }
    const explicitPayments = new Map<string, typeof pc.payments>();
    for (const pay of pc.payments ?? []) {
      const h = findHouse(pay.house, pay.source);
      if (h) explicitPayments.set(h.id, [...(explicitPayments.get(h.id) ?? []), pay]);
    }

    // Consistencia entre casas: el "total del condominio" de un concepto debe ser igual en todos los recibos del mes.
    const buildingTotals = new Map<string, Map<string, number>>();
    for (const r of pc.receipts ?? []) {
      const m = buildingTotals.get(`${r.year}-${r.month}`) ?? new Map<string, number>();
      for (const l of r.lines) {
        if (l.buildingAmount === null) continue;
        const prev = m.get(l.concept.trim());
        if (prev !== undefined && !same(prev, l.buildingAmount)) {
          plan.warnings.push(`${name} ${formatPeriod(r.month, r.year)}: "${l.concept}" tiene total del condominio ${prev} en un recibo y ${l.buildingAmount} en otro (${r.source})`);
        }
        m.set(l.concept.trim(), l.buildingAmount);
      }
      buildingTotals.set(`${r.year}-${r.month}`, m);
    }

    for (const h of houses) {
      const receipts = (receiptsByHouse.get(h.id) ?? []).sort((a, b) => periodKey(a.year, a.month) - periodKey(b.year, b.month));
      const expected = debtFile.get(h.id) ?? null;
      const notes: string[] = [];
      const charges: (LedgerCharge & { months: number | null; isInvoice: boolean })[] = [];
      const payments: LedgerPayment[] = [];

      // Recibos: validar y guardar tal cual.
      for (const r of receipts) {
        const linesSum = cents(r.lines.reduce((s2, l) => s2 + l.unitAmount, 0));
        if (!same(linesSum, r.monthTotal)) plan.errors.push(`${name} casa ${h.number} ${formatPeriod(r.month, r.year)}: las líneas suman ${linesSum} y el total del mes dice ${r.monthTotal} (${r.source})`);
        if (!same(r.monthTotal + r.previousDebt, r.totalDue)) plan.errors.push(`${name} casa ${h.number} ${formatPeriod(r.month, r.year)}: mes ${r.monthTotal} + deuda ${r.previousDebt} ≠ total ${r.totalDue} (${r.source})`);
        const aliquot = r.aliquot ?? aliquotOf.get(h.id) ?? 0;
        if (r.aliquot != null && aliquotOf.has(h.id) && Math.abs(r.aliquot - (aliquotOf.get(h.id) ?? 0)) > 0.0001) {
          notes.push(`alícuota ${r.aliquot} en ${formatPeriod(r.month, r.year)} ≠ archivo ${aliquotOf.get(h.id)}`);
        }
        const owner = ownerOf.get(h.id)!;
        const id = randomUUID();
        const issuedOn = r.issuedOn ?? firstDay(r.year, r.month);
        plan.invoices.push({
          id,
          house_id: h.id,
          month: r.month,
          year: r.year,
          amount: cents(r.monthTotal),
          exchange_rate: r.exchangeRate ?? null,
          exchange_rate_date: r.exchangeRate ? (r.exchangeRateDate ?? issuedOn) : null,
          exchange_rate_source: r.exchangeRate ? 'BCV' : null,
          status: 'generated',
          generated_at: `${issuedOn}T12:00:00-04:00`,
          paid_at: null,
          detail: breakdownOf(r, aliquot, null),
          issued_condominium_name: name,
          issued_house_number: h.number,
          issued_owner_name: r.ownerName ?? owner.name ?? null,
          issued_owner_document: r.ownerDocument ?? owner.doc,
          issued_receipt_number: r.receiptNumber ?? receiptNumber({ month: r.month, year: r.year }, h.number),
          issued_rif: header.rif ?? null,
          issued_address: header.address ?? null,
          issued_administrator_name: header.administrator_name ?? null,
          issued_administrator_rif: header.administrator_rif ?? null,
          issued_payment_instructions: header.payment_instructions ?? null,
          source: r.source,
          ...tag,
        });
        charges.push({ id, source: 'invoice', date: firstDay(r.year, r.month), amount: cents(r.monthTotal), interest: breakdownOf(r, aliquot, null).lateInterest, months: null, isInvoice: true });
      }

      // Deuda de años anteriores: la "deuda anterior" del primer recibo.
      const first = receipts[0];
      let openingDebt: HouseDebtRow | null = null;
      if (first && first.previousDebt > TOLERANCE) {
        const before = first.month === 1 ? { y: first.year - 1, m: 12 } : { y: first.year, m: first.month - 1 };
        openingDebt = {
          id: randomUUID(),
          house_id: h.id,
          concept: `Deuda anterior a ${formatPeriod(first.month, first.year).toLowerCase()}`,
          detail: expected?.detail ?? `Saldo que figura como "deuda anterior" en el recibo de ${formatPeriod(first.month, first.year).toLowerCase()}.`,
          origin_date: lastDay(before.y, before.m),
          amount: cents(first.previousDebt),
          created_at: now,
          months: first.previousDebtCount ?? null,
          source: first.source,
          ...tag,
        };
        charges.unshift({ id: openingDebt.id, source: 'debt', date: openingDebt.origin_date, amount: Number(openingDebt.amount), interest: 0, months: openingDebt.months ?? null, isInvoice: false });
      }
      // Casa sin recibos pero con deuda en el archivo: se registra como deuda al corte.
      if (!first && expected && expected.amount > TOLERANCE) {
        openingDebt = {
          id: randomUUID(),
          house_id: h.id,
          concept: 'Deuda al corte (archivo de deudas)',
          detail: expected.detail ?? null,
          origin_date: p.cutoff,
          amount: cents(expected.amount),
          created_at: now,
          months: expected.months || null,
          source: expected.source,
          ...tag,
        };
        charges.push({ id: openingDebt.id, source: 'debt', date: p.cutoff, amount: cents(expected.amount), interest: 0, months: expected.months || null, isInvoice: false });
        notes.push('sin recibos: se cargó la deuda del archivo');
      }

      // Pagos: los conocidos o los que se deducen de los recibos.
      const known = explicitPayments.get(h.id);
      if (known?.length) {
        for (const pay of known) {
          const id = randomUUID();
          plan.payments.push({ id, house_id: h.id, paid_on: pay.date, amount: cents(pay.amount), method: pay.method ?? 'other', reference: pay.reference ?? null, amount_ves: pay.amountVes ?? null, exchange_rate: pay.exchangeRate ?? null, note: pay.note ?? null, created_at: now, source: pay.source, ...tag });
          payments.push({ id, date: pay.date, amount: cents(pay.amount) });
        }
      } else if (receipts.length) {
        const chain = paymentsFromChain(receipts, expected?.amount ?? null);
        notes.push(...chain.anomalies);
        if (!expected) notes.push('no está en el archivo de deudas: se asume que no pagó después del último recibo');
        for (const c of chain.payments) {
          const id = randomUUID();
          const date = minDate(lastDay(c.year, c.month), p.cutoff);
          plan.payments.push({ id, house_id: h.id, paid_on: date, amount: c.amount, method: 'other', reference: null, amount_ves: null, exchange_rate: null, note: `Pago calculado a partir de los recibos (${formatPeriod(c.month, c.year).toLowerCase()}); fecha aproximada`, created_at: now, source: c.source, ...tag });
          payments.push({ id, date, amount: c.amount });
        }
      }

      // Conciliar con el mismo libro de cuentas del sistema.
      const ledger = applyPayments(charges, payments);
      // Si el archivo trae los meses y la deuda de años anteriores sigue pendiente, sus meses se
      // ajustan para que el total coincida con el archivo.
      if (openingDebt && expected && !first?.previousDebtCount) {
        const out = ledger.charges.get(openingDebt.id)?.outstanding ?? 0;
        const others = monthsOf(charges.filter((c) => c.id !== openingDebt!.id), ledger.charges);
        const target = expected.months - others;
        if (out > TOLERANCE && target > 0) {
          const fraction = out / Number(openingDebt.amount);
          let m = Math.max(1, Math.round(target / fraction));
          while (m > 1 && Math.ceil(m * fraction - 1e-9) > target) m--;
          while (Math.ceil(m * fraction - 1e-9) < target) m++;
          openingDebt.months = m;
          charges.find((c) => c.id === openingDebt!.id)!.months = m;
        }
      }
      if (openingDebt) plan.debts.push(openingDebt);

      const months = monthsOf(charges, ledger.charges);
      const deuda = cents(ledger.outstanding);
      const ok = (!expected || (same(deuda, expected.amount) && months === expected.months)) && !notes.some((n) => n.startsWith('en '));
      if (expected && !same(deuda, expected.amount)) notes.push(`deuda calculada ${deuda} ≠ archivo ${expected.amount}`);
      if (expected && months !== expected.months) notes.push(`meses calculados ${months} ≠ archivo ${expected.months}`);
      if (ledger.credit > TOLERANCE) notes.push(`queda saldo a favor ${cents(ledger.credit)}`);
      plan.houses.push({
        condominio: name,
        casa: h.number,
        recibos: receipts.length,
        facturado: cents(ledger.totalCharged),
        pagado: cents(ledger.totalPaid),
        deudaCalculada: deuda,
        deudaArchivo: expected?.amount ?? null,
        mesesCalculados: months,
        mesesArchivo: expected?.months ?? null,
        ok,
        notas: notes,
      });
    }

    // Recibos de casas que existen pero no tienen PDF en algún mes.
    const periods = [...new Set((pc.receipts ?? []).map((r) => periodKey(r.year, r.month)))].sort();
    for (const pk of periods) {
      const have = new Set((pc.receipts ?? []).filter((r) => periodKey(r.year, r.month) === pk).map((r) => key(r.house)));
      const missing = houses.filter((h) => !have.has(key(h.number))).map((h) => h.number);
      if (missing.length) plan.warnings.push(`${name} ${formatPeriod(pk % 100, Math.floor(pk / 100))}: no hay recibo de las casas ${missing.join(', ')}`);
    }
  }
}

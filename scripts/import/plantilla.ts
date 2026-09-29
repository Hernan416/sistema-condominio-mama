// Formato estándar de la carga histórica ("plantilla"). Todo lo que se lea de los PDF y Excel
// termina aquí, y el importador solo entiende este formato. Cada dato lleva `source`
// ("Manzana 3-A/03 Marzo/recibos/casa-12.pdf#p1") para poder ubicarlo si algo no cuadra.
//
// Montos en USD. Si un documento viene en Bs., se convierte con la tasa impresa en él
// (o la BCV de su fecha) ANTES de ponerlo aquí, y la tasa se guarda en el recibo.
import type { InvoiceLineKind } from '@/types/billing';

export interface Plantilla {
  version: 1;
  /** Nombre del lote (ej. "historico-2026"). Permite revisar o deshacer toda la carga. */
  batch: string;
  /** Fecha de corte "YYYY-MM-DD": a partir del día siguiente todo se hace en el sistema. */
  cutoff: string;
  condominiums: PlantillaCondominium[];
}

export interface PlantillaCondominium {
  /** "manzana-3-a" | "manzana-3-b" */
  slug: string;
  /** Datos del recibo reales (RIF, dirección, cuentas…): reemplazan a los de prueba. */
  settings?: Partial<{
    rif: string | null;
    address: string | null;
    administratorName: string | null;
    administratorRif: string | null;
    paymentInstructions: string | null;
    dueDay: number;
    defaultReserveFundPercent: number;
    lateInterestMonthlyPercent: number;
  }>;
  /** Del archivo de alícuotas (y dueños, si los trae). */
  houses?: PlantillaHouse[];
  /** Dinero en banco/caja al inicio del periodo cargado (del primer balance general). */
  openingCash?: { amount: number; date: string; source: string };
  /** Un balance general por mes: gastos, ingresos y (si lo trae) saldo en caja. */
  balances?: PlantillaBalance[];
  /** Un recibo por casa y mes, con TODAS sus líneas tal como vienen (los conceptos cambian mes a mes). */
  receipts?: PlantillaReceipt[];
  /** Del archivo de deudas: cuánto debía cada casa al corte y cuántos meses equivale. */
  debtsAtCutoff?: PlantillaDebtAtCutoff[];
  /** Pagos conocidos con fecha. Si no hay, el importador los calcula de la cadena de recibos. */
  payments?: PlantillaPayment[];
}

export interface PlantillaHouse {
  number: string;
  aliquot?: number;
  ownerName?: string | null;
  ownerDocument?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  source?: string;
}

export interface PlantillaBalance {
  month: number;
  year: number;
  expenses: { concept: string; amount: number; kind: 'ordinary' | 'extraordinary' | 'income'; distribution?: 'aliquot' | 'equal' }[];
  reserveFundPercent?: number;
  dueDate?: string | null;
  generalNote?: string | null;
  /** Saldo en caja al cierre del mes según el balance (solo para verificar). */
  closingCash?: number | null;
  /** Total cobrado en el mes según el balance (solo para verificar). */
  collected?: number | null;
  source: string;
}

export interface PlantillaReceipt {
  house: string;
  month: number;
  year: number;
  receiptNumber?: string | null;
  issuedOn?: string | null;
  dueOn?: string | null;
  aliquot?: number | null;
  ownerName?: string | null;
  ownerDocument?: string | null;
  /** Todas las líneas del recibo, con su concepto EXACTO. */
  lines: { concept: string; kind: InvoiceLineKind; buildingAmount: number | null; unitAmount: number }[];
  /** Total del mes (suma de las líneas). */
  monthTotal: number;
  /** Deuda anterior impresa en el recibo. */
  previousDebt: number;
  /** Cuántos recibos/meses dice que tenía pendientes (si lo trae). */
  previousDebtCount?: number | null;
  totalDue: number;
  reserveFundPercent?: number | null;
  lateInterestMonthlyPercent?: number | null;
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  notes?: string[];
  source: string;
}

export interface PlantillaDebtAtCutoff {
  house: string;
  /** Total que debía al corte (incluye lo de años anteriores y lo pendiente de 2026). */
  amount: number;
  /** A cuántos meses equivale. */
  months: number;
  detail?: string | null;
  source: string;
}

export interface PlantillaPayment {
  house: string;
  date: string;
  amount: number;
  method?: 'transfer' | 'mobile' | 'zelle' | 'cash_usd' | 'cash_ves' | 'other';
  reference?: string | null;
  amountVes?: number | null;
  exchangeRate?: number | null;
  note?: string | null;
  source: string;
}

// ─── Validación ────────────────────────────────────────────────────────────────
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9;
const isMonth = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
const isYear = (v: unknown) => Number.isInteger(v) && (v as number) >= 2000 && (v as number) <= 2100;
const KINDS: InvoiceLineKind[] = ['ordinary', 'reserve', 'income', 'extraordinary', 'unit', 'interest'];

/** Revisa la forma de la plantilla. Devuelve la lista de problemas (vacía = válida). */
export function validatePlantilla(p: unknown): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const x = p as Plantilla;
  if (!x || typeof x !== 'object') return ['La plantilla no es un objeto JSON'];
  if (x.version !== 1) err('version', 'debe ser 1');
  if (!x.batch || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(x.batch)) err('batch', 'use minúsculas, números y guiones (ej. "historico-2026")');
  if (!isDate(x.cutoff)) err('cutoff', 'fecha "YYYY-MM-DD"');
  if (!Array.isArray(x.condominiums) || x.condominiums.length === 0) err('condominiums', 'falta la lista');

  for (const [ci, c] of (x.condominiums ?? []).entries()) {
    const at = `condominiums[${ci}] (${c?.slug ?? '?'})`;
    if (!c?.slug) err(at, 'falta slug');
    for (const [i, h] of (c.houses ?? []).entries()) {
      if (!h.number) err(`${at}.houses[${i}]`, 'falta number');
      if (h.aliquot !== undefined && !(isMoney(h.aliquot) && h.aliquot >= 0 && h.aliquot <= 100)) err(`${at}.houses[${i}]`, 'alícuota entre 0 y 100');
    }
    if (c.openingCash && (!isMoney(c.openingCash.amount) || !isDate(c.openingCash.date))) err(`${at}.openingCash`, 'monto y fecha');
    for (const [i, b] of (c.balances ?? []).entries()) {
      const w = `${at}.balances[${i}] ${b.year}-${b.month}`;
      if (!isMonth(b.month) || !isYear(b.year)) err(w, 'mes/año inválidos');
      if (!b.source) err(w, 'falta source');
      for (const [j, e] of (b.expenses ?? []).entries()) {
        if (!e.concept?.trim()) err(`${w}.expenses[${j}]`, 'falta concepto');
        if (!isMoney(e.amount)) err(`${w}.expenses[${j}]`, 'monto inválido');
        if (!['ordinary', 'extraordinary', 'income'].includes(e.kind)) err(`${w}.expenses[${j}]`, 'kind: ordinary | extraordinary | income');
      }
    }
    const seenReceipts = new Set<string>();
    for (const [i, r] of (c.receipts ?? []).entries()) {
      const w = `${at}.receipts[${i}] casa ${r.house} ${r.year}-${r.month}`;
      const key = `${r.house}|${r.year}|${r.month}`;
      if (seenReceipts.has(key)) err(w, 'recibo repetido (misma casa y mes)');
      seenReceipts.add(key);
      if (!r.house) err(w, 'falta casa');
      if (!isMonth(r.month) || !isYear(r.year)) err(w, 'mes/año inválidos');
      if (!r.source) err(w, 'falta source');
      if (!Array.isArray(r.lines) || r.lines.length === 0) err(w, 'sin líneas');
      for (const [j, l] of (r.lines ?? []).entries()) {
        if (!l.concept?.trim()) err(`${w}.lines[${j}]`, 'falta concepto');
        if (!KINDS.includes(l.kind)) err(`${w}.lines[${j}]`, `kind: ${KINDS.join(' | ')}`);
        if (!isMoney(l.unitAmount)) err(`${w}.lines[${j}]`, 'unitAmount inválido');
        if (l.buildingAmount !== null && !isMoney(l.buildingAmount)) err(`${w}.lines[${j}]`, 'buildingAmount inválido');
      }
      for (const f of ['monthTotal', 'previousDebt', 'totalDue'] as const) if (!isMoney(r[f])) err(w, `${f} inválido`);
      for (const f of ['issuedOn', 'dueOn', 'exchangeRateDate'] as const) if (r[f] != null && !isDate(r[f])) err(w, `${f} debe ser "YYYY-MM-DD"`);
    }
    for (const [i, d] of (c.debtsAtCutoff ?? []).entries()) {
      const w = `${at}.debtsAtCutoff[${i}] casa ${d.house}`;
      if (!d.house) err(w, 'falta casa');
      if (!isMoney(d.amount) || d.amount < 0) err(w, 'monto inválido');
      if (!Number.isInteger(d.months) || d.months < 0) err(w, 'meses: entero ≥ 0');
    }
    for (const [i, pay] of (c.payments ?? []).entries()) {
      const w = `${at}.payments[${i}] casa ${pay.house}`;
      if (!isDate(pay.date)) err(w, 'fecha inválida');
      if (!isMoney(pay.amount) || pay.amount <= 0) err(w, 'monto > 0');
    }
  }
  return errors;
}

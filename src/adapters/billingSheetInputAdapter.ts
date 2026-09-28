// JSON sin tipar del cliente → entrada de dominio. Solo forma y tipos; las reglas de
// negocio (montos, unidades del condominio…) las valida BillingService.
import type { BillingSheetInput } from '@/services/billing/BillingService';
import type { BuildingExpense } from '@/types/billing';
import type { UnitUpdateInput } from '@/types/unitInput';
import type { AliquotScheme } from '@/utils/aliquotScheme';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const optStr = (v: unknown) => (v == null ? null : typeof v === 'string' ? v : undefined);

export function parseBillingSheetInput(body: unknown): BillingSheetInput | null {
  if (!isObj(body)) return null;
  const reserve = num(body.reserveFundPercent);
  const dueDate = optStr(body.dueDate);
  const generalNote = optStr(body.generalNote);
  if (reserve === null || dueDate === undefined || generalNote === undefined) return null;
  if (!Array.isArray(body.expenses) || !Array.isArray(body.unitCharges) || !isObj(body.unitNotes)) return null;
  if (body.expenses.length > 200 || body.unitCharges.length > 2000) return null;

  const expenses: BillingSheetInput['expenses'] = [];
  for (const e of body.expenses) {
    if (!isObj(e)) return null;
    const concept = str(e.concept);
    const amount = num(e.amount);
    if (concept === null || amount === null) return null;
    if (e.kind !== 'ordinary' && e.kind !== 'extraordinary' && e.kind !== 'income') return null;
    if (e.distribution !== 'aliquot' && e.distribution !== 'equal') return null;
    const overrides = parseOverrides(e.overrides);
    if (overrides === null) return null;
    expenses.push({ id: str(e.id) ?? undefined, concept: concept.slice(0, 120), amount, kind: e.kind, distribution: e.distribution, overrides });
  }

  const unitCharges: BillingSheetInput['unitCharges'] = [];
  for (const c of body.unitCharges) {
    if (!isObj(c)) return null;
    const houseId = str(c.houseId);
    const concept = str(c.concept);
    const amount = num(c.amount);
    if (houseId === null || concept === null || amount === null) return null;
    unitCharges.push({ id: str(c.id) ?? undefined, houseId, concept: concept.slice(0, 120), amount, recurring: c.recurring === true });
  }

  const unitNotes: Record<string, string> = {};
  for (const [id, note] of Object.entries(body.unitNotes)) {
    if (typeof note !== 'string') return null;
    unitNotes[id] = note.slice(0, 300);
  }

  return {
    reserveFundPercent: reserve,
    dueDate,
    generalNote: generalNote?.slice(0, 500) ?? null,
    unitNotes,
    expenses,
    unitCharges,
  };
}

/** { [houseId]: { mode: 'exempt' } | { mode: 'fixed', amount } }; ausente = sin ajustes. */
function parseOverrides(v: unknown): BuildingExpense['overrides'] | null {
  if (v == null) return {};
  if (!isObj(v) || Object.keys(v).length > 1000) return null;
  const out: NonNullable<BuildingExpense['overrides']> = {};
  for (const [houseId, o] of Object.entries(v)) {
    if (!isObj(o)) return null;
    if (o.mode === 'exempt') out[houseId] = { mode: 'exempt' };
    else if (o.mode === 'fixed' && num(o.amount) !== null) out[houseId] = { mode: 'fixed', amount: o.amount as number };
    else return null;
  }
  return out;
}

export function parseUnitUpdates(body: unknown): { updates: UnitUpdateInput[]; scheme: AliquotScheme } | null {
  if (!isObj(body) || !Array.isArray(body.updates) || body.updates.length > 1000) return null;
  const scheme = parseScheme(body.aliquotScheme);
  if (!scheme) return null;
  const out: UnitUpdateInput[] = [];
  for (const u of body.updates) {
    if (!isObj(u)) return null;
    const id = str(u.id);
    const aliquot = num(u.aliquot);
    const aliquotCategoryId = optStr(u.aliquotCategoryId);
    if (id === null || aliquot === null || aliquotCategoryId === undefined) return null;
    out.push({ id, aliquot, aliquotCategoryId });
  }
  return { updates: out, scheme };
}

function parseScheme(v: unknown): AliquotScheme | null {
  if (!isObj(v) || (v.mode !== 'proportional' && v.mode !== 'percent') || !Array.isArray(v.categories) || v.categories.length > 20) return null;
  const categories: AliquotScheme['categories'] = [];
  for (const c of v.categories) {
    if (!isObj(c)) return null;
    const id = str(c.id);
    const name = str(c.name);
    const value = num(c.value);
    if (id === null || name === null || value === null) return null;
    categories.push({ id: id.slice(0, 64), name: name.slice(0, 60), value });
  }
  return { mode: v.mode, categories };
}

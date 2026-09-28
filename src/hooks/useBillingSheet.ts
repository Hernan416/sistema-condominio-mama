import { useCallback, useMemo, useRef, useState } from 'react';
import { createAdminInvoicesApi } from '@/services/api/adminInvoicesApi';
import { calculateCondominiumInvoices, roundCents } from '@/utils/billingCalculator';
import { formatAmountInput, parseAmountInput } from '@/utils/amountInput';
import type { BillingSheet, BuildingExpense, Distribution, ExpenseKind, ExpenseOverride } from '@/types/billing';
import type { BillingSheetDto, PeriodDto, SheetOriginDto, UnitDto } from '@/types/dto';

interface Options {
  condominiumSlug: string;
  units: UnitDto[];
  initialPeriod: PeriodDto;
  initialSheet: BillingSheetDto;
  initialOrigin: SheetOriginDto;
}

type Draft = Omit<BillingSheetDto, 'updatedAt'>;

const newId = () => crypto.randomUUID();
const snapshot = (d: Draft) => JSON.stringify(d);
const toDraft = ({ updatedAt: _u, ...rest }: BillingSheetDto): Draft => rest;
const amountTexts = (d: Draft) =>
  Object.fromEntries([...d.expenses, ...d.unitCharges].map((x) => [x.id, formatAmountInput(Math.abs(x.amount))]));

export function useBillingSheet({ condominiumSlug, units, initialPeriod, initialSheet, initialOrigin }: Options) {
  const api = useMemo(() => createAdminInvoicesApi(condominiumSlug), [condominiumSlug]);
  const [period, setPeriod] = useState(initialPeriod);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialSheet));
  const [origin, setOrigin] = useState(initialOrigin);
  const [saved, setSaved] = useState(() => (initialOrigin === 'saved' ? snapshot(toDraft(initialSheet)) : ''));
  const [texts, setTexts] = useState<Record<string, string>>(() => amountTexts(toDraft(initialSheet)));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const periodRef = useRef(period);

  const dirty = snapshot(draft) !== saved;
  const edit = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setSavedMessage(null);
    setError(null);
  };

  // ── Parámetros del mes ─────────────────────────────────────
  const setReserveFundPercent = (value: number) => edit((d) => ({ ...d, reserveFundPercent: value }));
  const setDueDate = (value: string | null) => edit((d) => ({ ...d, dueDate: value }));
  const setGeneralNote = (value: string) => edit((d) => ({ ...d, generalNote: value || null }));

  // ── Gastos del condominio ──────────────────────────────────
  const addExpense = (kind: ExpenseKind) => {
    const expense: BuildingExpense = { id: newId(), concept: '', amount: 0, kind, distribution: 'aliquot' };
    edit((d) => ({ ...d, expenses: [...d.expenses, expense] }));
    setTexts((t) => ({ ...t, [expense.id]: '' }));
  };
  const updateExpense = (id: string, patch: Partial<Pick<BuildingExpense, 'concept' | 'kind' | 'distribution'>>) =>
    edit((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const setExpenseAmount = (id: string, text: string) => {
    setTexts((t) => ({ ...t, [id]: text }));
    const amount = parseAmountInput(text) ?? 0;
    edit((d) => ({ ...d, expenses: d.expenses.map((e) => (e.id === id ? { ...e, amount } : e)) }));
  };
  const removeExpense = (id: string) => edit((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));

  // ── Cargos / abonos individuales (1 a 1 y masivos) ─────────
  /** Agrega el mismo cargo (o abono, si `credit`) a varias unidades a la vez. */
  const addChargeToUnits = (houseIds: string[], concept: string, amount: number, credit: boolean, recurring = false) => {
    const signed = credit ? -Math.abs(amount) : Math.abs(amount);
    const charges = houseIds.map((houseId) => ({ id: newId(), houseId, concept: concept.trim(), amount: signed, recurring }));
    edit((d) => ({ ...d, unitCharges: [...d.unitCharges, ...charges] }));
    setTexts((t) => ({ ...t, ...Object.fromEntries(charges.map((c) => [c.id, formatAmountInput(Math.abs(c.amount))])) }));
  };
  const removeCharge = (id: string) => edit((d) => ({ ...d, unitCharges: d.unitCharges.filter((c) => c.id !== id) }));
  const toggleChargeRecurring = (id: string) =>
    edit((d) => ({ ...d, unitCharges: d.unitCharges.map((c) => (c.id === id ? { ...c, recurring: !c.recurring } : c)) }));

  // ── Conceptos personalizados: ajustar un gasto del condominio para ciertas casas ──
  /** null = la casa vuelve a pagar según el reparto. */
  const setExpenseOverride = (expenseId: string, houseIds: string[], override: ExpenseOverride | null) =>
    edit((d) => ({
      ...d,
      expenses: d.expenses.map((e) => {
        if (e.id !== expenseId) return e;
        const overrides = { ...(e.overrides ?? {}) };
        for (const id of houseIds) {
          if (override) overrides[id] = override;
          else delete overrides[id];
        }
        return { ...e, overrides };
      }),
    }));
  /** Quita de las unidades indicadas todos los cargos con ese concepto (deshacer un cargo masivo). */
  const removeChargesByConcept = (houseIds: string[], concept: string) => {
    const ids = new Set(houseIds);
    edit((d) => ({ ...d, unitCharges: d.unitCharges.filter((c) => !(ids.has(c.houseId) && c.concept === concept)) }));
  };

  // ── Notas personalizadas ───────────────────────────────────
  const setUnitNote = (houseId: string, note: string) => edit((d) => ({ ...d, unitNotes: { ...d.unitNotes, [houseId]: note } }));
  const setNoteForUnits = (houseIds: string[], note: string) =>
    edit((d) => ({ ...d, unitNotes: { ...d.unitNotes, ...Object.fromEntries(houseIds.map((id) => [id, note])) } }));

  // ── Selección para acciones masivas ────────────────────────
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(units.map((u) => u.id)));
  const selectOnly = (ids: string[]) => setSelected(new Set(ids));
  const clearSelection = () => setSelected(new Set());

  // ── Vista previa en vivo (mismo cálculo que el servidor; sin deuda anterior) ──
  const sheetForCalc: BillingSheet = useMemo(
    () => ({ condominiumId: '', ...period, ...draft, updatedAt: null }),
    [draft, period],
  );
  const preview = useMemo(
    () => calculateCondominiumInvoices(sheetForCalc, units.map((u) => ({ id: u.id, aliquot: u.aliquot }))),
    [sheetForCalc, units],
  );
  const totals = useMemo(() => {
    const sum = (kind: ExpenseKind) => roundCents(draft.expenses.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0));
    const all = [...preview.values()];
    return {
      ordinary: sum('ordinary'),
      extraordinary: sum('extraordinary'),
      income: sum('income'),
      reserve: roundCents(all.reduce((s, b) => s + b.reserveFund, 0)),
      unitCharges: roundCents(draft.unitCharges.reduce((s, c) => s + c.amount, 0)),
      billed: roundCents(all.reduce((s, b) => s + b.monthTotal, 0)),
    };
  }, [draft, preview]);

  const invalidExpenseIds = useMemo(
    () => new Set(draft.expenses.filter((e) => !e.concept.trim() || parseAmountInput(texts[e.id] ?? '') === null).map((e) => e.id)),
    [draft.expenses, texts],
  );

  // ── Guardar / cambiar de mes ───────────────────────────────
  const load = (sheet: BillingSheetDto, from: SheetOriginDto) => {
    const d = toDraft(sheet);
    setDraft(d);
    setOrigin(from);
    setSaved(from === 'saved' ? snapshot(d) : '');
    setTexts(amountTexts(d));
    setSelected(new Set());
  };

  const save = useCallback(async () => {
    if (invalidExpenseIds.size > 0) {
      setError('Complete el concepto y el monto de cada gasto marcado en rojo');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const clean: Draft = {
        ...draft,
        unitNotes: Object.fromEntries(Object.entries(draft.unitNotes).filter(([, n]) => n.trim())),
      };
      const stored = await api.saveSheet(periodRef.current, clean);
      load(stored, 'saved');
      setSavedMessage('Relación de gastos guardada. Ya puede emitir los recibos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [api, draft, invalidExpenseIds]);

  const discard = useCallback(async () => {
    setLoading(true);
    try {
      const { sheet, origin: from } = await api.getSheet(periodRef.current);
      load(sheet, from);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const changePeriod = useCallback(
    async (next: PeriodDto) => {
      if (dirty && !window.confirm('Tiene cambios sin guardar en este mes. ¿Cambiar de mes y descartarlos?')) return;
      periodRef.current = next;
      setPeriod(next);
      setLoading(true);
      setError(null);
      setSavedMessage(null);
      try {
        const { sheet, origin: from } = await api.getSheet(next);
        if (periodRef.current === next) load(sheet, from);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el mes');
      } finally {
        setLoading(false);
      }
    },
    [api, dirty],
  );

  return {
    period,
    changePeriod,
    draft,
    origin,
    texts,
    dirty,
    loading,
    saving,
    error,
    savedMessage,
    preview,
    totals,
    invalidExpenseIds,
    selected,
    toggleSelected,
    selectAll,
    selectOnly,
    clearSelection,
    setReserveFundPercent,
    setDueDate,
    setGeneralNote,
    addExpense,
    updateExpense,
    setExpenseAmount,
    removeExpense,
    addChargeToUnits,
    removeCharge,
    toggleChargeRecurring,
    setExpenseOverride,
    removeChargesByConcept,
    setUnitNote,
    setNoteForUnits,
    save,
    discard,
  };
}

export type BillingSheetState = ReturnType<typeof useBillingSheet>;
export type { Distribution, ExpenseKind };

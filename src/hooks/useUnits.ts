import { useCallback, useMemo, useState } from 'react';
import { createAdminInvoicesApi } from '@/services/api/adminInvoicesApi';
import { aliquotTotal, equalAliquots } from '@/utils/billingCalculator';
import { resolveAliquots, summarizeScheme, validateScheme, type AliquotMode, type AliquotScheme } from '@/utils/aliquotScheme';
import type { UnitDto } from '@/types/dto';

interface Options {
  condominiumSlug: string;
  initialUnits: UnitDto[];
  initialScheme: AliquotScheme;
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000).replace('.', ',');
const parseNumber = (t: string, max: number): number | null => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

export function useUnits({ condominiumSlug, initialUnits, initialScheme }: Options) {
  const api = useMemo(() => createAdminInvoicesApi(condominiumSlug), [condominiumSlug]);
  const [saved, setSaved] = useState({ units: initialUnits, scheme: initialScheme });
  const [units, setUnits] = useState(initialUnits);
  const [scheme, setScheme] = useState(initialScheme);
  const [aliquotTexts, setAliquotTexts] = useState<Record<string, string>>(() => Object.fromEntries(initialUnits.map((u) => [u.id, fmt(u.aliquot)])));
  const [valueTexts, setValueTexts] = useState<Record<string, string>>(() => Object.fromEntries(initialScheme.categories.map((c) => [c.id, fmt(c.value)])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const touched = () => {
    setSavedMessage(null);
    setError(null);
  };

  // ── Alícuotas resultantes (mismo cálculo que hará el servidor al guardar) ──
  const aliquots = useMemo(
    () => resolveAliquots(units.map((u) => ({ id: u.id, aliquot: u.aliquot, categoryId: u.aliquotCategoryId })), scheme),
    [units, scheme],
  );
  const total = aliquotTotal([...aliquots.values()]);
  const summary = useMemo(
    () => summarizeScheme(units.map((u) => ({ id: u.id, aliquot: u.aliquot, categoryId: u.aliquotCategoryId })), scheme, aliquots),
    [units, scheme, aliquots],
  );
  const schemeError = validateScheme(scheme);
  const isTyped = (u: UnitDto) => !!u.aliquotCategoryId && scheme.categories.some((c) => c.id === u.aliquotCategoryId);

  // ── Tipos de alícuota ──────────────────────────────────────
  const addCategory = () => {
    const id = crypto.randomUUID();
    // Empieza vacío: con un valor inicial, al escribir "6" encima quedaría "16".
    setScheme((s) => ({ ...s, categories: [...s.categories, { id, name: '', value: 0 }] }));
    setValueTexts((t) => ({ ...t, [id]: '' }));
    touched();
  };
  const renameCategory = (id: string, name: string) => {
    setScheme((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));
    touched();
  };
  const setCategoryValue = (id: string, text: string) => {
    setValueTexts((t) => ({ ...t, [id]: text }));
    const n = parseNumber(text, 100000) ?? 0; // vacío o inválido = 0 → el aviso pide completarlo
    setScheme((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, value: n } : c)) }));
    touched();
  };
  const removeCategory = (id: string) => {
    // Las unidades de ese tipo conservan su alícuota actual como personalizada.
    setUnits((list) => list.map((u) => (u.aliquotCategoryId === id ? { ...u, aliquot: aliquots.get(u.id) ?? u.aliquot, aliquotCategoryId: null } : u)));
    setAliquotTexts((t) => ({ ...t, ...Object.fromEntries(units.filter((u) => u.aliquotCategoryId === id).map((u) => [u.id, fmt(aliquots.get(u.id) ?? u.aliquot)])) }));
    setScheme((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) }));
    touched();
  };
  const setMode = (mode: AliquotMode) => {
    setScheme((s) => ({ ...s, mode }));
    touched();
  };

  /** Asigna un tipo (o "personalizada" con null) a una o varias unidades. */
  const assignCategory = (ids: string[], categoryId: string | null) => {
    const set = new Set(ids);
    setUnits((list) =>
      list.map((u) => {
        if (!set.has(u.id)) return u;
        // Al pasar a "personalizada" se parte de la alícuota que tenía con su tipo.
        return categoryId === null ? { ...u, aliquot: aliquots.get(u.id) ?? u.aliquot, aliquotCategoryId: null } : { ...u, aliquotCategoryId: categoryId };
      }),
    );
    if (categoryId === null) setAliquotTexts((t) => ({ ...t, ...Object.fromEntries(ids.map((id) => [id, fmt(aliquots.get(id) ?? 0)])) }));
    touched();
  };

  // ── Alícuota manual de cada unidad ─────────────────────────
  const setAliquotText = (id: string, text: string) => {
    setAliquotTexts((t) => ({ ...t, [id]: text }));
    const n = parseNumber(text, 100);
    if (n !== null) setUnits((list) => list.map((u) => (u.id === id ? { ...u, aliquot: n } : u)));
    touched();
  };
  /** Masivo: 100 % en partes iguales (quita los tipos: todas quedan personalizadas). */
  const splitEqually = () => {
    const values = equalAliquots(units.length);
    setUnits((list) => list.map((u, i) => ({ ...u, aliquot: values[i], aliquotCategoryId: null })));
    setAliquotTexts(Object.fromEntries(units.map((u, i) => [u.id, fmt(values[i])])));
    touched();
  };

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAllSelected = (all: boolean) => setSelected(all ? new Set(units.map((u) => u.id)) : new Set());

  // ── Guardar ────────────────────────────────────────────────
  const invalidIds = useMemo(
    () => new Set(units.filter((u) => !isTyped(u) && parseNumber(aliquotTexts[u.id] ?? '', 100) === null).map((u) => u.id)),
    [units, aliquotTexts, scheme],
  );
  const changedUnits = useMemo(() => {
    const before = new Map(saved.units.map((u) => [u.id, u]));
    return units.filter((u) => JSON.stringify(u) !== JSON.stringify(before.get(u.id)));
  }, [units, saved.units]);
  const dirty = changedUnits.length > 0 || JSON.stringify(scheme) !== JSON.stringify(saved.scheme);

  const save = useCallback(async () => {
    if (schemeError) return setError(schemeError);
    if (invalidIds.size > 0) return setError('Corrija las alícuotas marcadas en rojo (números entre 0 y 100)');
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveUnits(
        changedUnits.map(({ id, aliquot, aliquotCategoryId }) => ({ id, aliquot, aliquotCategoryId })),
        scheme,
      );
      setSaved({ units: result.units, scheme: result.aliquotScheme });
      setUnits(result.units);
      setScheme(result.aliquotScheme);
      setAliquotTexts(Object.fromEntries(result.units.map((u) => [u.id, fmt(u.aliquot)])));
      setValueTexts(Object.fromEntries(result.aliquotScheme.categories.map((c) => [c.id, fmt(c.value)])));
      setSavedMessage('Unidades y alícuotas guardadas. Los próximos recibos ya usan estas alícuotas.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [api, changedUnits, invalidIds, scheme, schemeError]);

  const discard = () => {
    setUnits(saved.units);
    setScheme(saved.scheme);
    setAliquotTexts(Object.fromEntries(saved.units.map((u) => [u.id, fmt(u.aliquot)])));
    setValueTexts(Object.fromEntries(saved.scheme.categories.map((c) => [c.id, fmt(c.value)])));
    touched();
  };

  return {
    units,
    scheme,
    aliquots,
    total,
    summary,
    schemeError,
    isTyped,
    aliquotTexts,
    valueTexts,
    invalidIds,
    dirty,
    saving,
    error,
    savedMessage,
    selected,
    toggleSelected,
    setAllSelected,
    addCategory,
    renameCategory,
    setCategoryValue,
    removeCategory,
    setMode,
    assignCategory,
    setAliquotText,
    splitEqually,
    save,
    discard,
  };
}

export type UnitsState = ReturnType<typeof useUnits>;

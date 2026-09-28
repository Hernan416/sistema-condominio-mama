import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { TextInput } from '@/components/ui/TextInput';
import type { BuildingExpense, ExpenseOverride } from '@/types/billing';
import { parseAmountInput } from '@/utils/amountInput';
import { UNIT_CHARGE_SUGGESTIONS } from '@/utils/expenseCatalog';

interface Props {
  units: { id: string; number: string; aliquotCategoryId: string | null }[];
  /** Tipos de alícuota, para seleccionar de un clic "todas las casas grandes". */
  categories: { id: string; name: string }[];
  selected: Set<string>;
  expenses: BuildingExpense[];
  disabled: boolean;
  onToggle: (houseId: string) => void;
  onSelectOnly: (houseIds: string[]) => void;
  onAddCharge: (concept: string, amount: number, credit: boolean, recurring: boolean) => void;
  onAdjustExpense: (expenseId: string, override: ExpenseOverride | null) => void;
  onSetNote: (note: string) => void;
}

const houses = (n: number) => `${n} ${n === 1 ? 'casa' : 'casas'}`;

/**
 * Acciones para varias casas a la vez. La selección se hace aquí mismo (o marcando la tabla
 * de abajo: es la misma), y los controles siempre están disponibles; solo "Aplicar" espera
 * a que haya casas elegidas.
 */
export function MassActionsPanel({ units, categories, selected, expenses, disabled, onToggle, onSelectOnly, onAddCharge, onAdjustExpense, onSetNote }: Props) {
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'charge' | 'credit'>('charge');
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState('');
  const [expenseId, setExpenseId] = useState('');
  const [mode, setMode] = useState<'split' | 'fixed' | 'exempt'>('fixed');
  const [fixed, setFixed] = useState('');

  const count = selected.size;
  const parsed = parseAmountInput(amount);
  const fixedValue = parseAmountInput(fixed);
  const chargeReady = concept.trim().length > 0 && parsed !== null && parsed > 0;
  const adjustReady = !!expenseId && (mode !== 'fixed' || fixedValue !== null);
  const needHouses = count === 0 ? 'Elija al menos una casa arriba' : null;

  const quick = [
    { label: 'Todas', ids: units.map((u) => u.id) },
    ...categories
      .map((c) => ({ label: c.name || 'Sin nombre', ids: units.filter((u) => u.aliquotCategoryId === c.id).map((u) => u.id) }))
      .filter((q) => q.ids.length > 0),
  ];

  return (
    <section aria-label="Acciones masivas" className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-accent-tint p-5 ring-1 ring-inset ring-accent/20">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-accent-strong">Aplicar a varias casas</h2>
          <p className="text-sm font-bold text-accent-strong" aria-live="polite">
            {count === 0 ? 'Ninguna casa elegida' : `${houses(count)} de ${units.length}`}
          </p>
        </div>

        {/* 1. ¿A qué casas? */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">1. Elija las casas:</span>
          {quick.map((q) => (
            <ActionButton key={q.label} size="sm" variant="secondary" disabled={disabled} onClick={() => onSelectOnly(q.ids)}>
              {q.label} ({q.ids.length})
            </ActionButton>
          ))}
          {count > 0 && (
            <ActionButton size="sm" variant="ghost" disabled={disabled} onClick={() => onSelectOnly([])}>
              Ninguna
            </ActionButton>
          )}
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Casas">
          {units.map((u) => {
            const on = selected.has(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onToggle(u.id)}
                  className={`tabular inline-flex h-10 min-w-11 cursor-pointer items-center justify-center rounded-xl px-2 text-sm font-bold transition-colors ${
                    on ? 'bg-accent text-on-accent shadow-[var(--shadow-button)]' : 'bg-surface text-ink ring-1 ring-inset ring-line hover:ring-line-strong'
                  }`}
                >
                  {u.number}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <datalist id="unit-charge-suggestions">{UNIT_CHARGE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>

      {/* 2. ¿Qué aplicar? — siempre disponible */}
      <p className="text-sm font-bold text-ink">2. Elija qué aplicarles:</p>
      <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-sm font-bold">Cargo o abono propio</p>
          <div className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
            <InlineSelect aria-label="Tipo de movimiento" value={type} options={[{ value: 'charge', label: 'Cargo' }, { value: 'credit', label: 'Abono' }]} onValueChange={setType} />
            <TextInput aria-label="Concepto" list="unit-charge-suggestions" placeholder="Concepto" value={concept} maxLength={120} onValueChange={setConcept} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MoneyInput aria-label="Monto en USD" className="w-32" placeholder="0,00" value={amount} onValueChange={setAmount} />
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Repetir cada mes
            </label>
          </div>
          <ActionButton
            size="sm"
            disabled={!chargeReady || count === 0}
            title={needHouses ?? undefined}
            onClick={() => {
              onAddCharge(concept, parsed!, type === 'credit', recurring);
              setConcept('');
              setAmount('');
              setRecurring(false);
            }}
          >
            {count === 0 ? 'Elija casas primero' : `${type === 'credit' ? 'Abonar' : 'Cargar'} a ${houses(count)}`}
          </ActionButton>
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-sm font-bold">Cambiar cómo pagan un concepto</p>
          <InlineSelect
            aria-label="Concepto del condominio"
            value={expenseId}
            options={[{ value: '', label: expenses.length ? 'Elija un concepto…' : 'Agregue gastos arriba primero' }, ...expenses.map((e) => ({ value: e.id, label: e.concept || 'Sin concepto' }))]}
            onValueChange={setExpenseId}
          />
          <div className="flex items-center gap-2">
            <InlineSelect
              aria-label="Cómo lo pagan"
              className="flex-1"
              value={mode}
              options={[{ value: 'fixed', label: 'Monto fijo' }, { value: 'exempt', label: 'No aplica' }, { value: 'split', label: 'Según reparto' }]}
              onValueChange={setMode}
            />
            {mode === 'fixed' && <MoneyInput aria-label="Monto fijo en USD" className="w-32" placeholder="0,00" value={fixed} onValueChange={setFixed} />}
          </div>
          <ActionButton
            size="sm"
            variant="secondary"
            disabled={!adjustReady || count === 0}
            title={needHouses ?? undefined}
            onClick={() => onAdjustExpense(expenseId, mode === 'split' ? null : mode === 'exempt' ? { mode: 'exempt' } : { mode: 'fixed', amount: fixedValue! })}
          >
            {count === 0 ? 'Elija casas primero' : `Aplicar a ${houses(count)}`}
          </ActionButton>
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 ring-1 ring-line">
          <p className="text-sm font-bold">Nota personalizada en el recibo</p>
          <TextInput aria-label="Nota" placeholder="Ej.: Recuerde actualizar su número de teléfono" value={note} maxLength={300} onValueChange={setNote} />
          <ActionButton
            size="sm"
            variant="secondary"
            disabled={count === 0}
            title={needHouses ?? undefined}
            onClick={() => {
              onSetNote(note.trim());
              setNote('');
            }}
          >
            {count === 0 ? 'Elija casas primero' : `${note.trim() ? 'Poner nota' : 'Borrar nota'} en ${houses(count)}`}
          </ActionButton>
        </div>
      </fieldset>
    </section>
  );
}

import { ActionButton } from '@/components/ui/ActionButton';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { TextInput } from '@/components/ui/TextInput';
import type { BuildingExpense, Distribution, ExpenseKind } from '@/types/billing';
import { EXPENSE_SUGGESTIONS, INCOME_SUGGESTIONS } from '@/utils/expenseCatalog';
import { formatUsd } from '@/utils/currency';

interface Totals {
  ordinary: number;
  extraordinary: number;
  income: number;
  reserve: number;
}

interface Props {
  expenses: BuildingExpense[];
  texts: Record<string, string>;
  invalidIds: Set<string>;
  totals: Totals;
  reserveFundPercent: number;
  disabled: boolean;
  onAdd: (kind: ExpenseKind) => void;
  onChange: (id: string, patch: Partial<Pick<BuildingExpense, 'concept' | 'kind' | 'distribution'>>) => void;
  onAmountChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}

const KIND_OPTIONS: { value: ExpenseKind; label: string }[] = [
  { value: 'ordinary', label: 'Gasto común' },
  { value: 'extraordinary', label: 'Cuota extraordinaria' },
  { value: 'income', label: 'Ingreso (descuenta)' },
];
const DISTRIBUTION_OPTIONS: { value: Distribution; label: string }[] = [
  { value: 'aliquot', label: 'Por alícuota' },
  { value: 'equal', label: 'Partes iguales' },
];

export function ExpenseTable({ expenses, texts, invalidIds, totals, reserveFundPercent, disabled, onAdd, onChange, onAmountChange, onRemove }: Props) {
  return (
    <section aria-labelledby="expenses-title" className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 id="expenses-title" className="font-display text-2xl font-semibold">Gastos del condominio</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
            Iguales para todas las unidades: cada una paga su parte según su alícuota (o en partes iguales, si así lo acordó la asamblea).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton size="sm" variant="secondary" disabled={disabled} onClick={() => onAdd('ordinary')}>+ Gasto común</ActionButton>
          <ActionButton size="sm" variant="secondary" disabled={disabled} onClick={() => onAdd('extraordinary')}>+ Cuota extraordinaria</ActionButton>
          <ActionButton size="sm" variant="secondary" disabled={disabled} onClick={() => onAdd('income')}>+ Ingreso</ActionButton>
        </div>
      </div>

      <datalist id="expense-suggestions">{EXPENSE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="income-suggestions">{INCOME_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>

      {expenses.length === 0 ? (
        <p className="p-8 text-center text-base text-ink-muted">Aún no hay gastos este mes. Agregue el primero con los botones de arriba.</p>
      ) : (
        <ul className="divide-y divide-line">
          {expenses.map((e) => {
            const invalid = invalidIds.has(e.id);
            return (
              <li key={e.id} className="grid items-center gap-2 px-5 py-3 md:grid-cols-[minmax(0,1fr)_12rem_10rem_9.5rem_auto]">
                <TextInput
                  aria-label="Concepto"
                  list={e.kind === 'income' ? 'income-suggestions' : 'expense-suggestions'}
                  placeholder={e.kind === 'income' ? 'Ej.: Alquiler del salón' : 'Ej.: Vigilancia privada'}
                  value={e.concept}
                  maxLength={120}
                  invalid={invalid && !e.concept.trim()}
                  disabled={disabled}
                  onValueChange={(concept) => onChange(e.id, { concept })}
                />
                <InlineSelect aria-label="Tipo" value={e.kind} options={KIND_OPTIONS} disabled={disabled} onValueChange={(kind) => onChange(e.id, { kind })} />
                <InlineSelect aria-label="Reparto" value={e.distribution} options={DISTRIBUTION_OPTIONS} disabled={disabled} onValueChange={(distribution) => onChange(e.id, { distribution })} />
                <MoneyInput
                  aria-label="Monto total en USD"
                  value={texts[e.id] ?? ''}
                  placeholder="0,00"
                  highlighted={invalid}
                  disabled={disabled}
                  onValueChange={(t) => onAmountChange(e.id, t)}
                />
                <ActionButton size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(e.id)} aria-label={`Eliminar ${e.concept || 'gasto'}`}>
                  Quitar
                </ActionButton>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-[var(--radius-card)] border-t border-line bg-line text-sm sm:grid-cols-4">
        {[
          ['Gastos comunes', formatUsd(totals.ordinary)],
          [`Fondo de reserva (${String(reserveFundPercent).replace('.', ',')} %)`, formatUsd(totals.reserve)],
          ['Cuotas extraordinarias', formatUsd(totals.extraordinary)],
          ['Ingresos', totals.income > 0 ? `− ${formatUsd(totals.income)}` : formatUsd(0)],
        ].map(([label, value]) => (
          <div key={label} className="bg-canvas/60 px-5 py-3">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="tabular text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

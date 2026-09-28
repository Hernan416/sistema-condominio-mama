// Conceptos del condominio para UNA casa: pagar según el reparto, un monto fijo, o no aplica.
import { useState } from 'react';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { MoneyInput } from '@/components/ui/MoneyInput';
import type { BuildingExpense, ExpenseOverride, InvoiceBreakdown } from '@/types/billing';
import { formatUsd } from '@/utils/currency';
import { formatAmountInput, parseAmountInput } from '@/utils/amountInput';

type Mode = 'split' | 'fixed' | 'exempt';

interface Props {
  houseId: string;
  expenses: BuildingExpense[];
  breakdown: InvoiceBreakdown | undefined;
  disabled: boolean;
  onChange: (expenseId: string, override: ExpenseOverride | null) => void;
}

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'split', label: 'Según reparto' },
  { value: 'fixed', label: 'Monto fijo' },
  { value: 'exempt', label: 'No aplica' },
];

export function UnitExpenseAdjustments({ houseId, expenses, breakdown, disabled, onChange }: Props) {
  if (expenses.length === 0) return null;
  return (
    <section aria-label="Conceptos del condominio para esta casa" className="flex flex-col gap-2">
      <h4 className="text-sm font-bold">Conceptos del condominio para esta casa</h4>
      <p className="text-xs text-ink-muted">
        "Monto fijo": esta casa paga ese monto y el resto se reparte entre las demás. "No aplica": no paga este concepto y su parte la absorben las demás.
      </p>
      <ul className="divide-y divide-line rounded-xl bg-surface ring-1 ring-line">
        {expenses.map((e) => (
          <AdjustmentRow key={e.id} expense={e} houseId={houseId} breakdown={breakdown} disabled={disabled} onChange={onChange} />
        ))}
      </ul>
    </section>
  );
}

function AdjustmentRow({ expense: e, houseId, breakdown, disabled, onChange }: { expense: BuildingExpense; houseId: string; breakdown: InvoiceBreakdown | undefined; disabled: boolean; onChange: Props['onChange'] }) {
  const override = e.overrides?.[houseId];
  const mode: Mode = override?.mode === 'fixed' ? 'fixed' : override?.mode === 'exempt' ? 'exempt' : 'split';
  const [text, setText] = useState(override?.mode === 'fixed' ? formatAmountInput(override.amount) : '');
  const line = breakdown?.lines.find((l) => l.concept === e.concept && l.kind === (e.kind === 'ordinary' ? 'ordinary' : e.kind));
  const tooBig = override?.mode === 'fixed' && override.amount > e.amount;

  return (
    <li className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(14rem,1fr)_10.5rem_8.5rem_6.5rem]">
      <span className="min-w-0 text-sm">
        <span className="block truncate font-bold text-ink">{e.concept || 'Sin concepto'}</span>
        <span className="whitespace-nowrap text-xs text-ink-muted">Total del condominio {formatUsd(e.amount)}{e.kind === 'income' ? ' (ingreso)' : e.kind === 'extraordinary' ? ' (extraordinaria)' : ''}</span>
      </span>
      <InlineSelect
        aria-label={`Cómo paga ${e.concept}`}
        value={mode}
        options={MODE_OPTIONS}
        disabled={disabled}
        onValueChange={(m) => {
          if (m === 'split') onChange(e.id, null);
          else if (m === 'exempt') onChange(e.id, { mode: 'exempt' });
          else onChange(e.id, { mode: 'fixed', amount: parseAmountInput(text) ?? 0 });
        }}
      />
      {mode === 'fixed' ? (
        <MoneyInput
          aria-label={`Monto fijo de ${e.concept}`}
          value={text}
          placeholder="0,00"
          highlighted={tooBig}
          disabled={disabled}
          onValueChange={(t) => {
            setText(t);
            onChange(e.id, { mode: 'fixed', amount: parseAmountInput(t) ?? 0 });
          }}
        />
      ) : (
        <span />
      )}
      <span className={`tabular text-right text-sm font-bold ${mode === 'exempt' ? 'text-ink-muted line-through' : 'text-ink'}`}>
        {mode === 'exempt' ? formatUsd(0) : line ? formatUsd(Math.abs(line.unitAmount)) : '—'}
      </span>
      {tooBig && <p className="text-xs font-bold text-danger sm:col-span-4">El monto fijo supera el total del gasto.</p>}
    </li>
  );
}

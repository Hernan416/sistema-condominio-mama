import { Fragment, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { TextInput } from '@/components/ui/TextInput';
import { BreakdownList } from '@/components/domain/BreakdownList';
import { UnitExpenseAdjustments } from '@/components/domain/UnitExpenseAdjustments';
import type { BuildingExpense, ExpenseOverride, InvoiceBreakdown, UnitCharge } from '@/types/billing';
import type { UnitDto } from '@/types/dto';
import { formatUsd } from '@/utils/currency';
import { formatPercent } from '@/utils/billingCalculator';
import { parseAmountInput } from '@/utils/amountInput';

interface Props {
  units: UnitDto[];
  expenses: BuildingExpense[];
  charges: UnitCharge[];
  notes: Record<string, string>;
  preview: Map<string, InvoiceBreakdown>;
  selected: Set<string>;
  disabled: boolean;
  onToggle: (houseId: string) => void;
  onAddCharge: (houseId: string, concept: string, amount: number, credit: boolean, recurring: boolean) => void;
  onRemoveCharge: (chargeId: string) => void;
  onToggleRecurring: (chargeId: string) => void;
  onSetOverride: (expenseId: string, houseId: string, override: ExpenseOverride | null) => void;
  onNoteChange: (houseId: string, note: string) => void;
}

const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-ink-muted';

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={label} className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-black/10">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );
}

/** Una fila por unidad: su recibo personalizado (conceptos ajustados, cargos, abonos y nota) con el total en vivo. */
export function UnitChargesTable({ units, expenses, charges, notes, preview, selected, disabled, onToggle, onAddCharge, onRemoveCharge, onToggleRecurring, onSetOverride, onNoteChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const allSelected = units.length > 0 && units.every((u) => selected.has(u.id));

  return (
    <section aria-labelledby="units-title" className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line">
      <div className="border-b border-line p-5">
        <h2 id="units-title" className="font-display text-2xl font-semibold">Recibo de cada unidad</h2>
        <p className="mt-1 max-w-[75ch] text-sm text-ink-muted">
          Abra una casa para personalizar su recibo: cambiar cómo paga un concepto del condominio (monto fijo o no aplica), agregar cargos o abonos propios y ver su recibo completo.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-base">
          <thead className="bg-canvas/60">
            <tr className="border-b border-line">
              <th scope="col" className={`${th} w-12`}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas"
                  className="size-5 cursor-pointer accent-[var(--color-accent)]"
                  checked={allSelected}
                  disabled={disabled}
                  onChange={() => units.forEach((u) => (allSelected ? selected.has(u.id) : !selected.has(u.id)) && onToggle(u.id))}
                />
              </th>
              <th scope="col" className={th}>Unidad</th>
              <th scope="col" className={th}>Personalizado</th>
              <th scope="col" className={th}>Nota en el recibo</th>
              <th scope="col" className={`${th} text-right`}>Total del mes</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const own = charges.filter((c) => c.houseId === u.id);
              const adjusted = expenses.filter((e) => e.overrides?.[u.id]);
              const b = preview.get(u.id);
              const isOpen = open === u.id;
              return (
                <Fragment key={u.id}>
                  <tr className={`border-b border-line align-top ${selected.has(u.id) ? 'bg-accent-tint/50' : 'hover:bg-canvas/50'}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Seleccionar casa ${u.number}`} className="mt-2.5 size-5 cursor-pointer accent-[var(--color-accent)]" checked={selected.has(u.id)} disabled={disabled} onChange={() => onToggle(u.id)} />
                    </td>
                    <th scope="row" className="px-4 py-3 text-left">
                      <button type="button" onClick={() => setOpen(isOpen ? null : u.id)} aria-expanded={isOpen} className="group flex cursor-pointer items-center gap-3 text-left">
                        <span className="font-display tabular inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-sunken px-2 text-lg font-semibold">{u.number}</span>
                        <span className="flex flex-col">
                          <span className="text-sm font-bold text-ink">{u.ownerName ?? 'Sin propietario'}</span>
                          <span className="whitespace-nowrap text-xs font-normal text-ink-muted">
                            Alícuota {formatPercent(u.aliquot)} · <span className="font-bold text-accent group-hover:underline">{isOpen ? 'cerrar' : 'personalizar'}</span>
                          </span>
                        </span>
                      </button>
                    </th>
                    <td className="px-4 py-3">
                      <ul className="flex flex-wrap gap-1.5">
                        {adjusted.map((e) => {
                          const o = e.overrides![u.id];
                          return (
                            <li key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-sunken py-1 pl-3 pr-1 text-sm font-bold text-ink ring-1 ring-inset ring-line">
                              <span className="max-w-40 truncate">{e.concept}</span>
                              <span className="whitespace-nowrap text-ink-muted">{o.mode === 'exempt' ? 'no aplica' : `fijo ${formatUsd(o.amount)}`}</span>
                              <RemoveButton label={`Volver a repartir ${e.concept}`} disabled={disabled} onClick={() => onSetOverride(e.id, u.id, null)} />
                            </li>
                          );
                        })}
                        {own.map((c) => (
                          <li key={c.id} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1 text-sm font-bold ${c.amount < 0 ? 'bg-accent-tint text-accent-strong' : 'bg-warning-tint text-warning'}`}>
                            <span className="max-w-40 truncate">{c.concept}</span>
                            <span className="tabular whitespace-nowrap">{c.amount < 0 ? `− ${formatUsd(-c.amount)}` : formatUsd(c.amount)}</span>
                            {c.recurring && <span className="rounded-full bg-surface/70 px-1.5 text-xs">cada mes</span>}
                            <RemoveButton label={`Quitar ${c.concept}`} disabled={disabled} onClick={() => onRemoveCharge(c.id)} />
                          </li>
                        ))}
                        {own.length === 0 && adjusted.length === 0 && <li className="py-1 text-sm text-ink-muted">Igual que las demás</li>}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <TextInput aria-label={`Nota para la casa ${u.number}`} placeholder="Sin nota" value={notes[u.id] ?? ''} maxLength={300} disabled={disabled} onValueChange={(n) => onNoteChange(u.id, n)} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 pt-5 text-right text-lg font-bold">{b ? formatUsd(b.monthTotal) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line bg-canvas/30">
                      <td />
                      <td colSpan={4} className="px-4 py-5">
                        <div className="flex max-w-4xl flex-col gap-6">
                          <div className="flex flex-col gap-6">
                            <UnitExpenseAdjustments houseId={u.id} expenses={expenses} breakdown={b} disabled={disabled} onChange={(expenseId, o) => onSetOverride(expenseId, u.id, o)} />
                            <section aria-label="Cargos y abonos propios" className="flex flex-col gap-2">
                              <h4 className="text-sm font-bold">Cargos o abonos propios de esta casa</h4>
                              {own.length > 0 && (
                                <ul className="flex flex-col gap-1">
                                  {own.map((c) => (
                                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm ring-1 ring-line">
                                      <span className="font-bold">{c.concept}</span>
                                      <span className="flex items-center gap-3">
                                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                                          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={!!c.recurring} disabled={disabled} onChange={() => onToggleRecurring(c.id)} />
                                          Repetir cada mes
                                        </label>
                                        <span className="tabular font-bold">{c.amount < 0 ? `− ${formatUsd(-c.amount)}` : formatUsd(c.amount)}</span>
                                        <RemoveButton label={`Quitar ${c.concept}`} disabled={disabled} onClick={() => onRemoveCharge(c.id)} />
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <SingleChargeForm disabled={disabled} onAdd={(concept, amount, credit, recurring) => onAddCharge(u.id, concept, amount, credit, recurring)} />
                            </section>
                          </div>
                          <div className="border-t border-line pt-5">
                            <h4 className="mb-2 text-sm font-bold">Así queda su recibo</h4>
                            {b && <BreakdownList breakdown={b} />}
                            <p className="mt-3 text-xs text-ink-muted">La deuda de meses anteriores y los intereses se agregan al emitir el recibo.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SingleChargeForm({ disabled, onAdd }: { disabled: boolean; onAdd: (concept: string, amount: number, credit: boolean, recurring: boolean) => void }) {
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'charge' | 'credit'>('charge');
  const [recurring, setRecurring] = useState(false);
  const parsed = parseAmountInput(amount);
  const valid = concept.trim().length > 0 && parsed !== null && parsed > 0;
  return (
    <fieldset disabled={disabled} className="flex flex-wrap items-center gap-2">
      <InlineSelect aria-label="Tipo de movimiento" className="w-28" value={type} options={[{ value: 'charge', label: 'Cargo' }, { value: 'credit', label: 'Abono' }]} onValueChange={setType} />
      <TextInput aria-label="Concepto" list="unit-charge-suggestions" className="!w-60 flex-1" placeholder="Ej.: Puesto de estacionamiento adicional" value={concept} maxLength={120} onValueChange={setConcept} />
      <MoneyInput aria-label="Monto en USD" className="w-28" placeholder="0,00" value={amount} onValueChange={setAmount} />
      <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted">
        <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        Cada mes
      </label>
      <ActionButton
        size="sm"
        disabled={!valid}
        onClick={() => {
          onAdd(concept, parsed!, type === 'credit', recurring);
          setConcept('');
          setAmount('');
          setRecurring(false);
        }}
      >
        Agregar
      </ActionButton>
    </fieldset>
  );
}

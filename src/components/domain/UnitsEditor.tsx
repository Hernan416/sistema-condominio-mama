// Contenedor de "Unidades y alícuotas": la lógica vive en useUnits.
import { useUnits } from '@/hooks/useUnits';
import { AliquotSchemePanel } from '@/components/domain/AliquotSchemePanel';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { SaveBar } from '@/components/ui/SaveBar';
import { TextInput } from '@/components/ui/TextInput';
import { formatPercent } from '@/utils/billingCalculator';
import type { AliquotScheme } from '@/utils/aliquotScheme';
import type { UnitDto } from '@/types/dto';

interface Props {
  condominiumSlug: string;
  initialUnits: UnitDto[];
  initialScheme: AliquotScheme;
}

const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-ink-muted';

export default function UnitsEditor({ condominiumSlug, initialUnits, initialScheme }: Props) {
  const u = useUnits({ condominiumSlug, initialUnits, initialScheme });
  const balanced = Math.abs(u.total - 100) < 0.0001;
  const allSelected = u.units.length > 0 && u.selected.size === u.units.length;
  const typeOptions = [
    ...u.scheme.categories.map((c) => ({ value: c.id, label: c.name.trim() || 'Sin nombre' })),
    { value: '__manual', label: 'Personalizada' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-live="polite"
        className={`flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] p-5 ring-1 ring-inset ${
          balanced ? 'bg-accent-tint ring-accent/20' : 'bg-warning-tint ring-warning/25'
        }`}
      >
        <div>
          <p className={`font-display tabular text-3xl font-semibold ${balanced ? 'text-accent-strong' : 'text-warning'}`}>Suma de alícuotas: {formatPercent(u.total)}</p>
          <p className={`mt-1 text-sm font-bold ${balanced ? 'text-accent-strong' : 'text-warning'}`}>
            {balanced
              ? 'Correcto: las alícuotas suman 100 %.'
              : 'Deben sumar 100 % según el documento de condominio. Mientras tanto, los gastos se reparten en proporción a la suma real.'}
          </p>
        </div>
        {u.summary.some((s) => s.count > 0) && (
          <ul className="flex flex-wrap gap-2">
            {u.summary.filter((s) => s.count > 0).map((s) => (
              <li key={s.category.id} className="rounded-full bg-surface px-3 py-1.5 text-sm ring-1 ring-line">
                <strong>{s.category.name || 'Sin nombre'}</strong>: {s.count} × {formatPercent(s.eachAliquot)} = {formatPercent(s.totalAliquot)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AliquotSchemePanel state={u} />

      <div className="relative overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line">
        <table className="w-full min-w-[640px] text-base">
          <thead className="bg-canvas/60">
            <tr className="border-b border-line">
              <th scope="col" className={`${th} w-12`}>
                <input type="checkbox" aria-label="Seleccionar todas" className="size-5 cursor-pointer accent-[var(--color-accent)]" checked={allSelected} onChange={() => u.setAllSelected(!allSelected)} />
              </th>
              <th scope="col" className={th}>Casa</th>
              <th scope="col" className={th}>Propietario</th>
              <th scope="col" className={`${th} w-56`}>Tipo</th>
              <th scope="col" className={`${th} w-36`}>Alícuota (%)</th>
            </tr>
          </thead>
          <tbody>
            {u.units.map((unit) => {
              const typed = u.isTyped(unit);
              return (
                <tr key={unit.id} className={`border-b border-line last:border-b-0 ${u.selected.has(unit.id) ? 'bg-accent-tint/50' : 'hover:bg-canvas/50'}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Seleccionar casa ${unit.number}`} className="size-5 cursor-pointer accent-[var(--color-accent)]" checked={u.selected.has(unit.id)} onChange={() => u.toggleSelected(unit.id)} />
                  </td>
                  <th scope="row" className="px-4 py-3 text-left">
                    <div className="flex items-center gap-3">
                      <span className="font-display tabular inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-sunken px-2 text-lg font-semibold">{unit.number}</span>
                      <code className="whitespace-nowrap text-sm font-normal text-ink-muted">{unit.username ?? 'sin usuario'}</code>
                    </div>
                  </th>
                  <td className="px-4 py-3 text-ink-muted">{unit.ownerName ?? 'Sin propietario'}</td>
                  <td className="px-4 py-3">
                    <InlineSelect
                      aria-label={`Tipo de alícuota casa ${unit.number}`}
                      value={typed ? unit.aliquotCategoryId! : '__manual'}
                      options={typeOptions}
                      disabled={u.saving}
                      onValueChange={(v) => u.assignCategory([unit.id], v === '__manual' ? null : v)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {typed ? (
                      <p className="tabular flex min-h-11 items-center rounded-xl bg-sunken px-3 font-bold text-ink" title="Calculada según el tipo">
                        {formatPercent(u.aliquots.get(unit.id) ?? 0)}
                      </p>
                    ) : (
                      <TextInput
                        inputMode="decimal"
                        aria-label={`Alícuota casa ${unit.number}`}
                        className="tabular font-bold"
                        value={u.aliquotTexts[unit.id] ?? ''}
                        invalid={u.invalidIds.has(unit.id)}
                        disabled={u.saving}
                        onValueChange={(v) => u.setAliquotText(unit.id, v)}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SaveBar dirty={u.dirty} saving={u.saving} error={u.error} savedMessage={u.savedMessage} onSave={u.save} onDiscard={u.discard} saveLabel="Guardar alícuotas" />
    </div>
  );
}

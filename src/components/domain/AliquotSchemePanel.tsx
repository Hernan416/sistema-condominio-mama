// Ayuda para calcular alícuotas por tipo de unidad ("Casa pequeña", "Casa grande"…).
import { useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { InlineSelect } from '@/components/ui/InlineSelect';
import { TextInput } from '@/components/ui/TextInput';
import type { UnitsState } from '@/hooks/useUnits';
import { formatPercent } from '@/utils/billingCalculator';

interface Props {
  state: UnitsState;
}

export function AliquotSchemePanel({ state: u }: Props) {
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const proportional = u.scheme.mode === 'proportional';
  const options = [
    { value: '', label: 'Elija un tipo…' },
    ...u.scheme.categories.map((c) => ({ value: c.id, label: c.name.trim() || 'Sin nombre' })),
    { value: '__manual', label: 'Personalizada (a mano)' },
  ];

  return (
    <section aria-labelledby="scheme-title" className="rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-5">
        <div>
          <h2 id="scheme-title" className="font-display text-2xl font-semibold">Tipos de alícuota</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-muted">
            Cree un tipo por cada clase de unidad (por ejemplo "Casa pequeña" y "Casa grande"), asígnelo a las casas y el sistema calcula la alícuota de cada una.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-ink-muted">Los valores son…</span>
          <InlineSelect
            aria-label="Cómo se interpretan los valores"
            className="w-72"
            value={u.scheme.mode}
            options={[
              { value: 'proportional', label: 'Proporciones (se ajustan a 100 %)' },
              { value: 'percent', label: 'Porcentajes exactos' },
            ]}
            onValueChange={u.setMode}
          />
        </label>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            {proportional
              ? 'Ejemplo: pequeña = 6 y grande = 8. Una casa grande paga 8/6 de lo que paga una pequeña, y entre todas suman 100 %.'
              : 'Cada casa del tipo toma exactamente ese porcentaje, tal como figura en el documento de condominio.'}
          </p>
          {u.scheme.categories.length === 0 && (
            <p className="rounded-xl border-2 border-dashed border-line p-4 text-sm text-ink-muted">Aún no hay tipos. Agregue el primero.</p>
          )}
          <ul className="flex flex-col gap-2">
            {u.scheme.categories.map((c) => {
              const s = u.summary.find((x) => x.category.id === c.id);
              return (
                <li key={c.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                  <TextInput aria-label="Nombre del tipo" placeholder="Ej.: Casa grande" value={c.name} maxLength={60} invalid={!c.name.trim()} onValueChange={(v) => u.renameCategory(c.id, v)} />
                  <TextInput
                    aria-label={proportional ? `Proporción de ${c.name}` : `Alícuota (%) de ${c.name}`}
                    inputMode="decimal"
                    className="tabular font-bold"
                    placeholder={proportional ? 'Ej.: 6' : 'Ej.: 7,5'}
                    invalid={!(c.value > 0)}
                    value={u.valueTexts[c.id] ?? ''}
                    onValueChange={(v) => u.setCategoryValue(c.id, v)}
                  />
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="tabular whitespace-nowrap text-sm text-ink-muted">
                      {s && s.count > 0 ? `${s.count} × ${formatPercent(s.eachAliquot)}` : 'sin casas'}
                    </span>
                    <ActionButton size="sm" variant="ghost" onClick={() => u.removeCategory(c.id)} aria-label={`Eliminar tipo ${c.name}`}>Quitar</ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
          <div>
            <ActionButton size="sm" variant="secondary" disabled={u.scheme.categories.length >= 20} onClick={u.addCategory}>+ Agregar tipo</ActionButton>
          </div>
          {u.schemeError && u.scheme.categories.length > 0 && <p role="alert" className="text-sm font-bold text-danger">{u.schemeError}</p>}
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-canvas/60 p-4 ring-1 ring-inset ring-line">
          <p className="text-sm font-bold">Asignar a las casas marcadas en la tabla</p>
          <p className="text-sm text-ink-muted">
            {u.selected.size === 0 ? 'Marque casas en la tabla de abajo (o use "Seleccionar todas").' : `${u.selected.size} ${u.selected.size === 1 ? 'casa marcada' : 'casas marcadas'}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <InlineSelect aria-label="Tipo a asignar" className="min-w-56 flex-1" value={bulkCategory} options={options} onValueChange={setBulkCategory} />
            <ActionButton
              disabled={u.selected.size === 0 || !bulkCategory}
              onClick={() => {
                u.assignCategory([...u.selected], bulkCategory === '__manual' ? null : bulkCategory);
                u.setAllSelected(false);
              }}
            >
              Asignar
            </ActionButton>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <ActionButton size="sm" variant="ghost" onClick={() => u.setAllSelected(true)}>Seleccionar todas</ActionButton>
            <ActionButton size="sm" variant="ghost" onClick={u.splitEqually}>Todas iguales (100 % ÷ {u.units.length})</ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

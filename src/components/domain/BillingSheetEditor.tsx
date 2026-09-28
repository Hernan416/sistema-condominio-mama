// Contenedor de la "Relación de gastos" (Paso 1 de los recibos): la lógica vive en useBillingSheet.
// Orden pensado para una usuaria no experta: 1) gastos del mes, 2) datos del recibo, 3) casos
// especiales (opcional, plegado) y, al guardar, el botón al paso siguiente.
import { useBillingSheet } from '@/hooks/useBillingSheet';
import { PeriodPicker } from '@/components/domain/PeriodPicker';
import { SheetSettingsCard } from '@/components/domain/SheetSettingsCard';
import { ExpenseTable } from '@/components/domain/ExpenseTable';
import { MassActionsPanel } from '@/components/domain/MassActionsPanel';
import { UnitChargesTable } from '@/components/domain/UnitChargesTable';
import { DisclosurePanel } from '@/components/ui/DisclosurePanel';
import { SaveBar } from '@/components/ui/SaveBar';
import { StatStrip } from '@/components/ui/StatStrip';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import type { BillingSheetDto, ExchangeRateDto, PeriodDto, SheetOriginDto, UnitDto } from '@/types/dto';

interface Props {
  condominiumSlug: string;
  units: UnitDto[];
  initialPeriod: PeriodDto;
  initialSheet: BillingSheetDto;
  initialOrigin: SheetOriginDto;
  exchangeRate: ExchangeRateDto | null;
  /** Tipos de alícuota (selección rápida "todas las casas grandes"). */
  aliquotCategories: { id: string; name: string }[];
}

export default function BillingSheetEditor(props: Props) {
  const s = useBillingSheet(props);
  const locked = s.loading || s.saving;
  const selectedIds = [...s.selected];

  // Casas con algo propio (cargo, abono, nota o un concepto que pagan distinto).
  const customized = new Set<string>([
    ...s.draft.unitCharges.map((c) => c.houseId),
    ...Object.entries(s.draft.unitNotes).filter(([, n]) => n.trim()).map(([id]) => id),
    ...s.draft.expenses.flatMap((e) => Object.keys(e.overrides ?? {})),
  ]);
  const saved = s.origin === 'saved' && !s.dirty;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodPicker period={s.period} onChange={s.changePeriod} disabled={s.saving} />
        {s.origin !== 'saved' && !s.loading && (
          <p role="status" className="max-w-xl rounded-xl bg-warning-tint px-4 py-3 text-base font-bold text-warning ring-1 ring-inset ring-warning/25">
            {s.origin === 'copied'
              ? 'Copiamos los gastos del último mes para ahorrarle trabajo. Revise los montos y toque «Guardar gastos» al final.'
              : 'Este mes todavía no tiene gastos. Agréguelos y toque «Guardar gastos» al final.'}
          </p>
        )}
      </div>

      <div aria-busy={s.loading} className={`flex flex-col gap-6 transition-opacity ${s.loading ? 'opacity-50' : ''}`}>
        <ExpenseTable
          expenses={s.draft.expenses}
          texts={s.texts}
          invalidIds={s.invalidExpenseIds}
          totals={s.totals}
          reserveFundPercent={s.draft.reserveFundPercent}
          disabled={locked}
          onAdd={s.addExpense}
          onChange={s.updateExpense}
          onAmountChange={s.setExpenseAmount}
          onRemove={s.removeExpense}
        />

        <SheetSettingsCard
          reserveFundPercent={s.draft.reserveFundPercent}
          dueDate={s.draft.dueDate}
          generalNote={s.draft.generalNote}
          disabled={locked}
          onReserveChange={s.setReserveFundPercent}
          onDueDateChange={s.setDueDate}
          onGeneralNoteChange={s.setGeneralNote}
        />

        <DisclosurePanel
          title="Casos especiales (opcional)"
          subtitle="Solo si alguna casa paga distinto: multas, descuentos, una casa que no paga un gasto o una nota para ella."
          badge={customized.size > 0 ? `${customized.size} ${customized.size === 1 ? 'casa' : 'casas'} con cambios` : null}
          defaultOpen={customized.size > 0}
        >
          <MassActionsPanel
            units={props.units}
            categories={props.aliquotCategories}
            selected={s.selected}
            expenses={s.draft.expenses}
            disabled={locked}
            onToggle={s.toggleSelected}
            onSelectOnly={s.selectOnly}
            onAddCharge={(concept, amount, credit, recurring) => s.addChargeToUnits(selectedIds, concept, amount, credit, recurring)}
            onAdjustExpense={(expenseId, override) => s.setExpenseOverride(expenseId, selectedIds, override)}
            onSetNote={(note) => s.setNoteForUnits(selectedIds, note)}
          />

          <UnitChargesTable
            units={props.units}
            expenses={s.draft.expenses}
            charges={s.draft.unitCharges}
            notes={s.draft.unitNotes}
            preview={s.preview}
            selected={s.selected}
            disabled={locked}
            onToggle={s.toggleSelected}
            onAddCharge={(houseId, concept, amount, credit, recurring) => s.addChargeToUnits([houseId], concept, amount, credit, recurring)}
            onRemoveCharge={s.removeCharge}
            onToggleRecurring={s.toggleChargeRecurring}
            onSetOverride={(expenseId, houseId, override) => s.setExpenseOverride(expenseId, [houseId], override)}
            onNoteChange={s.setUnitNote}
          />
        </DisclosurePanel>

        <StatStrip
          items={[
            { label: 'Gastos comunes + fondo', value: formatUsd(s.totals.ordinary + s.totals.reserve) },
            { label: 'Cuotas extraordinarias', value: formatUsd(s.totals.extraordinary) },
            { label: 'Cargos − abonos por casa', value: formatUsd(s.totals.unitCharges) },
            {
              label: 'Total que se va a cobrar',
              value: formatUsd(s.totals.billed),
              tone: 'accent',
              hint: props.exchangeRate ? formatVes(usdToVes(s.totals.billed, props.exchangeRate.usdToVes)) : undefined,
            },
          ]}
        />
      </div>

      <SaveBar
        dirty={s.dirty}
        saving={s.saving}
        error={s.error}
        savedMessage={s.savedMessage ?? (saved ? 'Gastos guardados. Ya puede pasar al paso 2.' : null)}
        onSave={s.save}
        onDiscard={s.origin === 'saved' ? s.discard : undefined}
        saveLabel="Guardar gastos"
        next={saved ? { href: `/admin/${props.condominiumSlug}/facturas?mes=${s.period.month}&anio=${s.period.year}`, label: 'Paso 2: emitir los recibos' } : null}
      />
    </div>
  );
}

// Contenedor de la "Relación de gastos": la lógica vive en useBillingSheet.
import { useBillingSheet } from '@/hooks/useBillingSheet';
import { PeriodPicker } from '@/components/domain/PeriodPicker';
import { SheetSettingsCard } from '@/components/domain/SheetSettingsCard';
import { ExpenseTable } from '@/components/domain/ExpenseTable';
import { MassActionsPanel } from '@/components/domain/MassActionsPanel';
import { UnitChargesTable } from '@/components/domain/UnitChargesTable';
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodPicker period={s.period} onChange={s.changePeriod} disabled={s.saving} />
        {s.origin !== 'saved' && !s.loading && (
          <p role="status" className="max-w-xl rounded-xl bg-warning-tint px-4 py-3 text-sm font-bold text-warning ring-1 ring-inset ring-warning/25">
            {s.origin === 'copied'
              ? 'Propuesta copiada del último mes con gastos. Revise los montos y guarde para poder emitir los recibos.'
              : 'Este mes aún no tiene gastos. Agréguelos y guarde para poder emitir los recibos.'}
          </p>
        )}
      </div>

      <StatStrip
        items={[
          { label: 'Gastos comunes + fondo', value: formatUsd(s.totals.ordinary + s.totals.reserve) },
          { label: 'Extraordinarias', value: formatUsd(s.totals.extraordinary) },
          { label: 'Cargos − abonos individuales', value: formatUsd(s.totals.unitCharges) },
          {
            label: 'Total a facturar',
            value: formatUsd(s.totals.billed),
            tone: 'accent',
            hint: props.exchangeRate ? formatVes(usdToVes(s.totals.billed, props.exchangeRate.usdToVes)) : undefined,
          },
        ]}
      />

      <div aria-busy={s.loading} className={`flex flex-col gap-6 transition-opacity ${s.loading ? 'opacity-50' : ''}`}>
        <SheetSettingsCard
          reserveFundPercent={s.draft.reserveFundPercent}
          dueDate={s.draft.dueDate}
          generalNote={s.draft.generalNote}
          disabled={locked}
          onReserveChange={s.setReserveFundPercent}
          onDueDateChange={s.setDueDate}
          onGeneralNoteChange={s.setGeneralNote}
        />

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
      </div>

      <SaveBar
        dirty={s.dirty}
        saving={s.saving}
        error={s.error}
        savedMessage={s.savedMessage}
        onSave={s.save}
        onDiscard={s.origin === 'saved' ? s.discard : undefined}
        saveLabel="Guardar relación de gastos"
      />
    </div>
  );
}

// Componente contenedor: toda la lógica vive en useInvoiceGeneration; aquí solo se ensambla la vista.
import { useInvoiceGeneration } from '@/hooks/useInvoiceGeneration';
import { BulkActions } from '@/components/domain/BulkActions';
import { InvoiceTable } from '@/components/domain/InvoiceTable';
import { PeriodPicker } from '@/components/domain/PeriodPicker';
import { StatStrip } from '@/components/ui/StatStrip';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import type { ExchangeRateDto, InvoiceRowDto, PeriodDto } from '@/types/dto';

interface Props {
  condominiumSlug: string;
  initialPeriod: PeriodDto;
  initialRows: InvoiceRowDto[];
  initialSheetSaved: boolean;
  /** Tasa BCV del día (null si no se pudo obtener: se muestra solo USD). */
  exchangeRate: ExchangeRateDto | null;
}

export default function InvoiceGenerator({ condominiumSlug, initialPeriod, initialRows, initialSheetSaved, exchangeRate }: Props) {
  const inv = useInvoiceGeneration({ condominiumSlug, initialPeriod, initialRows, initialSheetSaved });
  const locked = inv.loading || inv.bulk.running;
  const ves = (usd: number) => (exchangeRate ? formatVes(usdToVes(usd, exchangeRate.usdToVes)) : undefined);

  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        items={[
          { label: 'Emitidas', value: `${inv.stats.issued} de ${inv.stats.units}`, tone: inv.stats.pending > 0 ? 'warning' : 'accent', hint: inv.stats.pending > 0 ? `${inv.stats.pending} por emitir o actualizar` : 'Todo al día' },
          { label: 'Pagadas', value: inv.stats.paid, tone: 'accent' },
          { label: 'Facturado del mes', value: formatUsd(inv.stats.monthTotal), hint: ves(inv.stats.monthTotal) },
          { label: 'Deuda de meses anteriores', value: formatUsd(inv.stats.previousDebt), tone: inv.stats.previousDebt > 0 ? 'warning' : 'default', hint: `${inv.stats.delinquentUnits} casas con deuda` },
        ]}
      />

      {!inv.sheetSaved && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-warning-tint px-5 py-4 text-warning ring-1 ring-inset ring-warning/25">
          <p className="text-lg font-bold">Primero haga el paso 1: anote y guarde los gastos de este mes. Los montos de abajo son solo una propuesta.</p>
          <a href={`/admin/${condominiumSlug}/gastos?mes=${inv.period.month}&anio=${inv.period.year}`} className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-accent px-5 font-bold text-on-accent no-underline">Ir al paso 1: gastos</a>
        </div>
      )}

      <BulkActions
        periodSlot={<PeriodPicker period={inv.period} onChange={inv.changePeriod} disabled={inv.bulk.running} />}
        pendingCount={inv.sheetSaved ? inv.pendingCount : 0}
        progress={inv.bulk}
        disabled={locked || !inv.sheetSaved}
        onGenerateAll={inv.generateAll}
      />

      {inv.loadError && (
        <p role="alert" className="rounded-xl bg-danger-tint px-4 py-3 font-bold text-danger ring-1 ring-inset ring-danger/20">
          {inv.loadError}
        </p>
      )}

      <div aria-busy={inv.loading} className={`transition-opacity duration-300 ${inv.loading ? 'opacity-50' : ''}`}>
        <InvoiceTable
          rows={inv.rows}
          rowStates={inv.rowStates}
          usdToVes={exchangeRate?.usdToVes ?? null}
          disabled={locked}
          canIssue={inv.sheetSaved}
          condominiumSlug={condominiumSlug}
          onGenerate={inv.generateOne}
        />
      </div>
    </div>
  );
}

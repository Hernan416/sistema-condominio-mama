// Desglose de una factura (solo presentación): lo mismo que imprime el PDF.
import type { InvoiceBreakdown, InvoiceLineKind } from '@/types/billing';
import { formatUsd } from '@/utils/currency';

const SECTION_TITLES: Record<InvoiceLineKind, string> = {
  ordinary: 'Gastos comunes',
  reserve: 'Fondo de reserva',
  income: 'Ingresos (se descuentan)',
  extraordinary: 'Cuotas extraordinarias',
  unit: 'Cargos y abonos de la unidad',
  interest: 'Intereses de mora',
};
const ORDER: InvoiceLineKind[] = ['ordinary', 'reserve', 'income', 'extraordinary', 'unit', 'interest'];
const usd = (n: number) => (n < 0 ? `− ${formatUsd(Math.abs(n))}` : formatUsd(n));

export function BreakdownList({ breakdown }: { breakdown: InvoiceBreakdown }) {
  return (
    <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex flex-col gap-3">
        {ORDER.map((kind) => {
          const lines = breakdown.lines.filter((l) => l.kind === kind);
          if (lines.length === 0) return null;
          return (
            <section key={kind}>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-accent">{SECTION_TITLES[kind]}</h4>
              <ul className="divide-y divide-line/70">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 text-ink">{l.concept}</span>
                    <span className="flex shrink-0 items-baseline gap-4">
                      {l.buildingAmount !== null && <span className="tabular whitespace-nowrap text-xs text-ink-muted">de {usd(l.buildingAmount)}</span>}
                      <span className={`tabular whitespace-nowrap font-bold ${l.unitAmount < 0 ? 'text-accent' : 'text-ink'}`}>{usd(l.unitAmount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {breakdown.lines.length === 0 && <p className="text-sm text-ink-muted">Sin conceptos este mes.</p>}
      </div>

      <dl className="flex flex-col gap-1.5 self-start rounded-xl bg-sunken p-4 text-sm">
        <div className="flex justify-between"><dt className="text-ink-muted">Total del mes</dt><dd className="tabular font-bold">{usd(breakdown.monthTotal)}</dd></div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Deuda anterior{breakdown.previousDebtCount > 0 ? ` (${breakdown.previousDebtCount})` : ''}</dt>
          <dd className={`tabular font-bold ${breakdown.previousDebt > 0 ? 'text-warning' : ''}`}>{usd(breakdown.previousDebt)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-base"><dt className="font-bold">Total a pagar</dt><dd className="tabular font-bold text-accent">{usd(breakdown.totalDue)}</dd></div>
        {(breakdown.unitNote || breakdown.generalNote) && (
          <div className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
            {breakdown.unitNote && <p><strong className="text-ink">Nota:</strong> {breakdown.unitNote}</p>}
            {breakdown.generalNote && <p><strong className="text-ink">Aviso general:</strong> {breakdown.generalNote}</p>}
          </div>
        )}
      </dl>
    </div>
  );
}

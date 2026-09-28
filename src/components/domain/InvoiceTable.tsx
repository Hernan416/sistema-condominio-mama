import { Fragment, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { StatusBadge, type BadgeTone } from '@/components/ui/StatusBadge';
import { BreakdownList } from '@/components/domain/BreakdownList';
import type { RowState } from '@/hooks/useInvoiceGeneration';
import type { InvoiceRowDto } from '@/types/dto';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import { formatPercent } from '@/utils/billingCalculator';
import { adminInvoicePdfPath } from '@/utils/invoiceNaming';

interface Props {
  rows: InvoiceRowDto[];
  rowStates: Record<string, RowState>;
  /** Bs. por USD para la referencia bajo el total; null = solo USD. */
  usdToVes: number | null;
  disabled: boolean;
  canIssue: boolean;
  condominiumSlug: string;
  onGenerate: (houseId: string) => void;
}

function statusView(row: InvoiceRowDto): { tone: BadgeTone; label: string } {
  if (!row.invoice || row.invoice.status === 'pending') return { tone: 'neutral', label: 'Sin emitir' };
  if (row.payment?.status === 'paid') return { tone: 'success', label: 'Pagada' };
  if (row.outdated) return { tone: 'warning', label: 'Hay cambios: vuelva a emitir' };
  if (row.payment?.status === 'partial') return { tone: 'warning', label: 'Abono parcial' };
  return { tone: 'warning', label: 'Por cobrar' };
}

const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-ink-muted';

export function InvoiceTable({ rows, rowStates, usdToVes: rate, disabled, canIssue, condominiumSlug, onGenerate }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border-2 border-dashed border-line p-10 text-lg text-ink-muted">
        Este condominio todavía no tiene casas registradas.
      </p>
    );
  }

  return (
    <div className="relative overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line">
      <table className="w-full min-w-[720px] text-base">
        <thead className="bg-canvas/60">
          <tr className="border-b border-line">
            <th scope="col" className={th}>Casa</th>
            <th scope="col" className={th}>Propietario</th>
            <th scope="col" className={`${th} whitespace-nowrap text-right`}>Total a pagar</th>
            <th scope="col" className={th}>Estado</th>
            <th scope="col" className={`${th} text-right`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = rowStates[row.houseId] ?? { phase: 'idle' };
            const status = statusView(row);
            const issued = !!row.invoice && row.invoice.status !== 'pending';
            const paid = row.payment?.status === 'paid';
            const b = row.breakdown;
            const pendingAmount = row.payment ? row.payment.outstanding : b.totalDue;
            const isOpen = open === row.houseId;

            return (
              <Fragment key={row.houseId}>
                <tr className={`border-b border-line transition-colors hover:bg-canvas/50 ${isOpen ? 'bg-canvas/50' : ''}`}>
                  <th scope="row" className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : row.houseId)}
                      aria-expanded={isOpen}
                      className="group flex cursor-pointer items-center gap-3 text-left"
                    >
                      <span className="font-display tabular inline-flex h-10 min-w-10 items-center justify-center rounded-xl bg-sunken px-2 text-lg font-semibold text-ink">
                        {row.houseNumber}
                      </span>
                      <span className="flex flex-col">
                        <span className="whitespace-nowrap text-sm font-bold text-accent group-hover:underline">{isOpen ? 'Ocultar detalle' : 'Ver detalle'}</span>
                      </span>
                    </button>
                  </th>
                  <td className="px-4 py-3">
                    <span className="block min-w-40 text-ink">{row.ownerName ?? '—'}</span>
                    <span className="text-xs text-ink-muted">Alícuota {formatPercent(row.aliquot)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="tabular block text-lg font-bold">{formatUsd(b.totalDue)}</span>
                    {rate !== null && <span className="tabular block text-xs text-ink-muted">{formatVes(usdToVes(b.totalDue, rate))}</span>}
                    <span className="tabular block text-xs text-ink-muted">Este mes {formatUsd(b.monthTotal)}</span>
                    {b.previousDebt > 0 && <span className="tabular block text-xs font-bold text-warning">+ deuda anterior {formatUsd(b.previousDebt)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tone={state.phase === 'error' ? 'danger' : status.tone}>{state.phase === 'error' ? 'Error' : status.label}</StatusBadge>
                      {state.phase === 'error' && <span className="max-w-56 text-xs text-danger" role="alert">{state.message}</span>}
                      {row.payment?.status === 'partial' && <span className="tabular text-xs text-ink-muted">Pagado {formatUsd(row.payment.paid)} · falta {formatUsd(row.payment.outstanding)}</span>}
                      {issued && row.invoice && (
                        <a href={adminInvoicePdfPath(row.invoice.id)} target="_blank" rel="noopener" className="text-xs font-bold text-accent underline">Ver PDF</a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-end gap-1">
                      {!paid && (
                        <ActionButton
                          size="sm"
                          variant={issued && !row.outdated ? 'secondary' : 'primary'}
                          busy={state.phase === 'working'}
                          disabled={disabled || !canIssue}
                          onClick={() => onGenerate(row.houseId)}
                        >
                          {state.phase === 'working' ? 'Emitiendo…' : issued ? 'Volver a emitir' : 'Emitir recibo'}
                        </ActionButton>
                      )}
                      {issued && !paid && (
                        <a
                          href={`/admin/${condominiumSlug}/casas/${row.houseId}?monto=${pendingAmount.toFixed(2)}#pagos`}
                          className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold text-accent no-underline hover:bg-sunken"
                        >
                          Anotar pago
                        </a>
                      )}
                      {paid && (
                        <a href={`/admin/${condominiumSlug}/casas/${row.houseId}#pagos`} className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-bold text-ink-muted no-underline hover:bg-sunken">
                          Ver pagos
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line bg-canvas/30">
                    <td colSpan={5} className="px-6 py-5">
                      <BreakdownList breakdown={b} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

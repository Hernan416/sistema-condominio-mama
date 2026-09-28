import type { ReactNode } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { BulkProgress } from '@/hooks/useInvoiceGeneration';

interface Props {
  /** Selector de periodo (u otro filtro) que encabeza la barra. */
  periodSlot: ReactNode;
  pendingCount: number;
  progress: BulkProgress;
  disabled: boolean;
  onGenerateAll: () => void;
}

export function BulkActions({ periodSlot, pendingCount, progress, disabled, onGenerateAll }: Props) {
  const finished = !progress.running && progress.total > 0;

  return (
    <section aria-label="Acciones para todas las unidades" className="flex flex-col gap-5 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-raised)] ring-1 ring-line">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {periodSlot}
        <ActionButton busy={progress.running} disabled={disabled || pendingCount === 0} onClick={onGenerateAll}>
          {progress.running ? 'Emitiendo recibos…' : pendingCount === 0 ? 'Todo emitido' : `Emitir pendientes (${pendingCount})`}
        </ActionButton>
      </div>

      {(progress.running || finished) && (
        <div aria-live="polite" className="flex flex-col gap-2 border-t border-line pt-4">
          <ProgressBar value={progress.done} max={progress.total} label={progress.running ? 'Generando y guardando PDF' : 'Listo'} />
          {finished && progress.failed > 0 && (
            <p className="text-sm font-bold text-danger">
              {progress.failed} {progress.failed === 1 ? 'recibo falló' : 'recibos fallaron'}. Revise las filas marcadas y vuelva a intentarlo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

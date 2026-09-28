import { TextInput } from '@/components/ui/TextInput';

interface Props {
  reserveFundPercent: number;
  dueDate: string | null;
  generalNote: string | null;
  disabled: boolean;
  onReserveChange: (value: number) => void;
  onDueDateChange: (value: string | null) => void;
  onGeneralNoteChange: (value: string) => void;
}

export function SheetSettingsCard({ reserveFundPercent, dueDate, generalNote, disabled, onReserveChange, onDueDateChange, onGeneralNoteChange }: Props) {
  return (
    <section aria-labelledby="sheet-settings" className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-raised)] ring-1 ring-line">
      <h2 id="sheet-settings" className="font-display mb-4 text-2xl font-semibold">Datos de este recibo</h2>
      <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-[10rem_12rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-muted">Fondo de reserva (%)</span>
          <TextInput
            inputMode="decimal"
            value={String(reserveFundPercent).replace('.', ',')}
            onValueChange={(v) => {
              const n = Number(v.replace(',', '.'));
              if (Number.isFinite(n) && n >= 0 && n <= 100) onReserveChange(n);
            }}
          />
          <span className="text-xs text-ink-muted">Sobre los gastos comunes. Lo fija el documento de condominio o la asamblea.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-muted">Vence el</span>
          <TextInput type="date" value={dueDate ?? ''} onValueChange={(v) => onDueDateChange(v || null)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-ink-muted">Aviso para todos los recibos (opcional)</span>
          <textarea
            value={generalNote ?? ''}
            onChange={(e) => onGeneralNoteChange(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ej.: Asamblea ordinaria el sábado 10 a las 5:00 p. m. en el área social."
            className="w-full rounded-xl bg-surface px-3 py-2.5 text-base text-ink ring-1 ring-inset ring-line placeholder:text-ink-muted/60 hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
      </fieldset>
    </section>
  );
}

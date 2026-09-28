import { ActionButton } from '@/components/ui/ActionButton';

interface Props {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  savedMessage: string | null;
  onSave: () => void;
  onDiscard?: () => void;
  saveLabel?: string;
  /** Siguiente paso, se ofrece cuando todo está guardado. */
  next?: { href: string; label: string } | null;
}

/** Barra fija inferior: estado de los cambios y botón Guardar. */
export function SaveBar({ dirty, saving, error, savedMessage, onSave, onDiscard, saveLabel = 'Guardar cambios', next = null }: Props) {
  return (
    <div className="sticky bottom-4 z-10">
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] px-5 py-3 shadow-[var(--shadow-float)] ring-1 transition-colors ${
          dirty ? 'bg-night text-night-ink ring-night-line' : 'bg-surface text-ink ring-line'
        }`}
        aria-live="polite"
      >
        <p className={`text-base font-bold ${error ? 'text-danger' : ''}`}>
          {error ?? (dirty ? 'Tiene cambios sin guardar' : (savedMessage ?? 'Todo guardado'))}
        </p>
        <div className="flex gap-2">
          {dirty && onDiscard && (
            <ActionButton variant="ghost" className={dirty ? '!text-night-muted hover:!bg-night-raised hover:!text-night-ink' : ''} disabled={saving} onClick={onDiscard}>
              Descartar
            </ActionButton>
          )}
          {!dirty && !saving && next ? (
            <a href={next.href} className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-5 text-base font-bold text-on-accent no-underline shadow-[var(--shadow-button)] hover:bg-accent-strong">
              {next.label} →
            </a>
          ) : (
            <ActionButton busy={saving} disabled={!dirty} onClick={onSave}>
              {saving ? 'Guardando…' : saveLabel}
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

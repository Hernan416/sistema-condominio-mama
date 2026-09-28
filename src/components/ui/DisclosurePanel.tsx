import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  /** Texto corto a la derecha del título ("3 casas personalizadas"). */
  badge?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Sección plegable grande (versión React de Disclosure.astro): lo opcional queda guardado hasta que se pide. */
export function DisclosurePanel({ title, subtitle, badge, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line open:ring-2 open:ring-accent/40"
    >
      <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-2xl font-semibold">{title}</span>
          {subtitle && <span className="text-base text-ink-muted">{subtitle}</span>}
        </span>
        {badge && <span className="rounded-full bg-accent-tint px-3 py-1 text-sm font-bold text-accent-strong">{badge}</span>}
        <span className="inline-flex shrink-0 rounded-full bg-sunken px-4 py-2 text-base font-bold text-ink">{open ? 'Cerrar' : 'Abrir'}</span>
      </summary>
      <div className="flex flex-col gap-6 border-t border-line p-5">{open && children}</div>
    </details>
  );
}

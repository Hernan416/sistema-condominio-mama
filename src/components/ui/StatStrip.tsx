import type { ReactNode } from 'react';

export interface StatItem {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'accent' | 'warning';
  /** Línea secundaria bajo la cifra (p. ej. el equivalente en Bs.). */
  hint?: ReactNode;
}

const valueTone = {
  default: 'text-ink',
  accent: 'text-accent',
  warning: 'text-warning',
};

/** Franja compacta de cifras: una sola superficie con divisores, no tarjetas sueltas. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-raised)] ring-1 ring-line sm:grid-cols-4 sm:divide-x">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 px-5 py-4">
          <dt className="text-sm font-bold text-ink-muted">{item.label}</dt>
          <dd className={`font-display text-3xl font-semibold ${valueTone[item.tone ?? 'default']}`}>{item.value}</dd>
          {item.hint && <dd className="tabular text-sm text-ink-muted">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

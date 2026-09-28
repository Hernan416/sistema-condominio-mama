import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-sunken text-ink-muted', dot: 'bg-line-strong' },
  success: { box: 'bg-accent-tint text-accent-strong', dot: 'bg-accent' },
  warning: { box: 'bg-warning-tint text-warning', dot: 'bg-warning' },
  danger: { box: 'bg-danger-tint text-danger', dot: 'bg-danger' },
};

export function StatusBadge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${tones[tone].box}`}>
      <span className={`size-1.5 rounded-full ${tones[tone].dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

import type { SelectHTMLAttributes } from 'react';

interface Props<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: T;
  options: { value: T; label: string }[];
  onValueChange: (value: T) => void;
}

/** Select compacto (sin etiqueta visible: úsese con aria-label). */
export function InlineSelect<T extends string>({ value, options, onValueChange, className = '', ...rest }: Props<T>) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value as T)}
        className="min-h-11 w-full cursor-pointer appearance-none rounded-xl bg-surface pl-3 pr-9 text-sm font-bold text-ink ring-1 ring-inset ring-line hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-accent"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

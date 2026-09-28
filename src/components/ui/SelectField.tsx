import type { SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: number | string; label: string }[];
}

export function SelectField({ label, id, options, className = '', ...rest }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className={`min-h-11 w-full cursor-pointer appearance-none rounded-xl bg-surface pl-3 pr-10 text-base font-bold text-ink ring-1 ring-inset ring-line hover:ring-line-strong focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
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
    </div>
  );
}

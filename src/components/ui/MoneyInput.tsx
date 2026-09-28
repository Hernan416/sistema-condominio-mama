import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  highlighted?: boolean;
}

export function MoneyInput({ value, onValueChange, highlighted = false, className = '', ...rest }: Props) {
  return (
    <div
      className={`flex min-h-11 items-center rounded-xl bg-surface px-3 ring-1 ring-inset transition-shadow focus-within:ring-2 focus-within:ring-accent ${
        highlighted ? 'ring-warning' : 'ring-line hover:ring-line-strong'
      } ${className}`}
    >
      <span className="pr-1.5 text-base text-ink-muted" aria-hidden="true">$</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="tabular w-full min-w-0 bg-transparent py-2 text-base font-bold text-ink focus:outline-none"
        {...rest}
      />
    </div>
  );
}

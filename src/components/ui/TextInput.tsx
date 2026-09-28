import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
}

/** Campo compacto para tablas y formularios del panel. */
export function TextInput({ value, onValueChange, invalid = false, className = '', ...rest }: Props) {
  return (
    <input
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-invalid={invalid || undefined}
      className={`min-h-11 w-full min-w-0 rounded-xl bg-surface px-3 text-base text-ink ring-1 ring-inset transition-shadow placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-accent ${
        invalid ? 'ring-danger' : 'ring-line hover:ring-line-strong'
      } ${className}`}
      {...rest}
    />
  );
}

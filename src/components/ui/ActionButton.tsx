import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'sm';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent shadow-[var(--shadow-button)] hover:bg-accent-strong',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line hover:ring-line-strong',
  ghost: 'text-ink-muted hover:bg-sunken hover:text-ink',
};

const sizes: Record<Size, string> = {
  md: 'min-h-12 px-5 text-base',
  sm: 'min-h-10 px-4 text-sm',
};

export function ActionButton({ variant = 'primary', size = 'md', busy = false, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition-[background-color,box-shadow,transform] duration-300 ease-[var(--ease-out-expo)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

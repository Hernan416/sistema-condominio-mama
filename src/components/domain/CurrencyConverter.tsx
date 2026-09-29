import { SelectField } from '@/components/ui/SelectField';
import { TextInput } from '@/components/ui/TextInput';
import { useCurrencyConverter, type CurrencyCode } from '@/hooks/useCurrencyConverter';
import { formatEur, formatUsd, formatVes } from '@/utils/currency';
import type { CurrencyRatesDto } from '@/types/dto';

const CURRENCY_META: Record<CurrencyCode, { label: string; format: (n: number) => string }> = {
  ves: { label: 'Bolívares', format: formatVes },
  'usd-bcv': { label: 'Dólares · BCV', format: formatUsd },
  'usd-paralelo': { label: 'Dólares · Paralelo', format: formatUsd },
  'usd-binance': { label: 'Dólares · Binance', format: formatUsd },
  'eur-bcv': { label: 'Euros · BCV', format: formatEur },
  'eur-paralelo': { label: 'Euros · Paralelo', format: formatEur },
};

const OPTIONS = Object.entries(CURRENCY_META).map(([value, meta]) => ({ value, label: meta.label }));

function ratesTable(rates: CurrencyRatesDto): { label: string; value: string }[] {
  return [
    { label: 'Dólar BCV', value: formatVes(rates.usdBcv) },
    { label: 'Dólar Paralelo', value: formatVes(rates.usdParalelo) },
    { label: 'Dólar Binance', value: formatVes(rates.usdBinance) },
    { label: 'Euro BCV', value: formatVes(rates.eurBcv) },
    { label: 'Euro Paralelo', value: formatVes(rates.eurParalelo) },
  ];
}

export function CurrencyConverter() {
  const { amount, setAmount, from, setFrom, to, setTo, swap, result, rates, loading, error } = useCurrencyConverter();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="monto" className="text-sm font-bold text-ink-muted">
          Monto
        </label>
        <TextInput
          id="monto"
          inputMode="decimal"
          value={amount}
          onValueChange={setAmount}
          className="min-h-16 text-2xl font-bold"
          aria-describedby="resultado"
        />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <SelectField label="De" id="moneda-origen" options={OPTIONS} value={from} onChange={(e) => setFrom(e.target.value as CurrencyCode)} />
        <button
          type="button"
          onClick={swap}
          aria-label="Invertir monedas"
          className="mb-0.5 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface text-ink-muted ring-1 ring-line hover:bg-sunken hover:text-ink"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 10V4m0 0L4 7m3-3 3 3" />
            <path d="M17 14v6m0 0 3-3m-3 3-3-3" />
          </svg>
        </button>
        <SelectField label="A" id="moneda-destino" options={OPTIONS} value={to} onChange={(e) => setTo(e.target.value as CurrencyCode)} />
      </div>

      <div id="resultado" className="rounded-[var(--radius-card)] bg-accent-tint p-6 text-center" aria-live="polite">
        {loading ? (
          <p className="text-lg text-ink-muted">Consultando tasas del día…</p>
        ) : error ? (
          <p className="text-lg font-bold text-danger">{error}</p>
        ) : result === null ? (
          <p className="text-lg text-ink-muted">Escriba un monto para convertir.</p>
        ) : (
          <p className="font-display tabular text-4xl font-semibold text-accent-strong">{CURRENCY_META[to].format(result)}</p>
        )}
      </div>

      {rates && (
        <div className="rounded-[var(--radius-card)] border-2 border-line p-5">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-ink-muted">Tasas de hoy (Bs. por unidad)</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-base">
            {ratesTable(rates).map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-ink-muted">{row.label}</dt>
                <dd className="text-right font-bold text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-ink-muted">Actualizado: {new Date(rates.updatedAt).toLocaleString('es-VE')}</p>
        </div>
      )}
    </div>
  );
}

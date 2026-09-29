import { useEffect, useMemo, useState } from 'react';
import type { CurrencyRatesDto } from '@/types/dto';
import { parseAmountInput } from '@/utils/amountInput';

export type CurrencyCode = 'ves' | 'usd-bcv' | 'usd-paralelo' | 'usd-binance' | 'eur-bcv' | 'eur-paralelo';

/** Bs. que vale una unidad de esa moneda/tasa. Bs. siempre es la base (1). */
function ratePerVes(code: CurrencyCode, rates: CurrencyRatesDto): number {
  switch (code) {
    case 'ves':
      return 1;
    case 'usd-bcv':
      return rates.usdBcv;
    case 'usd-paralelo':
      return rates.usdParalelo;
    case 'usd-binance':
      return rates.usdBinance;
    case 'eur-bcv':
      return rates.eurBcv;
    case 'eur-paralelo':
      return rates.eurParalelo;
  }
}

export function useCurrencyConverter() {
  const [rates, setRates] = useState<CurrencyRatesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('1,00');
  const [from, setFrom] = useState<CurrencyCode>('usd-bcv');
  const [to, setTo] = useState<CurrencyCode>('ves');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/currency/rates')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CurrencyRatesDto>;
      })
      .then((data) => {
        if (cancelled) return;
        setRates(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No pudimos cargar las tasas. Revise su conexión e intente de nuevo.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountValue = parseAmountInput(amount);

  const result = useMemo(() => {
    if (!rates || amountValue === null) return null;
    const valueInVes = amountValue * ratePerVes(from, rates);
    return valueInVes / ratePerVes(to, rates);
  }, [rates, amountValue, from, to]);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return { amount, setAmount, from, setFrom, to, setTo, swap, result, rates, loading, error };
}

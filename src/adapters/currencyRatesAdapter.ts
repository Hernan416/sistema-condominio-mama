import type { CurrencyRates } from '@/types/domain';
import type { CurrencyRatesDto } from '@/types/dto';
import type { DolarApiQuote, UsdtRatesQuote } from '@/types/external';

function rateFor(quotes: DolarApiQuote[], fuente: string): number {
  const quote = quotes.find((q) => q.fuente === fuente);
  const rate = quote?.promedio ?? quote?.venta ?? quote?.compra;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Sin tasa "${fuente}" utilizable en la respuesta de DolarApi`);
  }
  return rate;
}

/** ve.dolarapi.com (dólares + euros) y usdt.com.ve (Binance P2P) → dominio. */
export function toCurrencyRates(dolares: DolarApiQuote[], euros: DolarApiQuote[], usdt: UsdtRatesQuote): CurrencyRates {
  const { buy_rate: buy, sell_rate: sell } = usdt.data.binance;
  return {
    usdBcv: rateFor(dolares, 'oficial'),
    usdParalelo: rateFor(dolares, 'paralelo'),
    usdBinance: Math.round(((buy + sell) / 2) * 10000) / 10000,
    eurBcv: rateFor(euros, 'oficial'),
    eurParalelo: rateFor(euros, 'paralelo'),
    updatedAt: new Date(),
  };
}

/** Dominio → DTO para el endpoint público (fechas como ISO). */
export function toCurrencyRatesDto(rates: CurrencyRates): CurrencyRatesDto {
  return {
    usdBcv: rates.usdBcv,
    usdParalelo: rates.usdParalelo,
    usdBinance: rates.usdBinance,
    eurBcv: rates.eurBcv,
    eurParalelo: rates.eurParalelo,
    updatedAt: rates.updatedAt.toISOString(),
  };
}

import type { APIRoute } from 'astro';
import { toCurrencyRatesDto } from '@/adapters/currencyRatesAdapter';
import { getCurrencyRates } from '@/services/container';
import { json, jsonError } from '@/utils/http';

/** Tasas para la calculadora pública. Sin sesión: no depende de un condominio ni de un usuario. */
export const GET: APIRoute = async () => {
  try {
    const rates = await getCurrencyRates().current();
    const response = json(toCurrencyRatesDto(rates));
    response.headers.set('Cache-Control', 'public, max-age=60');
    return response;
  } catch (error) {
    console.error('[api/currency/rates]', error);
    return jsonError('No pudimos consultar las tasas en este momento. Intente de nuevo en unos minutos.', 502);
  }
};

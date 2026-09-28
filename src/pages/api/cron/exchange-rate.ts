import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { getExchangeRates } from '@/services/container';
import { config } from '@/services/config';
import { json, jsonError } from '@/utils/http';
import { isoDateInCaracas } from '@/utils/dates';

/**
 * GET /api/cron/exchange-rate — lo llama el cron diario de Vercel (vercel.json).
 * Consulta la tasa BCV una vez y la guarda como la tasa de hoy para todo el sistema.
 */
export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorized(request.headers.get('authorization'))) return jsonError('No autorizado', 401);

  try {
    const rate = await getExchangeRates().refreshToday();
    return json({ day: isoDateInCaracas(new Date()), usdToVes: rate.usdToVes, source: rate.source, publishedAt: rate.publishedAt });
  } catch (error) {
    console.error('[cron:exchange-rate]', error);
    return jsonError('No se pudo obtener la tasa', 502);
  }
};

/** Sin CRON_SECRET configurado, el endpoint queda cerrado. */
function isAuthorized(header: string | null): boolean {
  const secret = config.cronSecret;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

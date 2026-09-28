import type { APIRoute } from 'astro';
import { getBillingService, getInvoiceService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { toInvoiceRowDto } from '@/adapters/invoiceDtoAdapter';
import { isUuid, isValidPeriod } from '@/utils/validation';
import { json, jsonError } from '@/utils/http';

/**
 * POST /api/admin/:slug/invoices/generate { houseId, month, year }
 * Una unidad por petición: la emisión masiva la orquesta el cliente, así cada
 * invocación serverless termina en segundos (límite de tiempo del plan gratuito de Vercel).
 */
export const POST: APIRoute = ({ locals, params, request }) =>
  withAdminCondominium(locals.admin, params.slug, async (condominium) => {
    const body = await request.json().catch(() => null);
    const { houseId, month, year } = body ?? {};
    if (!isUuid(houseId) || !isValidPeriod(month, year)) return jsonError('Datos inválidos', 400);

    await getInvoiceService().generate(condominium, houseId, { month, year });
    const { units } = await getBillingService().preview(condominium, { month, year });
    const row = units.find((u) => u.house.id === houseId)!;
    return json({ row: toInvoiceRowDto(row) });
  }, 'admin-invoices:generate');

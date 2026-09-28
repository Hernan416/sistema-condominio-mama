import type { APIRoute } from 'astro';
import { getBillingService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { toBillingSheetDto } from '@/adapters/invoiceDtoAdapter';
import { parseBillingSheetInput } from '@/adapters/billingSheetInputAdapter';
import { isValidPeriod } from '@/utils/validation';
import { json, jsonError } from '@/utils/http';

/** GET /api/admin/:slug/sheet?month&year → relación de gastos (guardada o propuesta desde el mes anterior). */
export const GET: APIRoute = ({ locals, params, url }) =>
  withAdminCondominium(locals.admin, params.slug, async (condominium) => {
    const month = Number(url.searchParams.get('month'));
    const year = Number(url.searchParams.get('year'));
    if (!isValidPeriod(month, year)) return jsonError('Periodo inválido', 400);

    const { sheet, origin } = await getBillingService().getSheet(condominium, { month, year });
    return json({ sheet: toBillingSheetDto(sheet), origin });
  }, 'admin-sheet:get');

/** PUT /api/admin/:slug/sheet { month, year, reserveFundPercent, dueDate, generalNote, unitNotes, expenses, unitCharges } */
export const PUT: APIRoute = ({ locals, params, request }) =>
  withAdminCondominium(locals.admin, params.slug, async (condominium) => {
    const body = await request.json().catch(() => null);
    const month = body?.month;
    const year = body?.year;
    if (!isValidPeriod(month, year)) return jsonError('Periodo inválido', 400);

    const input = parseBillingSheetInput(body);
    if (!input) return jsonError('Datos inválidos', 400);

    const sheet = await getBillingService().saveSheet(condominium, { month, year }, input);
    return json({ sheet: toBillingSheetDto(sheet) });
  }, 'admin-sheet:save');

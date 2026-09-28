import type { APIRoute } from 'astro';
import { getBillingService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { toInvoiceRowDto } from '@/adapters/invoiceDtoAdapter';
import { isValidPeriod } from '@/utils/validation';
import { json, jsonError } from '@/utils/http';

/** GET /api/admin/:slug/invoices?month=9&year=2026 → cálculo de cada unidad + factura emitida. */
export const GET: APIRoute = ({ locals, params, url }) =>
  withAdminCondominium(locals.admin, params.slug, async (condominium) => {
    const month = Number(url.searchParams.get('month'));
    const year = Number(url.searchParams.get('year'));
    if (!isValidPeriod(month, year)) return jsonError('Periodo inválido', 400);

    const { units, origin } = await getBillingService().preview(condominium, { month, year });
    return json({ rows: units.map(toInvoiceRowDto), sheetSaved: origin === 'saved' });
  }, 'admin-invoices:list');

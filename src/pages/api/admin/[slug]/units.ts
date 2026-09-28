import type { APIRoute } from 'astro';
import { getCondominiumService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { toUnitDto } from '@/adapters/invoiceDtoAdapter';
import { parseUnitUpdates } from '@/adapters/billingSheetInputAdapter';
import { json, jsonError } from '@/utils/http';

/** PUT /api/admin/:slug/units { updates: [{ id, aliquot, aliquotCategoryId }], aliquotScheme } — solo alícuotas. */
export const PUT: APIRoute = ({ locals, params, request }) =>
  withAdminCondominium(locals.admin, params.slug, async (condominium) => {
    const input = parseUnitUpdates(await request.json().catch(() => null));
    if (!input) return jsonError('Datos inválidos', 400);

    const { units, scheme } = await getCondominiumService().updateAliquots(condominium, input.updates, input.scheme);
    return json({ units: units.map(toUnitDto), aliquotScheme: scheme });
  }, 'admin-units:save');

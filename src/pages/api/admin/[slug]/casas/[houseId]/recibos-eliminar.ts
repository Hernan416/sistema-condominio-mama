import type { APIRoute } from 'astro';
import { getInvoiceService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';

/** POST (formulario) — elimina un recibo emitido por error (los históricos no se pueden). */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#historial`,
    async (condominium) => {
      await getInvoiceService().deleteGenerated(condominium, text('invoiceId', 64) ?? '');
      return 'Recibo eliminado';
    },
    'admin-house:invoice-delete',
  );
};

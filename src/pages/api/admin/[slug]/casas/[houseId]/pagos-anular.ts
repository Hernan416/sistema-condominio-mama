import type { APIRoute } from 'astro';
import { getAccountService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';

/** POST (formulario) — anula (elimina) un pago registrado por error. */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#pagos`,
    async (condominium) => {
      await getAccountService().deletePayment(condominium, text('paymentId', 64) ?? '');
      return 'Pago anulado';
    },
    'admin-house:payment-delete',
  );
};

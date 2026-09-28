import type { APIRoute } from 'astro';
import { getAccountService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';

/** POST (formulario) — elimina una deuda registrada por error. */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#deudas`,
    async (condominium) => {
      await getAccountService().deleteDebt(condominium, text('debtId', 64) ?? '');
      return 'Deuda eliminada';
    },
    'admin-house:debt-delete',
  );
};

import type { APIRoute } from 'astro';
import { getCondominiumService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import type { Occupancy } from '@/types/accounts';

/** POST (formulario) — datos del propietario, contacto y ocupación de la casa. */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const form = await request.formData();
  const { text } = formReader(form);
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#datos`,
    async (condominium) => {
      await getCondominiumService().updateHouseProfile(condominium, houseId, {
        ownerName: text('ownerName', 120),
        ownerDocument: text('ownerDocument', 20),
        ownerEmail: text('ownerEmail', 120),
        ownerPhone: text('ownerPhone', 20),
        occupancy: (text('occupancy', 10) ?? 'owner') as Occupancy,
        occupantName: text('occupantName', 120),
        occupantPhone: text('occupantPhone', 20),
        notes: text('notes', 1000),
      });
      return 'Datos de la casa guardados';
    },
    'admin-house:profile',
  );
};

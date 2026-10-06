import type { APIRoute } from 'astro';
import { getBudgetService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';

/** POST — cambia, para todas las casas del proyecto, cómo se cuenta "recaudado": de
 * proporcional al pago a todo-o-nada, o viceversa (botón "Cambiar asignación presupuestaria"). */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  const projectId = params.id ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/proyectos/${projectId}`,
    async (condominium) => {
      const mode = text('mode', 20) === 'all_or_nothing' ? 'all_or_nothing' : 'proportional';
      await getBudgetService().setCollectionMode(condominium, projectId, mode);
      return mode === 'all_or_nothing' ? 'Ahora se cuenta recaudado solo cuando el recibo del mes queda 100 % pagado' : 'Ahora se cuenta recaudado en proporción a lo pagado de cada recibo';
    },
    'admin-budget:collection-mode',
  );
};

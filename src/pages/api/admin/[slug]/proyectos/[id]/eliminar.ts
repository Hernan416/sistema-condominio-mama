import type { APIRoute } from 'astro';
import { getBudgetService } from '@/services/container';
import { withAdminFormAction } from '@/services/condominiums/adminScope';

/** POST — deja de llevar el seguimiento de este proyecto (lo ya facturado no se toca: sigue
 * en sus meses como una cuota extraordinaria normal). */
export const POST: APIRoute = async ({ locals, params }) => {
  const projectId = params.id ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/proyectos`,
    async (condominium) => {
      await getBudgetService().deleteProject(condominium, projectId);
      return 'Proyecto eliminado';
    },
    'admin-budget:delete',
  );
};

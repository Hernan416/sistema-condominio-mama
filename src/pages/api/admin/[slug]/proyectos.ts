import type { APIRoute } from 'astro';
import { getBudgetService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import { parseAmountInput } from '@/utils/amountInput';
import { formatUsd } from '@/utils/currency';

/** POST (formulario) — crea un proyecto con presupuesto y factura su primera cuota (o la única,
 * si se factura todo en un mes) como cuota extraordinaria por alícuota. */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/proyectos`,
    async (condominium) => {
      const billingMode = text('billingMode', 10) === 'spread' ? 'spread' : 'single';
      const project = await getBudgetService().createProject(condominium, {
        name: text('name', 120) ?? '',
        targetAmount: parseAmountInput(text('targetAmount', 30) ?? '') ?? 0,
        billingMode,
        startYear: Number(text('startYear', 4) ?? 0),
        startMonth: Number(text('startMonth', 2) ?? 0),
        monthsCount: Number(text('monthsCount', 3) ?? 1),
      });
      return `Proyecto "${project.name}" creado (meta: ${formatUsd(project.targetAmount)})`;
    },
    'admin-budget:create',
  );
};

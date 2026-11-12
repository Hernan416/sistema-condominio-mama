import type { APIRoute } from 'astro';
import { getBillingService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import { NotFoundError, ValidationError } from '@/services/errors';
import { isValidPeriod } from '@/utils/validation';

/**
 * POST (formulario) — elimina un gasto general (anotado desde Finanzas, no facturado). Los
 * gastos que sí salen en el recibo no se tocan aquí: se editan en "Recibos" → "Gastos".
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const form = await request.formData();
  const { text } = formReader(form);
  const month = Number(text('month', 2) ?? 0);
  const year = Number(text('year', 4) ?? 0);
  const expenseId = text('expenseId', 64) ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/finanzas/gastos?mes=${month}&anio=${year}`,
    async (condominium) => {
      if (!isValidPeriod(month, year)) throw new ValidationError('Periodo inválido');
      const billing = getBillingService();
      const { sheet } = await billing.getSheet(condominium, { month, year });
      const target = sheet.expenses.find((e) => e.id === expenseId);
      if (!target) throw new NotFoundError('El gasto no existe en ese mes');
      if (target.includeInReceipt !== false) throw new ValidationError('Ese gasto sí se factura a los vecinos: edítelo o quítelo desde "Recibos" → "Gastos del condominio".');
      await billing.saveSheet(condominium, { month, year }, {
        reserveFundPercent: sheet.reserveFundPercent,
        dueDate: sheet.dueDate,
        generalNote: sheet.generalNote,
        unitNotes: sheet.unitNotes,
        expenses: sheet.expenses.filter((e) => e.id !== expenseId),
        unitCharges: sheet.unitCharges,
      });
      return 'Gasto general eliminado';
    },
    'admin-finanzas:gasto-general-delete',
  );
};

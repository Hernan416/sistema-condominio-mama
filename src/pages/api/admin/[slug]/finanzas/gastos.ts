import type { APIRoute } from 'astro';
import { getBillingService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import { ValidationError } from '@/services/errors';
import type { CashAccount } from '@/types/accounts';
import type { ExpenseKind } from '@/types/billing';
import { parseAmountInput } from '@/utils/amountInput';
import { formatUsd } from '@/utils/currency';
import { isValidPeriod } from '@/utils/validation';

/**
 * POST (formulario) — anota un gasto general del condominio que NO se cobra a los vecinos
 * (includeInReceipt: false): queda solo para las estadísticas de Finanzas, con su cuenta.
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const form = await request.formData();
  const { text } = formReader(form);
  const month = Number(text('month', 2) ?? 0);
  const year = Number(text('year', 4) ?? 0);
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/finanzas/gastos?mes=${month}&anio=${year}`,
    async (condominium) => {
      if (!isValidPeriod(month, year)) throw new ValidationError('Periodo inválido');
      const concept = (text('concept', 120) ?? '').trim();
      if (!concept) throw new ValidationError('El gasto necesita un concepto');
      const amount = parseAmountInput(text('amount', 30) ?? '');
      if (amount === null || amount <= 0) throw new ValidationError('El monto debe ser mayor que 0');
      const kind: ExpenseKind = text('kind', 15) === 'extraordinary' ? 'extraordinary' : 'ordinary';
      const accountRaw = text('account', 10);
      const account: CashAccount | null = accountRaw === 'cash_usd' || accountRaw === 'bs' || accountRaw === 'zelle' ? accountRaw : null;

      const billing = getBillingService();
      const { sheet } = await billing.getSheet(condominium, { month, year });
      await billing.saveSheet(condominium, { month, year }, {
        reserveFundPercent: sheet.reserveFundPercent,
        dueDate: sheet.dueDate,
        generalNote: sheet.generalNote,
        unitNotes: sheet.unitNotes,
        expenses: [
          ...sheet.expenses,
          { concept, category: text('category', 60), amount, kind, distribution: 'aliquot', includeInReceipt: false, account },
        ],
        unitCharges: sheet.unitCharges,
      });
      return `Gasto general de ${formatUsd(amount)} anotado`;
    },
    'admin-finanzas:gasto-general',
  );
};

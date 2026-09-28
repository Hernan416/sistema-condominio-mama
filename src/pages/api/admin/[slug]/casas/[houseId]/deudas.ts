import type { APIRoute } from 'astro';
import { getAccountService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import { parseAmountInput } from '@/utils/amountInput';
import { formatUsd } from '@/utils/currency';

/** POST (formulario) — registra una deuda existente (saldo anterior al sistema, acuerdo, reparación…). */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#deudas`,
    async (condominium) => {
      const debt = await getAccountService().addDebt(condominium, houseId, {
        concept: text('concept', 120) ?? '',
        detail: text('detail', 500),
        date: text('date', 10) ?? '',
        amount: parseAmountInput(text('amount', 30) ?? '') ?? 0,
      });
      return `Deuda "${debt.concept}" de ${formatUsd(debt.amount)} registrada`;
    },
    'admin-house:debt',
  );
};

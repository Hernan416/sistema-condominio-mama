import type { APIRoute } from 'astro';
import { getAccountService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import type { PaymentMethod } from '@/types/accounts';
import { parseAmountInput, parseDecimalInput } from '@/utils/amountInput';
import { formatUsd } from '@/utils/currency';

/** POST (formulario) — corrige un pago ya registrado (monto, fecha, moneda, forma de pago…). */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const form = await request.formData();
  const { text } = formReader(form);
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#pagos`,
    async (condominium) => {
      const currency = text('currency', 3) === 'VES' ? 'VES' : 'USD';
      const payment = await getAccountService().updatePayment(condominium, text('paymentId', 64) ?? '', {
        date: text('date', 10) ?? '',
        currency,
        amount: parseAmountInput(text('amount', 30) ?? '') ?? 0,
        exchangeRate: currency === 'VES' ? parseDecimalInput(text('exchangeRate', 30) ?? '') : null,
        method: (text('method', 12) ?? 'other') as PaymentMethod,
        reference: text('reference', 60),
        note: text('note', 300),
      });
      return `Pago de ${formatUsd(payment.amount)} actualizado`;
    },
    'admin-house:payment-edit',
  );
};

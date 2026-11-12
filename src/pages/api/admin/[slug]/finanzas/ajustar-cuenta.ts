import type { APIRoute } from 'astro';
import { getCondominiumService, getExchangeRates, getMetricsService } from '@/services/container';
import { formReader, withAdminFormAction } from '@/services/condominiums/adminScope';
import { ValidationError } from '@/services/errors';
import { CASH_ACCOUNT_LABELS, type CashAccount } from '@/types/accounts';
import { roundCents } from '@/utils/billingCalculator';
import { parseAmountInput } from '@/utils/amountInput';
import { formatUsd, formatVes } from '@/utils/currency';

/**
 * POST (formulario) — "Ajustar al monto real": la administradora dice cuánto tiene de verdad en
 * una cuenta (efectivo USD, Bs. del banco o Zelle) y el sistema guarda la diferencia como ajuste
 * de partida de esa cuenta, para que "Dinero por cuenta" muestre justo ese monto. No toca recibos,
 * pagos ni deudas. El monto de Bs. se convierte a USD con la tasa de hoy. Con reset=1 se deshace el
 * último ajuste de esa cuenta (vuelve al que tenía antes).
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { text } = formReader(await request.formData());
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/finanzas#dinero-por-cuenta`,
    async (condominium) => {
      const accountRaw = text('account', 10);
      if (accountRaw !== 'cash_usd' && accountRaw !== 'bs' && accountRaw !== 'zelle') throw new ValidationError('Cuenta inválida');
      const account: CashAccount = accountRaw;
      if (text('reset', 1) === '1') {
        await getCondominiumService().undoAccountOpening(condominium, account);
        return `${CASH_ACCOUNT_LABELS[account]} volvió al saldo que tenía antes del último ajuste`;
      }
      const real = parseAmountInput(text('amount', 30) ?? '');
      if (real === null || real < 0) throw new ValidationError('Escriba el monto que tiene ahora (0 o más)');

      let realUsd = real;
      if (account === 'bs') {
        const rate = await getExchangeRates().current();
        if (!rate || rate.usdToVes <= 0) throw new ValidationError('No hay tasa del día para convertir los bolívares: intente más tarde');
        realUsd = roundCents(real / rate.usdToVes);
      }

      const metrics = getMetricsService();
      const accounts = await metrics.cashAccounts(condominium);
      const current = accounts[account];
      // Lo que ya aportan los pagos y gastos, sin el ajuste: el ajuste cubre la diferencia.
      const opening = roundCents(realUsd - (current.received - current.spent));
      await getCondominiumService().setAccountOpening(condominium, account, opening);
      return `${CASH_ACCOUNT_LABELS[account]} ajustada a ${account === 'bs' ? formatVes(real) : formatUsd(real)}`;
    },
    'admin-finanzas:ajustar-cuenta',
  );
};

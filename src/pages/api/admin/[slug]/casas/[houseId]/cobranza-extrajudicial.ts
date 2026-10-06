import type { APIRoute } from 'astro';
import { getAccountService } from '@/services/container';
import { withAdminFormAction } from '@/services/condominiums/adminScope';
import { formatUsd } from '@/utils/currency';

/** POST — aplica los honorarios de cobranza extrajudicial (20 % de la deuda actual) a esta
 * casa, sola y sin alícuotas: un cargo nuevo igual a una deuda registrada cualquiera. */
export const POST: APIRoute = async ({ locals, params }) => {
  const houseId = params.houseId ?? '';
  return withAdminFormAction(
    locals.admin,
    params.slug,
    (slug) => `/admin/${slug}/casas/${houseId}#cobranza`,
    async (condominium) => {
      const { debt, base } = await getAccountService().applyExtrajudicialFee(condominium, houseId);
      return `Honorarios de cobranza extrajudicial de ${formatUsd(debt.amount)} aplicados (20 % de ${formatUsd(base)} de deuda)`;
    },
    'admin-house:extrajudicial-fee',
  );
};

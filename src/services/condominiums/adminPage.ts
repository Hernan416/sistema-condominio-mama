// Carga común de las páginas /admin/[slug]/*: verifica acceso y trae lo que todas muestran.
import type { AstroGlobal } from 'astro';
import { getCondominiumService, getExchangeRates } from '@/services/container';
import { AccessDeniedError } from '@/services/errors';
import type { AdminSession, Condominium, ExchangeRate } from '@/types/domain';

export interface AdminCondominiumPage {
  admin: AdminSession;
  condominium: Condominium;
  condominiums: Condominium[];
  rate: ExchangeRate | null;
}

/** Devuelve los datos de la página o una redirección si el administrador no tiene acceso. */
export async function loadAdminCondominiumPage(Astro: AstroGlobal): Promise<AdminCondominiumPage | Response> {
  const admin = Astro.locals.admin!;
  const service = getCondominiumService();
  try {
    const [condominium, condominiums, rate] = await Promise.all([
      service.requireForAdmin(admin, Astro.params.slug ?? ''),
      service.listForAdmin(admin),
      getExchangeRates().current(),
    ]);
    return { admin, condominium, condominiums, rate };
  } catch (error) {
    if (error instanceof AccessDeniedError) return Astro.redirect('/admin');
    throw error;
  }
}

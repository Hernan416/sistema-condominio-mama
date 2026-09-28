import type { APIRoute } from 'astro';
import { getCondominiumService } from '@/services/container';
import { AccessDeniedError, ValidationError } from '@/services/errors';
import { isValidSlug } from '@/utils/validation';
import { parseDecimalInput } from '@/utils/amountInput';

/** POST (formulario HTML) /api/admin/:slug/settings → guarda los datos del recibo y vuelve a la página. */
export const POST: APIRoute = async ({ locals, params, request, redirect }) => {
  const slug = params.slug;
  if (!locals.admin || !isValidSlug(slug)) return redirect('/admin', 303);
  const back = (query: string) => redirect(`/admin/${slug}/datos?${query}`, 303);

  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? '').trim() || null;
  const number = (name: string) => Number(String(form.get(name) ?? '').replace(',', '.'));

  try {
    const service = getCondominiumService();
    const condominium = await service.requireForAdmin(locals.admin, slug);
    await service.updateSettings(condominium, {
      name: text('name') ?? '',
      city: text('city'),
      settings: {
        rif: text('rif')?.toUpperCase() ?? null,
        address: text('address'),
        administratorName: text('administratorName'),
        administratorRif: text('administratorRif')?.toUpperCase() ?? null,
        paymentInstructions: text('paymentInstructions'),
        defaultReserveFundPercent: number('defaultReserveFundPercent'),
        dueDay: number('dueDay'),
        lateInterestMonthlyPercent: number('lateInterestMonthlyPercent') || 0,
        openingBalance: parseDecimalInput(String(form.get('openingBalance') ?? '')) ?? 0,
        openingBalanceDate: text('openingBalanceDate'),
      },
    });
    return back('guardado=1');
  } catch (error) {
    if (error instanceof AccessDeniedError) return redirect('/admin', 303);
    if (error instanceof ValidationError) return back(`error=${encodeURIComponent(error.message)}`);
    console.error('[admin-settings]', error);
    return back(`error=${encodeURIComponent('No se pudieron guardar los datos. Intente de nuevo.')}`);
  }
};

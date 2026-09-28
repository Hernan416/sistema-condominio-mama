import type { APIRoute } from 'astro';
import { getLoginService } from '@/services/container';

/** POST /api/auth/login — login único: el servicio decide si es residente o administrador. */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const identifier = String(form.get('identifier') ?? '').trim();
  const secret = String(form.get('secret') ?? '');
  // Se conserva el usuario al volver con error (nunca la clave).
  const back = (error: string) => redirect(`/?error=${error}&usuario=${encodeURIComponent(identifier.slice(0, 120))}`, 303);

  try {
    const result = await getLoginService(cookies).login(identifier, secret);
    if (result.status === 'admin') return redirect('/admin', 303);
    if (result.status === 'resident') return redirect('/dashboard', 303);
    // Primera vez: todavía no tiene PIN → a crearlo.
    if (result.status === 'needs_pin') return redirect(`/pin?modo=crear&usuario=${encodeURIComponent(result.username)}`, 303);
    return back(result.status);
  } catch (error) {
    console.error('[login]', error);
    return back('server');
  }
};

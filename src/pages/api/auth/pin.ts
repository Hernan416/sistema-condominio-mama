import type { APIRoute } from 'astro';
import { getLoginService } from '@/services/container';
import type { PinMode } from '@/services/auth/LoginService';

/** POST /api/auth/pin — el residente crea su PIN (primera vez) o pone uno nuevo (lo olvidó). */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const mode: PinMode = form.get('mode') === 'olvido' ? 'olvido' : 'crear';
  const username = String(form.get('username') ?? '').trim().slice(0, 60);
  const back = (error: string) => redirect(`/pin?modo=${mode}&usuario=${encodeURIComponent(username)}&error=${error}`, 303);

  try {
    const result = await getLoginService(cookies).setResidentPin(mode, username, String(form.get('pin') ?? ''), String(form.get('confirm') ?? ''));
    if (result.status === 'ok') return redirect('/dashboard?pin=listo', 303);
    // Ya tenía PIN y llegó a "crear": que entre normalmente.
    if (result.status === 'already_set') return redirect(`/?usuario=${encodeURIComponent(username)}&aviso=ya-tiene-pin`, 303);
    return back(result.status);
  } catch (error) {
    console.error('[pin]', error);
    return back('server');
  }
};

import type { APIRoute } from 'astro';
import { getLoginService } from '@/services/container';

/** POST /api/auth/logout — cierra la sesión que haya (residente o administrador). */
export const POST: APIRoute = async ({ cookies, redirect }) => {
  getLoginService(cookies).logout();
  return redirect('/', 303);
};

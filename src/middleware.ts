import { defineMiddleware } from 'astro:middleware';
import { readResidentSession } from '@/services/auth/residentSession';
import { getAdminAuthenticator } from '@/services/container';
import { jsonError } from '@/utils/http';

// /admin/login solo redirige a "/" (el login es único).
const ADMIN_PUBLIC = new Set(['/admin/login']);

const isAdminArea = (path: string) => path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
const isResidentArea = (path: string) => path === '/dashboard' || path.startsWith('/api/invoices/');
const isApi = (path: string) => path.startsWith('/api/');

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/+$/, '') || '/';
  context.locals.resident = null;
  context.locals.admin = null;

  const loadAdmin = async () =>
    (context.locals.admin = await getAdminAuthenticator(context.request, context.cookies).currentAdmin());
  const loadResident = async () => (context.locals.resident = await readResidentSession(context.cookies));

  // Login: quien ya tiene sesión va directo a su pantalla.
  if (path === '/') {
    if (await loadResident()) return context.redirect('/dashboard');
    if (await loadAdmin()) return context.redirect('/admin');
  }

  if (isAdminArea(path) && !ADMIN_PUBLIC.has(path)) {
    if (!(await loadAdmin())) return isApi(path) ? jsonError('No autorizado', 401) : context.redirect('/');
  }

  if (isResidentArea(path)) {
    if (!(await loadResident())) return isApi(path) ? jsonError('Sesión expirada', 401) : context.redirect('/');
  }

  const response = await next();
  // Nada con datos personales debe quedar en caché compartida.
  if (context.locals.admin || context.locals.resident) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});

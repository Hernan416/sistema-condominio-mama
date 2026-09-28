// Resuelve el condominio de una petición de /api/admin/[slug]/* verificando el acceso,
// y traduce los errores de dominio a respuestas HTTP. Lo usan todos los endpoints admin.
import type { AdminSession, Condominium } from '@/types/domain';
import { getCondominiumService } from '@/services/container';
import { AccessDeniedError, ConflictError, NotFoundError, ValidationError } from '@/services/errors';
import { isValidSlug } from '@/utils/validation';
import { jsonError } from '@/utils/http';

export async function withAdminCondominium(
  admin: AdminSession | null,
  slug: string | undefined,
  handler: (condominium: Condominium) => Promise<Response>,
  logTag: string,
): Promise<Response> {
  if (!admin) return jsonError('No autorizado', 401);
  if (!isValidSlug(slug)) return jsonError('Condominio inválido', 400);

  try {
    const condominium = await getCondominiumService().requireForAdmin(admin, slug);
    return await handler(condominium);
  } catch (error) {
    if (error instanceof AccessDeniedError) return jsonError(error.message, 403);
    if (error instanceof NotFoundError) return jsonError(error.message, 404);
    if (error instanceof ValidationError) return jsonError(error.message, 400);
    if (error instanceof ConflictError) return jsonError(error.message, 409);
    console.error(`[${logTag}]`, error);
    // En desarrollo se devuelve el detalle para depurar; en producción nunca se expone.
    const detail = import.meta.env.DEV && error instanceof Error ? ` (${error.name}: ${error.message})` : '';
    return jsonError(`Ocurrió un error inesperado. Intente de nuevo.${detail}`, 500);
  }
}

/**
 * Igual que withAdminCondominium, para formularios HTML: en vez de JSON redirige de vuelta a
 * `backTo` con ?ok=… o ?error=… (el mensaje de negocio llega tal cual a la pantalla).
 */
export async function withAdminFormAction(
  admin: AdminSession | null,
  slug: string | undefined,
  backTo: (slug: string) => string,
  handler: (condominium: Condominium) => Promise<string>,
  logTag: string,
): Promise<Response> {
  const go = (url: string) => new Response(null, { status: 303, headers: { Location: url } });
  if (!admin || !isValidSlug(slug)) return go('/admin');
  const base = backTo(slug);
  const withQuery = (q: string) => {
    const [path, hash] = base.split('#');
    return `${path}${path.includes('?') ? '&' : '?'}${q}${hash ? '#' + hash : ''}`;
  };
  try {
    const condominium = await getCondominiumService().requireForAdmin(admin, slug);
    const okMessage = await handler(condominium);
    return go(withQuery(`ok=${encodeURIComponent(okMessage)}`));
  } catch (error) {
    if (error instanceof AccessDeniedError) return go('/admin');
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ConflictError) {
      return go(withQuery(`error=${encodeURIComponent(error.message)}`));
    }
    console.error(`[${logTag}]`, error);
    const detail = import.meta.env.DEV && error instanceof Error ? ` (${error.name}: ${error.message})` : '';
    return go(withQuery(`error=${encodeURIComponent('No se pudo completar la operación.' + detail)}`));
  }
}

/** Lee campos de texto de un formulario (vacío → null). */
export function formReader(form: FormData) {
  const text = (name: string, max = 500) => String(form.get(name) ?? '').trim().slice(0, max) || null;
  return { text };
}

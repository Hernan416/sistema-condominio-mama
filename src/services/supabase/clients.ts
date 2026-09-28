import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { config } from '@/services/config';

let serviceClient: SupabaseClient | null = null;

/**
 * Cliente con service_role: ignora RLS. SOLO se usa en el servidor, dentro de repositorios.
 * Toda autorización se decide antes, en el middleware/endpoints.
 */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const { url, serviceRoleKey } = config.supabase();
    serviceClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/** Cliente de Supabase Auth ligado a las cookies de la petición (sesión de la administradora). */
export function getAuthClient(request: Request, cookies: AstroCookies): SupabaseClient {
  const { url, anonKey } = config.supabase();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, { ...options, path: options.path ?? '/' });
        }
      },
    },
  });
}

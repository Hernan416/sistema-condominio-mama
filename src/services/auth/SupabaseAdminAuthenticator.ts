import type { AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthClient, getServiceClient } from '@/services/supabase/clients';
import type { AdminAuthenticator } from '@/services/contracts';
import type { AdminSession } from '@/types/domain';

/** Autenticación de administradores con Supabase Auth + membresías en `condominium_admins`. */
export class SupabaseAdminAuthenticator implements AdminAuthenticator {
  private readonly auth: SupabaseClient;

  constructor(request: Request, cookies: AstroCookies, private readonly db: SupabaseClient = getServiceClient()) {
    this.auth = getAuthClient(request, cookies);
  }

  async signIn(email: string, password: string): Promise<AdminSession | null> {
    const { data, error } = await this.auth.auth.signInWithPassword({ email, password });
    if (error || !data.user) return null;

    if (!(await this.isAdmin(data.user.id))) {
      await this.auth.auth.signOut();
      return null;
    }
    return { userId: data.user.id, email: data.user.email ?? null, name: displayName(data.user.user_metadata) };
  }

  /** Valida el JWT contra Supabase (getUser, no getSession) y confirma que sea admin. */
  async currentAdmin(): Promise<AdminSession | null> {
    const { data, error } = await this.auth.auth.getUser();
    if (error || !data.user) return null;
    if (!(await this.isAdmin(data.user.id))) return null;
    return { userId: data.user.id, email: data.user.email ?? null, name: displayName(data.user.user_metadata) };
  }

  async signOut(): Promise<void> {
    await this.auth.auth.signOut();
  }

  /** Es administrador si gestiona al menos un condominio. */
  private async isAdmin(userId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from('condominium_admins')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId);
    return !error && (count ?? 0) > 0;
  }
}

/** Nombre guardado en Authentication → Users → user_metadata (full_name o name). */
function displayName(meta: Record<string, unknown> | undefined): string | null {
  const v = meta?.full_name ?? meta?.name;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

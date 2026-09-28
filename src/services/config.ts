// Lectura centralizada de configuración. Las credenciales de la nube solo se exigen
// cuando su proveedor está activo, con un mensaje claro de qué falta.
import * as env from 'astro:env/server';

export class ConfigError extends Error {}

function required(name: keyof typeof env, provider: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`Falta la variable ${name} (requerida porque ${provider} está activo). Revisa tu archivo .env`);
  }
  return value;
}

export const config = {
  dataProvider: env.DATA_PROVIDER,
  storageProvider: env.STORAGE_PROVIDER,
  appName: env.APP_NAME,
  cronSecret: env.CRON_SECRET ?? null,

  exchangeRate() {
    if (env.EXCHANGE_RATE_PROVIDER === 'fixed') {
      const fixed = env.EXCHANGE_RATE_FIXED;
      if (typeof fixed !== 'number' || fixed <= 0) {
        throw new ConfigError('Falta EXCHANGE_RATE_FIXED (Bs. por USD), requerida porque EXCHANGE_RATE_PROVIDER=fixed');
      }
      return { provider: 'fixed' as const, fixed };
    }
    return { provider: 'dolarapi' as const, url: env.EXCHANGE_RATE_API_URL };
  },

  local: {
    dataDir: env.LOCAL_DATA_DIR,
    adminEmail: env.LOCAL_ADMIN_EMAIL,
    adminPassword: env.LOCAL_ADMIN_PASSWORD,
  },

  supabase() {
    const provider = 'DATA_PROVIDER=supabase';
    return {
      url: required('SUPABASE_URL', provider),
      anonKey: required('SUPABASE_ANON_KEY', provider),
      serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', provider),
    };
  },

  googleDrive() {
    const provider = 'STORAGE_PROVIDER=google';
    return {
      clientId: required('GOOGLE_CLIENT_ID', provider),
      clientSecret: required('GOOGLE_CLIENT_SECRET', provider),
      refreshToken: required('GOOGLE_REFRESH_TOKEN', provider),
      rootFolderId: required('GOOGLE_DRIVE_ROOT_FOLDER_ID', provider),
      publicLinks: env.GOOGLE_DRIVE_PUBLIC_LINKS,
    };
  },

  /** En desarrollo hay un secreto por defecto; en producción es obligatorio (mín. 32 caracteres). */
  sessionSecret(): string {
    const secret = env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (import.meta.env.PROD) {
      throw new ConfigError('SESSION_SECRET es obligatorio en producción (mínimo 32 caracteres)');
    }
    return 'solo-desarrollo-no-usar-en-produccion-0123456789';
  },
};

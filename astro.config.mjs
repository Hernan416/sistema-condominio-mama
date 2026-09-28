// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `astro check` / `astro build` pre-empaquetan dependencias con NODE_ENV=production. Si
 * comparten la caché de Vite con `astro dev`, el servidor de desarrollo termina sirviendo el
 * runtime de producción de React (jsxDEV = undefined) y las islas quedan en blanco.
 * Cada comando que no sea `dev` usa su propia caché.
 * @type {import('astro').AstroIntegration}
 */
const isolateViteCache = {
  name: 'isolate-vite-cache',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      if (command !== 'dev') updateConfig({ vite: { cacheDir: 'node_modules/.vite-tooling' } });
    },
  },
};

/**
 * Solo en desarrollo: Vite sirve las dependencias pre-empaquetadas con
 * "Cache-Control: immutable" (un año). Si alguna vez se sirve una copia equivocada bajo la
 * misma URL ?v=, el navegador la conserva para siempre y la isla React queda en blanco.
 * Con "no-cache" el navegador revalida cada vez (una respuesta 304, sin costo real).
 * @type {import('vite').Plugin}
 */
const revalidateDevDeps = {
  name: 'revalidate-dev-deps',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.includes('/node_modules/.vite/deps/')) {
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) =>
          setHeader(name, String(name).toLowerCase() === 'cache-control' ? 'no-cache' : value);
      }
      next();
    });
  },
};

export default defineConfig({
  output: 'server',
  // 60s: margen para subir a Drive una factura por invocación (máximo del plan Hobby).
  adapter: vercel({ maxDuration: 60 }),
  integrations: [react(), isolateViteCache],
  vite: {
    plugins: [tailwindcss(), revalidateDevDeps],
    // React pre-empaquetado desde el arranque: evita re-optimizaciones a mitad de sesión.
    // (Cambiar esta lista también cambia el hash ?v= de las dependencias, lo que obliga al
    // navegador a descartar copias viejas que Vite sirve con caché "immutable".)
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
  },
  // Protege los formularios POST contra CSRF (valor por defecto, explícito a propósito).
  security: { checkOrigin: true },
  // Todas las variables son `context: 'server'` y `access: 'secret'`:
  // Astro impide en build que un componente de cliente (React) las importe.
  // Las credenciales de Supabase/Google son opcionales: solo se exigen (en services/config.ts)
  // cuando su proveedor está activo. Sin .env, todo funciona en modo local.
  env: {
    schema: {
      // Selectores de proveedor: el único cambio necesario para pasar a la nube.
      DATA_PROVIDER: envField.enum({ context: 'server', access: 'secret', values: ['local', 'supabase'], default: 'local' }),
      STORAGE_PROVIDER: envField.enum({ context: 'server', access: 'secret', values: ['local', 'google'], default: 'local' }),

      SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Marca del producto (el nombre de cada condominio vive en la base de datos).
      APP_NAME: envField.string({ context: 'server', access: 'secret', default: 'Portal Residencial' }),

      // Tasa USD → Bs. (dolarapi = BCV oficial vía ve.dolarapi.com; fixed = valor fijo sin internet)
      EXCHANGE_RATE_PROVIDER: envField.enum({ context: 'server', access: 'secret', values: ['dolarapi', 'fixed'], default: 'dolarapi' }),
      EXCHANGE_RATE_API_URL: envField.string({ context: 'server', access: 'secret', default: 'https://ve.dolarapi.com/v1/dolares/oficial' }),
      EXCHANGE_RATE_FIXED: envField.number({ context: 'server', access: 'secret', optional: true }),
      // Vercel lo envía como "Authorization: Bearer <CRON_SECRET>" al llamar al cron diario.
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),

      // Modo local
      LOCAL_DATA_DIR: envField.string({ context: 'server', access: 'secret', default: '.local-data' }),
      LOCAL_ADMIN_EMAIL: envField.string({ context: 'server', access: 'secret', default: 'admin@local.test' }),
      LOCAL_ADMIN_PASSWORD: envField.string({ context: 'server', access: 'secret', default: 'admin1234' }),

      // Supabase (DATA_PROVIDER=supabase)
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),

      // Google Drive (STORAGE_PROVIDER=google)
      GOOGLE_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_REFRESH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_DRIVE_ROOT_FOLDER_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_DRIVE_PUBLIC_LINKS: envField.boolean({ context: 'server', access: 'secret', default: true }),
    },
  },
});

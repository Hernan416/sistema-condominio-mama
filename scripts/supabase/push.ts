// Copia .local-data/db.json (el almacenamiento local) a Supabase, tabla por tabla.
// No borra nada local. Se puede correr varias veces: cada fila se sube por su "id" (o su
// llave natural en billing_sheets), así que repetir la carga simplemente reemplaza lo que ya
// subió antes — nunca duplica filas.
//
//   npm run supabase:push                 sube todo lo que haya en .local-data/db.json
//   npm run supabase:push -- --dry-run    solo muestra cuántas filas de cada tabla subiría
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { LocalDatabase } from '@/services/local/localSchema';

// Astro carga .env.local solo dentro de "astro dev"; este script corre aparte con tsx, así
// que lo carga él mismo (si existe) para no pedirle al usuario que exporte las variables a mano.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Revise .env.local (o expórtelas antes de correr este script).');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const dataDir = resolve(process.env.LOCAL_DATA_DIR ?? '.local-data');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Orden que respeta las llaves foráneas: primero lo que las demás tablas referencian. */
const TABLES: { key: keyof LocalDatabase; table: string; onConflict: string }[] = [
  { key: 'condominiums', table: 'condominiums', onConflict: 'id' },
  { key: 'houses', table: 'houses', onConflict: 'id' },
  { key: 'users', table: 'users', onConflict: 'id' },
  { key: 'exchange_rates', table: 'exchange_rates', onConflict: 'day' },
  { key: 'billing_sheets', table: 'billing_sheets', onConflict: 'condominium_id,year,month' },
  { key: 'invoices', table: 'invoices', onConflict: 'id' },
  { key: 'house_debts', table: 'house_debts', onConflict: 'id' },
  { key: 'payments', table: 'payments', onConflict: 'id' },
];
const CHUNK = 500;

async function main() {
  const db = JSON.parse(await readFile(resolve(dataDir, 'db.json'), 'utf8')) as LocalDatabase;
  console.log(`Leyendo ${resolve(dataDir, 'db.json')} (versión del esquema local: ${db.version})\n`);

  const summary: Record<string, number> = {};
  for (const { key, table, onConflict } of TABLES) {
    const rows = db[key] as unknown[];
    summary[table] = rows.length;
    if (dryRun || rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    console.log(`  ${table}: ${rows.length} fila(s) subida(s)`);
  }

  console.table(summary);
  console.log(dryRun ? '\nEnsayo: no se escribió nada en Supabase (quite --dry-run para subir de verdad).' : '\nListo: Supabase queda igual a su almacenamiento local. Nada se borró en .local-data/.');
}

main().catch((e) => {
  console.error('\nError subiendo a Supabase:', e.message);
  process.exit(1);
});

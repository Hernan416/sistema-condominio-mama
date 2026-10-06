// Exporta TODO lo que hay en Supabase a un archivo local, en el mismo formato que usa el modo
// local (.local-data/db.json): un arreglo por tabla, tal cual. No toca Supabase (solo lee) ni
// su .local-data/db.json actual (escribe aparte, para no perder nada por accidente).
//
//   npm run supabase:pull                         escribe .local-data/supabase-export.json
//   npm run supabase:pull -- --out=otro.json       a otro archivo
//   npm run supabase:pull -- --install             además, lo deja activo como db.json
//                                                   (hace un respaldo del db.json anterior primero)
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { LOCAL_SCHEMA_VERSION, type LocalDatabase } from '@/services/local/localSchema';

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

const dataDir = resolve(process.env.LOCAL_DATA_DIR ?? '.local-data');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outFile = resolve(outArg ? outArg.slice('--out='.length) : resolve(dataDir, 'supabase-export.json'));
const install = process.argv.includes('--install');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const TABLES: { key: keyof Omit<LocalDatabase, 'version'>; table: string }[] = [
  { key: 'condominiums', table: 'condominiums' },
  { key: 'houses', table: 'houses' },
  { key: 'users', table: 'users' },
  { key: 'exchange_rates', table: 'exchange_rates' },
  { key: 'billing_sheets', table: 'billing_sheets' },
  { key: 'invoices', table: 'invoices' },
  { key: 'house_debts', table: 'house_debts' },
  { key: 'payments', table: 'payments' },
];

async function fetchAll(table: string): Promise<unknown[]> {
  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const db = { version: LOCAL_SCHEMA_VERSION } as LocalDatabase;
  const summary: Record<string, number> = {};
  for (const { key, table } of TABLES) {
    const rows = await fetchAll(table);
    (db as unknown as Record<string, unknown[]>)[key] = rows;
    summary[table] = rows.length;
  }

  await mkdir(dataDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(db, null, 1));
  console.table(summary);
  console.log(`\nEscrito: ${outFile}`);

  if (install) {
    const current = resolve(dataDir, 'db.json');
    if (existsSync(current)) {
      const backupDir = resolve(dataDir, 'respaldos');
      await mkdir(backupDir, { recursive: true });
      const backup = resolve(backupDir, `db-antes-de-instalar-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      await copyFile(current, backup);
      console.log(`Respaldo del db.json anterior: ${backup}`);
    }
    await copyFile(outFile, current);
    console.log(`Instalado como ${current} — con DATA_PROVIDER=local, el sistema ya lee esta foto de Supabase.`);
  } else {
    console.log('Para usarlo como almacenamiento local: vuelva a correr con --install, o copie este archivo a db.json usted mismo.');
  }
}

main().catch((e) => {
  console.error('\nError exportando de Supabase:', e.message);
  process.exit(1);
});

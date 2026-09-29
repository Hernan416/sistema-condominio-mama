// Paso 3 de la carga histórica: ENSAYAR, CARGAR o DESHACER en la base LOCAL.
//
//   npm run import -- <plantilla.json>            ensayo: concilia y muestra el reporte, no escribe
//   npm run import -- <plantilla.json> --apply    respaldo automático + carga
//   npm run import -- --undo <lote>               quita todo lo cargado con ese lote
//
// El reporte queda en .local-data/import/reporte-<lote>.json y .csv (se abre en Excel).
// Detenga el uso del sistema mientras se carga (el servidor puede seguir encendido).
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LocalJsonStore } from '@/services/local/LocalJsonStore';
import { validatePlantilla, type Plantilla } from './plantilla';
import { buildImport } from './build';

const dataDir = resolve(process.env.LOCAL_DATA_DIR ?? '.local-data');
const outDir = join(dataDir, 'import');
const store = new LocalJsonStore(dataDir);
const args = process.argv.slice(2);

async function backup(reason: string) {
  const dir = join(dataDir, 'respaldos');
  await mkdir(dir, { recursive: true });
  const file = join(dir, `db-${reason}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await copyFile(join(dataDir, 'db.json'), file);
  return file;
}

if (args[0] === '--undo') {
  const batch = args[1];
  if (!batch) throw new Error('Indique el lote: npm run import -- --undo <lote>');
  const file = await backup(`antes-de-deshacer-${batch}`);
  const removed = await store.transaction((db) => {
    const count = { recibos: 0, pagos: 0, deudas: 0, gastos: 0 };
    const keep = <T extends { import_batch?: string | null }>(rows: T[], k: keyof typeof count) =>
      rows.filter((r) => (r.import_batch === batch ? (count[k]++, false) : true));
    db.invoices = keep(db.invoices, 'recibos');
    db.payments = keep(db.payments, 'pagos');
    db.house_debts = keep(db.house_debts, 'deudas');
    db.billing_sheets = keep(db.billing_sheets, 'gastos');
    return count;
  });
  console.table(removed);
  console.log(`Lote "${batch}" deshecho. Alícuotas, dueños y datos del recibo NO se revierten; para eso use el respaldo: ${file}`);
  process.exit(0);
}

const plantillaPath = args.find((a) => !a.startsWith('--'));
if (!plantillaPath) {
  console.error('Uso: npm run import -- <plantilla.json> [--apply]   ·   npm run import -- --undo <lote>');
  process.exit(1);
}
const apply = args.includes('--apply');
const plantilla = JSON.parse(await readFile(resolve(plantillaPath), 'utf8')) as Plantilla;

const problems = validatePlantilla(plantilla);
if (problems.length) {
  console.error(`La plantilla tiene ${problems.length} problema(s):\n - ${problems.slice(0, 50).join('\n - ')}`);
  process.exit(1);
}

const db = await store.read();
const plan = buildImport(plantilla, db);

// Choques con datos que NO son de este lote (p. ej. recibos emitidos a mano en el sistema).
const conflicts: string[] = [];
for (const inv of plan.invoices) {
  const clash = db.invoices.find((i) => i.house_id === inv.house_id && i.year === inv.year && i.month === inv.month && i.import_batch !== plan.batch);
  if (clash) conflicts.push(`Ya existe un recibo de ${inv.year}-${inv.month} para la casa ${db.houses.find((h) => h.id === inv.house_id)?.number}`);
}
for (const s of plan.billingSheets) {
  const clash = db.billing_sheets.find((b) => b.condominium_id === s.condominium_id && b.year === s.year && b.month === s.month && b.import_batch !== plan.batch);
  if (clash) conflicts.push(`Ya existe una relación de gastos de ${s.year}-${s.month} en ${db.condominiums.find((c) => c.id === s.condominium_id)?.name}`);
}
plan.errors.push(...conflicts.slice(0, 20));
if (conflicts.length > 20) plan.errors.push(`… y ${conflicts.length - 20} choques más`);

// ── Reporte ────────────────────────────────────────────────────────────────
await mkdir(outDir, { recursive: true });
const ok = plan.houses.filter((h) => h.ok).length;
const summary = {
  lote: plan.batch,
  corte: plantilla.cutoff,
  recibos: plan.invoices.length,
  'relaciones de gastos': plan.billingSheets.length,
  'deudas de años anteriores': plan.debts.length,
  'pagos (conocidos o calculados)': plan.payments.length,
  'casas que cuadran': `${ok} de ${plan.houses.length}`,
  errores: plan.errors.length,
  avisos: plan.warnings.length,
};
await writeFile(join(outDir, `reporte-${plan.batch}.json`), JSON.stringify({ summary, errors: plan.errors, warnings: plan.warnings, houses: plan.houses }, null, 1));
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const header = ['condominio', 'casa', 'recibos', 'facturado', 'pagado', 'deudaCalculada', 'deudaArchivo', 'mesesCalculados', 'mesesArchivo', 'ok', 'notas'] as const;
const csv = [header.join(';'), ...plan.houses.map((h) => header.map((k) => csvCell(k === 'notas' ? h.notas.join(' | ') : k === 'ok' ? (h.ok ? 'sí' : 'REVISAR') : h[k])).join(';'))].join('\n');
await writeFile(join(outDir, `reporte-${plan.batch}.csv`), `﻿${csv}`); // BOM: Excel lee bien los acentos

console.table(summary);
const bad = plan.houses.filter((h) => !h.ok);
if (bad.length) console.table(bad.slice(0, 40).map((h) => ({ condominio: h.condominio, casa: h.casa, calculado: h.deudaCalculada, archivo: h.deudaArchivo, meses: `${h.mesesCalculados}/${h.mesesArchivo ?? '?'}`, notas: h.notas.join(' | ').slice(0, 90) })));
if (plan.errors.length) console.error(`\nErrores (impiden cargar):\n - ${plan.errors.slice(0, 40).join('\n - ')}`);
if (plan.warnings.length) console.warn(`\nAvisos (revisar):\n - ${plan.warnings.slice(0, 40).join('\n - ')}`);
console.log(`\nReporte completo: ${join(outDir, `reporte-${plan.batch}.csv`)}`);

if (!apply) {
  console.log('\nModo ensayo: no se cargó nada. Si todo cuadra: agregue --apply');
  process.exit(0);
}
if (plan.errors.length) {
  console.error('\nNo se cargó nada: corrija los errores primero.');
  process.exit(1);
}

const file = await backup(`antes-de-importar-${plan.batch}`);
await store.transaction((d) => {
  // Volver a cargar el mismo lote reemplaza lo anterior de ese lote (se puede repetir).
  d.invoices = d.invoices.filter((r) => r.import_batch !== plan.batch);
  d.payments = d.payments.filter((r) => r.import_batch !== plan.batch);
  d.house_debts = d.house_debts.filter((r) => r.import_batch !== plan.batch);
  d.billing_sheets = d.billing_sheets.filter((r) => r.import_batch !== plan.batch);
  for (const u of plan.condominiumUpdates) Object.assign(d.condominiums.find((c) => c.id === u.id)!, u.fields);
  for (const u of plan.houseUpdates) Object.assign(d.houses.find((h) => h.id === u.id)!, u.fields);
  d.billing_sheets.push(...plan.billingSheets);
  d.invoices.push(...plan.invoices);
  d.house_debts.push(...plan.debts);
  d.payments.push(...plan.payments);
});
console.log(`\nCargado el lote "${plan.batch}". Respaldo previo: ${file}`);

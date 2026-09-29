// Borra el HISTORIAL de la base local para empezar la carga real desde cero:
// recibos emitidos, pagos, deudas registradas, relaciones de gastos y saldo inicial de caja.
// Conserva condominios (con sus datos del recibo), casas, alícuotas, usuarios y PIN, y tasas BCV.
//
//   npm run data:reset-history            → muestra qué borraría (no toca nada)
//   npm run data:reset-history -- --apply → hace una copia de respaldo y borra
import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { LocalJsonStore } from '@/services/local/LocalJsonStore';

const dataDir = resolve(process.env.LOCAL_DATA_DIR ?? '.local-data');
const apply = process.argv.includes('--apply');
const store = new LocalJsonStore(dataDir);

const db = await store.read();
const summary = {
  recibos: db.invoices.length,
  pagos: db.payments.length,
  deudas: db.house_debts.length,
  'relaciones de gastos': db.billing_sheets.length,
  'saldos iniciales de caja': db.condominiums.filter((c) => Number(c.opening_balance ?? 0) !== 0 || c.opening_balance_date).length,
};
console.log(`Base local: ${join(dataDir, 'db.json')} (v${db.version})`);
console.table(summary);
console.log(`Se conservan: ${db.condominiums.length} condominios, ${db.houses.length} casas, ${db.users.length} usuarios, ${db.exchange_rates.length} tasas BCV.`);

if (!apply) {
  console.log('\nModo ensayo: no se borró nada. Para borrar: npm run data:reset-history -- --apply');
} else {
  const backups = join(dataDir, 'respaldos');
  await mkdir(backups, { recursive: true });
  const backup = join(backups, `db-antes-de-borrar-historial-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await copyFile(join(dataDir, 'db.json'), backup);
  await store.transaction((d) => {
    d.invoices = [];
    d.payments = [];
    d.house_debts = [];
    d.billing_sheets = [];
    for (const c of d.condominiums) Object.assign(c, { opening_balance: 0, opening_balance_date: null });
    // Intentos fallidos / bloqueos de prueba tampoco sirven.
    for (const u of d.users) Object.assign(u, { failed_attempts: 0, locked_until: null });
  });
  console.log(`\nHistorial borrado. Respaldo: ${backup}`);
}

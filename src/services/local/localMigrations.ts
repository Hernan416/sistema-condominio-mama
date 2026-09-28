// Migraciones del archivo local que CONSERVAN los datos. La clave es la versión de origen.
import { randomUUID } from 'node:crypto';
import { demoBillingSheet, demoCondominiumSettings } from '@/services/local/localSeed';
import type { LocalDatabase } from '@/services/local/localSchema';
import { equalAliquots } from '@/utils/billingCalculator';
import { currentPeriod } from '@/utils/months';

export const MIGRATIONS: Record<number, (db: Record<string, unknown>) => void> = {
  // v4 → v5: tasa de cambio diaria persistida.
  4: (db) => {
    db.exchange_rates = [];
  },

  // v5 → v6: facturación completa (alícuotas, relación de gastos, datos del recibo).
  5: (raw) => {
    const db = raw as unknown as LocalDatabase;
    db.condominiums = db.condominiums.map((c, i) => ({ ...demoCondominiumSettings(`J-00000000-${i + 1}`), ...c }));
    for (const c of db.condominiums) {
      const houses = db.houses.filter((h) => h.condominium_id === c.id);
      const aliquots = equalAliquots(houses.length);
      houses.forEach((h, i) => Object.assign(h, { owner_document: h.owner_document ?? null, aliquot: h.aliquot ?? aliquots[i] }));
    }
    // Los montos "pendientes" del modelo anterior ya no aplican: ahora salen de la relación de gastos.
    db.invoices = db.invoices
      .filter((inv) => inv.status !== 'pending')
      .map((inv) => ({ ...inv, paid_at: inv.paid_at ?? null, detail: inv.detail ?? null }));
    const period = currentPeriod();
    db.billing_sheets = db.condominiums.map((c) =>
      demoBillingSheet(c.id, db.houses.filter((h) => h.condominium_id === c.id).map((h) => h.id), period),
    );
  },

  // v6 → v7: tipos de alícuota por condominio y tipo asignado a cada unidad.
  6: (raw) => {
    const db = raw as unknown as LocalDatabase;
    for (const c of db.condominiums) c.aliquot_scheme ??= { mode: 'proportional', categories: [] };
    for (const h of db.houses) h.aliquot_category_id ??= null;
  },

  // v7 → v8: libro de cuentas (pagos y deudas registradas) y más datos de cada casa.
  // Las facturas marcadas "pagada" con el modelo anterior se convierten en un pago real.
  7: (raw) => {
    const db = raw as unknown as LocalDatabase;
    db.payments = [];
    db.house_debts = [];
    for (const h of db.houses) Object.assign(h, { owner_phone: null, occupancy: 'owner', occupant_name: null, occupant_phone: null, notes: null, ...h });
    for (const c of db.condominiums) Object.assign(c, { opening_balance: 0, opening_balance_date: null, ...c });
    for (const inv of db.invoices) {
      if (inv.status !== 'paid') continue;
      db.payments.push({
        id: randomUUID(),
        house_id: inv.house_id,
        paid_on: (inv.paid_at ?? inv.generated_at ?? new Date().toISOString()).slice(0, 10),
        amount: inv.amount,
        method: 'other',
        reference: null,
        amount_ves: null,
        exchange_rate: null,
        note: 'Pago marcado antes de existir el libro de pagos',
        created_at: new Date().toISOString(),
      });
      inv.status = 'generated';
    }
  },
};

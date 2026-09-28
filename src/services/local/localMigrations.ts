// Migraciones del archivo local que CONSERVAN los datos. La clave es la versión de origen.
import { randomUUID } from 'node:crypto';
import { DEMO_ADMIN, demoBillingSheet, demoCondominiumSettings, userRecord } from '@/services/local/localSeed';
import { hashPin } from '@/services/auth/pinHasher';
import type { LocalDatabase } from '@/services/local/localSchema';
import { equalAliquots } from '@/utils/billingCalculator';
import { currentPeriod } from '@/utils/months';
import { receiptNumber } from '@/utils/dueDate';

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
  // v8 → v9: sin almacenamiento de archivos. El PDF se genera al momento desde los datos
  // del recibo; se borran las referencias al archivo guardado.
  8: (raw) => {
    const db = raw as unknown as { invoices: Record<string, unknown>[] };
    for (const inv of db.invoices) {
      delete inv.drive_file_id;
      delete inv.drive_file_url;
    }
  },
  // v9 → v10: cada recibo emitido congela su encabezado (condominio, RIF, cuentas, dueño,
  // cédula, número, fuente de la tasa). Los ya emitidos toman los datos de hoy, que es lo más
  // cercano a como estaban; desde aquí ya no cambian.
  9: (raw) => {
    const db = raw as unknown as LocalDatabase;
    for (const inv of db.invoices) {
      if (inv.status === 'pending' || inv.issued_condominium_name) continue;
      const house = db.houses.find((h) => h.id === inv.house_id);
      const condo = house ? db.condominiums.find((c) => c.id === house.condominium_id) : undefined;
      if (!house || !condo) continue;
      Object.assign(inv, {
        issued_condominium_name: condo.name,
        issued_house_number: house.number,
        issued_owner_name: house.owner_name ?? null,
        issued_owner_document: house.owner_document ?? null,
        issued_receipt_number: receiptNumber({ month: inv.month, year: inv.year }, house.number),
        issued_rif: condo.rif ?? null,
        issued_address: condo.address ?? null,
        issued_administrator_name: condo.administrator_name ?? null,
        issued_administrator_rif: condo.administrator_rif ?? null,
        issued_payment_instructions: condo.payment_instructions ?? null,
        exchange_rate_source: inv.exchange_rate == null ? null : 'BCV',
      });
    }
  },
  // v10 → v11: tabla de usuarios (administradora y residentes, todos con usuario + PIN).
  // Cada casa pasa su usuario, su PIN (mismo hash) y sus intentos a un usuario residente.
  10: (raw) => {
    const db = raw as unknown as LocalDatabase & { houses: Record<string, unknown>[] };
    db.users = [];
    for (const h of db.houses) {
      if (typeof h.username === 'string' && typeof h.pin_hash === 'string') {
        db.users.push(
          userRecord({
            username: h.username,
            pin_hash: h.pin_hash,
            role: 'resident',
            display_name: (h.owner_name as string | null) ?? null,
            house_id: h.id as string,
            failed_attempts: Number(h.failed_attempts ?? 0),
            locked_until: (h.locked_until as string | null) ?? null,
          }),
        );
      }
      delete h.username;
      delete h.pin_hash;
      delete h.failed_attempts;
      delete h.locked_until;
    }
    db.users.push(userRecord({ username: DEMO_ADMIN.username, pin_hash: hashPin(DEMO_ADMIN.pin), role: 'admin', display_name: DEMO_ADMIN.name, house_id: null }));
  },
};

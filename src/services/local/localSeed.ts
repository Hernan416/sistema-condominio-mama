import { randomUUID } from 'node:crypto';
import { currentPeriod } from '@/utils/months';
import { equalAliquots } from '@/utils/billingCalculator';
import { dueDateFor } from '@/utils/dueDate';
import { hashPin } from '@/services/auth/pinHasher';
import { LOCAL_SCHEMA_VERSION, type LocalDatabase, type LocalHouseRecord } from '@/services/local/localSchema';
import type { BillingSheetRow, CondominiumRow, UserRow } from '@/types/database';

/** Mismos datos que supabase/seed.sql. Montos en USD. Los residentes empiezan SIN PIN (lo crean al entrar). */

/** Administradora de prueba (usuario + PIN, como todos). Cámbiele el PIN al pasar a producción. */
export const DEMO_ADMIN = { username: 'maria', pin: '2508', name: 'María González' };

/** Fila de la tabla users. */
export function userRecord(fields: Pick<UserRow, 'username' | 'pin_hash' | 'role' | 'display_name' | 'house_id'> & Partial<UserRow>): UserRow {
  return { id: randomUUID(), failed_attempts: 0, locked_until: null, created_at: new Date().toISOString(), ...fields };
}
/** Condominios reales y su cantidad de casas (numeradas 1…N; usuario "<prefijo>-<número>"). */
export const CONDOMINIUM_LAYOUT = [
  { name: 'Manzana 3-A', slug: 'manzana-3-a', prefix: '3a', rif: 'J-00000000-1', houses: 33 },
  { name: 'Manzana 3-B', slug: 'manzana-3-b', prefix: '3b', rif: 'J-00000000-2', houses: 38 },
];

/** Datos del recibo de ejemplo (a reemplazar por los reales en "Datos del condominio"). */
export function demoCondominiumSettings(rif: string): Partial<CondominiumRow> {
  return {
    rif,
    address: 'Isla de Margarita, Nueva Esparta',
    administrator_name: null,
    administrator_rif: null,
    payment_instructions: `Pago móvil: Banco ___ · Tel. 0414-000-0000 · RIF ${rif}\nTransferencia: cuenta corriente ___ a nombre de la Junta de Condominio`,
    default_reserve_fund_percent: 10,
    due_day: 5,
    late_interest_monthly_percent: 0,
    aliquot_scheme: { mode: 'proportional', categories: [] },
    opening_balance: 0,
    opening_balance_date: null,
  };
}

/** Relación de gastos de ejemplo con conceptos típicos de una urbanización de casas. */
export function demoBillingSheet(condominiumId: string, houseIds: string[], period: { month: number; year: number }): BillingSheetRow {
  const expense = (concept: string, amount: number) => ({
    id: randomUUID(),
    concept,
    amount,
    kind: 'ordinary' as const,
    distribution: 'aliquot' as const,
  });
  return {
    condominium_id: condominiumId,
    year: period.year,
    month: period.month,
    reserve_fund_percent: 10,
    due_date: dueDateFor(period, 5),
    general_note: null,
    unit_notes: {},
    expenses: [
      expense('Vigilancia privada', 180),
      expense('Electricidad de áreas comunes y portón', 25),
      expense('Mantenimiento del portón eléctrico', 20),
      expense('Mantenimiento de áreas verdes', 60),
      expense('Aseo y limpieza de áreas comunes', 30),
      expense('Honorarios de administración', 50),
      expense('Comisiones bancarias', 5),
    ],
    unit_charges: houseIds.length > 4 ? [{ id: randomUUID(), house_id: houseIds[4], concept: 'Reposición de control del portón', amount: 8 }] : [],
    updated_at: new Date().toISOString(),
  };
}

export function buildLocalSeed(): LocalDatabase {
  const period = currentPeriod();
  const db: LocalDatabase = {
    version: LOCAL_SCHEMA_VERSION,
    condominiums: [],
    houses: [],
    invoices: [],
    exchange_rates: [],
    billing_sheets: [],
    payments: [],
    house_debts: [],
    users: [userRecord({ username: DEMO_ADMIN.username, pin_hash: hashPin(DEMO_ADMIN.pin), role: 'admin', display_name: DEMO_ADMIN.name, house_id: null })],
  };

  for (const c of CONDOMINIUM_LAYOUT) {
    const condominium: CondominiumRow = { id: randomUUID(), name: c.name, slug: c.slug, city: 'Isla de Margarita', ...demoCondominiumSettings(c.rif) };
    db.condominiums.push(condominium);

    const ids: string[] = [];
    // Alícuotas iguales de prueba (suman 100 %); las reales se cargan con los datos de cada casa.
    const aliquots = equalAliquots(c.houses);
    Array.from({ length: c.houses }, (_, i) => String(i + 1)).forEach((unit, i) => {
      const house: LocalHouseRecord = {
        id: randomUUID(),
        condominium_id: condominium.id,
        number: unit,
        owner_name: `Propietario casa ${unit}`,
        owner_document: null,
        owner_email: null,
        aliquot: aliquots[i],
        aliquot_category_id: null,
        owner_phone: null,
        occupancy: 'owner',
        occupant_name: null,
        occupant_phone: null,
        notes: null,
      };
      ids.push(house.id);
      db.houses.push(house);
      db.users.push(userRecord({ username: `${c.prefix}-${unit}`, pin_hash: null, role: 'resident', display_name: house.owner_name, house_id: house.id }));
    });
    db.billing_sheets.push(demoBillingSheet(condominium.id, ids, period));
  }
  return db;
}

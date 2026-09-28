// Forma del archivo local (sin dependencias de otros módulos locales: evita ciclos de importación).
// Los registros imitan EXACTAMENTE las columnas de la base (snake_case), así los mismos
// adapters sirven para ambos proveedores y migrar es copiar filas.
import type { BillingSheetRow, CondominiumRow, ExchangeRateRow, HouseDebtRow, HouseRow, InvoiceRow, PaymentRow, UserRow } from '@/types/database';

/**
 * Sube este número cuando cambie la forma del archivo. Si hay una migración registrada
 * (localMigrations.ts), se conservan los datos; si no, se regenera con datos de prueba.
 */
export const LOCAL_SCHEMA_VERSION = 11;

/** La casa guardada (sin el join de usuarios, que se arma al leer). */
export type LocalHouseRecord = Omit<HouseRow, 'users'>;

export interface LocalInvoiceRecord extends Omit<InvoiceRow, 'houses' | 'amount'> {
  amount: number;
}

export interface LocalDatabase {
  version: number;
  condominiums: CondominiumRow[];
  houses: LocalHouseRecord[];
  invoices: LocalInvoiceRecord[];
  exchange_rates: ExchangeRateRow[];
  billing_sheets: BillingSheetRow[];
  payments: PaymentRow[];
  house_debts: HouseDebtRow[];
  users: UserRow[];
}

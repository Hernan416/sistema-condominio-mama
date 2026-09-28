import { randomUUID } from 'node:crypto';
import { generatedInvoiceToRow, supabaseInvoiceToDomainInvoice, type GeneratedInvoice } from '@/adapters/invoiceAdapter';
import type { LocalDatabase, LocalInvoiceRecord, LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { InvoiceRepository } from '@/services/contracts';
import type { BillingPeriod, Invoice } from '@/types/domain';

const key = (p: BillingPeriod) => p.year * 100 + p.month;

/** Misma semántica que SupabaseInvoiceRepository, sobre el archivo JSON local. */
export class LocalInvoiceRepository implements InvoiceRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findByStoredFileId(fileId: string): Promise<Invoice | null> {
    const db = await this.store.read();
    const row = db.invoices.find((i) => i.drive_file_id === fileId);
    return row ? toDomain(db, row) : null;
  }

  async findByHouseAndPeriod(houseId: string, period: BillingPeriod): Promise<Invoice | null> {
    const db = await this.store.read();
    const row = db.invoices.find((i) => i.house_id === houseId && key(i) === key(period));
    return row ? toDomain(db, row) : null;
  }

  async findLatestAvailableForHouse(houseId: string): Promise<Invoice | null> {
    const db = await this.store.read();
    const row = db.invoices
      .filter((i) => i.house_id === houseId && i.status !== 'pending')
      .sort((a, b) => key(b) - key(a))[0];
    return row ? toDomain(db, row) : null;
  }

  async listByCondominiumAndPeriod(condominiumId: string, period: BillingPeriod): Promise<Invoice[]> {
    const db = await this.store.read();
    const houseIds = houseIdsOf(db, condominiumId);
    return db.invoices.filter((i) => houseIds.has(i.house_id) && key(i) === key(period)).map((row) => toDomain(db, row));
  }

  async listIssuedByCondominium(condominiumId: string): Promise<Invoice[]> {
    const db = await this.store.read();
    const houseIds = houseIdsOf(db, condominiumId);
    return db.invoices.filter((i) => houseIds.has(i.house_id) && i.status !== 'pending').map((row) => toDomain(db, row));
  }

  saveGenerated(invoice: GeneratedInvoice): Promise<Invoice> {
    return this.store.transaction((db) => {
      const fields = generatedInvoiceToRow(invoice);
      let row = db.invoices.find((i) => i.house_id === invoice.houseId && key(i) === key(invoice.period));
      if (row) Object.assign(row, fields);
      else db.invoices.push((row = { id: randomUUID(), ...fields }));
      return toDomain(db, row);
    });
  }
}

function houseIdsOf(db: LocalDatabase, condominiumId: string): Set<string> {
  return new Set(db.houses.filter((h) => h.condominium_id === condominiumId).map((h) => h.id));
}

/** Simula el join `houses(number)` de Supabase y pasa por el mismo adapter. */
function toDomain(db: LocalDatabase, row: LocalInvoiceRecord): Invoice {
  const house = db.houses.find((h) => h.id === row.house_id);
  return supabaseInvoiceToDomainInvoice({ ...row, houses: house ? { number: house.number } : null });
}

import { billingSheetRowToDomain, billingSheetToRow } from '@/adapters/billingSheetAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { BillingSheetRepository } from '@/services/contracts';
import type { BillingSheet } from '@/types/billing';
import type { BillingPeriod } from '@/types/domain';

const key = (p: BillingPeriod) => p.year * 100 + p.month;

export class LocalBillingSheetRepository implements BillingSheetRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async find(condominiumId: string, period: BillingPeriod): Promise<BillingSheet | null> {
    const { billing_sheets } = await this.store.read();
    const row = billing_sheets.find((s) => s.condominium_id === condominiumId && key(s) === key(period));
    return row ? billingSheetRowToDomain(row) : null;
  }

  async findLatestBefore(condominiumId: string, period: BillingPeriod): Promise<BillingSheet | null> {
    const { billing_sheets } = await this.store.read();
    const row = billing_sheets
      .filter((s) => s.condominium_id === condominiumId && key(s) < key(period))
      .sort((a, b) => key(b) - key(a))[0];
    return row ? billingSheetRowToDomain(row) : null;
  }

  async listByCondominium(condominiumId: string): Promise<BillingSheet[]> {
    const { billing_sheets } = await this.store.read();
    return billing_sheets.filter((s) => s.condominium_id === condominiumId).map(billingSheetRowToDomain);
  }

  save(sheet: BillingSheet): Promise<BillingSheet> {
    return this.store.transaction((db) => {
      const row = billingSheetToRow(sheet);
      db.billing_sheets = [
        ...db.billing_sheets.filter((s) => !(s.condominium_id === sheet.condominiumId && key(s) === key(sheet))),
        row,
      ];
      return billingSheetRowToDomain(row);
    });
  }
}

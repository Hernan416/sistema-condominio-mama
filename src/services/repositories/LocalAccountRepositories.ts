import { randomUUID } from 'node:crypto';
import { debtRowToDomain, newDebtToRow, newPaymentToRow, paymentRowToDomain, type NewDebt, type NewPayment } from '@/adapters/accountAdapter';
import type { LocalDatabase, LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { HouseDebtRepository, PaymentRepository } from '@/services/contracts';
import type { HouseDebt, Payment } from '@/types/accounts';

const houseIdsOf = (db: LocalDatabase, condominiumId: string) =>
  new Set(db.houses.filter((h) => h.condominium_id === condominiumId).map((h) => h.id));

export class LocalPaymentRepository implements PaymentRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async listByCondominium(condominiumId: string): Promise<Payment[]> {
    const db = await this.store.read();
    const ids = houseIdsOf(db, condominiumId);
    return db.payments.filter((p) => ids.has(p.house_id)).map(paymentRowToDomain);
  }

  create(payment: NewPayment): Promise<Payment> {
    return this.store.transaction((db) => {
      const row = { id: randomUUID(), ...newPaymentToRow(payment), created_at: new Date().toISOString() };
      db.payments.push(row);
      return paymentRowToDomain(row);
    });
  }

  delete(id: string): Promise<void> {
    return this.store.transaction((db) => {
      db.payments = db.payments.filter((p) => p.id !== id);
    });
  }
}

export class LocalHouseDebtRepository implements HouseDebtRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async listByCondominium(condominiumId: string): Promise<HouseDebt[]> {
    const db = await this.store.read();
    const ids = houseIdsOf(db, condominiumId);
    return db.house_debts.filter((d) => ids.has(d.house_id)).map(debtRowToDomain);
  }

  create(debt: NewDebt): Promise<HouseDebt> {
    return this.store.transaction((db) => {
      const row = { id: randomUUID(), ...newDebtToRow(debt), created_at: new Date().toISOString() };
      db.house_debts.push(row);
      return debtRowToDomain(row);
    });
  }

  delete(id: string): Promise<void> {
    return this.store.transaction((db) => {
      db.house_debts = db.house_debts.filter((d) => d.id !== id);
    });
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { debtRowToDomain, newDebtToRow, newPaymentToRow, paymentRowToDomain, type NewDebt, type NewPayment } from '@/adapters/accountAdapter';
import type { HouseDebtRow, PaymentRow } from '@/types/database';
import type { HouseDebt, Payment } from '@/types/accounts';
import type { HouseDebtRepository, PaymentRepository } from '@/services/contracts';

const PAYMENT_COLUMNS = 'id, house_id, paid_on, amount, method, reference, amount_ves, exchange_rate, note, created_at';
const DEBT_COLUMNS = 'id, house_id, concept, detail, origin_date, amount, months, created_at';

export class SupabasePaymentRepository implements PaymentRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCondominium(condominiumId: string): Promise<Payment[]> {
    const { data, error } = await this.db
      .from('payments')
      .select(`${PAYMENT_COLUMNS}, scope:houses!inner(condominium_id)`)
      .eq('scope.condominium_id', condominiumId)
      .overrideTypes<PaymentRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
    return (data ?? []).map(paymentRowToDomain);
  }

  async create(payment: NewPayment): Promise<Payment> {
    const { data, error } = await this.db.from('payments').insert(newPaymentToRow(payment)).select(PAYMENT_COLUMNS).single<PaymentRow>();
    if (error) throw new Error(`No se pudo registrar el pago: ${error.message}`);
    return paymentRowToDomain(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('payments').delete().eq('id', id);
    if (error) throw new Error(`No se pudo anular el pago: ${error.message}`);
  }
}

export class SupabaseHouseDebtRepository implements HouseDebtRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCondominium(condominiumId: string): Promise<HouseDebt[]> {
    const { data, error } = await this.db
      .from('house_debts')
      .select(`${DEBT_COLUMNS}, scope:houses!inner(condominium_id)`)
      .eq('scope.condominium_id', condominiumId)
      .overrideTypes<HouseDebtRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron leer las deudas: ${error.message}`);
    return (data ?? []).map(debtRowToDomain);
  }

  async create(debt: NewDebt): Promise<HouseDebt> {
    const { data, error } = await this.db.from('house_debts').insert(newDebtToRow(debt)).select(DEBT_COLUMNS).single<HouseDebtRow>();
    if (error) throw new Error(`No se pudo registrar la deuda: ${error.message}`);
    return debtRowToDomain(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('house_debts').delete().eq('id', id);
    if (error) throw new Error(`No se pudo eliminar la deuda: ${error.message}`);
  }
}

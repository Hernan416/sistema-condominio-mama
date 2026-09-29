import type { SupabaseClient } from '@supabase/supabase-js';
import { generatedInvoiceToRow, supabaseInvoiceToDomainInvoice, type GeneratedInvoice } from '@/adapters/invoiceAdapter';
import type { InvoiceRow } from '@/types/database';
import type { BillingPeriod, Invoice } from '@/types/domain';
import type { InvoiceRepository } from '@/services/contracts';

const INVOICE_COLUMNS =
  'id, house_id, month, year, amount, exchange_rate, exchange_rate_date, exchange_rate_source, source, import_batch, status, generated_at, paid_at, detail, issued_condominium_name, issued_house_number, issued_owner_name, issued_owner_document, issued_receipt_number, ' +
  'issued_rif, issued_address, issued_administrator_name, issued_administrator_rif, issued_payment_instructions, houses(number)';

export class SupabaseInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(id: string): Promise<Invoice | null> {
    const { data, error } = await this.db.from('invoices').select(INVOICE_COLUMNS).eq('id', id).maybeSingle<InvoiceRow>();
    if (error) throw new Error(`No se pudo leer la factura: ${error.message}`);
    return data ? supabaseInvoiceToDomainInvoice(data) : null;
  }

  async findByHouseAndPeriod(houseId: string, { month, year }: BillingPeriod): Promise<Invoice | null> {
    const { data, error } = await this.db
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('house_id', houseId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle<InvoiceRow>();
    if (error) throw new Error(`No se pudo leer la factura: ${error.message}`);
    return data ? supabaseInvoiceToDomainInvoice(data) : null;
  }

  async findLatestAvailableForHouse(houseId: string): Promise<Invoice | null> {
    const { data, error } = await this.db
      .from('invoices')
      .select(INVOICE_COLUMNS)
      .eq('house_id', houseId)
      .in('status', ['generated', 'paid'])
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceRow>();
    if (error) throw new Error(`No se pudo leer la factura: ${error.message}`);
    return data ? supabaseInvoiceToDomainInvoice(data) : null;
  }

  async listByCondominiumAndPeriod(condominiumId: string, { month, year }: BillingPeriod): Promise<Invoice[]> {
    // `houses!inner` convierte el join en un filtro: solo facturas de casas de ese condominio.
    const { data, error } = await this.db
      .from('invoices')
      .select(`${INVOICE_COLUMNS}, scope:houses!inner(condominium_id)`)
      .eq('scope.condominium_id', condominiumId)
      .eq('month', month)
      .eq('year', year)
      .overrideTypes<InvoiceRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron listar las facturas: ${error.message}`);
    return (data ?? []).map(supabaseInvoiceToDomainInvoice);
  }

  async listIssuedByCondominium(condominiumId: string): Promise<Invoice[]> {
    const { data, error } = await this.db
      .from('invoices')
      .select(`${INVOICE_COLUMNS}, scope:houses!inner(condominium_id)`)
      .eq('scope.condominium_id', condominiumId)
      .neq('status', 'pending')
      .overrideTypes<InvoiceRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron leer los recibos: ${error.message}`);
    return (data ?? []).map(supabaseInvoiceToDomainInvoice);
  }

  async saveGenerated(invoice: GeneratedInvoice): Promise<Invoice> {
    const { data, error } = await this.db
      .from('invoices')
      .upsert(generatedInvoiceToRow(invoice), { onConflict: 'house_id,year,month' })
      .select(INVOICE_COLUMNS)
      .single<InvoiceRow>();
    if (error) throw new Error(`No se pudo guardar la factura: ${error.message}`);
    return supabaseInvoiceToDomainInvoice(data);
  }

}

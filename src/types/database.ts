// Forma exacta de las filas de la base (snake_case). Solo la importan adapters y repositorios.
// El modo local guarda exactamente estas mismas columnas.

export interface CondominiumRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  rif?: string | null;
  address?: string | null;
  administrator_name?: string | null;
  administrator_rif?: string | null;
  payment_instructions?: string | null;
  default_reserve_fund_percent?: number | string;
  due_day?: number;
  late_interest_monthly_percent?: number | string;
  aliquot_scheme?: unknown; // jsonb { mode, categories: [{ id, name, value }] }
  opening_balance?: number | string;
  opening_balance_date?: string | null;
}

export interface HouseRow {
  id: string;
  condominium_id: string;
  number: string;
  username: string;
  owner_name: string | null;
  owner_document: string | null;
  owner_email: string | null;
  aliquot: number | string;
  aliquot_category_id?: string | null;
  owner_phone?: string | null;
  occupancy?: 'owner' | 'tenant' | 'vacant' | null;
  occupant_name?: string | null;
  occupant_phone?: string | null;
  notes?: string | null;
}

export interface PaymentRow {
  id: string;
  house_id: string;
  paid_on: string; // YYYY-MM-DD
  amount: number | string; // USD
  method: 'transfer' | 'mobile' | 'zelle' | 'cash_usd' | 'cash_ves' | 'other';
  reference: string | null;
  amount_ves: number | string | null;
  exchange_rate: number | string | null;
  note: string | null;
  created_at: string | null;
}

export interface HouseDebtRow {
  id: string;
  house_id: string;
  concept: string;
  detail: string | null;
  origin_date: string; // YYYY-MM-DD
  amount: number | string; // USD
  created_at: string | null;
}

export interface InvoiceRow {
  id: string;
  house_id: string;
  month: number;
  year: number;
  amount: number | string; // USD. numeric puede llegar como string desde PostgREST
  exchange_rate: number | string | null; // Bs. por USD al generar
  exchange_rate_date: string | null; // YYYY-MM-DD
  status: 'pending' | 'generated' | 'paid';
  generated_at: string | null;
  paid_at: string | null;
  detail: unknown | null; // jsonb con el InvoiceBreakdown emitido
  houses?: { number: string } | null; // join opcional
}

/** Una fila por día (fecha de Caracas): la tasa se consulta a la API una vez al día. */
export interface ExchangeRateRow {
  day: string; // YYYY-MM-DD
  usd_to_ves: number | string;
  source: string;
  published_at: string; // ISO
  fetched_at: string; // ISO
}

/** Relación de gastos del mes (un agregado: gastos y cargos van en columnas jsonb). */
export interface BillingSheetRow {
  condominium_id: string;
  year: number;
  month: number;
  reserve_fund_percent: number | string;
  due_date: string | null;
  general_note: string | null;
  unit_notes: Record<string, string>;
  expenses: {
    id: string;
    concept: string;
    amount: number;
    kind: 'ordinary' | 'extraordinary' | 'income';
    distribution: 'aliquot' | 'equal';
    overrides?: Record<string, { mode: 'exempt' } | { mode: 'fixed'; amount: number }>;
  }[];
  unit_charges: { id: string; house_id: string; concept: string; amount: number; recurring?: boolean }[];
  updated_at: string | null;
}

export interface VerifyPinRow {
  status: 'ok' | 'invalid' | 'locked';
  house_id: string | null;
  house_number: string | null;
  condominium_id: string | null;
  locked_until: string | null;
}

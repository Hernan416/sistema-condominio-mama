import type { Condominium, CondominiumSettings, CondominiumWithSettings } from '@/types/domain';
import type { CondominiumRow } from '@/types/database';
import type { CashAccount } from '@/types/accounts';
import { EMPTY_SCHEME, validateScheme, type AliquotScheme } from '@/utils/aliquotScheme';

export const DEFAULT_SETTINGS: CondominiumSettings = {
  rif: null,
  address: null,
  administratorName: null,
  administratorRif: null,
  paymentInstructions: null,
  defaultReserveFundPercent: 10,
  dueDay: 5,
  openingBalance: 0,
  openingBalanceDate: null,
  billPreviousMonth: false,
};

export function supabaseCondominiumToDomain(row: CondominiumRow): Condominium {
  return { id: row.id, name: row.name, slug: row.slug, city: row.city };
}

export function supabaseCondominiumWithSettings(row: CondominiumRow): CondominiumWithSettings {
  return {
    ...supabaseCondominiumToDomain(row),
    settings: {
      rif: row.rif ?? null,
      address: row.address ?? null,
      administratorName: row.administrator_name ?? null,
      administratorRif: row.administrator_rif ?? null,
      paymentInstructions: row.payment_instructions ?? null,
      defaultReserveFundPercent: row.default_reserve_fund_percent == null ? DEFAULT_SETTINGS.defaultReserveFundPercent : Number(row.default_reserve_fund_percent),
      dueDay: row.due_day ?? DEFAULT_SETTINGS.dueDay,
      openingBalance: Number(row.opening_balance ?? 0),
      openingBalanceDate: row.opening_balance_date ?? null,
      billPreviousMonth: row.bill_previous_month ?? DEFAULT_SETTINGS.billPreviousMonth,
    },
    aliquotScheme: parseAliquotScheme(row.aliquot_scheme),
    accountOpenings: parseAccountOpenings(row.account_openings),
    accountOpeningsPrevious: parseAccountOpeningsPrevious(row.account_openings),
  };
}

/** El jsonb viene de la base: { cash_usd, bs, zelle, previous: { … } }. */
export function parseAccountOpeningsPrevious(value: unknown): Partial<Record<CashAccount, number>> {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).previous : null;
  const p = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const out: Partial<Record<CashAccount, number>> = {};
  for (const k of ['cash_usd', 'bs', 'zelle'] as const) if (typeof p[k] === 'number' && Number.isFinite(p[k])) out[k] = p[k] as number;
  return out;
}

/** El jsonb viene de la base: lo que no sea un número válido cuenta como 0. */
export function parseAccountOpenings(value: unknown): Record<CashAccount, number> {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return { cash_usd: num(v.cash_usd), bs: num(v.bs), zelle: num(v.zelle) };
}

/** El jsonb viene de la base: si no tiene forma válida se usa un esquema vacío. */
export function parseAliquotScheme(value: unknown): AliquotScheme {
  if (typeof value !== 'object' || value === null) return EMPTY_SCHEME;
  const v = value as { mode?: unknown; categories?: unknown };
  const scheme: AliquotScheme = {
    mode: v.mode === 'percent' ? 'percent' : 'proportional',
    categories: Array.isArray(v.categories)
      ? v.categories
          .filter((c): c is { id: string; name: string; value: number } => typeof c?.id === 'string' && typeof c?.name === 'string' && typeof c?.value === 'number')
          .map(({ id, name, value }) => ({ id, name, value }))
      : [],
  };
  return validateScheme(scheme) === null ? scheme : EMPTY_SCHEME;
}

/** Dominio → columnas a actualizar (nombre, ciudad y datos del recibo). */
export function condominiumUpdateToRow(update: { name: string; city: string | null; settings: CondominiumSettings }) {
  const s = update.settings;
  return {
    name: update.name,
    city: update.city,
    rif: s.rif,
    address: s.address,
    administrator_name: s.administratorName,
    administrator_rif: s.administratorRif,
    payment_instructions: s.paymentInstructions,
    default_reserve_fund_percent: s.defaultReserveFundPercent,
    due_day: s.dueDay,
    opening_balance: s.openingBalance,
    opening_balance_date: s.openingBalanceDate,
    bill_previous_month: s.billPreviousMonth,
  };
}

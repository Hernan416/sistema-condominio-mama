import type { Condominium, CondominiumSettings, CondominiumWithSettings } from '@/types/domain';
import type { CondominiumRow } from '@/types/database';
import { EMPTY_SCHEME, validateScheme, type AliquotScheme } from '@/utils/aliquotScheme';

export const DEFAULT_SETTINGS: CondominiumSettings = {
  rif: null,
  address: null,
  administratorName: null,
  administratorRif: null,
  paymentInstructions: null,
  defaultReserveFundPercent: 10,
  dueDay: 5,
  lateInterestMonthlyPercent: 0,
  openingBalance: 0,
  openingBalanceDate: null,
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
      lateInterestMonthlyPercent: Number(row.late_interest_monthly_percent ?? 0),
      openingBalance: Number(row.opening_balance ?? 0),
      openingBalanceDate: row.opening_balance_date ?? null,
    },
    aliquotScheme: parseAliquotScheme(row.aliquot_scheme),
  };
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
    late_interest_monthly_percent: s.lateInterestMonthlyPercent,
    opening_balance: s.openingBalance,
    opening_balance_date: s.openingBalanceDate,
  };
}

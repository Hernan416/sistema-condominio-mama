// Cuentas por casa: pagos (abonos) y deudas registradas a mano. Montos en USD.

export type PaymentMethod = 'transfer' | 'mobile' | 'zelle' | 'cash_usd' | 'other';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  mobile: 'Pago móvil',
  zelle: 'Zelle',
  cash_usd: 'Efectivo (USD)',
  other: 'Otro',
};

/**
 * Las tres "cuentas" de dinero que maneja un condominio, para Finanzas: efectivo en dólares,
 * bolívares (banco/pago móvil/transferencia: no se distingue entre ellos) y Zelle.
 */
export type CashAccount = 'cash_usd' | 'bs' | 'zelle';

export const CASH_ACCOUNT_LABELS: Record<CashAccount, string> = {
  cash_usd: 'Efectivo (USD)',
  bs: 'Bolívares (Bs.)',
  zelle: 'Zelle',
};

/** A qué cuenta entra un pago de un vecino, según cómo pagó. Todo lo que no sea USD en efectivo
 * ni Zelle se cuenta como bolívares (transferencia, pago móvil, u otro sin especificar). */
export function accountOf(method: PaymentMethod): CashAccount {
  if (method === 'cash_usd') return 'cash_usd';
  if (method === 'zelle') return 'zelle';
  return 'bs';
}

/** Pago o abono de una casa. Se aplica automáticamente a su deuda más antigua. */
export interface Payment {
  id: string;
  houseId: string;
  /** Fecha del pago "YYYY-MM-DD". */
  date: string;
  /** Monto en USD (si pagó en Bs., es la conversión a la tasa indicada). */
  amount: number;
  method: PaymentMethod;
  /** N° de referencia bancaria, de pago móvil, etc. */
  reference: string | null;
  /** Si pagó en bolívares: monto en Bs. y tasa usada. */
  amountVes: number | null;
  exchangeRate: number | null;
  note: string | null;
  createdAt: Date | null;
}

/** Concepto fijo de la deuda que crea `AccountService.applyExtrajudicialFee`: sirve para
 * reconocerla luego (no cobrar dos veces mientras haya una pendiente) sin otra marca en la fila. */
export const EXTRAJUDICIAL_FEE_CONCEPT = 'Honorarios de cobranza extrajudicial';
export const EXTRAJUDICIAL_FEE_PERCENT = 20;

/** Deuda registrada a mano: saldos anteriores al sistema, acuerdos, reparaciones… */
export interface HouseDebt {
  id: string;
  houseId: string;
  concept: string;
  detail: string | null;
  /** Fecha de origen "YYYY-MM-DD" (define su antigüedad y el orden en que se cobra). */
  date: string;
  amount: number;
  /** Meses de condominio que representa (null = no son meses: multa, reparación…). */
  months: number | null;
  createdAt: Date | null;
}

export type Occupancy = 'owner' | 'tenant' | 'vacant';

export const OCCUPANCY_LABELS: Record<Occupancy, string> = {
  owner: 'La habita el propietario',
  tenant: 'Alquilada (inquilino)',
  vacant: 'Desocupada',
};

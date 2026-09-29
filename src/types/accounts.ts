// Cuentas por casa: pagos (abonos) y deudas registradas a mano. Montos en USD.

export type PaymentMethod = 'transfer' | 'mobile' | 'zelle' | 'cash_usd' | 'cash_ves' | 'other';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  mobile: 'Pago móvil',
  zelle: 'Zelle',
  cash_usd: 'Efectivo (USD)',
  cash_ves: 'Efectivo (Bs.)',
  other: 'Otro',
};

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

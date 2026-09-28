// Modelos de dominio (camelCase). Es lo único que ve la UI; nunca filas crudas de la base.
import type { InvoiceBreakdown } from '@/types/billing';
import type { AliquotScheme } from '@/utils/aliquotScheme';
import type { Occupancy } from '@/types/accounts';

export type InvoiceStatus = 'pending' | 'generated' | 'paid';

export interface Condominium {
  id: string;
  name: string;
  slug: string;
  city: string | null;
}

/** Datos que aparecen en el recibo y valores por defecto de facturación. */
export interface CondominiumSettings {
  /** RIF de la junta de condominio, ej. "J-12345678-9". */
  rif: string | null;
  address: string | null;
  /** Administradora (persona o empresa) que emite el recibo. */
  administratorName: string | null;
  administratorRif: string | null;
  /** Cuentas bancarias, pago móvil, etc. Texto libre, una línea por dato. */
  paymentInstructions: string | null;
  /** % de fondo de reserva que se propone cada mes. */
  defaultReserveFundPercent: number;
  /** Día del mes siguiente en que vence el recibo (1–28). */
  dueDay: number;
  /**
   * Interés de mora mensual (%) aprobado por la asamblea; 0 = no se cobra.
   * La LPH no lo fija: sin tasa indicada en el recibo rige el interés legal (3 % anual).
   */
  lateInterestMonthlyPercent: number;
  /** Saldo en caja/banco al empezar a usar el sistema (base del saldo total en el resumen). */
  openingBalance: number;
  /** Fecha de ese saldo inicial "YYYY-MM-DD". */
  openingBalanceDate: string | null;
}

export interface CondominiumWithSettings extends Condominium {
  settings: CondominiumSettings;
  /** Tipos de alícuota ("Casa pequeña", "Casa grande"…) y cómo se interpretan. */
  aliquotScheme: AliquotScheme;
}

export interface House {
  id: string;
  condominiumId: string;
  number: string;
  /** Usuario con que entra el residente de esta casa (tabla users); null si no tiene. */
  username: string | null;
  ownerName: string | null;
  /** Cédula o RIF del propietario, ej. "V-12345678". */
  ownerDocument: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  /** Quién ocupa la casa: el propietario, un inquilino o nadie. */
  occupancy: Occupancy;
  /** Inquilino u ocupante (si no es el propietario). */
  occupantName: string | null;
  occupantPhone: string | null;
  /** Notas internas de la administración (no salen en el recibo). */
  notes: string | null;
  /** Alícuota: % de participación en los gastos comunes (todas suman 100). */
  aliquot: number;
  /** Tipo de alícuota asignado; null = alícuota personalizada. */
  aliquotCategoryId: string | null;
}

export interface BillingPeriod {
  month: number; // 1-12
  year: number;
}

/** Tasa de cambio oficial (BCV): cuántos bolívares vale 1 USD. */
export interface ExchangeRate {
  usdToVes: number;
  /** Fuente legible, ej. "BCV". */
  source: string;
  /** Fecha en que la fuente publicó la tasa. */
  publishedAt: Date;
}

export interface Invoice extends BillingPeriod {
  id: string;
  houseId: string;
  houseNumber: string | null;
  /** Monto en dólares (USD): la moneda en que se fija la cuota. */
  amount: number;
  /** Tasa BCV del día de emisión (la referencia en Bs. del recibo; queda fija). */
  exchangeRate: number | null;
  exchangeRateDate: Date | null;
  status: InvoiceStatus;
  generatedAt: Date | null;
  paidAt: Date | null;
  /** Desglose con el que se emitió (null en facturas anteriores a este formato). */
  detail: InvoiceBreakdown | null;
  /** Encabezado tal como estaba al emitir (null en recibos anteriores a este cambio). */
  issued: IssuedReceiptHeader | null;
}

/** Datos del condominio que imprime el recibo. */
export type ReceiptHeaderSettings = Pick<CondominiumSettings, 'rif' | 'address' | 'administratorName' | 'administratorRif' | 'paymentInstructions'>;

/**
 * Todo lo que el recibo imprime y NO está en el desglose, congelado el día de emisión:
 * así el PDF sale idéntico aunque luego cambien el dueño, el RIF, las cuentas o la tasa.
 */
export interface IssuedReceiptHeader {
  condominiumName: string;
  houseNumber: string;
  ownerName: string | null;
  ownerDocument: string | null;
  receiptNumber: string;
  settings: ReceiptHeaderSettings;
  /** Fuente de la tasa ("BCV"); el valor y la fecha están en exchangeRate / exchangeRateDate. */
  exchangeRateSource: string | null;
}

/** Fila del panel admin: una casa con su factura del periodo (si existe). */
export interface HouseInvoiceSummary {
  house: House;
  invoice: Invoice | null;
}

/** Resumen de un condominio en un periodo (inicio del panel admin). */
export interface CondominiumOverview {
  condominium: Condominium;
  houseCount: number;
  generatedCount: number;
  pendingCount: number;
  totalAmount: number;
}

export interface ResidentSession {
  houseId: string;
  houseNumber: string;
  condominiumId: string;
}

export interface AdminSession {
  userId: string;
  username: string;
  /** Nombre para saludar ("María González"); null si no se conoce. */
  name: string | null;
}

export type UserRole = 'admin' | 'resident';

/** Usuario con sus credenciales (solo lo usa el login; nunca llega a la interfaz). */
export interface UserCredentials {
  id: string;
  username: string;
  /** null = todavía no tiene PIN (residente que aún no lo ha creado). */
  pinHash: string | null;
  role: UserRole;
  displayName: string | null;
  houseId: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

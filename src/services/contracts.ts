// Contratos (Dependency Inversion). La lógica de negocio depende de estas interfaces,
// nunca de Supabase, el disco local o pdf-lib directamente.
import type {
  AdminSession,
  BillingPeriod,
  Condominium,
  CondominiumSettings,
  CondominiumWithSettings,
  ExchangeRate,
  House,
  Invoice,
  PinVerificationResult,
  ReceiptHeaderSettings,
} from '@/types/domain';
import type { BillingSheet, InvoiceBreakdown } from '@/types/billing';
import type { HouseUpdate } from '@/adapters/houseAdapter';
import type { GeneratedInvoice } from '@/adapters/invoiceAdapter';
import type { AliquotScheme } from '@/utils/aliquotScheme';
import type { HouseDebt, Payment } from '@/types/accounts';
import type { NewDebt, NewPayment } from '@/adapters/accountAdapter';
import type { PreviousDebt } from '@/utils/billingCalculator';
import type { ChargeState } from '@/utils/ledger';

/** Autenticación de administradores (Supabase Auth o credenciales locales). */
export interface AdminAuthenticator {
  signIn(email: string, password: string): Promise<AdminSession | null>;
  currentAdmin(): Promise<AdminSession | null>;
  signOut(): Promise<void>;
}

export interface CondominiumRepository {
  findById(id: string): Promise<Condominium | null>;
  findBySlug(slug: string): Promise<Condominium | null>;
  /** Condominios que ese administrador puede gestionar. */
  listForAdmin(adminUserId: string): Promise<Condominium[]>;
  findWithSettings(id: string): Promise<CondominiumWithSettings | null>;
  update(id: string, update: { name: string; city: string | null; settings: CondominiumSettings }): Promise<CondominiumWithSettings>;
  saveAliquotScheme(id: string, scheme: AliquotScheme): Promise<void>;
}

export interface HouseRepository {
  findById(id: string): Promise<House | null>;
  listByCondominium(condominiumId: string): Promise<House[]>;
  /** Actualiza varias unidades a la vez (solo los campos presentes). Devuelve las actualizadas. */
  updateMany(updates: ({ id: string } & HouseUpdate)[]): Promise<House[]>;
}

/** Relación de gastos mensual de un condominio (un agregado). */
export interface BillingSheetRepository {
  find(condominiumId: string, period: BillingPeriod): Promise<BillingSheet | null>;
  /** El mes más reciente anterior a `period` que tenga relación de gastos (para copiarla). */
  findLatestBefore(condominiumId: string, period: BillingPeriod): Promise<BillingSheet | null>;
  save(sheet: BillingSheet): Promise<BillingSheet>;
  /** Todas las relaciones guardadas del condominio (métricas de egresos). */
  listByCondominium(condominiumId: string): Promise<BillingSheet[]>;
}

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findByHouseAndPeriod(houseId: string, period: BillingPeriod): Promise<Invoice | null>;
  /** Recibo emitido más reciente (la "factura del mes" del residente). */
  findLatestAvailableForHouse(houseId: string): Promise<Invoice | null>;
  listByCondominiumAndPeriod(condominiumId: string, period: BillingPeriod): Promise<Invoice[]>;
  /** Todos los recibos emitidos del condominio (cualquier periodo): alimentan el libro de cuentas. */
  listIssuedByCondominium(condominiumId: string): Promise<Invoice[]>;
  /** Crea o reemplaza la factura emitida de esa casa y periodo. */
  saveGenerated(invoice: GeneratedInvoice): Promise<Invoice>;
}

/** Pagos y abonos de las casas. */
export interface PaymentRepository {
  listByCondominium(condominiumId: string): Promise<Payment[]>;
  create(payment: NewPayment): Promise<Payment>;
  delete(id: string): Promise<void>;
}

/** Deudas registradas a mano (saldos previos, acuerdos…). */
export interface HouseDebtRepository {
  listByCondominium(condominiumId: string): Promise<HouseDebt[]>;
  create(debt: NewDebt): Promise<HouseDebt>;
  delete(id: string): Promise<void>;
}

/** Lo que la facturación necesita del libro de cuentas (lo implementa AccountService). */
export interface AccountLedger {
  /** Deuda anterior de cada casa para el recibo de `period`. */
  previousDebts(condominiumId: string, period: BillingPeriod): Promise<Map<string, PreviousDebt>>;
  /** Cuánto se ha pagado de cada recibo emitido (clave: id del recibo). */
  invoiceStates(condominiumId: string): Promise<Map<string, ChargeState>>;
}

/** Fuente de la tasa USD → Bs. (DolarApi / BCV, o una tasa fija para desarrollo). Lanza si falla. */
export interface ExchangeRateProvider {
  fetchUsdToVes(): Promise<ExchangeRate>;
}

/** Persistencia de la tasa diaria (compartida por todas las instancias del servidor). */
export interface ExchangeRateRepository {
  findByDay(day: string): Promise<ExchangeRate | null>;
  /** La más reciente guardada (respaldo si la API falla). */
  findLatest(): Promise<ExchangeRate | null>;
  saveForDay(day: string, rate: ExchangeRate): Promise<void>;
}

/** Tasa lista para usar: nunca lanza; null si no hay ninguna disponible. */
export interface CurrentExchangeRate {
  current(): Promise<ExchangeRate | null>;
}

export interface PinVerifier {
  verify(username: string, pin: string): Promise<PinVerificationResult>;
}

export interface InvoiceDocumentData {
  condominiumName: string;
  houseNumber: string;
  ownerName: string | null;
  month: number;
  year: number;
  ownerDocument: string | null;
  settings: ReceiptHeaderSettings;
  detail: InvoiceBreakdown;
  /** Tasa del día de emisión; null si no se pudo obtener (el PDF muestra solo USD). */
  exchangeRate: ExchangeRate | null;
  /** Número de recibo legible, ej. "2026-09-0012". */
  receiptNumber: string;
  issuedAt: Date;
}

/** Generación de PDF al momento, sin guardar archivos (implementado por PdfInvoiceFacade). */
export interface InvoicePdfRenderer {
  render(data: InvoiceDocumentData): Promise<Uint8Array>;
}

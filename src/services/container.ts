// Composition root: el ÚNICO lugar que conoce las implementaciones concretas.
// Cambiar de almacenamiento local a Supabase / Google Drive = cambiar DATA_PROVIDER /
// STORAGE_PROVIDER en el .env. Ningún endpoint, página ni componente se entera.
import type { AstroCookies } from 'astro';
import { config } from '@/services/config';
import type {
  AdminAuthenticator,
  BillingSheetRepository,
  CondominiumRepository,
  ExchangeRateProvider,
  ExchangeRateRepository,
  HouseDebtRepository,
  HouseRepository,
  InvoiceRepository,
  InvoiceStorage,
  PaymentRepository,
  PinVerifier,
} from '@/services/contracts';
import { InvoiceService } from '@/services/invoices/InvoiceService';
import { CondominiumService } from '@/services/condominiums/CondominiumService';
import { BillingService } from '@/services/billing/BillingService';
import { AccountService } from '@/services/accounts/AccountService';
import { MetricsService } from '@/services/metrics/MetricsService';
import { LoginService } from '@/services/auth/LoginService';
import { PdfInvoiceFacade } from '@/services/pdf/PdfInvoiceFacade';
import { ExchangeRateService } from '@/services/exchange/ExchangeRateService';
import { DolarApiFacade } from '@/services/exchange/DolarApiFacade';
import { FixedRateProvider } from '@/services/exchange/FixedRateProvider';
// Local
import { LocalJsonStore } from '@/services/local/LocalJsonStore';
import { LocalBillingSheetRepository } from '@/services/repositories/LocalBillingSheetRepository';
import { LocalHouseDebtRepository, LocalPaymentRepository } from '@/services/repositories/LocalAccountRepositories';
import { LocalCondominiumRepository } from '@/services/repositories/LocalCondominiumRepository';
import { LocalExchangeRateRepository } from '@/services/repositories/LocalExchangeRateRepository';
import { LocalHouseRepository } from '@/services/repositories/LocalHouseRepository';
import { LocalInvoiceRepository } from '@/services/repositories/LocalInvoiceRepository';
import { LocalPinVerifier } from '@/services/auth/LocalPinVerifier';
import { LocalAdminAuthenticator } from '@/services/auth/LocalAdminAuthenticator';
import { LocalFileStorage } from '@/services/storage/LocalFileStorage';
// Nube
import { getServiceClient } from '@/services/supabase/clients';
import { SupabaseBillingSheetRepository } from '@/services/repositories/SupabaseBillingSheetRepository';
import { SupabaseHouseDebtRepository, SupabasePaymentRepository } from '@/services/repositories/SupabaseAccountRepositories';
import { SupabaseCondominiumRepository } from '@/services/repositories/SupabaseCondominiumRepository';
import { SupabaseExchangeRateRepository } from '@/services/repositories/SupabaseExchangeRateRepository';
import { SupabaseHouseRepository } from '@/services/repositories/SupabaseHouseRepository';
import { SupabaseInvoiceRepository } from '@/services/repositories/SupabaseInvoiceRepository';
import { SupabasePinVerifier } from '@/services/auth/SupabasePinVerifier';
import { SupabaseAdminAuthenticator } from '@/services/auth/SupabaseAdminAuthenticator';
import { GoogleDriveFacade } from '@/services/storage/GoogleDriveFacade';

interface DataLayer {
  condominiums: CondominiumRepository;
  houses: HouseRepository;
  invoices: InvoiceRepository;
  billingSheets: BillingSheetRepository;
  payments: PaymentRepository;
  houseDebts: HouseDebtRepository;
  exchangeRates: ExchangeRateRepository;
  pins: PinVerifier;
  adminAuth: (request: Request, cookies: AstroCookies) => AdminAuthenticator;
}

// ─── Fábricas por proveedor ────────────────────────────────────────────────────
const dataProviders: Record<typeof config.dataProvider, () => DataLayer> = {
  local() {
    const store = localStore();
    return {
      condominiums: new LocalCondominiumRepository(store),
      houses: new LocalHouseRepository(store),
      invoices: new LocalInvoiceRepository(store),
      billingSheets: new LocalBillingSheetRepository(store),
      payments: new LocalPaymentRepository(store),
      houseDebts: new LocalHouseDebtRepository(store),
      exchangeRates: new LocalExchangeRateRepository(store),
      pins: new LocalPinVerifier(store),
      adminAuth: (_request, cookies) =>
        new LocalAdminAuthenticator(cookies, { email: config.local.adminEmail, password: config.local.adminPassword }),
    };
  },
  supabase() {
    const db = getServiceClient();
    return {
      condominiums: new SupabaseCondominiumRepository(db),
      houses: new SupabaseHouseRepository(db),
      invoices: new SupabaseInvoiceRepository(db),
      billingSheets: new SupabaseBillingSheetRepository(db),
      payments: new SupabasePaymentRepository(db),
      houseDebts: new SupabaseHouseDebtRepository(db),
      exchangeRates: new SupabaseExchangeRateRepository(db),
      pins: new SupabasePinVerifier(db),
      adminAuth: (request, cookies) => new SupabaseAdminAuthenticator(request, cookies, db),
    };
  },
};

const storageProviders: Record<typeof config.storageProvider, () => InvoiceStorage> = {
  local: () => new LocalFileStorage(config.local.dataDir),
  google: () => new GoogleDriveFacade(config.googleDrive()),
};

function exchangeRateProvider(): ExchangeRateProvider {
  const settings = config.exchangeRate();
  return settings.provider === 'fixed' ? new FixedRateProvider(settings.fixed) : new DolarApiFacade(settings.url);
}

// ─── Singletons perezosos ──────────────────────────────────────────────────────
let data: DataLayer | null = null;
let invoiceService: InvoiceService | null = null;
let condominiumService: CondominiumService | null = null;
let billingService: BillingService | null = null;
let accountService: AccountService | null = null;
let metricsService: MetricsService | null = null;
let exchangeRates: ExchangeRateService | null = null;

function dataLayer(): DataLayer {
  return (data ??= dataProviders[config.dataProvider]());
}

let store: LocalJsonStore | null = null;

/** Una instancia por carga del módulo; la cola de escritura la comparte LocalJsonStore en todo el proceso. */
function localStore(): LocalJsonStore {
  return (store ??= new LocalJsonStore(config.local.dataDir));
}

if (import.meta.env.PROD && (config.dataProvider === 'local' || config.storageProvider === 'local')) {
  console.warn('[config] Modo local activo en producción: en Vercel el disco es efímero y los datos se perderán.');
}

// ─── API pública ───────────────────────────────────────────────────────────────
export function getInvoiceService(): InvoiceService {
  if (!invoiceService) {
    const { condominiums, houses, invoices } = dataLayer();
    invoiceService = new InvoiceService(
      condominiums,
      houses,
      invoices,
      getBillingService(),
      new PdfInvoiceFacade(),
      storageProviders[config.storageProvider](),
      getExchangeRates(),
    );
  }
  return invoiceService;
}

/** Tasa USD → Bs. del día (una consulta a la API por día, guardada en la base). */
export function getExchangeRates(): ExchangeRateService {
  return (exchangeRates ??= new ExchangeRateService(exchangeRateProvider(), dataLayer().exchangeRates));
}

export function getCondominiumService(): CondominiumService {
  if (!condominiumService) {
    const { condominiums, houses } = dataLayer();
    condominiumService = new CondominiumService(condominiums, houses, getBillingService());
  }
  return condominiumService;
}

/** Relación de gastos y cálculo de facturas. */
export function getBillingService(): BillingService {
  if (!billingService) {
    const { condominiums, houses, invoices, billingSheets } = dataLayer();
    billingService = new BillingService(condominiums, houses, invoices, billingSheets, getAccountService());
  }
  return billingService;
}

/** Libro de cuentas: recibos, deudas registradas y pagos de cada casa. */
export function getAccountService(): AccountService {
  if (!accountService) {
    const { houses, invoices, houseDebts, payments } = dataLayer();
    accountService = new AccountService(houses, invoices, houseDebts, payments);
  }
  return accountService;
}

/** Consolidado financiero por condominio. */
export function getMetricsService(): MetricsService {
  if (!metricsService) {
    const { condominiums, invoices, payments, billingSheets } = dataLayer();
    metricsService = new MetricsService(condominiums, invoices, payments, billingSheets, getAccountService());
  }
  return metricsService;
}

export function getAdminAuthenticator(request: Request, cookies: AstroCookies): AdminAuthenticator {
  return dataLayer().adminAuth(request, cookies);
}

export function getLoginService(request: Request, cookies: AstroCookies): LoginService {
  return new LoginService(getAdminAuthenticator(request, cookies), dataLayer().pins, cookies);
}

export function isLocalDataMode(): boolean {
  return config.dataProvider === 'local';
}

export function getAppName(): string {
  return config.appName;
}

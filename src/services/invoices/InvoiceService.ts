import type { BillingPeriod, Condominium, Invoice } from '@/types/domain';
import type {
  CondominiumRepository,
  CurrentExchangeRate,
  HouseRepository,
  InvoicePdfRenderer,
  InvoiceRepository,
  InvoiceStorage,
} from '@/services/contracts';
import type { BillingService } from '@/services/billing/BillingService';
import { NotFoundError } from '@/services/errors';
import { DEFAULT_SETTINGS } from '@/adapters/condominiumAdapter';
import { invoiceFileName } from '@/utils/invoiceNaming';
import { receiptNumber } from '@/utils/dueDate';

/**
 * Emisión, cobro y descarga de facturas. El cálculo lo hace BillingService; aquí se
 * genera el PDF, se guarda (Condominio → Año → Mes) y se registra con su desglose y tasa BCV.
 * Solo depende de interfaces: no sabe que existen Supabase, Drive, el disco ni pdf-lib.
 */
export class InvoiceService {
  constructor(
    private readonly condominiums: CondominiumRepository,
    private readonly houses: HouseRepository,
    private readonly invoices: InvoiceRepository,
    private readonly billing: BillingService,
    private readonly pdf: InvoicePdfRenderer,
    private readonly storage: InvoiceStorage,
    private readonly exchangeRates: CurrentExchangeRate,
  ) {}

  async generate(condominium: Condominium, houseId: string, period: BillingPeriod): Promise<Invoice> {

    const [{ house, breakdown }, settings, exchangeRate] = await Promise.all([
      this.billing.breakdownFor(condominium, period, houseId),
      this.condominiums.findWithSettings(condominium.id),
      this.exchangeRates.current(),
    ]);

    const pdf = await this.pdf.render({
      condominiumName: condominium.name,
      houseNumber: house.number,
      ownerName: house.ownerName,
      ownerDocument: house.ownerDocument,
      month: period.month,
      year: period.year,
      settings: settings?.settings ?? DEFAULT_SETTINGS,
      detail: breakdown,
      exchangeRate,
      receiptNumber: receiptNumber(period, house.number),
      issuedAt: new Date(),
    });

    const file = await this.storage.uploadInvoice(pdf, {
      condominiumName: condominium.name,
      houseNumber: house.number,
      month: period.month,
      year: period.year,
    });
    return this.invoices.saveGenerated({ houseId, period, detail: breakdown, file, rate: exchangeRate });
  }

  /** PDF de la factura más reciente disponible para la casa del residente. */
  async latestPdfForHouse(houseId: string): Promise<{ invoice: Invoice; pdf: Uint8Array; fileName: string } | null> {
    const invoice = await this.invoices.findLatestAvailableForHouse(houseId);
    if (!invoice?.driveFileId) return null;
    const pdf = await this.storage.downloadInvoice(invoice.driveFileId);
    const fileName = invoiceFileName(invoice.houseNumber ?? 'casa', invoice.month, invoice.year);
    return { invoice, pdf, fileName };
  }

  /** Lo que ve el residente al entrar: su condominio, su última factura y la tasa de hoy. */
  async residentOverview(houseId: string, condominiumId: string) {
    const [condominium, invoice, exchangeRate] = await Promise.all([
      this.condominiums.findById(condominiumId),
      this.invoices.findLatestAvailableForHouse(houseId),
      this.exchangeRates.current(),
    ]);
    return { condominium, invoice, exchangeRate };
  }

  /**
   * Archivo almacenado por id (vista previa del panel admin), solo si pertenece a uno
   * de los condominios permitidos. Si no, NotFoundError (no revela que existe).
   */
  async readStoredFileFor(allowed: Condominium[], fileId: string): Promise<Uint8Array> {
    const invoice = await this.invoices.findByStoredFileId(fileId);
    const house = invoice ? await this.houses.findById(invoice.houseId) : null;
    if (!house || !allowed.some((c) => c.id === house.condominiumId)) throw new NotFoundError('Archivo no encontrado');
    return this.storage.downloadInvoice(fileId);
  }
}

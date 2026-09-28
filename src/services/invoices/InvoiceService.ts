import type { BillingPeriod, Condominium, Invoice } from '@/types/domain';
import type { CondominiumRepository, CurrentExchangeRate, HouseRepository, InvoicePdfRenderer, InvoiceRepository } from '@/services/contracts';
import type { BillingService } from '@/services/billing/BillingService';
import { NotFoundError } from '@/services/errors';
import { DEFAULT_SETTINGS } from '@/adapters/condominiumAdapter';
import { issuedRateOf } from '@/adapters/invoiceAdapter';
import { invoiceFileName } from '@/utils/invoiceNaming';
import { receiptNumber } from '@/utils/dueDate';

export interface InvoicePdf {
  invoice: Invoice;
  pdf: Uint8Array;
  fileName: string;
}

/**
 * Emisión y descarga de recibos. Solo datos relacionales: emitir = guardar el desglose
 * congelado y la tasa BCV del día; el PDF se dibuja al momento cada vez que se pide, a partir
 * de esos datos (no se guarda ningún archivo). El cálculo lo hace BillingService.
 */
export class InvoiceService {
  constructor(
    private readonly condominiums: CondominiumRepository,
    private readonly houses: HouseRepository,
    private readonly invoices: InvoiceRepository,
    private readonly billing: BillingService,
    private readonly pdf: InvoicePdfRenderer,
    private readonly exchangeRates: CurrentExchangeRate,
  ) {}

  async generate(condominium: Condominium, houseId: string, period: BillingPeriod): Promise<Invoice> {
    const [{ breakdown }, exchangeRate] = await Promise.all([
      this.billing.breakdownFor(condominium, period, houseId),
      this.exchangeRates.current(),
    ]);
    return this.invoices.saveGenerated({ houseId, period, detail: breakdown, rate: exchangeRate });
  }

  /** PDF del recibo más reciente de la casa del residente (null si aún no hay ninguno). */
  async latestPdfForHouse(houseId: string): Promise<InvoicePdf | null> {
    const invoice = await this.invoices.findLatestAvailableForHouse(houseId);
    return invoice ? this.renderIssued(invoice) : null;
  }

  /**
   * PDF de un recibo para el panel, solo si es de uno de los condominios permitidos.
   * Si no, NotFoundError (no revela que existe).
   */
  async pdfForAdmin(allowed: Condominium[], invoiceId: string): Promise<InvoicePdf> {
    const invoice = await this.invoices.findById(invoiceId);
    const house = invoice ? await this.houses.findById(invoice.houseId) : null;
    if (!invoice || !house || !allowed.some((c) => c.id === house.condominiumId)) throw new NotFoundError('Recibo no encontrado');
    return this.renderIssued(invoice);
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
   * Dibuja el PDF de un recibo emitido. Montos, líneas, deuda y tasa salen del desglose
   * congelado al emitir (no cambian aunque luego se editen los gastos); el encabezado usa
   * los datos actuales del condominio y del propietario.
   */
  private async renderIssued(invoice: Invoice): Promise<InvoicePdf> {
    if (invoice.status === 'pending' || !invoice.detail) throw new NotFoundError('Este recibo todavía no se ha emitido');
    const house = await this.houses.findById(invoice.houseId);
    if (!house) throw new NotFoundError('Recibo no encontrado');
    const condominium = await this.condominiums.findWithSettings(house.condominiumId);
    if (!condominium) throw new NotFoundError('Recibo no encontrado');

    const period = { month: invoice.month, year: invoice.year };
    const pdf = await this.pdf.render({
      condominiumName: condominium.name,
      houseNumber: house.number,
      ownerName: house.ownerName,
      ownerDocument: house.ownerDocument,
      month: invoice.month,
      year: invoice.year,
      settings: condominium.settings ?? DEFAULT_SETTINGS,
      detail: invoice.detail,
      exchangeRate: issuedRateOf(invoice),
      receiptNumber: receiptNumber(period, house.number),
      issuedAt: invoice.generatedAt ?? new Date(),
    });
    return { invoice, pdf, fileName: invoiceFileName(house.number, invoice.month, invoice.year) };
  }
}

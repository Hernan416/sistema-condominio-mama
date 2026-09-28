import type { BillingPeriod, Condominium, CondominiumSettings, House, Invoice, IssuedReceiptHeader } from '@/types/domain';
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
    const [{ house, breakdown }, full, exchangeRate] = await Promise.all([
      this.billing.breakdownFor(condominium, period, houseId),
      this.condominiums.findWithSettings(condominium.id),
      this.exchangeRates.current(),
    ]);
    // Foto del recibo en este instante: montos (desglose), tasa y encabezado quedan congelados.
    const header = headerOf(full?.name ?? condominium.name, house, full?.settings ?? DEFAULT_SETTINGS, receiptNumber(period, house.number), exchangeRate?.source ?? null);
    return this.invoices.saveGenerated({ houseId, period, detail: breakdown, rate: exchangeRate, header, issuedAt: new Date() });
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
   * Dibuja el PDF de un recibo emitido SOLO con lo que se congeló al emitir: desglose, tasa
   * (y por tanto los Bs.), fecha y encabezado (condominio, RIF, cuentas, dueño, cédula).
   * Nada de lo que se edite después lo cambia. Los recibos emitidos antes de guardar el
   * encabezado usan los datos actuales como respaldo.
   */
  private async renderIssued(invoice: Invoice): Promise<InvoicePdf> {
    if (invoice.status === 'pending' || !invoice.detail) throw new NotFoundError('Este recibo todavía no se ha emitido');
    const header = invoice.issued ?? (await this.currentHeaderFor(invoice));

    const pdf = await this.pdf.render({
      condominiumName: header.condominiumName,
      houseNumber: header.houseNumber,
      ownerName: header.ownerName,
      ownerDocument: header.ownerDocument,
      month: invoice.month,
      year: invoice.year,
      settings: header.settings,
      detail: invoice.detail,
      exchangeRate: issuedRateOf(invoice),
      receiptNumber: header.receiptNumber,
      issuedAt: invoice.generatedAt ?? new Date(),
    });
    return { invoice, pdf, fileName: invoiceFileName(header.houseNumber, invoice.month, invoice.year) };
  }

  /** Respaldo para recibos emitidos antes de congelar el encabezado. */
  private async currentHeaderFor(invoice: Invoice): Promise<IssuedReceiptHeader> {
    const house = await this.houses.findById(invoice.houseId);
    const condominium = house ? await this.condominiums.findWithSettings(house.condominiumId) : null;
    if (!house || !condominium) throw new NotFoundError('Recibo no encontrado');
    return headerOf(condominium.name, house, condominium.settings, receiptNumber({ month: invoice.month, year: invoice.year }, house.number), null);
  }
}

function headerOf(condominiumName: string, house: House, settings: CondominiumSettings, number: string, rateSource: string | null): IssuedReceiptHeader {
  return {
    condominiumName,
    houseNumber: house.number,
    ownerName: house.ownerName,
    ownerDocument: house.ownerDocument,
    receiptNumber: number,
    settings: {
      rif: settings.rif,
      address: settings.address,
      administratorName: settings.administratorName,
      administratorRif: settings.administratorRif,
      paymentInstructions: settings.paymentInstructions,
    },
    exchangeRateSource: rateSource,
  };
}

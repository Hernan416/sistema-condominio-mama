import { PDFDocument, StandardFonts } from 'pdf-lib';
import { formatVes, usdToVes } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';
import { formatPeriod } from '@/utils/months';
import { formatPercent } from '@/utils/billingCalculator';
import type { InvoiceDocumentData, InvoicePdfRenderer } from '@/services/contracts';
import type { InvoiceLine } from '@/types/billing';
import { ACCENT, INK, LEFT, MUTED, RIGHT, SUNKEN, TINT, WARN, usd, Writer, type RGB } from '@/services/pdf/pdfWriter';

const COL_BUILDING = 440; // borde derecho de la columna "Monto en $"

const rateFormat = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * FACADE sobre pdf-lib: el resto del sistema solo conoce `render(data)`.
 * Sigue el formato de los recibos reales de la Junta de Condominio: encabezado con RIF,
 * franja "INMOBILIARIO/PROPIETARIO/ALÍCUOTAS", tabla de conceptos (Monto en $ / Alícuotas
 * $), Sub-total, Fondo de Reserva, Total de Gastos Comunes,
 * Estado de Cuenta (deuda anterior, cuota del mes, total a pagar) y forma de pago.
 */
export class PdfInvoiceFacade implements InvoicePdfRenderer {
  async render(data: InvoiceDocumentData): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Recibo ${data.receiptNumber} · ${data.condominiumName} · Casa ${data.houseNumber}`);
    doc.setAuthor(data.settings.administratorName ?? data.condominiumName);
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const w = new Writer(doc, fonts);
    const { detail, settings } = data;

    // ── Encabezado ─────────────────────────────────────────────
    w.text(data.condominiumName.toUpperCase(), LEFT, 20, 'bold');
    const headerLeft = [
      settings.address,
      [settings.rif ? `RIF: ${settings.rif}` : null, settings.administratorName ? `Administra: ${settings.administratorName}` : null].filter(Boolean).join(' · ') || null,
    ].filter(Boolean) as string[];
    let hy = w.y - 18;
    for (const line of headerLeft) {
      for (const wrapped of w.wrapLines(line, 9.5, 300)) {
        w.textAt(wrapped, LEFT, hy, 9.5, 'regular', MUTED);
        hy -= 12;
      }
    }
    const top = w.y;
    w.textRight('RECIBO DE CONDOMINIO', RIGHT, top, 11, 'bold', ACCENT);
    w.textRight(`Periodo Facturado: ${formatPeriod(data.month, data.year).toUpperCase()}`, RIGHT, top - 16, 10, 'bold');
    w.textRight(`Fecha de envío: ${formatDateVe(data.issuedAt)}`, RIGHT, top - 30, 10, 'regular', MUTED);
    if (data.exchangeRate) w.textRight(`Tasa BCV: Bs. ${rateFormat.format(data.exchangeRate.usdToVes)}`, RIGHT, top - 43, 10, 'regular', MUTED);
    if (detail.dueDate) w.textRight(`Vence: ${formatDateVe(new Date(`${detail.dueDate}T12:00:00-04:00`))}`, RIGHT, top - 56, 10, 'bold', INK);
    w.y = Math.min(hy, top - 56) - 18;

    // ── Inmobiliario / propietario ──────────────────────────────
    const boxH = 58;
    w.page.drawRectangle({ x: LEFT, y: w.y - boxH + 12, width: RIGHT - LEFT, height: boxH, color: SUNKEN });
    const col = (label: string, value: string, x: number, width: number) => {
      w.textAt(label, x, w.y, 8.5, 'regular', MUTED);
      w.textAt(value, x, w.y - 15, 11, 'bold', INK, width);
    };
    col('INMOBILIARIO', `Casa ${data.houseNumber}`, LEFT + 12, 70);
    col('PROPIETARIO', data.ownerName ?? '—', LEFT + 92, 210);
    col('C.I. / RIF', data.ownerDocument ?? '—', LEFT + 312, 100);
    col('ALÍCUOTAS', formatPercent(detail.aliquot), LEFT + 422, 90);
    const status = detail.solvent ? 'Solvente' : `Con deuda: ${detail.previousDebtCount} recibo${detail.previousDebtCount === 1 ? '' : 's'} pendiente${detail.previousDebtCount === 1 ? '' : 's'}`;
    w.textAt(status, LEFT + 12, w.y - 33, 9.5, 'bold', detail.solvent ? ACCENT : WARN);
    w.y -= boxH + 10;

    // ── Relación de gastos ─────────────────────────────────────
    const tableHeader = () => {
      w.textAt('CONCEPTO', LEFT, w.y, 8.5, 'bold', MUTED);
      w.textRight('MONTO EN $', COL_BUILDING, w.y, 8.5, 'bold', MUTED);
      w.textRight('ALÍCUOTAS $', RIGHT, w.y, 8.5, 'bold', MUTED);
      w.y -= 7;
      w.rule();
      w.y -= 14;
    };
    w.onNewPage = tableHeader;
    tableHeader();

    let buildingSubtotal = 0;
    let unitSubtotal = 0;
    const reserveLines = detail.lines.filter((l) => l.kind === 'reserve');
    for (const line of detail.lines) {
      if (line.kind === 'reserve') continue;
      this.drawLine(w, line);
      buildingSubtotal += line.buildingAmount ?? 0;
      unitSubtotal += line.unitAmount;
    }

    w.ensure(20);
    w.rule();
    w.y -= 14;
    this.drawTotalRow(w, 'Sub-total', buildingSubtotal, unitSubtotal, 'bold');

    for (const line of reserveLines) this.drawLine(w, line);
    const reserveBuilding = reserveLines.reduce((s, l) => s + (l.buildingAmount ?? 0), 0);

    w.ensure(20);
    w.page.drawRectangle({ x: LEFT, y: w.y - 5, width: RIGHT - LEFT, height: 18, color: TINT });
    this.drawTotalRow(w, 'TOTAL DE GASTOS COMUNES DEL MES', buildingSubtotal + reserveBuilding, detail.monthTotal, 'bold', ACCENT);
    w.y -= 10;

    // ── Estado de cuenta ────────────────────────────────────────
    w.onNewPage = null; // lo que sigue ya no es la tabla: no repetir su encabezado
    w.ensure(120);
    w.textAt('ESTADO DE CUENTA', LEFT, w.y, 9.5, 'bold', MUTED);
    w.y -= 16;
    const stateRow = (label: string, value: string, size = 10.5, font: 'regular' | 'bold' = 'regular', color: RGB = INK) => {
      w.textAt(label, LEFT + 250, w.y, size, font, color);
      w.textRight(value, RIGHT, w.y, size, font, color);
      w.y -= size + 7;
    };
    stateRow(`Deuda anterior (${detail.previousDebtCount} pendiente${detail.previousDebtCount === 1 ? '' : 's'})`, usd(detail.previousDebt), 10.5, 'regular', detail.previousDebt > 0 ? WARN : MUTED);
    stateRow('Cuota del mes', usd(detail.monthTotal), 10.5, 'regular');
    w.y -= 6;
    w.page.drawRectangle({ x: LEFT + 240, y: w.y - 30, width: RIGHT - LEFT - 240, height: 46, color: TINT });
    w.textAt('TOTAL A PAGAR EN $', LEFT + 252, w.y - 4, 11, 'bold', ACCENT);
    w.textRight(usd(detail.totalDue), RIGHT - 12, w.y - 8, 20, 'bold', ACCENT);
    if (data.exchangeRate) {
      w.textRight(formatVes(usdToVes(detail.totalDue, data.exchangeRate.usdToVes)), RIGHT - 12, w.y - 24, 10.5, 'bold', INK);
    }
    w.y -= 46;
    w.paragraph('Nota importante: se tomará la tasa vigente del Banco Central de Venezuela (BCV) al momento en que realice su pago.', 9, 'bold', WARN);
    w.paragraph(
      'Es importante resaltar que, al pagar puntualmente su recibo de condominio, contribuye a mantener en excelente funcionamiento todos los servicios de las áreas comunes, beneficiando a su comunidad y revalorizando su inmueble.',
      8.5, 'regular', MUTED,
    );

    // ── Notas ──────────────────────────────────────────────────
    for (const note of [detail.unitNote, detail.generalNote].filter(Boolean) as string[]) {
      w.y -= 6;
      w.paragraph(note, 10, 'bold', INK);
    }

    // ── Forma de pago ──────────────────────────────────────────
    if (settings.paymentInstructions) {
      w.y -= 10;
      w.ensure(40);
      w.textAt('FORMA DE PAGO', LEFT, w.y, 8.5, 'bold', MUTED);
      w.y -= 14;
      for (const line of settings.paymentInstructions.split('\n')) {
        w.ensure(20);
        w.page.drawRectangle({ x: LEFT, y: w.y - 6, width: RIGHT - LEFT, height: 18, color: SUNKEN });
        w.paragraph(line, 9.5, 'regular', INK);
        w.y -= 4;
      }
    }

    // ── Pie legal ──────────────────────────────────────────────
    w.y -= 10;
    w.paragraph('Conforme al artículo 14 de la Ley de Propiedad Horizontal, esta liquidación tiene fuerza ejecutiva.', 8, 'regular', MUTED);

    w.footerOnAllPages(`${data.condominiumName} · Recibo N° ${data.receiptNumber}`);
    return doc.save();
  }

  private drawLine(w: Writer, line: InvoiceLine) {
    w.ensure(16);
    w.textAt(line.concept, LEFT + 10, w.y, 9.5, 'regular', INK, COL_BUILDING - LEFT - 70);
    if (line.buildingAmount !== null) w.textRight(usd(line.buildingAmount), COL_BUILDING, w.y, 10, 'regular', MUTED);
    w.textRight(usd(line.unitAmount), RIGHT, w.y, 10, 'bold', line.unitAmount < 0 ? ACCENT : INK);
    w.y -= 15;
  }

  private drawTotalRow(w: Writer, label: string, building: number, unit: number, font: 'regular' | 'bold', color: RGB = INK) {
    w.textAt(label, LEFT, w.y, 10, font, color);
    w.textRight(usd(building), COL_BUILDING, w.y, 10, font, color);
    w.textRight(usd(unit), RIGHT, w.y, 10, font, color);
    w.y -= 18;
  }
}

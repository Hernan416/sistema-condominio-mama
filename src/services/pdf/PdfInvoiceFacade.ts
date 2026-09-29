import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';
import { formatPeriod } from '@/utils/months';
import { formatPercent } from '@/utils/billingCalculator';
import type { InvoiceDocumentData, InvoicePdfRenderer } from '@/services/contracts';
import type { InvoiceLine } from '@/types/billing';

const INK = rgb(0.06, 0.1, 0.08);
const MUTED = rgb(0.29, 0.34, 0.31);
const ACCENT = rgb(0.05, 0.42, 0.31);
const WARN = rgb(0.54, 0.33, 0);
const RULE = rgb(0.86, 0.87, 0.85);
const TINT = rgb(0.93, 0.96, 0.94);
const SUNKEN = rgb(0.95, 0.955, 0.945);
const HEADER_BAR = rgb(0.86, 0.9, 0.87); // barra de las cabeceras de sección ("GASTO ADMINISTRATIVO"…)

const PAGE: [number, number] = [612, 792]; // carta
const LEFT = 48;
const RIGHT = 564;
const BOTTOM = 64;
const COL_BUILDING = 440; // borde derecho de la columna "Monto en $"

const rateFormat = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/**
 * Una línea sin monto (concepto en mayúsculas, $0 en las dos columnas) es una cabecera de
 * sección tal como venían en los recibos originales ("GASTO ADMINISTRATIVO", "SERVICIO
 * PUBLICO"…): se dibuja como una barra en vez de una línea de cobro más.
 */
function isSectionHeader(line: InvoiceLine): boolean {
  return line.unitAmount === 0 && (line.buildingAmount === null || line.buildingAmount === 0) && line.concept === line.concept.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(line.concept);
}

// Equivalentes de caracteres frecuentes que la fuente estándar (WinAnsi) no incluye.
const REPLACEMENTS: Record<string, string> = {
  '\u2212': '-', // signo menos
  '\u2010': '-', // guion
  '\u2011': '-', // guion no separable
  '\u00a0': ' ', // espacio no separable (lo usa Intl)
  '\u202f': ' ', // espacio fino no separable
  '\u2248': '~', // aproximadamente
  '\u2192': '->', // flecha
  '\u2713': '', // visto bueno (sin equivalente: se omite)
};

/**
 * Deja solo caracteres que la fuente puede dibujar: nunca falla la emisión por un emoji o un
 * símbolo raro escrito en una nota o un concepto. Lo que no tiene equivalente se omite.
 */
function printable(text: string, font: PDFFont): string {
  const supported = charsetOf(font);
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const c = REPLACEMENTS[ch] ?? ch;
    if ([...c].every((x) => supported.has(x.codePointAt(0)!))) out += c;
    else if (/\s/.test(ch)) out += ' ';
  }
  return out;
}

const charsets = new WeakMap<PDFFont, Set<number>>();
function charsetOf(font: PDFFont): Set<number> {
  let set = charsets.get(font);
  if (!set) charsets.set(font, (set = new Set(font.getCharacterSet())));
  return set;
}

/** Montos para el PDF: solo caracteres WinAnsi (la fuente estándar no tiene "−"). */
const usd = (n: number) => (n < 0 ? `- ${formatUsd(Math.abs(n))}` : formatUsd(n));

/**
 * FACADE sobre pdf-lib: el resto del sistema solo conoce `render(data)`.
 * Sigue el formato de los recibos reales de la Junta de Condominio: encabezado con RIF,
 * franja "INMOBILIARIO/PROPIETARIO/ALÍCUOTAS", tabla de conceptos (Monto en $ / Alícuotas
 * $) con sus cabeceras de sección, Sub-total, Fondo de Reserva, Total de Gastos Comunes,
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
      if (isSectionHeader(line)) this.drawSectionHeader(w, line.concept);
      else this.drawLine(w, line);
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
    const legal = [
      'Conforme al artículo 14 de la Ley de Propiedad Horizontal, esta liquidación tiene fuerza ejecutiva.',
      detail.lateInterestMonthlyPercent > 0
        ? `Los recibos vencidos generan un interés de mora de ${formatPercent(detail.lateInterestMonthlyPercent)} mensual, aprobado en asamblea.`
        : null,
    ].filter(Boolean) as string[];
    for (const line of legal) w.paragraph(line, 8, 'regular', MUTED);

    w.footerOnAllPages(`${data.condominiumName} · Recibo N° ${data.receiptNumber}`);
    return doc.save();
  }

  private drawSectionHeader(w: Writer, concept: string) {
    w.ensure(20);
    w.page.drawRectangle({ x: LEFT, y: w.y - 4, width: RIGHT - LEFT, height: 15, color: HEADER_BAR });
    w.textAt(concept, LEFT + 4, w.y, 9, 'bold', INK);
    w.y -= 17;
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

/** Cursor de escritura con salto de página automático. */
class Writer {
  page: PDFPage;
  y: number;
  onNewPage: (() => void) | null = null;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: { regular: PDFFont; bold: PDFFont },
  ) {
    this.page = this.addPage();
    this.y = PAGE[1] - 56;
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage(PAGE);
    this.pages.push(page);
    return page;
  }

  /** Si no caben `height` puntos, continúa en una página nueva (repitiendo el encabezado de la tabla). */
  ensure(height: number) {
    if (this.y - height >= BOTTOM) return;
    this.page = this.addPage();
    this.y = PAGE[1] - 56;
    this.onNewPage?.();
  }

  text(value: string, x: number, size: number, font: 'regular' | 'bold', color: RGB = INK) {
    this.textAt(value, x, this.y, size, font, color);
  }

  textAt(value: string, x: number, y: number, size: number, font: 'regular' | 'bold', color: RGB = INK, maxWidth?: number) {
    const f = this.fonts[font];
    const safe = printable(value, f);
    const text = maxWidth ? fit(safe, f, size, maxWidth) : safe;
    this.page.drawText(text, { x, y, size, font: f, color });
  }

  textRight(value: string, right: number, y: number, size: number, font: 'regular' | 'bold', color: RGB = INK) {
    const f = this.fonts[font];
    const text = printable(value, f);
    this.page.drawText(text, { x: right - f.widthOfTextAtSize(text, size), y, size, font: f, color });
  }

  /** Parte `value` en líneas que quepan en `maxWidth`, para dibujarlas donde haga falta. */
  wrapLines(value: string, size: number, maxWidth: number, font: 'regular' | 'bold' = 'regular'): string[] {
    return wrap(printable(value, this.fonts[font]), this.fonts[font], size, maxWidth);
  }

  /** Texto con salto de línea automático dentro de los márgenes. */
  paragraph(value: string, size: number, font: 'regular' | 'bold', color: RGB) {
    const f = this.fonts[font];
    for (const line of wrap(printable(value, f), f, size, RIGHT - LEFT)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: LEFT, y: this.y, size, font: f, color });
      this.y -= size + 4;
    }
  }

  rule() {
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: RIGHT, y: this.y }, thickness: 1, color: RULE });
  }

  footerOnAllPages(label: string) {
    this.pages.forEach((page, i) => {
      const text = `${label} · Página ${i + 1} de ${this.pages.length}`;
      page.drawText(text, { x: LEFT, y: 36, size: 8, font: this.fonts.regular, color: MUTED });
    });
  }
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

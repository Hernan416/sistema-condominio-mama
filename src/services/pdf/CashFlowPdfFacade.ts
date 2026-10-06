// FACADE sobre pdf-lib para el reporte de ingresos y egresos de UN mes: nadie fuera de aquí
// toca pdf-lib para armarlo.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { formatUsd } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types/accounts';
import type { CondominiumSettings } from '@/types/domain';
import { ACCENT, HEADER_BAR, INK, LEFT, MUTED, RIGHT, SUNKEN, TINT, WARN, Writer } from '@/services/pdf/pdfWriter';

export interface CashFlowPdfPayment {
  date: string;
  houseNumber: string;
  ownerName: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
}

export interface CashFlowPdfLine {
  concept: string;
  category: string | null;
  amount: number;
}

export interface CashFlowDocumentData {
  condominiumName: string;
  settings: Pick<CondominiumSettings, 'rif' | 'address' | 'administratorName'>;
  monthLabel: string;
  generatedAt: Date;
  openingBalance: number;
  payments: CashFlowPdfPayment[];
  incomeLines: CashFlowPdfLine[];
  incomeTotal: number;
  expenseLines: CashFlowPdfLine[];
  expenseTotal: number;
  closingBalance: number;
}

const day = (iso: string) => formatDateVe(new Date(`${iso}T12:00:00-04:00`));
const NO_CATEGORY = 'Sin categoría';

/** Agrupa líneas por categoría (las sin categoría al final), conservando su orden original. */
function groupByCategory<T extends { category: string | null }>(lines: T[]): { category: string; items: T[]; total: number }[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const key = line.category?.trim() || NO_CATEGORY;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(line);
  }
  order.sort((a, b) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, 'es')));
  return order.map((category) => {
    const items = groups.get(category)!;
    return { category, items, total: items.reduce((s, l) => s + (l as unknown as { amount: number }).amount, 0) };
  });
}

/** Reporte de ingresos y egresos de un mes: pagos recibidos, otros ingresos y gastos, con el saldo. */
export class CashFlowPdfFacade {
  async render(data: CashFlowDocumentData): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Ingresos y egresos · ${data.condominiumName} · ${data.monthLabel}`);
    doc.setAuthor(data.settings.administratorName ?? data.condominiumName);
    const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
    const w = new Writer(doc, fonts);

    // ── Encabezado ─────────────────────────────────────────────
    w.text(data.condominiumName.toUpperCase(), LEFT, 20, 'bold');
    const headerLeft = [
      data.settings.address,
      [data.settings.rif ? `RIF: ${data.settings.rif}` : null, data.settings.administratorName ? `Administra: ${data.settings.administratorName}` : null].filter(Boolean).join(' · ') || null,
    ].filter(Boolean) as string[];
    let hy = w.y - 18;
    for (const line of headerLeft) {
      for (const wrapped of w.wrapLines(line, 9.5, 300)) {
        w.textAt(wrapped, LEFT, hy, 9.5, 'regular', MUTED);
        hy -= 12;
      }
    }
    const top = w.y;
    w.textRight('INGRESOS Y EGRESOS', RIGHT, top, 11, 'bold', ACCENT);
    w.textRight(`Mes: ${data.monthLabel}`, RIGHT, top - 16, 10, 'bold');
    w.textRight(`Generado: ${formatDateVe(data.generatedAt)}`, RIGHT, top - 30, 10, 'regular', MUTED);
    w.y = Math.min(hy, top - 30) - 18;

    // ── Resumen ──────────────────────────────────────────────────
    const boxH = 50;
    w.page.drawRectangle({ x: LEFT, y: w.y - boxH + 12, width: RIGHT - LEFT, height: boxH, color: SUNKEN });
    const stat = (label: string, value: string, x: number, color = INK) => {
      w.textAt(label, x, w.y, 8.5, 'regular', MUTED);
      w.textAt(value, x, w.y - 16, 13, 'bold', color);
    };
    const colW = (RIGHT - LEFT - 24) / 4;
    stat('SALDO INICIAL', formatUsd(data.openingBalance), LEFT + 12, INK);
    stat('INGRESOS', `+ ${formatUsd(data.incomeTotal)}`, LEFT + 12 + colW, ACCENT);
    stat('EGRESOS', `- ${formatUsd(data.expenseTotal)}`, LEFT + 12 + colW * 2, WARN);
    stat('SALDO DISPONIBLE', formatUsd(data.closingBalance), LEFT + 12 + colW * 3, data.closingBalance < 0 ? WARN : ACCENT);
    w.y -= boxH + 18;

    // ── Ingresos ─────────────────────────────────────────────────
    w.ensure(24);
    w.textAt('INGRESOS', LEFT, w.y, 11, 'bold', ACCENT);
    w.textRight(formatUsd(data.incomeTotal), RIGHT, w.y, 11, 'bold', ACCENT);
    w.y -= 8;
    w.rule();
    w.y -= 16;

    if (data.payments.length === 0 && data.incomeLines.length === 0) {
      w.textAt('No hay ingresos registrados este mes.', LEFT, w.y, 9.5, 'regular', MUTED);
      w.y -= 18;
    }

    if (data.payments.length > 0) {
      w.ensure(16);
      w.textAt('Pagos de las casas', LEFT, w.y, 9, 'bold', MUTED);
      w.y -= 14;
      const COL_CASA = LEFT + 55;
      const COL_OWNER = LEFT + 90;
      const COL_METHOD = 300;
      for (const p of data.payments) {
        w.ensure(15);
        w.textAt(day(p.date), LEFT, w.y, 9, 'regular', MUTED);
        w.textAt(p.houseNumber, COL_CASA, w.y, 9, 'bold', INK);
        w.textAt(p.ownerName ?? '—', COL_OWNER, w.y, 9, 'regular', INK, COL_METHOD - COL_OWNER - 8);
        const method = `${PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` · Ref. ${p.reference}` : ''}`;
        w.textAt(method, COL_METHOD, w.y, 8.5, 'regular', MUTED, RIGHT - COL_METHOD - 70);
        w.textRight(formatUsd(p.amount), RIGHT, w.y, 9.5, 'bold', ACCENT);
        w.y -= 14;
      }
      w.y -= 4;
    }

    if (data.incomeLines.length > 0) {
      w.ensure(16);
      w.textAt('Otros ingresos de la comunidad', LEFT, w.y, 9, 'bold', MUTED);
      w.y -= 14;
      for (const l of data.incomeLines) {
        w.ensure(15);
        w.textAt(l.concept, LEFT + 10, w.y, 9.5, 'regular', INK, 300);
        w.textAt(l.category?.trim() || NO_CATEGORY, 340, w.y, 8.5, 'regular', MUTED, RIGHT - 340 - 70);
        w.textRight(formatUsd(l.amount), RIGHT, w.y, 9.5, 'bold', ACCENT);
        w.y -= 14;
      }
    }

    // ── Egresos (agrupados por categoría) ─────────────────────────
    w.y -= 10;
    w.ensure(24);
    w.textAt('EGRESOS', LEFT, w.y, 11, 'bold', WARN);
    w.textRight(formatUsd(data.expenseTotal), RIGHT, w.y, 11, 'bold', WARN);
    w.y -= 8;
    w.rule();
    w.y -= 16;

    if (data.expenseLines.length === 0) {
      w.textAt('No hay gastos registrados este mes.', LEFT, w.y, 9.5, 'regular', MUTED);
      w.y -= 18;
    }

    for (const group of groupByCategory(data.expenseLines)) {
      w.ensure(20);
      w.page.drawRectangle({ x: LEFT, y: w.y - 4, width: RIGHT - LEFT, height: 15, color: HEADER_BAR });
      w.textAt(group.category.toUpperCase(), LEFT + 4, w.y, 8.5, 'bold', INK);
      w.textRight(formatUsd(group.total), RIGHT - 4, w.y, 8.5, 'bold', INK);
      w.y -= 17;
      for (const l of group.items) {
        w.ensure(15);
        w.textAt(l.concept, LEFT + 10, w.y, 9.5, 'regular', INK, RIGHT - LEFT - 10 - 70);
        w.textRight(formatUsd(l.amount), RIGHT, w.y, 9.5, 'regular', MUTED);
        w.y -= 14;
      }
      w.y -= 4;
    }

    // ── Cierre ───────────────────────────────────────────────────
    w.ensure(40);
    w.rule();
    w.y -= 14;
    w.page.drawRectangle({ x: LEFT, y: w.y - 5, width: RIGHT - LEFT, height: 18, color: TINT });
    w.textAt('SALDO DISPONIBLE AL CIERRE DEL MES', LEFT, w.y, 10, 'bold', ACCENT);
    w.textRight(formatUsd(data.closingBalance), RIGHT, w.y, 11, 'bold', data.closingBalance < 0 ? WARN : ACCENT);
    w.y -= 26;

    w.paragraph(
      `Saldo inicial ${formatUsd(data.openingBalance)} + ingresos ${formatUsd(data.incomeTotal)} − egresos ${formatUsd(data.expenseTotal)} = saldo disponible ${formatUsd(data.closingBalance)}. Solo incluye movimientos de ${data.monthLabel.toLowerCase()}.`,
      8.5, 'regular', MUTED,
    );

    w.footerOnAllPages(`${data.condominiumName} · Ingresos y egresos de ${data.monthLabel.toLowerCase()}`);
    return doc.save();
  }
}

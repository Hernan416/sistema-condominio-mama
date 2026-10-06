// FACADE sobre pdf-lib para el estado de cuenta consolidado (todas las casas, con el mes
// elegido completo): nadie fuera de aquí toca pdf-lib para armar este reporte.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { formatUsd } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';
import { formatPeriod } from '@/utils/months';
import type { CondominiumSettings } from '@/types/domain';
import { ACCENT, INK, LEFT, MUTED, RIGHT, SUNKEN, TINT, WARN, Writer } from '@/services/pdf/pdfWriter';

export interface AccountStatementRow {
  houseNumber: string;
  ownerName: string | null;
  /** Facturado SOLO en el mes elegido (no acumulado). */
  totalCharged: number;
  /** Pagado SOLO en el mes elegido (no acumulado). */
  totalPaid: number;
  /** Saldo pendiente real al cierre del mes (acumulado). */
  outstanding: number;
  pendingCount: number;
  oldestPendingDate: string | null;
}

export interface AccountStatementDocumentData {
  condominiumName: string;
  settings: Pick<CondominiumSettings, 'rif' | 'address' | 'administratorName'>;
  month: number;
  year: number;
  generatedAt: Date;
  rows: AccountStatementRow[];
}

const day = (iso: string) => formatDateVe(new Date(`${iso}T12:00:00-04:00`));

// Columnas (de LEFT=48 a RIGHT=564): casa, propietario, 3 columnas de monto, cuántos
// pendientes y desde cuándo. Cada una por separado (en vez de un solo texto largo) para que
// nunca se encimen con montos grandes ($ 1.470,23) ni con nombres de meses largos.
const COL_OWNER = LEFT + 28;
const COL_CHARGED = 294;
const COL_PAID = 360;
const COL_PENDING = 426;
const COL_COUNT = 468;

/** Reporte de una página (o varias) con el estado de cada casa, incluyendo el mes elegido completo. */
export class AccountStatementPdfFacade {
  async render(data: AccountStatementDocumentData): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(`Estado de cuenta · ${data.condominiumName} · ${formatPeriod(data.month, data.year)}`);
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
    w.textRight('ESTADO DE CUENTA CONSOLIDADO', RIGHT, top, 11, 'bold', ACCENT);
    w.textRight(`Movimientos de: ${formatPeriod(data.month, data.year).toLowerCase()}`, RIGHT, top - 16, 10, 'bold');
    w.textRight(`Generado: ${formatDateVe(data.generatedAt)}`, RIGHT, top - 30, 10, 'regular', MUTED);
    w.y = Math.min(hy, top - 30) - 18;

    // ── Resumen ──────────────────────────────────────────────────
    const totals = data.rows.reduce(
      (acc, r) => ({ charged: acc.charged + r.totalCharged, paid: acc.paid + r.totalPaid, outstanding: acc.outstanding + r.outstanding }),
      { charged: 0, paid: 0, outstanding: 0 },
    );
    const boxH = 50;
    w.page.drawRectangle({ x: LEFT, y: w.y - boxH + 12, width: RIGHT - LEFT, height: boxH, color: SUNKEN });
    const stat = (label: string, value: string, x: number, color = INK) => {
      w.textAt(label, x, w.y, 8.5, 'regular', MUTED);
      w.textAt(value, x, w.y - 16, 13, 'bold', color);
    };
    const colW = (RIGHT - LEFT - 24) / 4;
    stat('CASAS', String(data.rows.length), LEFT + 12, INK);
    stat('FACTURADO EN EL MES', formatUsd(totals.charged), LEFT + 12 + colW, INK);
    stat('COBRADO EN EL MES', formatUsd(totals.paid), LEFT + 12 + colW * 2, ACCENT);
    stat('SALDO PENDIENTE', formatUsd(totals.outstanding), LEFT + 12 + colW * 3, totals.outstanding > 0 ? WARN : INK);
    w.y -= boxH + 14;

    // ── Tabla ──────────────────────────────────────────────────
    const tableHeader = () => {
      w.textAt('CASA', LEFT, w.y, 8.5, 'bold', MUTED);
      w.textAt('PROPIETARIO', COL_OWNER, w.y, 8.5, 'bold', MUTED);
      w.textRight('FACTURADO', COL_CHARGED, w.y, 8.5, 'bold', MUTED);
      w.textRight('PAGADO', COL_PAID, w.y, 8.5, 'bold', MUTED);
      w.textRight('PENDIENTE', COL_PENDING, w.y, 8.5, 'bold', MUTED);
      w.textRight('N.°', COL_COUNT, w.y, 8.5, 'bold', MUTED);
      w.textRight('DESDE', RIGHT, w.y, 8.5, 'bold', MUTED);
      w.y -= 7;
      w.rule();
      w.y -= 14;
    };
    w.onNewPage = tableHeader;
    tableHeader();

    if (data.rows.length === 0) {
      w.textAt('No hay casas registradas en este condominio.', LEFT, w.y, 10, 'regular', MUTED);
      w.y -= 16;
    }

    for (const r of data.rows) {
      w.ensure(16);
      const owing = r.outstanding > 0.005;
      w.textAt(r.houseNumber, LEFT, w.y, 9.5, 'bold', INK);
      // Se reserva bastante espacio antes de FACTURADO (no solo 10 pt): su monto está alineado a
      // la derecha y uno grande ("$ 1.470,23") empieza a dibujarse bien a la izquierda de esa columna.
      w.textAt(r.ownerName ?? '—', COL_OWNER, w.y, 9.5, 'regular', INK, COL_CHARGED - COL_OWNER - 65);
      w.textRight(formatUsd(r.totalCharged), COL_CHARGED, w.y, 9.5, 'regular', MUTED);
      w.textRight(formatUsd(r.totalPaid), COL_PAID, w.y, 9.5, 'regular', MUTED);
      w.textRight(formatUsd(r.outstanding), COL_PENDING, w.y, 9.5, 'bold', owing ? WARN : INK);
      if (owing) {
        w.textRight(String(r.pendingCount), COL_COUNT, w.y, 9, 'regular', WARN);
        w.textRight(r.oldestPendingDate ? day(r.oldestPendingDate) : '—', RIGHT, w.y, 9, 'regular', WARN);
      } else {
        w.textRight('Al día', RIGHT, w.y, 9, 'regular', ACCENT);
      }
      w.y -= 15;
    }

    w.ensure(22);
    w.rule();
    w.y -= 14;
    w.page.drawRectangle({ x: LEFT, y: w.y - 5, width: RIGHT - LEFT, height: 18, color: TINT });
    w.textAt('TOTALES', LEFT, w.y, 10, 'bold', ACCENT);
    w.textRight(formatUsd(totals.charged), COL_CHARGED, w.y, 10, 'bold', ACCENT);
    w.textRight(formatUsd(totals.paid), COL_PAID, w.y, 10, 'bold', ACCENT);
    w.textRight(formatUsd(totals.outstanding), COL_PENDING, w.y, 10, 'bold', totals.outstanding > 0 ? WARN : ACCENT);
    w.y -= 24;

    w.paragraph(
      `"Facturado" y "Pagado" son solo los movimientos de ${formatPeriod(data.month, data.year).toLowerCase()} (su recibo de ese mes y los pagos hechos en él). "Pendiente" es el saldo real que arrastra cada casa al cierre del mes, incluyendo deudas de meses anteriores sin pagar.`,
      8.5, 'regular', MUTED,
    );

    w.footerOnAllPages(`${data.condominiumName} · Estado de cuenta de ${formatPeriod(data.month, data.year).toLowerCase()}`);
    return doc.save();
  }
}

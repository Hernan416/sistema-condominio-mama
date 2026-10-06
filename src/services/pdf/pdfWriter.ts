// FACADE compartida sobre pdf-lib: paleta, geometría de página y el cursor de escritura
// (`Writer`) que usan todos los PDF del sistema (recibos, estados de cuenta…). Nadie fuera de
// `services/pdf/` debe importar `pdf-lib` directamente (ver directivas de arquitectura).
import { PDFDocument, type PDFFont, type PDFPage, rgb, type RGB } from 'pdf-lib';
import { formatUsd } from '@/utils/currency';

export type { RGB };

export const INK = rgb(0.06, 0.1, 0.08);
export const MUTED = rgb(0.29, 0.34, 0.31);
export const ACCENT = rgb(0.05, 0.42, 0.31);
export const WARN = rgb(0.54, 0.33, 0);
export const RULE = rgb(0.86, 0.87, 0.85);
export const TINT = rgb(0.93, 0.96, 0.94);
export const SUNKEN = rgb(0.95, 0.955, 0.945);
export const HEADER_BAR = rgb(0.86, 0.9, 0.87); // barra de cabeceras de sección / fila de totales

export const PAGE: [number, number] = [612, 792]; // carta
export const LEFT = 48;
export const RIGHT = 564;
export const BOTTOM = 64;

// Equivalentes de caracteres frecuentes que la fuente estándar (WinAnsi) no incluye.
const REPLACEMENTS: Record<string, string> = {
  '−': '-', // signo menos
  '‐': '-', // guion
  '‑': '-', // guion no separable
  ' ': ' ', // espacio no separable (lo usa Intl)
  ' ': ' ', // espacio fino no separable
  '≈': '~', // aproximadamente
  '→': '->', // flecha
  '✓': '', // visto bueno (sin equivalente: se omite)
};

const charsets = new WeakMap<PDFFont, Set<number>>();
function charsetOf(font: PDFFont): Set<number> {
  let set = charsets.get(font);
  if (!set) charsets.set(font, (set = new Set(font.getCharacterSet())));
  return set;
}

/**
 * Deja solo caracteres que la fuente puede dibujar: nunca falla la emisión por un emoji o un
 * símbolo raro escrito en una nota o un concepto. Lo que no tiene equivalente se omite.
 */
export function printable(text: string, font: PDFFont): string {
  const supported = charsetOf(font);
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const c = REPLACEMENTS[ch] ?? ch;
    if ([...c].every((x) => supported.has(x.codePointAt(0)!))) out += c;
    else if (/\s/.test(ch)) out += ' ';
  }
  return out;
}

/** Montos para el PDF: solo caracteres WinAnsi (la fuente estándar no tiene "−"). */
export const usd = (n: number) => (n < 0 ? `- ${formatUsd(Math.abs(n))}` : formatUsd(n));

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

/** Cursor de escritura con salto de página automático. */
export class Writer {
  page: PDFPage;
  y: number;
  onNewPage: (() => void) | null = null;
  readonly pages: PDFPage[] = [];

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

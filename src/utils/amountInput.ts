/**
 * Monto en USD escrito por la administradora → número con 2 decimales, o null.
 * Acepta formato venezolano y el de teclado inglés:
 *   "30" · "30,5" · "30,50" · "1.250,00" · "30.50" · "$ 1.250"
 * Regla: si hay coma, la coma es decimal y los puntos son miles. Si no hay coma,
 * un punto seguido de 1–2 dígitos al final es decimal; cualquier otro punto es de miles.
 */
export function parseAmountInput(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(/,(?=.*,)/g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(s)) {
    const last = s.lastIndexOf('.');
    s = s.slice(0, last).replace(/\./g, '') + '.' + s.slice(last + 1);
  } else {
    s = s.replace(/\./g, '');
  }

  const value = Math.round(Number(s) * 100) / 100;
  return Number.isFinite(value) && value <= 1e9 ? value : null;
}

const inputFormat = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1250 → "1.250,00" para mostrar dentro del input. */
export function formatAmountInput(value: number | null): string {
  return value === null ? '' : inputFormat.format(value);
}

/**
 * Número decimal en formato venezolano, con los decimales que traiga (p. ej. una tasa
 * "855,6625"). Coma = decimal y puntos = miles; sin coma, un único punto seguido de un
 * número de dígitos distinto de 3 se toma como decimal ("855.6625"). Admite signo negativo.
 */
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith('-');
  let s = trimmed.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(/,(?=.*,)/g, '').replace(',', '.');
  } else {
    const dots = s.split('.').length - 1;
    const tail = s.split('.').pop() ?? '';
    s = dots === 1 && tail.length !== 3 ? s : s.replace(/\./g, '');
  }
  const value = Number(s);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

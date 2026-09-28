// El negocio vive en Venezuela (UTC-4, sin horario de verano). Vercel corre en UTC:
// todas las fechas "de calendario" se calculan en la zona de Caracas.
export const BUSINESS_TIME_ZONE = 'America/Caracas';

function parts(date: Date): { year: number; month: number; day: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Mes y año actuales en Caracas. */
export function monthAndYearInCaracas(date: Date = new Date()): { month: number; year: number } {
  const { month, year } = parts(date);
  return { month, year };
}

/** "2026-09-25" en Caracas. */
export function isoDateInCaracas(date: Date): string {
  const { year, month, day } = parts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "25/09/2026" en Caracas. */
export function formatDateVe(date: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

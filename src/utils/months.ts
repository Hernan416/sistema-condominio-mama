import { monthAndYearInCaracas } from '@/utils/dates';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

export function allMonths(): { value: number; label: string }[] {
  return MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));
}

export function formatPeriod(month: number, year: number): string {
  return `${monthName(month)} ${year}`;
}

/** Periodo actual según la hora de Caracas (no la del servidor, que en Vercel es UTC). */
export function currentPeriod(now: Date = new Date()): { month: number; year: number } {
  return monthAndYearInCaracas(now);
}

/** Suma (o resta, con delta negativo) meses a un periodo, pasando de año cuando hace falta. */
export function shiftPeriod({ month, year }: { month: number; year: number }, delta: number): { month: number; year: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Periodo de la URL (?mes=10&anio=2026); si falta o no es válido, el mes por defecto.
 * `lagMonths` desplaza ese valor por defecto hacia atrás (1 = el mes anterior al actual):
 * lo usan los condominios que facturan el mes ya vencido en vez del mes en curso.
 */
export function periodFromQuery(params: URLSearchParams, now: Date = new Date(), lagMonths = 0): { month: number; year: number } {
  const month = Number(params.get('mes'));
  const year = Number(params.get('anio'));
  const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100;
  return valid ? { month, year } : shiftPeriod(currentPeriod(now), -lagMonths);
}

/** "1 mes", "3 meses". */
export function monthsLabel(count: number): string {
  return `${count} ${count === 1 ? 'mes' : 'meses'}`;
}

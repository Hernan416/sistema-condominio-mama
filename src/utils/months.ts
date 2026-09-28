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

/** "09 - Septiembre": ordena bien en Drive y sigue siendo legible. */
export function monthFolderName(month: number): string {
  return `${String(month).padStart(2, '0')} - ${monthName(month)}`;
}

export function formatPeriod(month: number, year: number): string {
  return `${monthName(month)} ${year}`;
}

/** Periodo actual según la hora de Caracas (no la del servidor, que en Vercel es UTC). */
export function currentPeriod(now: Date = new Date()): { month: number; year: number } {
  return monthAndYearInCaracas(now);
}

/** Vencimiento del recibo: el día `dueDay` (1–28) del mes siguiente al periodo. "YYYY-MM-DD". */
export function dueDateFor({ month, year }: { month: number; year: number }, dueDay: number): string {
  const day = Math.min(Math.max(Math.round(dueDay), 1), 28);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Número de recibo legible y único por condominio: "2026-09-012". */
export function receiptNumber({ month, year }: { month: number; year: number }, houseNumber: string): string {
  const unit = houseNumber.replace(/[^\w]/g, '').toUpperCase().padStart(3, '0');
  return `${year}-${String(month).padStart(2, '0')}-${unit}`;
}

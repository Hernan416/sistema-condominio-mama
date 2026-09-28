// Montos en Venezuela: la cuota se fija en dólares y se paga (o se referencia) en bolívares.
// Formato venezolano: punto para miles, coma para decimales.
const number2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 30 → "$ 30,00" */
export function formatUsd(amount: number): string {
  return `$ ${number2.format(amount)}`;
}

/** 25669.875 → "Bs. 25.669,88" (bolívar digital; no "Bs.S", que ya no se usa). */
export function formatVes(amount: number): string {
  return `Bs. ${number2.format(amount)}`;
}

/** Conversión redondeada al céntimo. */
export function usdToVes(amountUsd: number, usdToVesRate: number): number {
  return Math.round(amountUsd * usdToVesRate * 100) / 100;
}

/** Saludo según la hora en Caracas: mañana (5–11), tarde (12–18), noche (19–4). */
export function greetingFor(date: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Caracas' }).format(date));
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

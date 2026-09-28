// Tipos de alícuota ("Casa pequeña", "Casa grande"…): ayuda para calcular y asignar alícuotas.
// Función pura: la usan igual la pantalla (vista previa) y el servidor (al guardar).

export interface AliquotCategory {
  id: string;
  /** Nombre libre, ej. "Casa grande". */
  name: string;
  /** Peso relativo (modo proporción) o porcentaje exacto (modo porcentaje). */
  value: number;
}

/**
 * proportional: los valores son pesos (6 y 8, o m²); se escalan para que todo sume 100 %.
 * percent: el valor ES la alícuota de cada unidad de ese tipo (como en el documento de condominio).
 */
export type AliquotMode = 'proportional' | 'percent';

export interface AliquotScheme {
  mode: AliquotMode;
  categories: AliquotCategory[];
}

export const EMPTY_SCHEME: AliquotScheme = { mode: 'proportional', categories: [] };

export interface SchemeUnit {
  id: string;
  aliquot: number;
  /** null = alícuota personalizada (se escribe a mano). */
  categoryId: string | null;
}

const PRECISION = 10000; // 4 decimales, como en los documentos de condominio

/**
 * Alícuota resultante de cada unidad.
 * - Unidades sin tipo conservan su alícuota manual.
 * - Proporción: las unidades con tipo se reparten lo que queda de 100 % (100 − manuales),
 *   en proporción al valor de su tipo; el último decimal se ajusta para sumar exacto.
 * - Porcentaje: cada unidad con tipo toma el valor del tipo tal cual.
 */
export function resolveAliquots(units: SchemeUnit[], scheme: AliquotScheme): Map<string, number> {
  const byId = new Map(scheme.categories.map((c) => [c.id, c]));
  const result = new Map<string, number>();
  const typed = units.filter((u) => u.categoryId && byId.has(u.categoryId));
  for (const u of units) if (!typed.includes(u)) result.set(u.id, u.aliquot);

  if (scheme.mode === 'percent') {
    for (const u of typed) result.set(u.id, round4(byId.get(u.categoryId!)!.value));
    return result;
  }

  const manualSum = units.filter((u) => !typed.includes(u)).reduce((s, u) => s + u.aliquot, 0);
  const remaining = Math.max(0, 100 - manualSum);
  const weights = typed.map((u) => Math.max(0, byId.get(u.categoryId!)!.value));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (typed.length === 0 || weightSum <= 0) {
    for (const u of typed) result.set(u.id, 0);
    return result;
  }

  // Resto mayor en diezmilésimas: la suma da exactamente `remaining`, y unidades del
  // mismo tipo difieren como mucho en 0,0001 (el residuo se reparte por orden).
  const total = Math.round(remaining * PRECISION);
  const exact = weights.map((w) => (total * w) / weightSum);
  const units4 = exact.map(Math.floor);
  let leftover = total - units4.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, f: Math.round((x - units4[i]) * 1e9) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    units4[i] += 1;
    leftover -= 1;
  }
  typed.forEach((u, i) => result.set(u.id, units4[i] / PRECISION));
  return result;
}

export interface CategorySummary {
  category: AliquotCategory;
  count: number;
  /** Alícuota de cada unidad de este tipo (la primera; las demás difieren ≤ 0,0001). */
  eachAliquot: number;
  totalAliquot: number;
}

/** Resumen por tipo: cuántas unidades, qué alícuota le queda a cada una y cuánto suman. */
export function summarizeScheme(units: SchemeUnit[], scheme: AliquotScheme, aliquots: Map<string, number>): CategorySummary[] {
  return scheme.categories.map((category) => {
    const members = units.filter((u) => u.categoryId === category.id);
    const values = members.map((u) => aliquots.get(u.id) ?? 0);
    return {
      category,
      count: members.length,
      eachAliquot: values.length ? Math.max(...values) : 0,
      totalAliquot: round4(values.reduce((s, v) => s + v, 0)),
    };
  });
}

/** Reglas de un esquema; devuelve el primer problema o null. */
export function validateScheme(scheme: AliquotScheme): string | null {
  if (scheme.mode !== 'proportional' && scheme.mode !== 'percent') return 'Modo de alícuota inválido';
  if (scheme.categories.length > 20) return 'Máximo 20 tipos de alícuota';
  const names = new Set<string>();
  for (const c of scheme.categories) {
    const name = c.name.trim();
    if (!name) return 'Cada tipo de alícuota necesita un nombre';
    if (names.has(name.toLowerCase())) return `El tipo "${name}" está repetido`;
    names.add(name.toLowerCase());
    if (!Number.isFinite(c.value) || c.value <= 0) return `El valor de "${name}" debe ser mayor que 0`;
    if (scheme.mode === 'percent' && c.value > 100) return `"${name}": una alícuota no puede superar 100 %`;
    if (c.value > 100000) return `El valor de "${name}" es demasiado grande`;
  }
  return null;
}

function round4(n: number): number {
  return Math.round(n * PRECISION) / PRECISION;
}

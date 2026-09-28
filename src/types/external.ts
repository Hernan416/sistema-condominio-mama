// Respuestas crudas de APIs externas. Solo las leen los adapters.

/** GET https://ve.dolarapi.com/v1/dolares/oficial */
export interface DolarApiQuote {
  moneda: string; // "USD"
  fuente: string; // "oficial" (BCV) | "paralelo"
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string; // ISO con zona horaria de Caracas
}

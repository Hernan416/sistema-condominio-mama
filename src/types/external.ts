// Respuestas crudas de APIs externas. Solo las leen los adapters.

/** GET https://ve.dolarapi.com/v1/dolares/oficial (y /v1/dolares, /v1/euros: devuelven un arreglo) */
export interface DolarApiQuote {
  moneda: string; // "USD" | "EUR"
  fuente: string; // "oficial" (BCV) | "paralelo"
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string; // ISO con zona horaria de Caracas
}

/** GET https://www.usdt.com.ve/api/v1/rates/current (tasa USDT/Bs. de exchanges P2P). */
export interface UsdtRatesQuote {
  success: boolean;
  data: {
    binance: { buy_rate: number; sell_rate: number; spread: number };
    bcv: { rate: number };
  };
}

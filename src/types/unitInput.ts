/** Alícuota de una unidad desde la pestaña Alícuotas (1 a 1 o masiva). */
export interface UnitUpdateInput {
  id: string;
  aliquot: number;
  aliquotCategoryId: string | null;
}

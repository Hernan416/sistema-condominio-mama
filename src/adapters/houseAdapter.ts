import type { House } from '@/types/domain';
import type { HouseRow } from '@/types/database';

export function supabaseHouseToDomainHouse(row: HouseRow): House {
  return {
    id: row.id,
    condominiumId: row.condominium_id,
    number: row.number,
    username: row.username,
    ownerName: row.owner_name,
    ownerDocument: row.owner_document ?? null,
    ownerEmail: row.owner_email,
    ownerPhone: row.owner_phone ?? null,
    occupancy: row.occupancy ?? 'owner',
    occupantName: row.occupant_name ?? null,
    occupantPhone: row.occupant_phone ?? null,
    notes: row.notes ?? null,
    aliquot: Number(row.aliquot ?? 0),
    aliquotCategoryId: row.aliquot_category_id ?? null,
  };
}

/** Datos del propietario y ocupación (ficha de la casa). */
export type HouseProfile = Pick<House, 'ownerName' | 'ownerDocument' | 'ownerEmail' | 'ownerPhone' | 'occupancy' | 'occupantName' | 'occupantPhone' | 'notes'>;

/**
 * Cambios a una unidad. PARCIAL a propósito: solo se escriben los campos presentes, así
 * guardar alícuotas nunca pisa los datos del propietario (ni al revés).
 */
export type HouseUpdate = Partial<HouseProfile & Pick<House, 'aliquot' | 'aliquotCategoryId'>>;

const COLUMN: Record<keyof HouseUpdate, keyof HouseRow> = {
  ownerName: 'owner_name',
  ownerDocument: 'owner_document',
  ownerEmail: 'owner_email',
  ownerPhone: 'owner_phone',
  occupancy: 'occupancy',
  occupantName: 'occupant_name',
  occupantPhone: 'occupant_phone',
  notes: 'notes',
  aliquot: 'aliquot',
  aliquotCategoryId: 'aliquot_category_id',
};

export function houseUpdateToRow(u: HouseUpdate): Partial<HouseRow> {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(COLUMN) as [keyof HouseUpdate, keyof HouseRow][]) {
    if (u[key] !== undefined) row[column] = u[key];
  }
  return row as Partial<HouseRow>;
}

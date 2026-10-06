import type { BillingSheet } from '@/types/billing';
import type { BillingSheetRow } from '@/types/database';

export function billingSheetRowToDomain(row: BillingSheetRow): BillingSheet {
  return {
    condominiumId: row.condominium_id,
    year: row.year,
    month: row.month,
    reserveFundPercent: Number(row.reserve_fund_percent),
    dueDate: row.due_date,
    generalNote: row.general_note,
    unitNotes: row.unit_notes ?? {},
    expenses: (row.expenses ?? []).map(({ id, concept, category, amount, kind, distribution, overrides, project_id }) => ({
      id,
      concept,
      category: category ?? null,
      amount: Number(amount),
      kind,
      distribution,
      overrides: overrides ?? {},
      projectId: project_id ?? null,
    })),
    unitCharges: (row.unit_charges ?? []).map((c) => ({ id: c.id, houseId: c.house_id, concept: c.concept, amount: Number(c.amount), recurring: !!c.recurring })),
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export function billingSheetToRow(sheet: BillingSheet): BillingSheetRow {
  return {
    condominium_id: sheet.condominiumId,
    year: sheet.year,
    month: sheet.month,
    reserve_fund_percent: sheet.reserveFundPercent,
    due_date: sheet.dueDate,
    general_note: sheet.generalNote,
    unit_notes: sheet.unitNotes,
    expenses: sheet.expenses.map(({ id, concept, category, amount, kind, distribution, overrides, projectId }) => ({
      id,
      concept,
      category: category ?? null,
      amount,
      kind,
      distribution,
      overrides: overrides ?? {},
      project_id: projectId ?? null,
    })),
    unit_charges: sheet.unitCharges.map((c) => ({ id: c.id, house_id: c.houseId, concept: c.concept, amount: c.amount, recurring: !!c.recurring })),
    updated_at: new Date().toISOString(),
  };
}

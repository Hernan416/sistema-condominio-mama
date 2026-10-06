import type { BudgetProject } from '@/types/budget';
import type { BudgetProjectRow } from '@/types/database';

export function budgetProjectRowToDomain(row: BudgetProjectRow): BudgetProject {
  return {
    id: row.id,
    condominiumId: row.condominium_id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    billingMode: row.billing_mode,
    collectionMode: row.collection_mode,
    startYear: row.start_year,
    startMonth: row.start_month,
    monthsCount: row.months_count,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export type NewBudgetProject = Omit<BudgetProject, 'id' | 'createdAt'>;

export function newBudgetProjectToRow(p: NewBudgetProject): Omit<BudgetProjectRow, 'id' | 'created_at'> {
  return {
    condominium_id: p.condominiumId,
    name: p.name,
    target_amount: p.targetAmount,
    billing_mode: p.billingMode,
    collection_mode: p.collectionMode,
    start_year: p.startYear,
    start_month: p.startMonth,
    months_count: p.monthsCount,
  };
}

import { randomUUID } from 'node:crypto';
import { budgetProjectRowToDomain, newBudgetProjectToRow, type NewBudgetProject } from '@/adapters/budgetAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { BudgetProjectRepository } from '@/services/contracts';
import type { BudgetProject } from '@/types/budget';

export class LocalBudgetProjectRepository implements BudgetProjectRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async listByCondominium(condominiumId: string): Promise<BudgetProject[]> {
    const { budget_projects } = await this.store.read();
    return budget_projects.filter((p) => p.condominium_id === condominiumId).map(budgetProjectRowToDomain);
  }

  async findById(id: string): Promise<BudgetProject | null> {
    const { budget_projects } = await this.store.read();
    const row = budget_projects.find((p) => p.id === id);
    return row ? budgetProjectRowToDomain(row) : null;
  }

  create(project: NewBudgetProject): Promise<BudgetProject> {
    return this.store.transaction((db) => {
      const row = { id: randomUUID(), ...newBudgetProjectToRow(project), created_at: new Date().toISOString() };
      db.budget_projects.push(row);
      return budgetProjectRowToDomain(row);
    });
  }

  setCollectionMode(id: string, mode: BudgetProject['collectionMode']): Promise<BudgetProject> {
    return this.store.transaction((db) => {
      const row = db.budget_projects.find((p) => p.id === id);
      if (!row) throw new Error('Proyecto no encontrado');
      row.collection_mode = mode;
      return budgetProjectRowToDomain(row);
    });
  }

  delete(id: string): Promise<void> {
    return this.store.transaction((db) => {
      db.budget_projects = db.budget_projects.filter((p) => p.id !== id);
    });
  }
}

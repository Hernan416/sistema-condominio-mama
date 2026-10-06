import type { SupabaseClient } from '@supabase/supabase-js';
import { budgetProjectRowToDomain, newBudgetProjectToRow, type NewBudgetProject } from '@/adapters/budgetAdapter';
import type { BudgetProjectRow } from '@/types/database';
import type { BudgetProject } from '@/types/budget';
import type { BudgetProjectRepository } from '@/services/contracts';

const COLUMNS = 'id, condominium_id, name, target_amount, billing_mode, collection_mode, start_year, start_month, months_count, created_at';

export class SupabaseBudgetProjectRepository implements BudgetProjectRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCondominium(condominiumId: string): Promise<BudgetProject[]> {
    const { data, error } = await this.db.from('budget_projects').select(COLUMNS).eq('condominium_id', condominiumId).overrideTypes<BudgetProjectRow[], { merge: false }>();
    if (error) throw new Error(`No se pudieron leer los proyectos: ${error.message}`);
    return (data ?? []).map(budgetProjectRowToDomain);
  }

  async findById(id: string): Promise<BudgetProject | null> {
    const { data, error } = await this.db.from('budget_projects').select(COLUMNS).eq('id', id).maybeSingle<BudgetProjectRow>();
    if (error) throw new Error(`No se pudo leer el proyecto: ${error.message}`);
    return data ? budgetProjectRowToDomain(data) : null;
  }

  async create(project: NewBudgetProject): Promise<BudgetProject> {
    const { data, error } = await this.db.from('budget_projects').insert(newBudgetProjectToRow(project)).select(COLUMNS).single<BudgetProjectRow>();
    if (error) throw new Error(`No se pudo crear el proyecto: ${error.message}`);
    return budgetProjectRowToDomain(data);
  }

  async setCollectionMode(id: string, mode: BudgetProject['collectionMode']): Promise<BudgetProject> {
    const { data, error } = await this.db.from('budget_projects').update({ collection_mode: mode }).eq('id', id).select(COLUMNS).single<BudgetProjectRow>();
    if (error) throw new Error(`No se pudo cambiar la asignación presupuestaria: ${error.message}`);
    return budgetProjectRowToDomain(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('budget_projects').delete().eq('id', id);
    if (error) throw new Error(`No se pudo eliminar el proyecto: ${error.message}`);
  }
}

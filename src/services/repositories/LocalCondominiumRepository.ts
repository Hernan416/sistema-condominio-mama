import { condominiumUpdateToRow, supabaseCondominiumToDomain, supabaseCondominiumWithSettings } from '@/adapters/condominiumAdapter';
import type { LocalJsonStore } from '@/services/local/LocalJsonStore';
import type { CondominiumRepository } from '@/services/contracts';
import type { Condominium, CondominiumSettings, CondominiumWithSettings } from '@/types/domain';
import type { AliquotScheme } from '@/utils/aliquotScheme';

/** En modo local hay un único administrador, con acceso a todos los condominios. */
export class LocalCondominiumRepository implements CondominiumRepository {
  constructor(private readonly store: LocalJsonStore) {}

  async findById(id: string): Promise<Condominium | null> {
    const { condominiums } = await this.store.read();
    const row = condominiums.find((c) => c.id === id);
    return row ? supabaseCondominiumToDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Condominium | null> {
    const { condominiums } = await this.store.read();
    const row = condominiums.find((c) => c.slug === slug);
    return row ? supabaseCondominiumToDomain(row) : null;
  }

  async listForAdmin(_adminUserId: string): Promise<Condominium[]> {
    const { condominiums } = await this.store.read();
    return condominiums.map(supabaseCondominiumToDomain).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async findWithSettings(id: string): Promise<CondominiumWithSettings | null> {
    const { condominiums } = await this.store.read();
    const row = condominiums.find((c) => c.id === id);
    return row ? supabaseCondominiumWithSettings(row) : null;
  }

  update(id: string, update: { name: string; city: string | null; settings: CondominiumSettings }): Promise<CondominiumWithSettings> {
    return this.store.transaction((db) => {
      const row = db.condominiums.find((c) => c.id === id);
      if (!row) throw new Error('El condominio no existe');
      Object.assign(row, condominiumUpdateToRow(update));
      return supabaseCondominiumWithSettings(row);
    });
  }

  saveAliquotScheme(id: string, scheme: AliquotScheme): Promise<void> {
    return this.store.transaction((db) => {
      const row = db.condominiums.find((c) => c.id === id);
      if (!row) throw new Error('El condominio no existe');
      row.aliquot_scheme = scheme;
    });
  }
}

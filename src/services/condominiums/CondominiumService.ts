import type { AdminSession, BillingPeriod, Condominium, CondominiumOverview, CondominiumSettings, CondominiumWithSettings, House } from '@/types/domain';
import type { CondominiumRepository, HouseRepository } from '@/services/contracts';
import type { BillingService } from '@/services/billing/BillingService';
import type { HouseProfile } from '@/adapters/houseAdapter';
import { AccessDeniedError, NotFoundError, ValidationError } from '@/services/errors';
import { resolveAliquots, validateScheme, type AliquotScheme } from '@/utils/aliquotScheme';

/** Condominios de cada administrador, sus datos de recibo y sus unidades. */
export class CondominiumService {
  constructor(
    private readonly condominiums: CondominiumRepository,
    private readonly houses: HouseRepository,
    private readonly billing: BillingService,
  ) {}

  listForAdmin(admin: AdminSession): Promise<Condominium[]> {
    return this.condominiums.listForAdmin(admin.userId);
  }

  /** Devuelve el condominio solo si el administrador tiene acceso; si no, AccessDeniedError. */
  async requireForAdmin(admin: AdminSession, slug: string): Promise<Condominium> {
    const allowed = await this.listForAdmin(admin);
    const condominium = allowed.find((c) => c.slug === slug);
    if (!condominium) throw new AccessDeniedError('No tienes acceso a este condominio');
    return condominium;
  }

  /** Resumen del periodo por condominio: el total sale del cálculo de la relación de gastos. */
  async overviewForAdmin(admin: AdminSession, period: BillingPeriod): Promise<CondominiumOverview[]> {
    const condominiums = await this.listForAdmin(admin);
    return Promise.all(
      condominiums.map(async (condominium) => {
        const { units } = await this.billing.preview(condominium, period);
        const issued = units.filter((u) => u.invoice && u.invoice.status !== 'pending');
        return {
          condominium,
          houseCount: units.length,
          generatedCount: issued.length,
          pendingCount: units.length - issued.length,
          totalAmount: units.reduce((sum, u) => sum + u.breakdown.monthTotal, 0),
        };
      }),
    );
  }

  findById(id: string): Promise<Condominium | null> {
    return this.condominiums.findById(id);
  }

  async getWithSettings(condominium: Condominium): Promise<CondominiumWithSettings> {
    const full = await this.condominiums.findWithSettings(condominium.id);
    if (!full) throw new NotFoundError('El condominio no existe');
    return full;
  }

  updateSettings(condominium: Condominium, update: { name: string; city: string | null; settings: CondominiumSettings }): Promise<CondominiumWithSettings> {
    if (!update.name.trim()) throw new ValidationError('El nombre del condominio es obligatorio');
    const s = update.settings;
    if (!(s.defaultReserveFundPercent >= 0 && s.defaultReserveFundPercent <= 100)) throw new ValidationError('El fondo de reserva debe estar entre 0 % y 100 %');
    if (!(Number.isInteger(s.dueDay) && s.dueDay >= 1 && s.dueDay <= 28)) throw new ValidationError('El día de vencimiento debe estar entre 1 y 28');
    if (!(s.lateInterestMonthlyPercent >= 0 && s.lateInterestMonthlyPercent <= 10)) throw new ValidationError('El interés de mora debe estar entre 0 % y 10 % mensual');
    if (!Number.isFinite(s.openingBalance) || Math.abs(s.openingBalance) > 1e9) throw new ValidationError('El saldo inicial no es válido');
    if (s.openingBalanceDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.openingBalanceDate)) throw new ValidationError('La fecha del saldo inicial no es válida');
    return this.condominiums.update(condominium.id, { ...update, name: update.name.trim(), city: update.city?.trim() || null });
  }

  listUnits(condominium: Condominium): Promise<House[]> {
    return this.houses.listByCondominium(condominium.id);
  }

  /**
   * Alícuotas de las unidades (1 a 1 o masivo) junto con los tipos de alícuota. Solo toca
   * alícuota y tipo: los datos del propietario se editan en la ficha de cada casa.
   * Las alícuotas de las unidades con tipo las recalcula SIEMPRE el servidor desde el esquema.
   */
  async updateAliquots(
    condominium: Condominium,
    updates: { id: string; aliquot: number; aliquotCategoryId: string | null }[],
    scheme: AliquotScheme,
  ): Promise<{ units: House[]; scheme: AliquotScheme }> {
    const problem = validateScheme(scheme);
    if (problem) throw new ValidationError(problem);
    const cleanScheme: AliquotScheme = {
      mode: scheme.mode,
      categories: scheme.categories.map((c) => ({ id: c.id, name: c.name.trim(), value: Math.round(c.value * 10000) / 10000 })),
    };
    const categoryIds = new Set(cleanScheme.categories.map((c) => c.id));

    const current = await this.houses.listByCondominium(condominium.id);
    const own = new Map(current.map((h) => [h.id, h]));
    for (const u of updates) {
      if (!own.has(u.id)) throw new NotFoundError('Una de las unidades no es de este condominio');
      if (!(Number.isFinite(u.aliquot) && u.aliquot >= 0 && u.aliquot <= 100)) throw new ValidationError('La alícuota debe estar entre 0 y 100');
    }

    // Estado final de TODAS las unidades (las no enviadas conservan su alícuota)…
    const changes = new Map(updates.map((u) => [u.id, u]));
    const merged = current.map((h) => {
      const u = changes.get(h.id);
      const categoryId = u ? u.aliquotCategoryId : h.aliquotCategoryId;
      return {
        id: h.id,
        aliquot: Math.round((u ? u.aliquot : h.aliquot) * 10000) / 10000,
        // Un tipo que ya no existe deja la unidad con alícuota personalizada.
        aliquotCategoryId: categoryId && categoryIds.has(categoryId) ? categoryId : null,
      };
    });
    // …con las alícuotas recalculadas según el esquema.
    const aliquots = resolveAliquots(merged.map((m) => ({ id: m.id, aliquot: m.aliquot, categoryId: m.aliquotCategoryId })), cleanScheme);
    const changed = merged
      .map((m) => ({ ...m, aliquot: aliquots.get(m.id) ?? m.aliquot }))
      .filter((f) => own.get(f.id)!.aliquot !== f.aliquot || own.get(f.id)!.aliquotCategoryId !== f.aliquotCategoryId);

    await this.condominiums.saveAliquotScheme(condominium.id, cleanScheme);
    if (changed.length > 0) await this.houses.updateMany(changed);
    return { units: await this.houses.listByCondominium(condominium.id), scheme: cleanScheme };
  }

  /** Ficha de la casa: datos del propietario, contacto y ocupación. */
  async updateHouseProfile(condominium: Condominium, houseId: string, profile: HouseProfile): Promise<House> {
    const house = await this.houses.findById(houseId);
    if (!house || house.condominiumId !== condominium.id) throw new NotFoundError('La casa no existe en este condominio');

    const text = (v: string | null, max: number) => v?.trim().replace(/\s+/g, ' ').slice(0, max) || null;
    const email = text(profile.ownerEmail, 120)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('El correo del propietario no es válido');
    // Acepta "v12345678", "V 12.345.678", "V-12345678"… y lo guarda como V-12345678.
    const doc = text(profile.ownerDocument, 20)?.toUpperCase().replace(/[\s.]/g, '') ?? null;
    if (doc && !/^[VEJGP]-?\d{5,10}(-?\d)?$/.test(doc)) throw new ValidationError('La cédula o RIF debe tener el formato V-12345678, E-…, J-12345678-9…');
    if (!['owner', 'tenant', 'vacant'].includes(profile.occupancy)) throw new ValidationError('Ocupación inválida');
    const phone = (v: string | null) => {
      const t = text(v, 20);
      if (t && !/^[+\d][\d\s().-]{6,19}$/.test(t)) throw new ValidationError(`El teléfono "${t}" no es válido`);
      return t;
    };

    const [updated] = await this.houses.updateMany([
      {
        id: houseId,
        ownerName: text(profile.ownerName, 120),
        ownerDocument: doc ? doc.replace(/^([VEJGP])-?/, '$1-') : null,
        ownerEmail: email,
        ownerPhone: phone(profile.ownerPhone),
        occupancy: profile.occupancy,
        occupantName: profile.occupancy === 'tenant' ? text(profile.occupantName, 120) : null,
        occupantPhone: profile.occupancy === 'tenant' ? phone(profile.occupantPhone) : null,
        notes: profile.notes?.trim().slice(0, 1000) || null,
      },
    ]);
    return updated;
  }
}

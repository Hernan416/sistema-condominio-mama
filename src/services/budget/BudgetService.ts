import type { BillingPeriod, Condominium } from '@/types/domain';
import type { BudgetProjectRepository, HouseRepository } from '@/services/contracts';
import type { BillingService } from '@/services/billing/BillingService';
import type { AccountService } from '@/services/accounts/AccountService';
import { NotFoundError, ValidationError } from '@/services/errors';
import { allocate, roundCents } from '@/utils/billingCalculator';
import { isValidPeriod } from '@/utils/validation';
import type { BudgetBillingMode, BudgetCollectionMode, BudgetHouseProgress, BudgetProject, BudgetProjectProgress, BudgetScheduleMonth } from '@/types/budget';

export interface CreateBudgetProjectInput {
  name: string;
  targetAmount: number;
  billingMode: BudgetBillingMode;
  startYear: number;
  startMonth: number;
  /** Solo si billingMode = 'spread' (1 si 'single'). */
  monthsCount: number;
}

const periodKey = (p: { year: number; month: number }) => p.year * 100 + p.month;

/** Los meses que factura un proyecto y cuánto en cada uno (en partes iguales; el residuo de
 * centavos queda en el último mes, igual que el resto de repartos del sistema). */
export function scheduleFor(project: Pick<BudgetProject, 'billingMode' | 'targetAmount' | 'startYear' | 'startMonth' | 'monthsCount'>): BudgetScheduleMonth[] {
  const totalCents = Math.round(project.targetAmount * 100);
  if (project.billingMode === 'single') return [{ year: project.startYear, month: project.startMonth, amount: totalCents / 100 }];

  const months = Math.max(1, project.monthsCount);
  const base = Math.floor(totalCents / months);
  let remaining = totalCents;
  let index = project.startYear * 12 + (project.startMonth - 1);
  const schedule: BudgetScheduleMonth[] = [];
  for (let i = 0; i < months; i++) {
    const isLast = i === months - 1;
    const cents = isLast ? remaining : base;
    remaining -= cents;
    schedule.push({ year: Math.floor(index / 12), month: (index % 12) + 1, amount: cents / 100 });
    index++;
  }
  return schedule;
}

/**
 * Proyectos con presupuesto (ej. "Pintura de fachada: $250"): se facturan como una cuota
 * extraordinaria más, en uno o varios meses, y se sigue cuánto se ha recaudado por casa.
 * No reinventa la facturación ni el libro de cuentas: usa BillingService para emitir la cuota
 * y AccountService para saber qué se pagó de verdad.
 */
export class BudgetService {
  constructor(
    private readonly projects: BudgetProjectRepository,
    private readonly houses: HouseRepository,
    private readonly billing: BillingService,
    private readonly accounts: AccountService,
  ) {}

  listProjects(condominium: Condominium): Promise<BudgetProject[]> {
    return this.projects.listByCondominium(condominium.id);
  }

  async createProject(condominium: Condominium, input: CreateBudgetProjectInput): Promise<BudgetProject> {
    const name = input.name.trim();
    if (!name) throw new ValidationError('El proyecto necesita un nombre');
    if (!(Number.isFinite(input.targetAmount) && input.targetAmount > 0 && input.targetAmount <= 1e9)) {
      throw new ValidationError('El presupuesto debe ser mayor que 0');
    }
    if (input.billingMode !== 'single' && input.billingMode !== 'spread') throw new ValidationError('Modalidad de facturación inválida');
    if (!isValidPeriod(input.startMonth, input.startYear)) throw new ValidationError('El mes de inicio no es válido');
    const monthsCount = input.billingMode === 'single' ? 1 : input.monthsCount;
    if (!(Number.isInteger(monthsCount) && monthsCount >= 1 && monthsCount <= 60)) {
      throw new ValidationError('La cantidad de meses debe estar entre 1 y 60');
    }

    const project = await this.projects.create({
      condominiumId: condominium.id,
      name: name.slice(0, 120),
      targetAmount: roundCents(input.targetAmount),
      billingMode: input.billingMode,
      collectionMode: 'proportional',
      startYear: input.startYear,
      startMonth: input.startMonth,
      monthsCount,
    });

    for (const month of scheduleFor(project)) await this.addScheduledExpense(condominium, project, month);
    return project;
  }

  /** Cambia, para TODAS las casas de este proyecto, cómo se cuenta "recaudado" (botón "Cambiar
   * asignación presupuestaria"): de proporcional al pago, a todo-o-nada, o viceversa. */
  async setCollectionMode(condominium: Condominium, projectId: string, mode: BudgetCollectionMode): Promise<BudgetProject> {
    await this.requireProject(condominium, projectId);
    return this.projects.setCollectionMode(projectId, mode);
  }

  async deleteProject(condominium: Condominium, projectId: string): Promise<void> {
    await this.requireProject(condominium, projectId);
    // No se tocan los gastos ya facturados: siguen en sus meses como una cuota extraordinaria
    // normal, solo se deja de llevar el seguimiento del proyecto.
    await this.projects.delete(projectId);
  }

  /** Progreso de recaudación de un proyecto, casa por casa, hasta el mes elegido (o el actual). */
  async progress(condominium: Condominium, projectId: string, asOf: BillingPeriod): Promise<BudgetProjectProgress> {
    const project = await this.requireProject(condominium, projectId);
    const [houses, accounts] = await Promise.all([this.houses.listByCondominium(condominium.id), this.accounts.accountsFor(condominium.id)]);
    const schedule = scheduleFor(project).filter((m) => periodKey(m) <= periodKey(asOf));
    const targets = allocate(project.targetAmount, houses.map((h) => h.aliquot));

    const rows: BudgetHouseProgress[] = houses.map((house, i) => {
      const account = accounts.get(house.id);
      let billed = 0;
      let collected = 0;
      for (const month of schedule) {
        const charge = account?.charges.find((c) => c.invoice && c.invoice.month === month.month && c.invoice.year === month.year);
        const line = charge?.invoice?.detail?.lines.find((l) => l.projectId === project.id);
        if (!charge || !line) continue;
        billed = roundCents(billed + line.unitAmount);
        if (project.collectionMode === 'all_or_nothing') {
          collected = roundCents(collected + (charge.status === 'paid' ? line.unitAmount : 0));
        } else {
          const ratio = charge.amount > 0 ? Math.min(1, charge.paid / charge.amount) : 0;
          collected = roundCents(collected + roundCents(line.unitAmount * ratio));
        }
      }
      return { houseId: house.id, houseNumber: house.number, ownerName: house.ownerName, aliquot: house.aliquot, target: targets[i], billed, collected };
    });
    rows.sort((a, b) => a.houseNumber.localeCompare(b.houseNumber, 'es', { numeric: true }));

    return {
      project,
      asOfYear: asOf.year,
      asOfMonth: asOf.month,
      schedule,
      houses: rows,
      targetTotal: project.targetAmount,
      billedTotal: roundCents(rows.reduce((s, r) => s + r.billed, 0)),
      collectedTotal: roundCents(rows.reduce((s, r) => s + r.collected, 0)),
    };
  }

  private async requireProject(condominium: Condominium, projectId: string): Promise<BudgetProject> {
    const project = await this.projects.findById(projectId);
    if (!project || project.condominiumId !== condominium.id) throw new NotFoundError('El proyecto no existe en este condominio');
    return project;
  }

  /** Agrega la cuota de un mes del proyecto a su relación de gastos (como cuota extraordinaria
   * por alícuota), conservando lo demás que ya tuviera esa relación. */
  private async addScheduledExpense(condominium: Condominium, project: BudgetProject, month: BudgetScheduleMonth): Promise<void> {
    const { sheet } = await this.billing.getSheet(condominium, { year: month.year, month: month.month });
    await this.billing.saveSheet(condominium, { year: month.year, month: month.month }, {
      reserveFundPercent: sheet.reserveFundPercent,
      dueDate: sheet.dueDate,
      generalNote: sheet.generalNote,
      unitNotes: sheet.unitNotes,
      expenses: [
        ...sheet.expenses,
        { concept: project.name, category: 'Proyectos', amount: month.amount, kind: 'extraordinary', distribution: 'aliquot', projectId: project.id },
      ],
      unitCharges: sheet.unitCharges,
    });
  }
}

import type { APIRoute } from 'astro';
import { getCondominiumService, getMetricsService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { isValidPeriod } from '@/utils/validation';
import { jsonError } from '@/utils/http';
import { CashFlowPdfFacade } from '@/services/pdf/CashFlowPdfFacade';

/** GET /api/admin/:slug/ingresos-egresos?month=9&year=2026 → PDF de ingresos y egresos de ese
 * mes (no acumulado a hoy), para ver (vista previa en el navegador) o imprimir/guardar desde ahí. */
export const GET: APIRoute = ({ locals, params, url }) =>
  withAdminCondominium(
    locals.admin,
    params.slug,
    async (condominium) => {
      const month = Number(url.searchParams.get('month'));
      const year = Number(url.searchParams.get('year'));
      if (!isValidPeriod(month, year)) return jsonError('Periodo inválido', 400);

      const [flow, full] = await Promise.all([
        getMetricsService().monthlyCashFlow(condominium, { month, year }),
        getCondominiumService().getWithSettings(condominium),
      ]);
      const pdf = await new CashFlowPdfFacade().render({
        condominiumName: condominium.name,
        settings: full.settings,
        monthLabel: flow.label,
        generatedAt: new Date(),
        openingBalance: flow.openingBalance,
        payments: flow.payments,
        incomeLines: flow.incomeLines,
        incomeTotal: flow.incomeTotal,
        expenseLines: flow.expenseLines,
        expenseTotal: flow.expenseTotal,
        closingBalance: flow.closingBalance,
      });

      const filename = `ingresos-egresos-${condominium.slug}-${year}-${String(month).padStart(2, '0')}.pdf`;
      return new Response(pdf as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
    'admin-ingresos-egresos',
  );

import type { APIRoute } from 'astro';
import { getAccountService, getCondominiumService } from '@/services/container';
import { withAdminCondominium } from '@/services/condominiums/adminScope';
import { isValidPeriod } from '@/utils/validation';
import { jsonError } from '@/utils/http';
import { AccountStatementPdfFacade } from '@/services/pdf/AccountStatementPdfFacade';

/** GET /api/admin/:slug/estado-de-cuenta?month=9&year=2026 → PDF con el estado de cuenta de
 * todas las casas durante ese mes, para ver (vista previa en el navegador) o imprimir/guardar
 * desde ahí. */
export const GET: APIRoute = ({ locals, params, url }) =>
  withAdminCondominium(
    locals.admin,
    params.slug,
    async (condominium) => {
      const month = Number(url.searchParams.get('month'));
      const year = Number(url.searchParams.get('year'));
      if (!isValidPeriod(month, year)) return jsonError('Periodo inválido', 400);

      const [rows, full] = await Promise.all([
        getAccountService().monthlyStatement(condominium.id, { month, year }),
        getCondominiumService().getWithSettings(condominium),
      ]);
      const pdf = await new AccountStatementPdfFacade().render({
        condominiumName: condominium.name,
        settings: full.settings,
        month,
        year,
        generatedAt: new Date(),
        rows: rows.map((r) => ({
          houseNumber: r.house.number,
          ownerName: r.house.ownerName,
          totalCharged: r.totalCharged,
          totalPaid: r.totalPaid,
          outstanding: r.outstanding,
          pendingCount: r.pendingCount,
          oldestPendingDate: r.oldestPendingDate,
        })),
      });

      const filename = `estado-de-cuenta-${condominium.slug}-${year}-${String(month).padStart(2, '0')}.pdf`;
      return new Response(pdf as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          // inline: se abre en el navegador (vista previa); desde ahí la administradora decide
          // si lo descarga o lo imprime. filename solo sugiere el nombre si decide guardarlo.
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
    'admin-estado-de-cuenta',
  );

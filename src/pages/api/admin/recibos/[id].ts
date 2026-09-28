import type { APIRoute } from 'astro';
import { getCondominiumService, getInvoiceService } from '@/services/container';
import { NotFoundError } from '@/services/errors';
import { isUuid } from '@/utils/validation';
import { jsonError } from '@/utils/http';

/** GET /api/admin/recibos/:id → dibuja el PDF del recibo y lo abre en el navegador (si es de un condominio del administrador). */
export const GET: APIRoute = async ({ params, locals }) => {
  const admin = locals.admin;
  const id = params.id ?? '';
  if (!admin) return jsonError('No autorizado', 401);
  if (!isUuid(id)) return jsonError('Recibo inválido', 400);

  try {
    const allowed = await getCondominiumService().listForAdmin(admin);
    const { pdf } = await getInvoiceService().pdfForAdmin(allowed, id);
    return new Response(pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (!(error instanceof NotFoundError)) console.error('[admin-recibo-pdf]', error);
    return jsonError('Recibo no encontrado', 404);
  }
};

import type { APIRoute } from 'astro';
import { getInvoiceService } from '@/services/container';
import { attachmentHeader } from '@/utils/http';

/**
 * Descarga directa al dispositivo del residente. El servidor trae el PDF desde Drive
 * y lo entrega con Content-Disposition: attachment (sin abrir Drive ni pedir cuenta Google).
 */
export const GET: APIRoute = async ({ locals, redirect }) => {
  const resident = locals.resident!;
  try {
    const result = await getInvoiceService().latestPdfForHouse(resident.houseId);
    if (!result) return redirect('/dashboard', 303);

    return new Response(result.pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': attachmentHeader(result.fileName),
        'Content-Length': String(result.pdf.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[invoice-download]', error);
    return new Response('No pudimos descargar la factura. Intente de nuevo en unos minutos.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};

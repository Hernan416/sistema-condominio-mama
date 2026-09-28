import type { APIRoute } from 'astro';
import { getInvoiceService } from '@/services/container';
import { attachmentHeader } from '@/utils/http';
import { isUuid } from '@/utils/validation';

/**
 * Descarga directa al dispositivo del residente: el servidor dibuja el PDF de su
 * recibo a partir de los datos guardados y lo entrega con Content-Disposition: attachment.
 */
export const GET: APIRoute = async ({ locals, redirect, url }) => {
  const resident = locals.resident!;
  // ?recibo=<id> descarga ese recibo (solo si es de su casa); sin parámetro, el más reciente.
  const requested = url.searchParams.get('recibo');
  const invoiceId = requested && isUuid(requested) ? requested : null;
  try {
    const result = await getInvoiceService().pdfForResident(resident.houseId, invoiceId);
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

/** "Factura-Casa-12-2026-09.pdf" */
export function invoiceFileName(houseNumber: string, month: number, year: number): string {
  const safeHouse = houseNumber.replace(/[^\w-]/g, '');
  return `Factura-Casa-${safeHouse}-${year}-${String(month).padStart(2, '0')}.pdf`;
}


/** Dirección donde el panel abre el PDF de un recibo (se dibuja al momento). */
export function adminInvoicePdfPath(invoiceId: string): string {
  return `/api/admin/recibos/${encodeURIComponent(invoiceId)}`;
}

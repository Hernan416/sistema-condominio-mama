/** "Factura-Casa-12-2026-09.pdf" */
export function invoiceFileName(houseNumber: string, month: number, year: number): string {
  const safeHouse = houseNumber.replace(/[^\w-]/g, '');
  return `Factura-Casa-${safeHouse}-${year}-${String(month).padStart(2, '0')}.pdf`;
}

/** Nombre de carpeta válido en Drive y en cualquier sistema de archivos (ej. "Manzana 3-B"). */
export function folderName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '') || 'Sin nombre';
}

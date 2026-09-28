// Mapa de navegación del panel de un condominio, organizado por TAREAS (no por datos).
// Cinco secciones con nombres cotidianos; "Recibos del mes" y "Ajustes" agrupan dos pantallas.

/** Pantalla concreta (una por página). */
export type CondominiumTab = 'resumen' | 'facturas' | 'gastos' | 'casas' | 'cobranza' | 'alicuotas' | 'datos';

export type AdminSectionId = 'inicio' | 'recibos' | 'casas' | 'historial' | 'ajustes';

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  /** Frase corta que explica para qué sirve (se muestra en el menú). */
  hint: string;
  icon: 'home' | 'receipt' | 'houses' | 'cash' | 'settings';
  href: string;
  tabs: CondominiumTab[];
}

export function adminSections(slug: string): AdminSection[] {
  const base = `/admin/${slug}`;
  return [
    { id: 'inicio', label: 'Inicio', hint: 'Qué hacer hoy', icon: 'home', href: base, tabs: ['resumen'] },
    { id: 'recibos', label: 'Recibos', hint: 'Gastos y recibos', icon: 'receipt', href: `${base}/gastos`, tabs: ['gastos', 'facturas'] },
    { id: 'casas', label: 'Casas y pagos', hint: 'Pagos y deudas', icon: 'houses', href: `${base}/casas`, tabs: ['casas'] },
    { id: 'historial', label: 'Historial', hint: 'Pagado y pendiente', icon: 'cash', href: `${base}/cobranza`, tabs: ['cobranza'] },
    { id: 'ajustes', label: 'Ajustes', hint: 'Datos y alícuotas', icon: 'settings', href: `${base}/datos`, tabs: ['datos', 'alicuotas'] },
  ];
}

export function sectionOf(tab: CondominiumTab): AdminSectionId {
  return adminSections('_').find((s) => s.tabs.includes(tab))!.id;
}

/** Pasos guiados de "Recibos del mes". */
export function monthlySteps(slug: string) {
  return [
    { tab: 'gastos' as const, number: 1, label: 'Anotar los gastos del mes', href: `/admin/${slug}/gastos` },
    { tab: 'facturas' as const, number: 2, label: 'Revisar y emitir los recibos', href: `/admin/${slug}/facturas` },
  ];
}

/** Sub-pantallas de "Ajustes". */
export function settingsTabs(slug: string) {
  return [
    { tab: 'datos' as const, label: 'Datos del recibo y caja', href: `/admin/${slug}/datos` },
    { tab: 'alicuotas' as const, label: 'Alícuotas (cuánto paga cada casa)', href: `/admin/${slug}/alicuotas` },
  ];
}

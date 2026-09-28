// Servicio de CLIENTE: única vía por la que las islas React hablan con el backend.
// No usa secretos: todo pasa por los endpoints protegidos en /api/admin/:slug/*.
import type { BillingSheetDto, InvoiceDto, InvoiceRowDto, PeriodDto, SheetOriginDto, UnitDto } from '@/types/dto';
import type { AliquotScheme } from '@/utils/aliquotScheme';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.assign('/?error=expired');
  if (!res.ok) throw new ApiError(body.error ?? 'Error inesperado', res.status);
  return body as T;
}

const qs = (p: PeriodDto) => new URLSearchParams({ month: String(p.month), year: String(p.year) });

export type AdminInvoicesApi = ReturnType<typeof createAdminInvoicesApi>;

export function createAdminInvoicesApi(condominiumSlug: string) {
  const base = `/api/admin/${encodeURIComponent(condominiumSlug)}`;

  return {
    async listInvoices(period: PeriodDto): Promise<{ rows: InvoiceRowDto[]; sheetSaved: boolean }> {
      return request(`${base}/invoices?${qs(period)}`);
    },

    async generate(houseId: string, period: PeriodDto): Promise<InvoiceRowDto> {
      return (await request<{ row: InvoiceRowDto }>(`${base}/invoices/generate`, { method: 'POST', body: JSON.stringify({ houseId, ...period }) })).row;
    },


    async getSheet(period: PeriodDto): Promise<{ sheet: BillingSheetDto; origin: SheetOriginDto }> {
      return request(`${base}/sheet?${qs(period)}`);
    },

    async saveSheet(period: PeriodDto, sheet: Omit<BillingSheetDto, 'updatedAt'>): Promise<BillingSheetDto> {
      return (await request<{ sheet: BillingSheetDto }>(`${base}/sheet`, { method: 'PUT', body: JSON.stringify({ ...period, ...sheet }) })).sheet;
    },

    async saveUnits(
      updates: Pick<UnitDto, 'id' | 'aliquot' | 'aliquotCategoryId'>[],
      aliquotScheme: AliquotScheme,
    ): Promise<{ units: UnitDto[]; aliquotScheme: AliquotScheme }> {
      return request(`${base}/units`, { method: 'PUT', body: JSON.stringify({ updates, aliquotScheme }) });
    },
  };
}

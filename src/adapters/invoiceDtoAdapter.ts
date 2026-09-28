import type { House, Invoice } from '@/types/domain';
import type { BillingSheet } from '@/types/billing';
import type { BillingSheetDto, InvoiceDto, InvoiceRowDto, UnitDto } from '@/types/dto';
import type { UnitPreview } from '@/services/billing/BillingService';

export function toInvoiceDto(invoice: Invoice): InvoiceDto {
  return {
    id: invoice.id,
    amount: invoice.amount,
    status: invoice.status,
    generatedAt: invoice.generatedAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
  };
}

export function toInvoiceRowDto({ house, invoice, breakdown, outdated, payment }: UnitPreview): InvoiceRowDto {
  return {
    houseId: house.id,
    houseNumber: house.number,
    username: house.username,
    ownerName: house.ownerName,
    aliquot: house.aliquot,
    breakdown,
    invoice: invoice ? toInvoiceDto(invoice) : null,
    outdated,
    payment,
  };
}

export function toBillingSheetDto(sheet: BillingSheet): BillingSheetDto {
  return {
    reserveFundPercent: sheet.reserveFundPercent,
    dueDate: sheet.dueDate,
    generalNote: sheet.generalNote,
    unitNotes: sheet.unitNotes,
    expenses: sheet.expenses,
    unitCharges: sheet.unitCharges,
    updatedAt: sheet.updatedAt?.toISOString() ?? null,
  };
}

export function toUnitDto(house: House): UnitDto {
  return {
    id: house.id,
    number: house.number,
    username: house.username,
    ownerName: house.ownerName,
    ownerDocument: house.ownerDocument,
    ownerEmail: house.ownerEmail,
    aliquot: house.aliquot,
    aliquotCategoryId: house.aliquotCategoryId,
  };
}

// Estado de cuenta (dominio) → todo lo que ve el residente en su pantalla. Solo formatea:
// los cálculos vienen del libro de cuentas y del recibo congelado.
import type { ExchangeRate, Invoice } from '@/types/domain';
import type { InvoiceLineKind } from '@/types/billing';
import { PAYMENT_METHOD_LABELS } from '@/types/accounts';
import type { AccountCharge, HouseAccount } from '@/services/accounts/AccountService';
import { formatUsd, formatVes, usdToVes } from '@/utils/currency';
import { formatDateVe } from '@/utils/dates';
import { formatPeriod, monthsLabel } from '@/utils/months';
import { formatPercent } from '@/utils/billingCalculator';
import { debtAgeLabel } from '@/utils/ledger';

type Tone = 'done' | 'warning' | 'danger' | 'default';

const day = (iso: string) => formatDateVe(new Date(`${iso}T12:00:00-04:00`));
const rateFormat = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const downloadHref = (invoiceId: string) => `/api/invoices/download?recibo=${encodeURIComponent(invoiceId)}`;

const SECTION_TITLES: { kind: InvoiceLineKind; title: string }[] = [
  { kind: 'ordinary', title: 'Gastos comunes' },
  { kind: 'reserve', title: 'Fondo de reserva' },
  { kind: 'income', title: 'Ingresos de la comunidad (se descuentan)' },
  { kind: 'extraordinary', title: 'Cuotas extraordinarias' },
  { kind: 'unit', title: 'Cargos y abonos de su casa' },
  { kind: 'interest', title: 'Intereses de mora' },
];

function chargeStatus(c: AccountCharge): { label: string; tone: Tone } {
  if (c.status === 'paid') return { label: 'Pagado', tone: 'done' };
  if (c.status === 'partial') return { label: 'Abono parcial', tone: 'warning' };
  return { label: 'Pendiente', tone: 'danger' };
}

interface Input {
  account: HouseAccount;
  /** Recibo a mostrar en la vista previa (id de la URL); si no es válido, el más reciente. */
  selectedInvoiceId: string | null;
  todayRate: ExchangeRate | null;
  today: string;
}

export function toResidentDashboardView({ account, selectedInvoiceId, todayRate, today }: Input) {
  const ves = (usd: number) => (todayRate ? formatVes(usdToVes(usd, todayRate.usdToVes)) : null);
  const receiptCharges = account.charges.filter((c) => c.invoice).reverse(); // más reciente primero
  const pendingCharges = account.charges.filter((c) => c.outstanding > 0); // más antiguo primero
  const selected = receiptCharges.find((c) => c.invoice!.id === selectedInvoiceId) ?? receiptCharges[0] ?? null;

  // Próximo vencimiento: el del recibo pendiente más antiguo que tenga fecha.
  const nextDue = pendingCharges.map((c) => c.invoice?.detail?.dueDate).find(Boolean) ?? null;

  return {
    houseNumber: account.house.number,
    username: account.house.username,
    ownerName: account.house.ownerName,
    aliquotLabel: formatPercent(account.house.aliquot),
    todayRateLabel: todayRate ? `Bs. ${rateFormat.format(todayRate.usdToVes)} por dólar (${todayRate.source}, ${formatDateVe(todayRate.publishedAt)})` : null,

    status: {
      upToDate: account.outstanding === 0,
      outstandingLabel: formatUsd(account.outstanding),
      outstandingVesLabel: account.outstanding > 0 ? ves(account.outstanding) : null,
      creditLabel: account.credit > 0 ? formatUsd(account.credit) : null,
      pendingCount: pendingCharges.length,
      /** "Equivale a 5 meses de condominio" (null si no debe meses). */
      monthsOwedLabel: account.monthsOwed > 0 ? monthsLabel(account.monthsOwed) : null,
      oldestAgeLabel: account.oldestPendingDate ? debtAgeLabel(account.oldestPendingDate, today) : null,
      nextDueLabel: nextDue ? day(nextDue) : null,
      overdue: nextDue !== null && nextDue < today,
      totalPaidLabel: formatUsd(account.totalPaid),
      totalChargedLabel: formatUsd(account.totalCharged),
      paymentsCount: account.payments.length,
      lastPaymentLabel: account.payments[0] ? `${formatUsd(account.payments[0].amount)} el ${day(account.payments[0].date)}` : null,
    },

    pending: pendingCharges.map((c) => ({
      id: c.id,
      label: c.label,
      kindLabel: c.invoice ? 'Recibo mensual' : `Deuda registrada por la administración${c.debt?.months ? ` (${monthsLabel(c.debt.months)})` : ''}`,
      detail: c.debt?.detail ?? null,
      sinceLabel: c.invoice ? `Recibo de ${formatPeriod(c.invoice.month, c.invoice.year).toLowerCase()}` : `Desde el ${day(c.date)}`,
      ageLabel: debtAgeLabel(c.date, today),
      amountLabel: formatUsd(c.amount),
      paidLabel: c.paid > 0 ? formatUsd(c.paid) : null,
      outstandingLabel: formatUsd(c.outstanding),
      outstandingVesLabel: ves(c.outstanding),
      status: chargeStatus(c),
      previewHref: c.invoice ? `?recibo=${encodeURIComponent(c.invoice.id)}#recibo` : null,
    })),

    receipts: receiptCharges.map((c) => ({
      id: c.invoice!.id,
      periodLabel: formatPeriod(c.invoice!.month, c.invoice!.year),
      amountLabel: formatUsd(c.amount),
      paidLabel: formatUsd(c.paid),
      outstandingLabel: c.outstanding > 0 ? formatUsd(c.outstanding) : null,
      status: chargeStatus(c),
      selected: c === selected,
      previewHref: `?recibo=${encodeURIComponent(c.invoice!.id)}#recibo`,
      downloadHref: downloadHref(c.invoice!.id),
    })),

    debts: account.charges
      .filter((c) => c.debt)
      .reverse()
      .map((c) => ({
        id: c.id,
        concept: c.label,
        detail: c.debt!.detail,
        dateLabel: day(c.date),
        amountLabel: formatUsd(c.amount),
        outstandingLabel: formatUsd(c.outstanding),
        status: chargeStatus(c),
      })),

    payments: account.payments.map((p) => ({
      id: p.id,
      dateLabel: day(p.date),
      amountLabel: formatUsd(p.amount),
      vesLabel: p.amountVes !== null ? `${formatVes(p.amountVes)}${p.exchangeRate ? ` a Bs. ${rateFormat.format(p.exchangeRate)}` : ''}` : null,
      methodLabel: PAYMENT_METHOD_LABELS[p.method],
      reference: p.reference,
      coveredLabel: p.appliedTo.length
        ? `Se aplicó a: ${p.appliedTo.map((a) => `${a.label.replace(/^Recibo de /, 'recibo de ')} (${formatUsd(a.amount)})`).join(', ')}`
        : 'Quedó como saldo a favor',
    })),

    preview: selected ? toReceiptPreview(selected.invoice!, selected) : null,
  };
}

/** Vista previa del recibo, con los datos CONGELADOS al emitir (igual que el PDF). */
function toReceiptPreview(invoice: Invoice, charge: AccountCharge) {
  const d = invoice.detail;
  const h = invoice.issued;
  if (!d) return null;
  const rate = invoice.exchangeRate;
  return {
    id: invoice.id,
    periodLabel: formatPeriod(invoice.month, invoice.year),
    receiptNumber: h?.receiptNumber ?? null,
    issuedLabel: invoice.generatedAt ? formatDateVe(invoice.generatedAt) : null,
    dueLabel: d.dueDate ? day(d.dueDate) : null,
    condominiumName: h?.condominiumName ?? null,
    rif: h?.settings.rif ?? null,
    address: h?.settings.address ?? null,
    ownerName: h?.ownerName ?? null,
    ownerDocument: h?.ownerDocument ?? null,
    houseNumber: h?.houseNumber ?? invoice.houseNumber,
    aliquotLabel: formatPercent(d.aliquot),
    solvent: d.solvent,
    previousDebtCount: d.previousDebtCount,
    sections: SECTION_TITLES.map((s) => ({
      title: s.kind === 'reserve' ? `Fondo de reserva (${formatPercent(d.reserveFundPercent)})` : s.title,
      lines: d.lines
        .filter((l) => l.kind === s.kind)
        .map((l) => ({ concept: l.concept, buildingLabel: l.buildingAmount !== null ? formatUsd(l.buildingAmount) : null, unitLabel: formatUsd(l.unitAmount) })),
    })).filter((s) => s.lines.length > 0),
    monthTotalLabel: formatUsd(d.monthTotal),
    previousDebtLabel: d.previousDebt > 0 ? formatUsd(d.previousDebt) : null,
    totalDueLabel: formatUsd(d.totalDue),
    // Bs. a la tasa congelada del día de emisión (como en el PDF).
    totalDueVesLabel: rate ? formatVes(usdToVes(d.totalDue, rate)) : null,
    rateLabel: rate ? `Tasa ${h?.exchangeRateSource ?? 'BCV'} del recibo: Bs. ${rateFormat.format(rate)} por dólar${invoice.exchangeRateDate ? `, publicada el ${formatDateVe(invoice.exchangeRateDate)}` : ''}.` : null,
    notes: [d.unitNote, d.generalNote].filter((n): n is string => !!n?.trim()),
    paymentLines: (h?.settings.paymentInstructions ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
    status: chargeStatus(charge),
    paidLabel: charge.paid > 0 ? formatUsd(charge.paid) : null,
    outstandingLabel: charge.outstanding > 0 ? formatUsd(charge.outstanding) : null,
    downloadHref: downloadHref(invoice.id),
  };
}

export type ResidentDashboardView = ReturnType<typeof toResidentDashboardView>;
export type ReceiptPreviewView = NonNullable<ResidentDashboardView['preview']>;

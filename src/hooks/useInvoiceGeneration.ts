import { useCallback, useMemo, useRef, useState } from 'react';
import { createAdminInvoicesApi } from '@/services/api/adminInvoicesApi';
import { summarizeRows } from '@/utils/invoiceStats';
import type { InvoiceRowDto, PeriodDto } from '@/types/dto';

export type RowPhase = 'idle' | 'working' | 'error';
export interface RowState {
  phase: RowPhase;
  message?: string;
}

export interface BulkProgress {
  running: boolean;
  done: number;
  total: number;
  failed: number;
}

interface Options {
  condominiumSlug: string;
  initialPeriod: PeriodDto;
  initialRows: InvoiceRowDto[];
  initialSheetSaved: boolean;
}

/** Unidad que necesita emitirse: sin recibo, o con recibo que ya no coincide con la relación de gastos. */
export const needsIssuing = (r: InvoiceRowDto) => !r.invoice?.imported && (!r.invoice || r.invoice.status === 'pending' || r.outdated);

export function useInvoiceGeneration({ condominiumSlug, initialPeriod, initialRows, initialSheetSaved }: Options) {
  const api = useMemo(() => createAdminInvoicesApi(condominiumSlug), [condominiumSlug]);
  const [period, setPeriodState] = useState(initialPeriod);
  const [rows, setRows] = useState(initialRows);
  const [sheetSaved, setSheetSaved] = useState(initialSheetSaved);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkProgress>({ running: false, done: 0, total: 0, failed: 0 });
  const periodRef = useRef(period);

  const setRowState = (houseId: string, state: RowState) => setRowStates((prev) => ({ ...prev, [houseId]: state }));
  const replaceRow = (row: InvoiceRowDto) => setRows((prev) => prev.map((r) => (r.houseId === row.houseId ? row : r)));

  const changePeriod = useCallback(
    async (next: PeriodDto) => {
      periodRef.current = next;
      setPeriodState(next);
      setLoading(true);
      setLoadError(null);
      try {
        const fresh = await api.listInvoices(next);
        if (periodRef.current !== next) return; // cambió de periodo mientras cargaba
        setRows(fresh.rows);
        setSheetSaved(fresh.sheetSaved);
        setRowStates({});
        setBulk({ running: false, done: 0, total: 0, failed: 0 });
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las facturas');
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  /** Emite (o regenera) el recibo de una unidad. Devuelve true si salió bien. */
  const generateOne = useCallback(
    async (houseId: string): Promise<boolean> => {
      setRowState(houseId, { phase: 'working' });
      try {
        replaceRow(await api.generate(houseId, periodRef.current));
        setRowState(houseId, { phase: 'idle' });
        return true;
      } catch (error) {
        setRowState(houseId, { phase: 'error', message: error instanceof Error ? error.message : 'Error al emitir' });
        return false;
      }
    },
    [api],
  );

  const pendingHouseIds = useMemo(
    () => rows.filter(needsIssuing).filter((r) => r.payment?.status !== 'paid').map((r) => r.houseId),
    [rows],
  );

  // Secuencial a propósito: respeta los límites de Vercel.
  const generateAll = useCallback(async () => {
    const ids = pendingHouseIds;
    if (ids.length === 0) return;
    setBulk({ running: true, done: 0, total: ids.length, failed: 0 });
    for (const id of ids) {
      const ok = await generateOne(id);
      setBulk((b) => ({ ...b, done: b.done + 1, failed: b.failed + (ok ? 0 : 1) }));
    }
    setBulk((b) => ({ ...b, running: false }));
  }, [pendingHouseIds, generateOne]);

  const stats = useMemo(() => summarizeRows(rows), [rows]);

  return {
    period,
    changePeriod,
    rows,
    sheetSaved,
    rowStates,
    loading,
    loadError,
    generateOne,
    generateAll,
    pendingCount: pendingHouseIds.length,
    bulk,
    stats,
  };
}

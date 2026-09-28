import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { folderName, invoiceFileName } from '@/utils/invoiceNaming';
import { monthFolderName } from '@/utils/months';
import type { InvoiceFileTarget, InvoiceStorage, StoredFile } from '@/services/contracts';

/**
 * Sustituto local de GoogleDriveFacade: misma interfaz, misma jerarquía Condominio → Año → Mes,
 * pero en disco (<LOCAL_DATA_DIR>/drive/Manzana 3-B/2026/09 - Septiembre/Factura-Casa-1-2026-09.pdf).
 * El `fileId` es la ruta relativa codificada; la URL la sirve /api/admin/files/[id].
 */
export class LocalFileStorage implements InvoiceStorage {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(process.cwd(), dataDir, 'drive');
  }

  async uploadInvoice(pdf: Uint8Array, { condominiumName, houseNumber, month, year }: InvoiceFileTarget): Promise<StoredFile> {
    const relPath = [
      folderName(condominiumName),
      String(year),
      monthFolderName(month),
      invoiceFileName(houseNumber, month, year),
    ].join('/');
    const absPath = this.resolveInside(relPath);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, pdf); // regenerar sobrescribe, igual que en Drive

    const fileId = Buffer.from(relPath, 'utf8').toString('base64url');
    return { fileId, url: `/api/admin/files/${fileId}` };
  }

  async downloadInvoice(fileId: string): Promise<Uint8Array> {
    const relPath = Buffer.from(fileId, 'base64url').toString('utf8');
    return new Uint8Array(await readFile(this.resolveInside(relPath)));
  }

  /** Impide salir de la carpeta raíz con rutas tipo "../../". */
  private resolveInside(relPath: string): string {
    const abs = resolve(this.root, relPath);
    const rel = relative(this.root, abs);
    if (rel.startsWith('..') || rel.split(sep).includes('..') || resolve(this.root, rel) !== abs) {
      throw new Error('Ruta de archivo inválida');
    }
    return abs;
  }
}

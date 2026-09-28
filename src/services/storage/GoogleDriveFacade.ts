import { Readable } from 'node:stream';
import { auth, drive, type drive_v3 } from '@googleapis/drive';
import { withRetry } from '@/utils/retry';
import { monthFolderName } from '@/utils/months';
import { folderName, invoiceFileName } from '@/utils/invoiceNaming';
import type { InvoiceFileTarget, InvoiceStorage, StoredFile } from '@/services/contracts';

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderId: string;
  publicLinks: boolean;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * FACADE sobre la API de Google Drive.
 * Expone solo `uploadInvoice` y `downloadInvoice`; oculta OAuth2, la jerarquía
 * Raíz → Condominio → Año → Mes, la deduplicación de archivos, permisos y reintentos.
 */
export class GoogleDriveFacade implements InvoiceStorage {
  private readonly client: drive_v3.Drive;
  // Cache por instancia de la función serverless: evita buscar la misma carpeta 30 veces en un lote.
  private readonly folderCache = new Map<string, Promise<string>>();

  constructor(private readonly config: GoogleDriveConfig) {
    const oauth = new auth.OAuth2(config.clientId, config.clientSecret);
    oauth.setCredentials({ refresh_token: config.refreshToken });
    this.client = drive({ version: 'v3', auth: oauth });
  }

  async uploadInvoice(pdf: Uint8Array, { condominiumName, houseNumber, month, year }: InvoiceFileTarget): Promise<StoredFile> {
    const condoFolderId = await this.ensureFolder(folderName(condominiumName), this.config.rootFolderId);
    const yearFolderId = await this.ensureFolder(String(year), condoFolderId);
    const monthFolderId = await this.ensureFolder(monthFolderName(month), yearFolderId);
    const name = invoiceFileName(houseNumber, month, year);

    const existingId = await this.findChild(name, monthFolderId, 'application/pdf');
    const fileId = existingId
      ? await this.replaceContent(existingId, pdf)
      : await this.createFile(name, monthFolderId, pdf);

    if (this.config.publicLinks) await this.shareWithAnyoneWithLink(fileId);
    return { fileId, url: await this.getDownloadUrl(fileId) };
  }

  async downloadInvoice(fileId: string): Promise<Uint8Array> {
    const res = await this.call(() =>
      this.client.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
    );
    return new Uint8Array(res.data as unknown as ArrayBuffer);
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  private ensureFolder(name: string, parentId: string): Promise<string> {
    const key = `${parentId}/${name}`;
    let pending = this.folderCache.get(key);
    if (!pending) {
      pending = this.findOrCreateFolder(name, parentId);
      pending.catch(() => this.folderCache.delete(key));
      this.folderCache.set(key, pending);
    }
    return pending;
  }

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const existing = await this.findChild(name, parentId, FOLDER_MIME);
    if (existing) return existing;

    const res = await this.call(() =>
      this.client.files.create({
        requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
        fields: 'id',
      }),
    );
    if (!res.data.id) throw new Error(`Drive no devolvió id para la carpeta "${name}"`);
    return res.data.id;
  }

  private async findChild(name: string, parentId: string, mimeType: string): Promise<string | null> {
    const q = [
      `name = '${escapeQuery(name)}'`,
      `'${escapeQuery(parentId)}' in parents`,
      `mimeType = '${mimeType}'`,
      'trashed = false',
    ].join(' and ');

    const res = await this.call(() =>
      this.client.files.list({ q, fields: 'files(id)', pageSize: 1, spaces: 'drive' }),
    );
    return res.data.files?.[0]?.id ?? null;
  }

  private async createFile(name: string, parentId: string, pdf: Uint8Array): Promise<string> {
    const res = await this.call(() =>
      this.client.files.create({
        requestBody: { name, parents: [parentId], mimeType: 'application/pdf' },
        media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdf)) },
        fields: 'id',
      }),
    );
    if (!res.data.id) throw new Error(`Drive no devolvió id para "${name}"`);
    return res.data.id;
  }

  /** Regenerar una factura reemplaza el archivo: mismo id, mismo enlace, sin duplicados. */
  private async replaceContent(fileId: string, pdf: Uint8Array): Promise<string> {
    await this.call(() =>
      this.client.files.update({
        fileId,
        media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdf)) },
        fields: 'id',
      }),
    );
    return fileId;
  }

  private async shareWithAnyoneWithLink(fileId: string): Promise<void> {
    await this.call(() =>
      this.client.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' },
        fields: 'id',
      }),
    );
  }

  private async getDownloadUrl(fileId: string): Promise<string> {
    const res = await this.call(() =>
      this.client.files.get({ fileId, fields: 'webContentLink, webViewLink' }),
    );
    return res.data.webContentLink ?? res.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  }

  /** Reintenta solo errores transitorios (límite de tasa y 5xx). */
  private call<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, { attempts: 4, baseDelayMs: 300, shouldRetry: isTransientDriveError });
  }
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isTransientDriveError(error: unknown): boolean {
  const status = Number((error as { code?: unknown; status?: unknown })?.code ?? (error as { status?: unknown })?.status);
  return status === 429 || (status >= 500 && status < 600);
}

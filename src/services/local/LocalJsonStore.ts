import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildLocalSeed } from '@/services/local/localSeed';
import { MIGRATIONS } from '@/services/local/localMigrations';
import { LOCAL_SCHEMA_VERSION, type LocalDatabase } from '@/services/local/localSchema';

// Se re-exportan para quien ya importaba desde aquí.
export { LOCAL_SCHEMA_VERSION };
export type { LocalDatabase, LocalHouseRecord, LocalInvoiceRecord } from '@/services/local/localSchema';

/**
 * Cola de escritura por archivo, compartida en todo el proceso. Vive en globalThis para
 * sobrevivir al HMR de Vite: se comparte SOLO la cola (datos), nunca la instancia, así el
 * código recargado siempre es el que se ejecuta.
 */
const queues = ((globalThis as unknown as { __localJsonQueues?: Map<string, Promise<unknown>> }).__localJsonQueues ??= new Map());

/**
 * "Base de datos" en un archivo JSON (solo para desarrollo).
 * Las escrituras se serializan en una cola para que dos peticiones simultáneas
 * (p. ej. la generación masiva) no se pisen.
 */
export class LocalJsonStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = resolve(process.cwd(), dataDir, 'db.json');
  }

  read(): Promise<LocalDatabase> {
    return this.enqueue(() => this.load());
  }

  /** Ejecuta `fn` sobre la base y la guarda al terminar. */
  transaction<T>(fn: (db: LocalDatabase) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const db = await this.load();
      const result = await fn(db);
      await this.save(db);
      return result;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const previous = queues.get(this.filePath) ?? Promise.resolve();
    const next = previous.then(task, task);
    queues.set(this.filePath, next.catch(() => undefined));
    return next;
  }

  private async load(): Promise<LocalDatabase> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return this.reseed('creada');
    }

    const db = JSON.parse(raw) as Partial<LocalDatabase>;
    if (db.version !== LOCAL_SCHEMA_VERSION && this.migrate(db)) {
      await this.save(db as LocalDatabase);
      console.info(`[local] Base de datos migrada a la versión ${LOCAL_SCHEMA_VERSION} (datos conservados).`);
    }
    if (db.version !== LOCAL_SCHEMA_VERSION) {
      await copyFile(this.filePath, `${this.filePath}.v${db.version ?? 1}.bak`);
      return this.reseed(`actualizada a la versión ${LOCAL_SCHEMA_VERSION} (copia del archivo anterior guardada como .bak)`);
    }
    return db as LocalDatabase;
  }

  /** Aplica migraciones en cadena hasta la versión actual. false si falta algún paso. */
  private migrate(db: Partial<LocalDatabase>): boolean {
    let version = db.version ?? 1;
    while (version < LOCAL_SCHEMA_VERSION) {
      const step = MIGRATIONS[version];
      if (!step) return false;
      step(db as Record<string, unknown>);
      version += 1;
    }
    db.version = version;
    return true;
  }

  private async reseed(reason: string): Promise<LocalDatabase> {
    const seed = buildLocalSeed();
    await this.save(seed);
    console.info(`[local] Base de datos ${reason}: ${this.filePath}`);
    console.info('[local] Residentes: 3a-1 … 3a-33 y 3b-1 … 3b-38 — cada uno crea su PIN al entrar la primera vez');
    return seed;
  }

  /** Escritura atómica: archivo temporal + rename, para no dejar JSON a medias. */
  private async save(db: LocalDatabase): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await rename(tmp, this.filePath);
  }
}

// Paso 1 de la carga histórica: EXTRAER. No escribe nada en la base.
//
//   npm run import:extract -- "<carpeta de origen>" ["<archivo alícuotas.xlsx>" ...]
//
// Recorre la carpeta (Condominio / Mes / {recibos|balance} / *.pdf), saca el texto de cada PDF
// con pdftotext -layout (conserva columnas y montos alineados) y convierte cada Excel en JSON.
// Todo queda en .local-data/import/:
//   texto/<misma ruta>.txt   texto de cada PDF (una hoja por página, separadas por \f)
//   excel/<archivo>.json     cada hoja del Excel como filas
//   inventario.json          lista de archivos: condominio, mes, tipo, páginas, tamaño, huella
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import ExcelJS from 'exceljs';

const [sourceDir, ...extraFiles] = process.argv.slice(2);
if (!sourceDir) {
  console.error('Uso: npm run import:extract -- "<carpeta de origen>" ["<excel>" ...]');
  process.exit(1);
}
const root = resolve(sourceDir);
const out = resolve(process.env.LOCAL_DATA_DIR ?? '.local-data', 'import');
mkdirSync(out, { recursive: true });

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Adivina condominio, mes/año y tipo a partir de la ruta (se revisa luego a mano si falla). */
function classify(rel: string) {
  const parts = rel.split(/[\\/]/);
  const lower = parts.map(norm);
  const condominium = parts[0] ?? null;
  let month: number | null = null;
  let year: number | null = null;
  for (const p of lower) {
    const byName = Object.entries(MONTHS).find(([name]) => p.includes(name));
    const numeric = p.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\D|$)/);
    if (byName) month = byName[1];
    else if (month === null && numeric && /mes|^\d{1,2}([ ._-]|$)/.test(p)) month = Number(numeric[1]);
    const y = p.match(/20\d{2}/);
    if (y) year = Number(y[0]);
  }
  const kind = lower.some((p) => p.includes('balance')) ? 'balance' : lower.some((p) => p.includes('recibo')) ? 'recibo' : 'otro';
  return { condominium, month, year, kind };
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const sha1 = (file: string) => createHash('sha1').update(readFileSync(file)).digest('hex');

async function excelToJson(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets: Record<string, unknown[][]> = {};
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v && typeof v === 'object') {
          const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
          if ('result' in o) return o.result; // fórmula → su valor
          if (o.richText) return o.richText.map((r) => r.text).join('');
          if ('text' in o) return o.text;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
        }
        return v ?? null;
      });
      rows.push(values);
    });
    sheets[ws.name] = rows;
  });
  return sheets;
}

const inventory: Record<string, unknown>[] = [];
const seen = new Map<string, string>();
const files = [...walk(root), ...extraFiles.map((f) => resolve(f))];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  const rel = file.startsWith(root) ? relative(root, file) : basename(file);
  const hash = sha1(file);
  const duplicateOf = seen.get(hash) ?? null;
  seen.set(hash, rel);
  const base = { archivo: rel, bytes: statSync(file).size, huella: hash, duplicadoDe: duplicateOf, ...classify(rel) };

  if (ext === '.pdf') {
    const txtPath = join(out, 'texto', `${rel}.txt`);
    mkdirSync(dirname(txtPath), { recursive: true });
    try {
      execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, txtPath], { stdio: 'pipe' });
      const text = readFileSync(txtPath, 'utf8');
      const pages = text.split('\f').filter((p) => p.trim()).length;
      // Poco texto por página = PDF escaneado (imagen): necesitará lectura visual.
      const scanned = text.replace(/\s/g, '').length < 40 * Math.max(pages, 1);
      inventory.push({ ...base, tipoArchivo: 'pdf', paginas: pages, escaneado: scanned, texto: relative(out, txtPath) });
    } catch (error) {
      inventory.push({ ...base, tipoArchivo: 'pdf', error: String(error) });
    }
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    const jsonPath = join(out, 'excel', `${rel}.json`);
    mkdirSync(dirname(jsonPath), { recursive: true });
    try {
      const sheets = await excelToJson(file);
      writeFileSync(jsonPath, JSON.stringify(sheets, null, 1));
      inventory.push({ ...base, tipoArchivo: 'excel', hojas: Object.fromEntries(Object.entries(sheets).map(([n, r]) => [n, r.length])), json: relative(out, jsonPath) });
    } catch (error) {
      inventory.push({ ...base, tipoArchivo: 'excel', error: String(error) });
    }
  } else if (ext === '.xls') {
    inventory.push({ ...base, tipoArchivo: 'excel-antiguo', error: 'Formato .xls (Excel 97-2003): ábralo y guárdelo como .xlsx' });
  } else {
    inventory.push({ ...base, tipoArchivo: ext || 'sin extensión', omitido: true });
  }
}

writeFileSync(join(out, 'inventario.json'), JSON.stringify(inventory, null, 1));
const count = (f: (i: Record<string, unknown>) => boolean) => inventory.filter(f).length;
console.log(`Archivos: ${inventory.length} · PDF: ${count((i) => i.tipoArchivo === 'pdf')} (escaneados: ${count((i) => i.escaneado === true)}) · Excel: ${count((i) => String(i.tipoArchivo).startsWith('excel'))}`);
console.log(`Duplicados: ${count((i) => !!i.duplicadoDe)} · Con error: ${count((i) => !!i.error)} · Sin mes detectado: ${count((i) => i.tipoArchivo === 'pdf' && i.month === null)}`);
console.table(
  Object.entries(
    inventory.reduce<Record<string, number>>((acc, i) => {
      const key = `${i.condominium ?? '?'} · ${i.year ?? '?'}-${String(i.month ?? '?').padStart(2, '0')} · ${i.kind}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([grupo, archivos]) => ({ grupo, archivos })),
);
console.log(`Resultado en ${out}`);

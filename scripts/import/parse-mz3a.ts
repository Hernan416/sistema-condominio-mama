// Genera la plantilla histórica de Manzana 3-A (recibos + balance) y las alícuotas de 3-A y 3-B,
// a partir de los PDF reales en "CONDOMINIO/". No escribe en la base: solo produce el JSON que
// luego revisa `npm run import -- <archivo>` (ensayo) y `npm run import -- <archivo> --apply`.
//
//   npx tsx scripts/import/parse-mz3a.ts
//
// Salida: .local-data/import/plantilla-mz3a.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InvoiceLineKind } from '@/types/billing';
import type { Plantilla, PlantillaBalance, PlantillaHouse, PlantillaPayment, PlantillaReceipt } from './plantilla';

const ROOT = resolve('CONDOMINIO/CONDOMINIO MZ3A');
const OUT = resolve('.local-data/import/plantilla-mz3a.json');

// ─── Alícuotas (ANEXO Nº 1, columna "S/SECTOR 1A y 1B": cada manzana suma 100 % por sí sola) ──
const ALIQUOTS_A: number[] = [
  3.048, 3.093, 3.135, 3.143, 3.098, 3.129, 3.137, 3.097, 3.136, 3.127, 5.17, 2.778, 2.78, 2.781, 2.745, 2.779, 5.007, 2.746, 2.728, 2.742,
  2.724, 2.674, 2.656, 2.671, 2.667, 2.641, 3.953, 2.779, 2.779, 2.781, 2.746, 2.746, 2.781,
];
const ALIQUOTS_B: number[] = [
  2.467, 2.439, 2.465, 2.469, 2.437, 2.438, 2.449, 3.003, 2.361, 2.394, 2.4, 2.377, 2.382, 2.416, 2.421, 2.398, 2.399, 4.567, 2.464, 2.437,
  2.468, 2.464, 2.437, 2.437, 2.468, 2.464, 2.468, 4.054, 2.732, 2.732, 2.782, 2.774, 2.744, 2.746, 2.783, 2.781, 2.752, 2.714,
];
const housesFrom = (aliquots: number[], sourceLabel: string): PlantillaHouse[] =>
  aliquots.map((aliquot, i) => ({ number: String(i + 1), aliquot, source: sourceLabel }));

// ─── Meses a cargar (enero-agosto 2026) ────────────────────────────────────────────────────────
const MONTHS: { month: number; year: number; folder: string }[] = [
  { month: 1, year: 2026, folder: 'ENERO 2026' },
  { month: 2, year: 2026, folder: 'FEBRERO 2026' },
  { month: 3, year: 2026, folder: 'MARZO 2026' },
  { month: 4, year: 2026, folder: 'ABRIL 2026' },
  { month: 5, year: 2026, folder: 'MAYO 2026' },
  { month: 6, year: 2026, folder: 'JUNIO 2026' },
  { month: 7, year: 2026, folder: 'JULIO 2026' },
  { month: 8, year: 2026, folder: 'AGOSTO 2026' },
];

// ─── Utilidades de texto/número (formato venezolano: punto = miles, coma = decimal; a veces el
// PDF trae el punto como decimal por error de tipeo, así que se acepta también) ─────────────────
const MONEY_RE = /-?\d{1,3}(?:[.,]\d{3})+[.,]\d{2}\b|-?\d+[.,]\d{2}\b/g;
// La alícuota es siempre un solo dígito antes del separador (< 10 %): evita confundirla con
// números de cuenta/factura o con el "Monto en $" de una línea vecina (p. ej. "29.700,00"). El
// "(?![.,]\d)" evita "morder" solo el primer grupo de un monto grande en Bs. (p. ej. "1.105.742,04").
const ALIQUOT_RE = /\b\d[.,]\d{2,3}\b(?![.,]\d)/;

function toNumber(tok: string): number {
  const isVE = /,\d{1,2}$/.test(tok); // termina en coma+1-2 dígitos → coma es el decimal
  const clean = isVE ? tok.replace(/\./g, '').replace(',', '.') : tok.replace(/,/g, '');
  return Number(clean);
}
function moneyTokens(line: string): number[] {
  return [...line.matchAll(MONEY_RE)].map((m) => toNumber(m[0]));
}
function pdftotext(file: string): string {
  return execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

const KEYWORD_KIND: [RegExp, InvoiceLineKind][] = [
  [/fondo de reserva/i, 'reserve'],
  [/reintegro|reembolso/i, 'income'],
  [/extraordinari/i, 'extraordinary'],
  [/inter[eé]s.*mora|mora.*inter[eé]s/i, 'interest'],
];
function kindOf(concept: string): InvoiceLineKind {
  for (const [re, kind] of KEYWORD_KIND) if (re.test(concept)) return kind;
  return 'ordinary';
}

// ─── Parseo de un recibo (dos plantillas: clásica ene-jul, y la de agosto) ─────────────────────
function parseReceipt(text: string, ctx: { month: number; year: number; source: string; houseFromFile: string }): PlantillaReceipt {
  const lines = text.split(/\r?\n/);
  const idx = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const agosto = !/INMOBILIARIO:/.test(text) && /\bInmueble\b/.test(text);

  // La casa se toma del NOMBRE DE ARCHIVO (confiable: un archivo por casa). El código interno
  // ("INMOBILIARIO"/"Inmueble") solo se usa para avisar si no coincide (ocurre al menos una vez
  // por un copy-paste del PDF de origen: agosto/CASA 28 trae por error "P1-01").
  const house = ctx.houseFromFile;
  let houseInternal = '';
  const labelIdx = idx(agosto ? /\bInmueble\b/ : /INMOBILIARIO:/);
  for (let i = labelIdx; i < Math.min(labelIdx + 5, lines.length); i++) {
    const l = lines[i].trim();
    const p1 = l.match(/^P1[-\s]?0*(\d{1,3})$/i);
    if (p1) {
      houseInternal = String(Number(p1[1]));
      break;
    }
    if (/^\d{1,3}$/.test(l)) {
      houseInternal = l;
      break;
    }
  }
  if (houseInternal && houseInternal !== house) console.warn(`aviso: ${ctx.source} dice internamente casa ${houseInternal} pero el archivo es de la casa ${house} (se usó el archivo)`);

  // Propietario: la línea siguiente a "PROPIETARIO:" / "Propietario:".
  const propIdx = idx(/PROPIETARIO:/i);
  const ownerName = propIdx >= 0 ? lines[propIdx + 1]?.trim() || null : null;

  // Alícuota: primer número de 3 decimales desde la etiqueta "Alicuotas:".
  const aliqIdx = idx(/Alicuotas:/i);
  let aliquot: number | null = null;
  for (let i = aliqIdx; i >= 0 && i < Math.min(aliqIdx + 5, lines.length); i++) {
    const m = lines[i].match(ALIQUOT_RE);
    if (m) {
      aliquot = Number(m[0].replace(',', '.'));
      break;
    }
  }

  // Tasa de cambio: en la clásica, al final de la línea "Periodo Facturado: <MES> <tasa>";
  // en agosto, tras "Elab. recibo BCV".
  let exchangeRate: number | null = null;
  const periodoIdx = idx(/Periodo Facturado:/i);
  if (periodoIdx >= 0) {
    const t = moneyTokens(lines[periodoIdx]);
    if (t.length) exchangeRate = t[0];
  }
  if (exchangeRate === null) {
    const bcvIdx = idx(/Elab\.\s*recibo BCV/i);
    if (bcvIdx >= 0) {
      const t = moneyTokens(lines[bcvIdx]);
      if (t.length) exchangeRate = t[0];
    }
  }

  // Fecha de envío → issuedOn (se valida contra el mes de la carpeta; si no calza, se intercambia).
  const fechaIdx = idx(/Fecha de env/i);
  let issuedOn: string | null = null;
  if (fechaIdx >= 0) {
    const m = lines[fechaIdx].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      let [, d, mo, y] = m.map(Number) as unknown as [never, number, number, number];
      if (mo !== ctx.month && d === ctx.month) [d, mo] = [mo, d];
      issuedOn = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Líneas: de la fila de encabezado ("Monto en $"/"Gasto Total ($)") a "Sub-total" (exclusive).
  const headerIdx = idx(/Monto en \$|Gasto Total/i);
  const subtotalIdx = idx(/^Sub-total\b/i);
  if (headerIdx < 0 || subtotalIdx < 0 || subtotalIdx <= headerIdx) throw new Error(`no se ubicó la tabla de conceptos (${ctx.source})`);
  const rawLines = lines.slice(headerIdx + 1, subtotalIdx);
  const itemLines: PlantillaReceipt['lines'] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '-' || trimmed === '$') continue;
    const tokens = moneyTokens(trimmed);
    let concept = trimmed;
    for (const m of [...trimmed.matchAll(MONEY_RE)]) concept = concept.replace(m[0], '');
    concept = concept.replace(/\$/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!concept) continue;
    let buildingAmount: number | null = null;
    let unitAmount = 0;
    if (tokens.length >= 2) [buildingAmount, unitAmount] = [tokens[tokens.length - 2], tokens[tokens.length - 1]];
    else if (tokens.length === 1) unitAmount = tokens[0];
    // Error confirmado de la plantilla de agosto: en TODAS las casas, la cuota de esta línea
    // sale igual a la del primer concepto de la tabla en vez de "monto × alícuota". Se recalcula.
    if (concept === 'Gasto de Administración' && buildingAmount !== null && aliquot !== null) {
      unitAmount = Math.round(buildingAmount * (aliquot / 100) * 100) / 100;
    }
    itemLines.push({ concept, kind: kindOf(concept), buildingAmount, unitAmount });
  }
  // El fondo de reserva a veces cae DESPUÉS del "Sub-total" (plantilla clásica): si no quedó
  // incluido arriba, se agrega aparte.
  let reserveFundPercent: number | null = null;
  const reserveIdx = idx(/FONDO DE RESERVA DEL MES/i);
  if (reserveIdx >= 0) {
    const pm = lines[reserveIdx].match(/(\d+)\s*%/);
    if (pm) reserveFundPercent = Number(pm[1]);
    if (reserveIdx > subtotalIdx) {
      const t: number[] = [];
      for (let i = reserveIdx; i < Math.min(reserveIdx + 3, lines.length) && t.length < 2; i++) t.push(...moneyTokens(lines[i]));
      const [buildingAmount = null, unitAmount = 0] = t.length >= 2 ? [t[0], t[1]] : [null, t[0] ?? 0];
      itemLines.push({ concept: 'Fondo de Reserva del Mes', kind: 'reserve', buildingAmount, unitAmount });
    }
  }

  // Totales del recibo: se toman de sus propias etiquetas (no de sumas), tal como se imprimen.
  // El formato no siempre trae los 2 decimales (a veces 1, a veces ninguno, a veces un "-" por
  // cero), así que se prueba de más a menos estricto.
  const lastMoneyOnLine = (line: string): number | null => {
    const strict = moneyTokens(line);
    if (strict.length) return strict[strict.length - 1];
    const oneDecimal = line.match(/(-?\d+[.,]\d)(?!\d)\s*$/);
    if (oneDecimal) return Number(oneDecimal[1].replace(',', '.'));
    if (/(?:^|\s)-(?:\s|$)/.test(line)) return 0;
    const bare = line.match(/(-?\d+)\s*$/);
    if (bare) return Number(bare[1]);
    return null;
  };
  const scan = (re: RegExp, span = 3) => {
    const i = idx(re);
    if (i < 0) return null;
    for (let j = i; j < Math.min(i + span, lines.length); j++) {
      const v = lastMoneyOnLine(lines[j]);
      if (v !== null) return v;
    }
    return null;
  };
  const monthTotal = scan(/^CUOTA MES/i);
  const previousDebt = scan(/DEUDA EN DOL/i);
  const printedTotalDue = scan(/TOTAL A PAGAR EN \$/i);
  if (monthTotal === null || previousDebt === null || printedTotalDue === null) throw new Error(`faltan totales (${ctx.source})`);
  // "Total a pagar" se recalcula (mes + deuda anterior): en un par de recibos el impreso no
  // descuenta un saldo a favor de centavos, y ese es justamente el invariante que exige el sistema.
  const totalDue = Math.round((monthTotal + previousDebt) * 100) / 100;
  if (Math.abs(totalDue - printedTotalDue) > 0.5) console.warn(`aviso: ${ctx.source}: "Total a pagar" impreso ${printedTotalDue} ≠ mes+deuda ${totalDue} (se usó mes+deuda)`);

  // Los recibos de origen a veces no cuadran (redondeos del mes, algún renglón sin actualizar).
  // Para no perder el total impreso (lo que de verdad se cobró), la diferencia chica se deja
  // como un renglón aparte; si es grande, se avisa en vez de taparla.
  const linesSum = Math.round(itemLines.reduce((s, l) => s + l.unitAmount, 0) * 100) / 100;
  const diff = Math.round((monthTotal - linesSum) * 100) / 100;
  if (Math.abs(diff) > 0.011) {
    if (Math.abs(diff) <= 1) itemLines.push({ concept: 'Ajuste según el recibo original', kind: 'ordinary', buildingAmount: null, unitAmount: diff });
    else console.warn(`aviso: ${ctx.source}: las líneas suman ${linesSum} y "CUOTA MES" dice ${monthTotal} (diferencia ${diff}, revisar)`);
  }

  return {
    house,
    month: ctx.month,
    year: ctx.year,
    issuedOn,
    aliquot,
    ownerName,
    lines: itemLines,
    monthTotal,
    previousDebt,
    totalDue,
    reserveFundPercent,
    exchangeRate,
    exchangeRateDate: issuedOn,
    source: ctx.source,
  };
}

// ─── Balance general de enero: solo el saldo inicial en caja (lo único que pide la carga) ─────
function parseOpeningCash(): { amount: number; date: string; source: string } {
  const dir = join(ROOT, 'ENERO 2026', 'BALANCE GENERAL');
  const file = readdirSync(dir)[0];
  const text = pdftotext(join(dir, file));
  const line = text.split(/\r?\n/).find((l) => /Saldo Inicial/i.test(l));
  if (!line) throw new Error('balance de enero: no se encontró "Saldo Inicial"');
  const dateM = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+Saldo Inicial/);
  const t = moneyTokens(line);
  if (!dateM || !t.length) throw new Error('balance de enero: no se pudo leer el saldo inicial');
  const [, d, m, y] = dateM;
  return { amount: t[t.length - 1], date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, source: `CONDOMINIO MZ3A/ENERO 2026/BALANCE GENERAL/${file}#saldo-inicial` };
}

// ─── Pagos reales del balance general: cada mes es un libro de movimientos bancarios con fecha,
// y casi todos los depósitos de un propietario traen su número de casa (a veces sin encabezado
// propio, pero siempre como el número suelto justo antes del primer monto en Bs. de la fila). Se
// usa esto en vez de deducir los pagos de la diferencia entre recibos: así agosto (el último mes
// cargado) también queda con lo que de verdad se cobró, no con "0" por falta de un recibo futuro.
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();

/** Agrupa las líneas del PDF en movimientos: cada uno empieza en una fecha "d/m/aaaa". */
// Fila completa sin su propia fecha (a julio le falta la última: "32 24.638,79 113.133,33
// 746,63 33,00 - -"): casa + al menos 2 montos en Bs. seguidos. Sin este corte, se pega a la
// fila anterior y arruina la lectura de ambas (dos tasas BCV, dos saldos, todo mezclado).
const ORPHAN_ROW = /^\d{1,3}\s+-?[\d.,]+\s+-?[\d.,]+\s/;

function ledgerEntries(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const entries: string[] = [];
  let current: string[] | null = null;
  let currentDate = '';
  for (const line of lines) {
    if (!line) continue;
    if (/^Total\b/i.test(line) || /^Validaci[oó]n de Moneda/i.test(line)) break;
    const dateM = line.match(/^\d{1,2}\/\d{1,2}\/\d{4}\b/);
    if (dateM) {
      if (current) entries.push(current.join(' '));
      current = [line];
      currentDate = dateM[0];
    } else if (current && ORPHAN_ROW.test(line)) {
      entries.push(current.join(' '));
      current = [`${currentDate} ${line}`];
    } else if (current) current.push(line);
  }
  if (current) entries.push(current.join(' '));
  return entries;
}

// El banco a veces no es la misma persona que el propietario registrado (paga desde la cuenta de
// un familiar); se identificaron a mano cruzando el Nº de cuenta bancaria (repite mes a mes).
const ACCOUNT_TO_HOUSE: Record<string, string> = {
  V015721851: '4', // SARDUA CAZORLA — misma cuenta paga la casa 4 en otros meses
  V014743883: '29', // LO PRESTI JOSEPH — casa 29
  V007682602: '25', // PEDRAZA CANAS PAB — casa 25
};

/**
 * El monto de cada movimiento se calcula como la DIFERENCIA del saldo en Bs. (columna que siempre
 * sale bien formateada, a diferencia de "Monto en $" — que a veces trae 0 o 1 decimal y hace que
 * se "salte" al número equivocado) entre esta fila y la anterior, convertida con la tasa BCV de
 * la propia fila. Es continuo entre los 8 archivos porque el de junio no trae su propio "Saldo
 * Anterior": se sigue arrastrando el saldo en Bs. de mayo.
 */
// Como MONEY_RE, pero también acepta 1 solo decimal: en el libro de bancos la tasa BCV a veces
// sale así (p. ej. "466,6"), y si no se reconoce ese token se pierde el ancla de toda la fila.
const LEDGER_MONEY_RE = /-?\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}\b|-?\d+[.,]\d{1,2}\b/g;

/**
 * Cada fila trae, en este orden, Débito (Bs), Crédito (Bs), Saldo (Bs), BCV, Débito (USD),
 * Crédito (USD), Saldo (USD) — pero (a) una casilla vacía a veces no deja ni rastro y a veces
 * sale como "-" o "0,00", y (b) en columnas USD el monto real no siempre cae bajo la etiqueta
 * "Débito" que uno esperaría (se comprobó visualmente contra el PDF de junio: un depósito, que
 * en Bs. es un Débito, aparece en Bs. bajo Débito pero en USD bajo Crédito). Por eso NO se
 * confía en la posición ni en la etiqueta: el saldo en USD es siempre el último número de la
 * fila, la tasa BCV es siempre el número entre 250 y 900, y el monto de la fila es el único
 * valor distinto de cero entre esos dos — sea cual sea la columna en la que haya caído.
 */
function parseAllLedgerPayments(
  months: { month: number; year: number; folder: string }[],
): {
  payments: PlantillaPayment[];
  unmatched: { source: string; text: string; amount: number }[];
  /**
   * Un resumen por CADA ARCHIVO (no por mes calendario: un balance a veces incluye movimientos
   * que caen en el mes siguiente). "cierreLibro" es el saldo (USD) de la última fila real del
   * archivo — coincide con lo que el propio balance dice en "Menos USD en Libro".
   */
  perFile: { month: number; depositado: number; sinIdentificar: number; egresos: number; cierreLibro: number | null }[];
} {
  const payments: PlantillaPayment[] = [];
  const unmatched: { source: string; text: string; amount: number }[] = [];
  const perFile: { month: number; depositado: number; sinIdentificar: number; egresos: number; cierreLibro: number | null }[] = [];

  for (const { folder, month } of months) {
    const dir = join(ROOT, folder, 'BALANCE GENERAL');
    const file = readdirSync(dir)[0];
    const source = `CONDOMINIO MZ3A/${folder}/BALANCE GENERAL/${file}`;
    const text = pdftotext(join(dir, file));
    const summary = { month, depositado: 0, sinIdentificar: 0, egresos: 0, cierreLibro: null as number | null };
    const entries = ledgerEntries(text);
    // Agosto repite un bloque completo de filas (mismo Nº de referencia, misma fecha y mismo
    // monto, dos veces): un tramo del PDF de origen salió duplicado. Sin este control, cada
    // depósito o gasto de ese tramo se cuenta dos veces.
    const seen = new Set<string>();

    entries.forEach((entry, entryIndex) => {
      const dateM = entry.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dateM || /Saldo (Anterior|Inicial)/i.test(entry)) return;
      const moneyMatches = [...entry.matchAll(LEDGER_MONEY_RE)];
      if (moneyMatches.length < 2) return;
      const values = moneyMatches.map((m) => toNumber(m[0]));
      const bcvIndex = values.findIndex((v) => v >= 250 && v <= 900);
      if (bcvIndex < 0 || bcvIndex >= values.length - 1) return; // sin tasa reconocible, o la tasa es el último número (no hay nada que leer)
      const afterBcv = values.slice(bcvIndex + 1);
      let amount: number;
      if (afterBcv.length === 1) {
        // Fila con una sola columna después de la tasa: falta el saldo o falta el monto (pasa
        // una vez por mes, en filas distintas). Si es la ÚLTIMA fila del archivo, es el monto
        // sin su saldo (a julio se lo cortaron: "33,00 - -"). Si no, es el saldo sin su monto
        // (a mayo: "233.914,94 515,18 - - 454,05"): el monto se saca por diferencia con el
        // saldo anterior, que sí se conoce.
        if (entryIndex === entries.length - 1 || summary.cierreLibro === null) {
          amount = afterBcv[0];
        } else {
          amount = Math.round((afterBcv[0] - summary.cierreLibro) * 100) / 100;
          summary.cierreLibro = afterBcv[0];
        }
      } else {
        const saldoUsd = afterBcv[afterBcv.length - 1];
        const between = afterBcv.slice(0, afterBcv.length - 1); // Débito(USD) y/o Crédito(USD), el que haya
        amount = between.find((v) => v !== 0) ?? 0;
        summary.cierreLibro = saldoUsd; // se sobreescribe con cada fila: al terminar, queda la última (el cierre real)
      }
      amount = Math.round(amount * 100) / 100;
      const [, d, m, y] = dateM;
      const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const reference = entry.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{4,})/)?.[1] ?? '';
      const dupeKey = `${date}|${reference}|${amount}`;
      if (seen.has(dupeKey)) return;
      seen.add(dupeKey);
      if (amount <= 0) {
        summary.egresos = Math.round((summary.egresos - amount) * 100) / 100;
        return;
      }

      // Casa: número suelto (1-2 dígitos, 1-38) entre la descripción y el primer monto de la fila.
      const before = entry.slice(0, moneyMatches[0].index).trim();
      const tokens = before.split(/\s+/);
      let house: string | null = null;
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (/^\d{1,2}$/.test(tokens[i]) && Number(tokens[i]) >= 1 && Number(tokens[i]) <= 38) {
          house = tokens[i];
          break;
        }
        if (/^\d{3,}$/.test(tokens[i])) break; // llegamos a un código bancario: no hay casa en esta fila
      }
      if (!house) {
        const acct = before.match(/\b(V\d{6,})\b/)?.[1];
        if (acct && ACCOUNT_TO_HOUSE[acct]) house = ACCOUNT_TO_HOUSE[acct];
      }
      const method = /pago m[oó]vil/i.test(entry) ? 'mobile' : /trf|transf/i.test(entry) ? 'transfer' : 'other';
      if (house) {
        payments.push({ house, date, amount, method, reference: reference || null, exchangeRate: values[bcvIndex], source: `${source}#${date}` });
        summary.depositado = Math.round((summary.depositado + amount) * 100) / 100;
      } else {
        unmatched.push({ source, text: before.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*/, '').slice(0, 60), amount });
        summary.sinIdentificar = Math.round((summary.sinIdentificar + amount) * 100) / 100;
      }
    });
    perFile.push(summary);
  }
  return { payments, unmatched, perFile };
}

// ─── "Relación de gastos" del mes: los mismos conceptos y montos del edificio que ya trae el
// recibo de la casa 1 (todas las casas comparten el mismo "Monto en $" de cada concepto) ───────
function balanceFrom(receipt: PlantillaReceipt): PlantillaBalance {
  const expenses = receipt.lines
    .filter((l) => l.kind !== 'reserve')
    .map((l) => ({
      concept: l.concept,
      amount: l.buildingAmount ?? Math.round((l.unitAmount / ((receipt.aliquot ?? 100) / 100)) * 100) / 100,
      kind: (l.kind === 'income' ? 'income' : l.kind === 'extraordinary' ? 'extraordinary' : 'ordinary') as 'ordinary' | 'extraordinary' | 'income',
      distribution: 'aliquot' as const,
    }));
  return {
    month: receipt.month,
    year: receipt.year,
    expenses,
    reserveFundPercent: receipt.reserveFundPercent ?? 10,
    dueDate: `${receipt.year}-${String(receipt.month).padStart(2, '0')}-01`,
    generalNote: null,
    source: `${receipt.source} (relación derivada del recibo de la casa 1)`,
  };
}

// ─── Programa principal ────────────────────────────────────────────────────────────────────────
function main() {
  const receipts: PlantillaReceipt[] = [];
  const balances: PlantillaBalance[] = [];
  const problems: string[] = [];

  for (const { month, year, folder } of MONTHS) {
    const dir = join(ROOT, folder, 'RECIBO');
    const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f));
    if (files.length !== 33) problems.push(`${folder}: ${files.length} recibos (se esperaban 33)`);
    let house1: PlantillaReceipt | null = null;
    for (const f of files) {
      const source = `CONDOMINIO MZ3A/${folder}/RECIBO/${f}`;
      const fileMatch = f.match(/(\d+)/);
      if (!fileMatch) {
        problems.push(`${source}: el nombre de archivo no trae un número de casa`);
        continue;
      }
      const houseFromFile = fileMatch[1];
      try {
        const text = pdftotext(join(dir, f));
        const r = parseReceipt(text, { month, year, source, houseFromFile });
        receipts.push(r);
        if (r.house === '1') house1 = r;
      } catch (e) {
        problems.push(`${source}: ${(e as Error).message}`);
      }
    }
    if (house1) balances.push(balanceFrom(house1));
    else problems.push(`${folder}: no se pudo derivar la relación de gastos (falta el recibo de la casa 1)`);
  }

  const openingCash = parseOpeningCash();

  // Dueño actual de cada casa: el de su recibo más reciente (2 casas cambiaron de dueño en mayo).
  const currentOwner = new Map<string, string>();
  for (const r of [...receipts].sort((a, b) => a.month - b.month)) if (r.ownerName) currentOwner.set(r.house, r.ownerName);
  const housesA = housesFrom(ALIQUOTS_A, 'CONDOMINIO/PORCENTAJE ALICUOTAS MZ3A Y MZ3B.pdf#anexo-1 (columna S/Sector 1A y 1B)').map((h) => ({
    ...h,
    ownerName: currentOwner.get(h.number) ?? null,
  }));

  // Pagos reales (con fecha) sacados de los 8 balances generales, en vez de deducidos de la
  // diferencia entre recibos: así agosto también queda con lo que de verdad se cobró.
  const { payments, unmatched, perFile } = parseAllLedgerPayments(MONTHS);
  if (unmatched.length) {
    const total = Math.round(unmatched.reduce((s, u) => s + u.amount, 0) * 100) / 100;
    console.warn(`aviso: ${unmatched.length} depósito(s) sin casa identificada (total $${total}):`);
    for (const u of unmatched) console.warn(`  - ${u.source}: "${u.text}" $${u.amount}`);
  }
  console.log(`Pagos reales del balance general: ${payments.length} (de ${payments.length + unmatched.length} depósitos detectados)`);

  // La caja del sistema (saldo inicial + pagos + ingresos − gastos) debe cerrar cada mes EXACTO
  // en lo que el propio balance general dice en "Menos USD en Libro" (no en la suma de cada
  // movimiento ya convertido a $ por separado: con la tasa moviéndose día a día dentro del mes,
  // esa suma no da lo mismo que convertir el cierre en bolívares una sola vez — es aritmética de
  // multi-moneda, no un error de lectura). Por eso la caja de cada mes se resuelve por diferencia
  // contra la meta impresa, en vez de sumar los egresos sueltos:
  //  1. Los depósitos que no se pudieron atar a una casa igual entraron al banco: se anotan como
  //     ingreso de la comunidad (no se le puede cobrar ese dinero a una casa en particular).
  //  2. El resto de la diferencia (gastos reales, redondeo, tasa) queda en un renglón de ajuste.
  let previousClosing = openingCash.amount;
  for (const [i, b] of balances.entries()) {
    const f = perFile[i];
    if (f.month !== b.month) throw new Error(`orden de meses desalineado: balance ${b.month} vs balance general ${f.month}`);
    // Mayo no trae "Menos USD en Libro" (el PDF de origen no tiene esa sección): se usa el propio
    // movimiento del mes como meta, para que quede la misma constancia que los demás meses y no
    // se pierda ese dinero al conciliar junio contra su meta real.
    const cierre = f.cierreLibro ?? Math.round((previousClosing + f.depositado + f.sinIdentificar - f.egresos) * 100) / 100;
    if (f.cierreLibro === null) console.warn(`aviso: ${MONTHS[i].folder}: no se encontró "Menos USD en Libro"; se usó el movimiento propio del mes como meta`);

    const currentExpense = Math.round(b.expenses.filter((e) => e.kind !== 'income').reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const currentIncome = Math.round(b.expenses.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0) * 100) / 100;

    if (f.sinIdentificar > 0.01) b.expenses.push({ concept: 'Depósitos bancarios sin casa identificada', amount: f.sinIdentificar, kind: 'income', distribution: 'aliquot' });

    const netNecesario = Math.round((cierre - previousClosing) * 100) / 100;
    const expenseNecesario = Math.round((f.depositado + f.sinIdentificar + currentIncome - netNecesario) * 100) / 100;
    const adjustment = Math.round((expenseNecesario - currentExpense) * 100) / 100;
    if (Math.abs(adjustment) > 0.01) {
      b.expenses.push({ concept: 'Ajuste de caja según el balance general (banco)', amount: adjustment, kind: 'ordinary', distribution: 'aliquot' });
    }
    // Cheque de honestidad: con lo que se acaba de guardar, la caja del sistema DEBE cerrar el
    // mes exactamente en "cierre" (si esto no cuadra, hay un error en la fórmula de arriba, no en
    // los datos — que no pase inadvertido).
    const gotIncome = Math.round(b.expenses.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const gotExpense = Math.round(b.expenses.filter((e) => e.kind !== 'income').reduce((s, e) => s + e.amount, 0) * 100) / 100;
    const reached = Math.round((previousClosing + f.depositado + gotIncome - gotExpense) * 100) / 100;
    if (Math.abs(reached - cierre) > 0.02) throw new Error(`${MONTHS[i].folder}: la caja calculada (${reached}) no cuadra con la meta (${cierre}) — revisar la fórmula de conciliación`);
    previousClosing = cierre;
  }

  const plantilla: Plantilla = {
    version: 1,
    batch: 'historico-mz3a-2026',
    cutoff: '2026-09-01',
    condominiums: [
      {
        slug: 'manzana-3-a',
        settings: {
          rif: 'J-405460016',
          address: 'AV. JUAN BAUTISTA ARISMENDI, MUNICIPIO GARCIA, ISLA MARGARITA, NVA. ESPARTA.',
          paymentInstructions:
            'BANESCO — Condominio Las Marites P1-3A, RIF J-405460016, Cuenta Corriente 0134-0018-16-0181080727. Pago Móvil: RIF J-405460016, Tlf 0426-8898977, Banesco (0134).',
          dueDay: 1,
          defaultReserveFundPercent: 10,
        },
        houses: housesA,
        openingCash,
        balances,
        receipts,
        payments,
      },
      {
        slug: 'manzana-3-b',
        houses: housesFrom(ALIQUOTS_B, 'CONDOMINIO/PORCENTAJE ALICUOTAS MZ3A Y MZ3B.pdf#anexo-1 (columna S/Sector 1A y 1B)'),
      },
    ],
  };

  mkdirSync(resolve('.local-data/import'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(plantilla, null, 1));
  console.log(`Recibos parseados: ${receipts.length}/264 · Relaciones de gastos: ${balances.length}/8`);
  console.log(`Saldo inicial (caja, ${openingCash.date}): $${openingCash.amount}`);
  if (problems.length) {
    console.error(`\nProblemas (${problems.length}):\n - ${problems.join('\n - ')}`);
    process.exitCode = 1;
  }
  console.log(`\nEscrito: ${OUT}`);
}

main();

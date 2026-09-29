// Pruebas del importador con datos inventados:  npm run import:test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocalSeed } from '@/services/local/localSeed';
import { buildImport, paymentsFromChain } from './build';
import { validatePlantilla, type Plantilla, type PlantillaReceipt } from './plantilla';

const receipt = (house: string, month: number, previousDebt: number, monthTotal = 30, extra: Partial<PlantillaReceipt> = {}): PlantillaReceipt => ({
  house,
  month,
  year: 2026,
  lines: [
    { concept: month === 2 ? 'Vigilancia (aumento febrero)' : 'Vigilancia', kind: 'ordinary', buildingAmount: 600, unitAmount: monthTotal - 5 },
    { concept: 'Fondo de reserva', kind: 'reserve', buildingAmount: null, unitAmount: 5 },
  ],
  monthTotal,
  previousDebt,
  totalDue: previousDebt + monthTotal,
  source: `Manzana 3-A/${month}/recibos/casa-${house}.pdf#p1`,
  ...extra,
});

const plantilla = (): Plantilla => ({
  version: 1,
  batch: 'prueba-2026',
  cutoff: '2026-03-31',
  condominiums: [
    {
      slug: 'manzana-3-a',
      houses: [{ number: '1', aliquot: 3.1234, ownerName: 'Ana Pérez' }],
      receipts: [
        // Casa 1: debía 50 de antes, abona poco a poco.
        receipt('1', 1, 50), receipt('1', 2, 60), receipt('1', 3, 0),
        // Casa 2: paga todo cada mes.
        receipt('2', 1, 0), receipt('2', 2, 0), receipt('2', 3, 0),
        // Casa 3: debía 100 (14 meses) y nunca paga.
        receipt('3', 1, 100), receipt('3', 2, 130), receipt('3', 3, 160),
      ],
      debtsAtCutoff: [
        { house: '1', amount: 30, months: 1, source: 'deudas.xlsx#fila2' },
        { house: '2', amount: 0, months: 0, source: 'deudas.xlsx#fila3' },
        { house: '3', amount: 190, months: 17, source: 'deudas.xlsx#fila4' },
      ],
      balances: [{ month: 1, year: 2026, expenses: [{ concept: 'Vigilancia', amount: 600, kind: 'ordinary' }], source: 'Manzana 3-A/01/balance.pdf' }],
    },
  ],
});

test('la plantilla de ejemplo es válida', () => {
  assert.deepEqual(validatePlantilla(plantilla()), []);
});

test('pagos deducidos de la cadena de recibos', () => {
  const { payments, anomalies } = paymentsFromChain([receipt('1', 1, 50), receipt('1', 2, 60), receipt('1', 3, 0)], 30);
  assert.deepEqual(payments.map((p) => [p.month, p.amount]), [[1, 20], [2, 90]]);
  assert.deepEqual(anomalies, []);
});

test('importa, guarda los conceptos exactos y cuadra con el archivo de deudas', () => {
  const db = buildLocalSeed();
  const plan = buildImport(plantilla(), db);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.invoices.length, 9);
  assert.equal(plan.billingSheets.length, 1);

  // Conceptos distintos por mes: se guardan tal cual.
  const feb = plan.invoices.find((i) => i.month === 2 && i.issued_house_number === '1')!;
  assert.equal((feb.detail as { lines: { concept: string }[] }).lines[0].concept, 'Vigilancia (aumento febrero)');
  assert.equal(feb.issued_owner_name, 'Ana Pérez');
  assert.equal(feb.import_batch, 'prueba-2026');

  const byHouse = Object.fromEntries(plan.houses.filter((h) => ['1', '2', '3'].includes(h.casa)).map((h) => [h.casa, h]));
  assert.equal(byHouse['1'].ok, true, byHouse['1'].notas.join(' | '));
  assert.equal(byHouse['1'].deudaCalculada, 30);
  assert.equal(byHouse['2'].deudaCalculada, 0);
  assert.equal(byHouse['3'].ok, true, byHouse['3'].notas.join(' | '));
  assert.equal(byHouse['3'].mesesCalculados, 17);

  // La deuda de años anteriores de la casa 3 queda con sus 14 meses.
  const house3 = db.houses.find((h) => h.number === '3' && h.condominium_id === db.condominiums.find((c) => c.slug === 'manzana-3-a')!.id)!;
  const opening = plan.debts.find((d) => d.house_id === house3.id)!;
  assert.equal(Number(opening.amount), 100);
  assert.equal(opening.months, 14);
  assert.equal(opening.origin_date, '2025-12-31');
});

test('detecta recibos que no suman y casas inexistentes', () => {
  const p = plantilla();
  p.condominiums[0].receipts!.push({ ...receipt('99', 1, 0) }, { ...receipt('4', 1, 0), monthTotal: 31, totalDue: 31 });
  const plan = buildImport(p, buildLocalSeed());
  assert.ok(plan.errors.some((e) => e.includes('"99" no existe')));
  assert.ok(plan.errors.some((e) => e.includes('las líneas suman 30')));
});

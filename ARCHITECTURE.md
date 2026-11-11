# ARCHITECTURE.md — Referencia técnica profunda del sistema

> Este documento es para la próxima IA (o persona) que trabaje en este repo. El `README.md`
> es la intro corta de cara al usuario/humano; **este archivo es el mapa completo del
> sistema**: cómo está armado, por qué se tomó cada decisión, qué partes son frágiles y qué
> trampas ya se encontraron. Está pensado para que puedas avanzar en cualquier tarea sin
> tener que releer todo el código desde cero. Donde haga falta, remite al archivo real en vez
> de confiar ciegamente en el resumen (el código es la fuente de verdad; esto es un mapa).

## 0. Qué es esta app

Sistema de gestión y facturación de condominios en **Isla de Margarita, Venezuela** ("Portal
MAGO Condominios"). Multi-condominio: una sola administradora gestiona varios condominios
("manzanas"), y cada casa tiene un residente que entra a ver su propio recibo y estado de
cuenta. Las cuotas se fijan en **USD** y siempre se muestra su equivalente en **bolívares**
a la tasa oficial del BCV. Sistema cerrado, sin registro público: login único con
**usuario + PIN de 4 dígitos** (tabla `users`), rol `admin` o `resident`.

Hoy existen 2 condominios reales en la base de Supabase:
- **Manzana 3-A** — `id e531e016-2e93-489f-83c8-7ce0228cf80b`, `slug manzana-3-a`, 33 casas.
- **Manzana 3-B** — `id 69251abc-10ac-41f1-bb3c-df14292e205a`, `slug manzana-3-b`, 38 casas.

## 1. Stack y los dos "modos de datos"

- **Astro 7** (SSR, pensado para desplegar en Vercel) + **React 19** solo en las islas
  interactivas del panel admin (`client:load`/`client:idle`). Tailwind 4.
- **Supabase** (Postgres) como base de datos en producción. `@supabase/supabase-js`.
- `pdf-lib` para generar los PDF de los recibos **al momento** (no se guarda ningún
  archivo en ningún sitio: ni Google Drive ni Supabase Storage). Cada vez que alguien pide
  un PDF, se vuelve a dibujar desde los datos congelados en `invoices.detail`.
- `tsx` para correr scripts sueltos (import histórico, scripts de datos, scripts puntuales).

### Dos proveedores de datos, un único composition root

El sistema puede correr contra **datos locales en disco** (`DATA_PROVIDER=local`, un único
archivo JSON `.local-data/db.json` gestionado por `LocalJsonStore`) o contra **Supabase**
(`DATA_PROVIDER=supabase`). Esto existe para poder desarrollar y probar sin tocar la base
real, y para poder armar/depurar la importación histórica en local antes de subirla.

El **único** archivo que sabe cuál proveedor está activo es `src/services/container.ts`
(el *composition root*). Elige entre `LocalXxxRepository` y `SupabaseXxxRepository` según
`config.dataProvider`, y expone funciones `get*Service()` que todo el resto del código usa
sin saber qué hay detrás. **Ningún endpoint, página ni componente debe instanciar un
repositorio directamente**: todos pasan por `container.ts`.

`container.ts` importa `src/services/config.ts`, que a su vez importa `astro:env/server`.
Esto es **solo válido dentro del runtime de Astro** — ver la sección 12 para el patrón
exacto para correr scripts sueltos sin pasar por aquí.

## 2. Estructura de directorios

La fuente de verdad de las reglas de arquitectura es
**`.claude/rules/01-architecture-guidelines.md`** — léelo siempre antes de reestructurar
algo; acá va un resumen:

- `src/components/ui/` — componentes de diseño puro (botones, inputs, badges). Sin lógica
  de negocio, sin saber de dónde vienen los datos.
- `src/components/domain/` — componentes de negocio (`InvoiceTable`, `AccountStatement`,
  `ExpenseTable`…). Ensamblan `ui/` y reciben datos por props. Mezcla de `.astro` (vista
  servidor, sin interactividad) y `.tsx` (islas React con `client:load`).
- `src/layouts/` — `BaseLayout`, `AuthLayout`, `ResidentLayout`: estructura de página.
- `src/pages/` — rutas de Astro, lo más delgadas posible: cargan datos vía servicios y
  delegan la vista a `components/domain`. `src/pages/api/` son los controladores HTTP
  (reciben `FormData` o JSON, llaman a un servicio, devuelven redirect o JSON).
- `src/hooks/` — hooks de React para el estado de las islas del panel admin
  (`useBillingSheet`, `useInvoiceGeneration`, `useUnits`, `useCurrencyConverter`).
- `src/services/` — toda la lógica de negocio y de acceso a datos:
  - `contracts.ts` — interfaces (Dependency Inversion): la lógica de negocio depende de
    estas interfaces, nunca de Supabase/disco/pdf-lib directamente.
  - `container.ts` — composition root (ver §1).
  - `config.ts` — lectura centralizada de variables de entorno (`astro:env/server`).
  - `repositories/` — implementación de los contratos, `Local*Repository` y
    `Supabase*Repository` en paralelo (mismo contrato, dos backends).
  - `invoices/InvoiceService.ts`, `billing/BillingService.ts`,
    `accounts/AccountService.ts`, `metrics/MetricsService.ts`, `budget/BudgetService.ts`,
    `condominiums/CondominiumService.ts` — servicios de dominio (ver §4-§10).
  - `pdf/PdfInvoiceFacade.ts`, `pdf/CashFlowPdfFacade.ts`,
    `pdf/AccountStatementPdfFacade.ts` — Facades sobre `pdf-lib` (único lugar permitido
    para tocar esa librería).
  - `exchange/` — Facade sobre la API de tasa de cambio (DolarApi) + servicio de caché
    diaria (`ExchangeRateService`).
  - `auth/` — login, sesiones firmadas (cookies), hash de PIN.
  - `local/` — almacenamiento JSON en disco (`LocalJsonStore`), seed de datos demo,
    migraciones del esquema local.
  - `api/adminInvoicesApi.ts` — cliente `fetch` que usan las islas React del panel para
    hablar con `src/pages/api/admin/...` (las islas NUNCA llaman servicios de servidor
    directamente: pasan por un endpoint HTTP).
- `src/adapters/` — transformación de datos: fila de Supabase (snake_case) ⇄ dominio
  (camelCase), y dominio ⇄ DTO (lo que viaja al cliente/HTML). Un archivo por entidad
  (`condominiumAdapter.ts`, `houseAdapter.ts`, `invoiceAdapter.ts`, `invoiceDtoAdapter.ts`,
  `billingSheetAdapter.ts`, `billingSheetInputAdapter.ts`, `accountAdapter.ts`,
  `budgetAdapter.ts`, `userAdapter.ts`, `exchangeRateAdapter.ts`,
  `exchangeRateViewAdapter.ts`, `condominiumViewAdapter.ts`, `currencyRatesAdapter.ts`,
  `residentDashboardAdapter.ts`).
- `src/types/` —
  - `domain.ts` — modelos de dominio camelCase (lo único que ve la UI).
  - `database.ts` — forma exacta de las filas de Supabase (snake_case). "El modo local
    guarda exactamente estas mismas columnas" (ver comentario en el archivo): el store
    local también usa esta forma de fila, lo que simplifica mucho tener dos backends.
  - `billing.ts` — modelo de facturación (`BuildingExpense`, `BillingSheet`,
    `InvoiceLine`, `InvoiceBreakdown`).
  - `accounts.ts` — `Payment`, `HouseDebt`, métodos de pago, ocupación.
  - `budget.ts` — proyectos con presupuesto.
  - `dto.ts`, `unitInput.ts`, `external.ts` — formas que cruzan el límite
    servidor↔cliente o llaman a APIs externas.
- `src/utils/` — funciones puras, sin I/O: `billingCalculator.ts`, `ledger.ts`,
  `aliquotScheme.ts`, `months.ts`, `dates.ts`, `dueDate.ts`, `currency.ts`,
  `amountInput.ts`, `invoiceNaming.ts`, `invoiceStats.ts`, `validation.ts`, `http.ts`,
  `retry.ts`, `theme.ts`, `greeting.ts`, `expenseCatalog.ts`, `adminSections.ts`.
- `scripts/` — scripts de línea de comandos (`tsx`), fuera de `src/`: importación
  histórica (`scripts/import/`), migración de datos (`scripts/data/`), sincronización
  local↔Supabase (`scripts/supabase/push.ts` / `pull.ts`).
- `supabase/migrations/` — SQL versionado del esquema (ver §11).
- `.claude/rules/01-architecture-guidelines.md` — reglas de arquitectura obligatorias.

### Patrones obligatorios (resumen; el archivo de reglas manda)

- **Facade**: nada fuera de `services/pdf/*Facade.ts` y `services/exchange/*Facade.ts`
  puede importar `pdf-lib` ni llamar directo a una API externa.
- **Adapter**: nada en `components/` ni `pages/` debe ver una fila cruda de Supabase
  (snake_case). Todo pasa por `adapters/`.
- **Dependency Inversion**: los servicios de `services/*Service.ts` dependen de las
  interfaces de `contracts.ts`, nunca de `Supabase*Repository`/`Local*Repository`
  directamente (esas se inyectan desde `container.ts`).

## 3. Modelo de dominio

- **Condominium** (`condominiums`) — nombre, slug, ciudad + `CondominiumSettings`: RIF,
  dirección, administradora, forma de pago, `defaultReserveFundPercent`, `dueDay`,
  `openingBalance`/`openingBalanceDate` (saldo de caja inicial), `billPreviousMonth` (§9),
  y el esquema de alícuotas (`aliquot_scheme` jsonb, ver `AliquotScheme` en §3.1).
- **House** (`houses`) — una unidad/casa: número, alícuota, datos del propietario
  (nombre, cédula/RIF, email, teléfono), ocupación (`owner`/`tenant`/`vacant`) y datos del
  inquilino si aplica.
- **BuildingExpense** — un gasto del condominio de un mes: `kind` (`ordinary` /
  `extraordinary` / `income`), `category` (texto libre, **independiente de `kind`**, ver
  gotcha en §13), `distribution` (`aliquot` / `equal`), `overrides` por casa (`exempt` o
  `fixed`), y opcionalmente `projectId` si viene de un proyecto con presupuesto (§8).
- **BillingSheet** (`billing_sheets`, un registro por condominio+mes) — la "relación de
  gastos" del mes: lista de `BuildingExpense`, `UnitCharge` (cargos/abonos individuales),
  `reserveFundPercent`, `dueDate`, notas generales y por casa.
- **Invoice** (`invoices`, un registro por casa+mes) — un recibo: `status`
  (`pending`/`generated`/`paid`), `detail` (el `InvoiceBreakdown` completo, congelado),
  tasa de cambio del día de emisión, encabezado congelado (`issued_*`), y si viene de
  la importación histórica, `imported = true` (nunca se puede volver a emitir).
- **HouseDebt** (`house_debts`) — deuda registrada a mano: saldos previos al sistema,
  multas, reparaciones, honorarios de cobranza extrajudicial… Tiene `origin_date`
  (define antigüedad/orden de cobro) y opcionalmente `months` (a cuántos meses de
  condominio equivale).
- **Payment** (`payments`) — un pago o abono de una casa, en USD o Bs. (convertido a la
  tasa indicada), con método, referencia y nota.
- **BudgetProject** (`budget_projects`) — un proyecto con presupuesto (ver §8).

### 3.1 Alícuotas (`src/utils/aliquotScheme.ts`)

La alícuota (LPH art. 7, % de participación de cada casa) puede escribirse a mano por casa,
o calcularse con **tipos de alícuota** ("Casa pequeña", "Casa grande"…) definidos en
`AliquotScheme` (`mode: 'proportional' | 'percent'` + `categories: {id, name, value}[]`):
- `percent`: cada unidad de ese tipo toma el valor del tipo tal cual (como en el documento
  de condominio).
- `proportional`: los valores son pesos (ej. 6 y 8, o m²) que se escalan para que, junto
  con las unidades sin tipo (alícuota manual), todo sume exactamente 100 % — con el mismo
  algoritmo de resto mayor que usa `billingCalculator.ts` (ver §5), en diezmilésimas de %.
`resolveAliquots()` es pura y la usan tanto la vista previa en pantalla como
`CondominiumService.updateAliquots()` al guardar (el servidor SIEMPRE recalcula las
alícuotas de las unidades con tipo desde el esquema; nunca confía en lo que mande el
cliente para esas). `validateScheme()` valida nombres únicos, valores > 0, máx. 20 tipos.

## 4. El motor de cálculo de facturación — `src/utils/billingCalculator.ts`

Función pura central: `calculateCondominiumInvoices(sheet, units, debts)` →
`Map<houseId, InvoiceBreakdown>`. Sin base de datos, sin fecha del sistema. Pasos:

1. **Gastos ordinarios** (`kind === 'ordinary'`): cada uno se reparte entre las unidades
   (`shareExpense`) respetando `overrides` (exento = no paga, nada le toca a los demás
   salvo lo que sobra; monto fijo = paga ese monto, el resto se reparte entre las demás).
   Se acumulan en `commonSubtotal` por casa.
2. **Cuotas extraordinarias** (`kind === 'extraordinary'`): igual reparto, acumulan en
   `extraordinarySubtotal`. Incluye tanto cuotas puntuales como las cuotas mensuales de
   proyectos con presupuesto (que además llevan `projectId`).
3. **Fondo de reserva**: `% sheet.reserveFundPercent` sobre una base
   `reserveBase` = ordinarios + extraordinarios de la casa **EXCLUYENDO los gastos cuya
   `category` sea "Proyectos"** (comparación insensible a mayúsculas/espacios —
   `isProjectExpense`). Este fue un cambio deliberado reciente: los proyectos con
   presupuesto ya tienen su propia cuota aprobada en asamblea, así que no deben generar
   fondo de reserva adicional. El fondo se reparte en proporción a lo que cada casa aporta
   a esa base (`reserveShareOf`), con el mismo `allocateFair`.
4. **Ingresos de la comunidad** (`kind === 'income'`): se descuentan (signo negativo) con
   el mismo reparto, FUERA de la base del fondo.
5. **Cargos/abonos individuales** (`UnitCharge`, no comunes): se suman tal cual a la casa.
6. `monthTotal = max(0, commonSubtotal + reserveFund + incomeSubtotal + extraordinarySubtotal + unitChargesSubtotal)`
   (nunca negativo: si los abonos superan lo facturado, el recibo queda en $0, el resto
   queda como saldo a favor vía el ledger, no acá).
7. `previousDebt`/`previousDebtCount` vienen de fuera (el libro de cuentas, §6), no se
   calculan acá.
8. `totalDue = monthTotal + previousDebt`.

### `allocateFair` — reparto exacto con resto mayor

`allocateFair(amount, weights, carry)` reparte un monto en céntimos de forma que la suma
dé EXACTAMENTE el monto (sin perder céntimos por redondeo): cada unidad recibe el piso de
su parte exacta, y los céntimos sobrantes se asignan por prioridad a quien tiene mayor
"fracción descartada + `carry`" (el error de redondeo que esa unidad viene acumulando de
repartos anteriores del MISMO mes, pasado entre llamadas vía el array `carry`). Esto
garantiza que dos casas con la misma alícuota paguen lo mismo (±1 céntimo) aunque haya
muchos gastos distintos en el mes. Solo compiten por el céntimo extra las unidades con
peso > 0 (una exenta o de monto fijo nunca lo recibe). `allocate()` es la versión sin
arrastre, para un solo reparto aislado (la usa `BudgetService` para repartir la meta total
de un proyecto, y `aliquotScheme.ts` reimplementa la misma idea para %).

### `InvoiceLine.category` — dato interno, no visual

Cada `InvoiceLine` (ordinaria/extraordinaria) lleva `category` copiada del gasto que la
originó. **Esto es solo para cálculos internos** (saber qué excluir del fondo de reserva y
del "Sub-total" del PDF, ver §7) — **nunca se muestra como encabezado ni agrupador en el
PDF**. Hubo una iteración anterior donde se agrupaban las líneas del PDF por categoría con
encabezados de sección; se revirtió explícitamente a pedido del usuario ("ya no quiero que
se vean las categorías ahí, solo los conceptos"). Si alguna vez se reintroduce una UI que
agrupe por categoría, que sea una elección explícita y consciente, no un efecto colateral.

## 5. Libro de cuentas / ledger — `src/utils/ledger.ts` + `AccountService`

`applyPayments(charges, payments)` es el corazón de "quién debe qué": aplica los pagos de
una casa a sus cargos (recibos emitidos + deudas registradas) **del más antiguo al más
reciente** (política deliberada: la deuda vieja nunca queda "escondida" detrás de un pago
reciente), con un único cursor que avanza hacia adelante:

- Los cargos se ordenan por fecha; en empate, `'debt'` va antes que `'invoice'`
  (`chargeOrder`).
- Los pagos se ordenan por fecha; en empate, por el momento en que se registraron
  (`recordedAt`).
- Cada pago llena cargos en orden hasta agotarse; lo que sobra después de cubrir TODOS los
  cargos pendientes queda como **saldo a favor** (`credit`).

**Gotcha crítico**: `due = orderedCharges.map((c) => Math.max(0, cents(c.amount)))` —
**los montos negativos de un cargo se recortan a 0**. Esto significa que una fila de
`house_debts` con `amount` negativo **NO funciona como crédito**: no hace nada (se
descubrió y confirmó leyendo el código antes de intentar usarlo así). Además,
`AccountService.addDebt()` y `AccountService.registerPayment()` **ambos rechazan montos
≤ 0** (`ValidationError`), así que ni siquiera se puede crear una deuda negativa desde la
app normal.

**La única forma que funciona de registrar un "saldo a favor" que predate los cargos reales
de una casa** es un **`payment` positivo, fechado ANTES** de esos cargos (ej. `2025-12-31`
si los cargos reales empiezan en enero 2026): el cursor de más-antiguo-primero lo consume
naturalmente antes de llegar a esos cargos, dejando el resto como crédito hacia el primero.
Así se corrigieron manualmente 16 casas de Manzana 3-A que tenían un saldo a favor inicial
que la importación histórica no había capturado (ver §10).

`previousDebt(charges, states, isPrevious)` suma lo pendiente (`outstanding`) de los cargos
que cumplen el predicado `isPrevious` — lo usa `AccountService.previousDebts()` para
calcular la "deuda anterior" de cada recibo (recibos de meses previos + deudas registradas
con origen hasta ese mes).

`AccountService.buildAccount()` arma el `HouseAccount` de una casa: a cada `Invoice`
emitido le asigna como fecha de cargo en el ledger **`${year}-${month}-01`** (primer día de
su periodo), sin importar la fecha de vencimiento real; a cada `HouseDebt` le asigna su
`origin_date`. **Esto es importante para entender por qué el orden de aplicación de pagos
puede sorprender**: ver gotcha de `origin_date` histórico en §13.

`AccountService` también implementa `applyExtrajudicialFee()`: cobra un 20 % (
`EXTRAJUDICIAL_FEE_PERCENT`) de la deuda ACTUAL de la casa como un cargo nuevo solo para
ella (no se reparte entre las demás, no compone sobre honorarios ya pendientes — se
reconoce por el concepto fijo `EXTRAJUDICIAL_FEE_CONCEPT`).

`monthsOwed()` convierte deuda en "meses de condominio equivalentes": cada recibo
pendiente cuenta 1 mes completo (aunque tenga abono parcial); una deuda registrada cuenta
sus `months` en proporción a lo que falta pagar.

## 6. Ciclo de vida de un recibo — `InvoiceService` + `BillingService`

1. **Relación de gastos** (`BillingService.getSheet`/`saveSheet`): si no existe para el
   periodo, se propone en blanco (salvo cargos marcados "cada mes" y el % de reserva /
   vencimiento, heredados del mes anterior). Hay que guardarla (`origin: 'saved'`) antes
   de poder emitir — `breakdownFor()` lo exige explícitamente.
2. **Vista previa** (`BillingService.preview`): calcula el desglose actual de todas las
   unidades y lo compara contra el recibo YA EMITIDO (si existe) para marcar `outdated`.
   `outdated = true` si cambió `monthTotal`, o si `previousDebt`/`previousDebtCount`
   congelados ya no coinciden con el libro de cuentas actual (p. ej. se registró una deuda
   atrasada, o se anuló un pago, después de emitir el recibo).
3. **Emitir** (`InvoiceService.generate`): calcula el desglose, arma el encabezado
   (`headerOf`, congela nombre del condominio, RIF, dirección, administradora, forma de
   pago, datos de la casa en ESE momento) y guarda. **Fix de auto-referencia**: la "deuda
   anterior" sale del libro de cuentas, que incluye el monto de ESTE MISMO recibo si ya
   existía con otro monto (reemisión) — guardar puede cambiar ese monto, lo que invalida
   la deuda anterior recién calculada. Por eso `generate()` hace un **guardado en dos
   pasadas**: guarda, vuelve a calcular `previousDebt`/`previousDebtCount` con el libro YA
   actualizado, y si cambió, guarda de nuevo con eso. Converge garantizado en la segunda
   vuelta porque `monthTotal` depende solo de la relación de gastos (no de la deuda
   anterior), así que es estable desde la primera pasada.
4. **Reemitir**: cualquier recibo no importado se puede volver a emitir en cualquier
   momento (pagado o no, con deuda o sin ella) — el botón por fila y la acción masiva
   "Volver a generar los N recibos ya emitidos" (`BulkActions`/`useInvoiceGeneration`) usan
   el mismo `generate()`. Un recibo con `imported = true` **nunca** se puede reemitir
   (`ConflictError`).
5. **PDF** (`InvoicePdfRenderer` / `PdfInvoiceFacade`, §7): se dibuja al momento a partir de
   `invoice.detail` + `invoice.issued` (el encabezado congelado) + la tasa congelada. Nunca
   se guarda un archivo.

## 7. El PDF — `src/services/pdf/PdfInvoiceFacade.ts`

Facade sobre `pdf-lib` (el único lugar permitido para usarlo junto con
`CashFlowPdfFacade.ts` y `AccountStatementPdfFacade.ts`, que comparten utilidades de bajo
nivel en `services/pdf/pdfWriter.ts`). Estructura del documento, de arriba abajo:

1. Encabezado: nombre del condominio, RIF/dirección/administradora, "RECIBO DE
   CONDOMINIO", periodo facturado, fecha de envío, tasa BCV del día (si hay), vencimiento.
2. Franja INMOBILIARIO / PROPIETARIO / C.I. / ALÍCUOTAS + estado ("Solvente" o "Con deuda:
   N recibos pendientes").
3. Tabla de conceptos: **cada línea se dibuja siempre plana, con su monto** (sin
   encabezados de sección ni agrupamiento por categoría — ver §4 sobre por qué). El fondo
   de reserva se dibuja aparte, después del resto.
4. **Sub-total**: suma de columnas "Monto en $" / "Alícuotas $" de TODAS las líneas
   **excepto** las de categoría "Proyectos" (`isProjectCategory`) — es solo presentación,
   la casa paga igual.
5. Línea(s) del fondo de reserva.
6. **TOTAL DE GASTOS COMUNES DEL MES** (fila resaltada): a diferencia del Sub-total, **sí**
   incluye todo (comunes + extraordinarias + proyectos + fondo de reserva) —
   `buildingGrandTotal + reserveBuilding` en la columna del condominio, `detail.monthTotal`
   en la columna de la casa. Este es el total real de lo que se reparte ese mes.
7. "ESTADO DE CUENTA": deuda anterior (con cuántos recibos pendientes), cuota del mes,
   y "TOTAL A PAGAR EN $" (+ su equivalente en Bs. si hay tasa) resaltado.
8. Notas (de la casa y general del mes), forma de pago, pie legal (art. 14 LPH).

**Todo lo que imprime queda congelado al emitir** (`InvoiceService.renderIssued`): el
desglose completo, la tasa del día y por tanto los Bs., la fecha, el encabezado. Editar
después esos datos (ajustes del condominio, datos del propietario) no cambia un recibo ya
emitido; hay que reemitirlo para que se refleje.

`InvoiceLineKind` incluye un valor legado `'interest'` que **ya no se genera** (la función
de interés de mora se eliminó por completo del cálculo/config/UI en vivo) pero **se
mantiene a propósito** para que recibos históricos o importados que ya tienen líneas de
interés se sigan mostrando tal cual se emitieron. No es código muerto a limpiar.

## 8. Proyectos con presupuesto — `src/services/budget/BudgetService.ts`

Un `BudgetProject` (ej. "Pintura de fachada: $250") se factura como una cuota
extraordinaria más, repartida por alícuota, en uno (`billingMode: 'single'`) o varios
meses en partes iguales (`'spread'`, con el residuo de centavos en el último mes —
`scheduleFor()`). Al crearlo, `addScheduledExpense()` agrega a la relación de gastos de
cada mes programado un `BuildingExpense` con `{ concept: project.name, category:
'Proyectos', kind: 'extraordinary', distribution: 'aliquot', projectId: project.id }`
— **siempre con ambos campos a la vez** (esto es importante: la categoría "Proyectos"
generada automáticamente SIEMPRE viene con `kind: 'extraordinary'` correcto; el problema de
gastos con categoría "Proyectos" pero `kind: 'ordinary'` solo aparece en gastos cargados
o editados a mano, ver §13).

`BudgetService.progress()` calcula, por casa, cuánto se le ha facturado (`billed`, sumando
`line.unitAmount` de las líneas con ese `projectId` en los recibos ya emitidos de los meses
programados hasta el corte) y cuánto se ha "recaudado" según `collectionMode`:
- `proportional` (por defecto): se cuenta la misma proporción del recibo completo que se
  pagó (si el recibo del mes está 80 % pagado, se cuenta 80 % de la cuota del proyecto).
- `all_or_nothing`: la cuota del proyecto solo cuenta recaudada cuando el recibo de ESE mes
  queda 100 % pagado.
Se puede cambiar el modo en cualquier momento (`setCollectionMode`) para TODAS las casas
del proyecto. Borrar un proyecty (`deleteProject`) NO toca los gastos ya facturados: siguen
en sus meses como una cuota extraordinaria normal, solo se deja de llevar seguimiento.

## 9. "Facturar el mes ya vencido" — `billPreviousMonth` (feature reciente)

Algunos condominios cargan los gastos recién terminado el mes (es decir, en noviembre
anotan y facturan octubre, el mes YA CONCLUIDO), en vez de facturar el mes en curso. Por
defecto el sistema sugiere el mes calendario actual como "el mes a trabajar"; este flag
cambia eso **por condominio**:

- `CondominiumSettings.billPreviousMonth: boolean` ↔ columna `condominiums
  .bill_previous_month` (default `false`). Se edita en "Ajustes" →
  `CondominiumSettingsForm.astro` ("Facturar el mes ya vencido").
- `src/utils/months.ts`: `shiftPeriod(period, delta)` suma/resta meses cruzando de año;
  `periodFromQuery(params, now, lagMonths)` acepta un tercer parámetro `lagMonths` — si no
  hay `?mes=&anio=` en la URL, el periodo por defecto es `currentPeriod()` desplazado
  `-lagMonths` meses.
- Se usa en `src/pages/admin/[slug]/gastos.astro`, `facturas.astro` (pasando
  `full.settings.billPreviousMonth ? 1 : 0` como `lagMonths`) y en
  `src/pages/admin/[slug]/index.astro` (el `now` que define la tarea "Anotar los gastos de
  ..." del Inicio y los años del selector del Resumen).
- **Solo Manzana 3-B lo tiene activado hoy.** Manzana 3-A sigue facturando el mes en curso.
  Se puede verificar con una consulta rápida: `select slug, bill_previous_month from
  condominiums`.
- Esto NO afecta a `cobranza.astro` ni `proyectos.astro` (usan `currentPeriod()` sin lag:
  son filtros de "hoy" para historial/antigüedad, no "qué mes facturar").

**Corrección de datos puntual ligada a este feature**: al activar esto para Manzana 3-B, se
descubrió que su hoja de gastos y sus 38 facturas de "octubre 2026" en realidad contenían
los gastos REALES de **septiembre** (una línea literalmente decía "Comisión Bancaria
1-09-26 al 30-09-26"). Se renombraron manualmente con SQL directo: `billing_sheets.month`
10→9, `invoices.month` 10→9 en las 38 filas, `issued_receipt_number` recalculado
(`2026-10-0XX` → `2026-09-0XX`) y `detail->>'dueDate'` recalculado con `dueDateFor()`
(`2026-11-05` → `2026-10-05`, porque el vencimiento es "día X del mes siguiente al
periodo"). No había ninguna hoja/factura de septiembre 2026 previa para esa manzana, así
que no hubo choque. **Si se necesita repetir este tipo de rename para otro condominio**,
verificar primero que no exista ya una hoja/factura en el mes destino, y recalcular siempre
`issued_receipt_number` y `detail.dueDate` a mano (no son columnas derivadas, son texto
congelado al emitir).

## 10. Importación histórica — `scripts/import/`

Pipeline para cargar los meses previos a usar el sistema en vivo (parsea PDFs escaneados de
recibos/balances). Tres pasos (detallados en `README.md`): **extraer** (`extract.ts`, lee
PDFs con `pdftotext -layout` + Excel de alícuotas/deudas a JSON), **plantilla**
(`plantilla.ts`, arma un JSON estándar con cada recibo línea por línea), **importar**
(`run.ts` → `build.ts`, que concilia casa por casa y escribe `invoices`/`payments`/
`house_debts` marcados con `source`/`import_batch`, con `invoice.imported = true` —
congelado para siempre, nunca reemitible).

**Defecto sistémico conocido, NO corregido en el código** (`scripts/import/build.ts`): al
construir la deuda inicial de una casa, solo se crea una fila compensatoria "Deuda anterior
a [mes]" en `house_debts` cuando el `previousDebt` del primer periodo importado es
**positivo**. No hay un caso equivalente para un `previousDebt` **negativo** (un saldo a
favor que la casa ya traía antes de empezar a usar el sistema) — esto lo descarta en
silencio. Se encontró y corrigió **a mano** (no en el pipeline) para **16 casas de Manzana
3-A** (incluida la casa 16, con $18.07, y otras 15 con montos menores), registrando en cada
una un `payment` positivo fechado `2025-12-31` (antes de cualquier cargo real) por el monto
exacto del saldo a favor faltante — el mecanismo correcto descrito en §5. **No se ha
revisado ni corregido para Manzana 3-B ni para ningún condominio futuro**, y el bug de
`build.ts` en sí **sigue sin arreglarse**. Si aparece una casa con una deuda que no cuadra
justo después de una importación histórica, este es el primer sospechoso a revisar.

**Segundo defecto de datos conocido, dejado así a propósito** (decisión explícita del
usuario: "no tranquilo, dejalo asi como esta"): algunas filas de `house_debts` importadas
tienen `origin_date` igual a la fecha en que se CARGÓ el dato (fecha de captura), no la
fecha real del periodo original que representan. Como `AccountService.buildAccount()` usa
`origin_date` tal cual para ordenar los cargos en el ledger (§5), esto puede producir un
orden de aplicación de pagos ligeramente distinto al "correcto" en casos límite. No se
corrige porque el usuario decidió dejarlo así.

Reset total de lo importado (conserva casas/usuarios/PIN):
`npm run data:reset-history -- --apply`.

## 11. Autenticación y sesiones

Un único login (`UnifiedLoginForm.astro` → `POST /api/auth/login` → `LoginService.login`)
contra la tabla `users` (usuario + PIN de 4 dígitos, columna `pin_hash` con scrypt — ver
`src/services/auth/pinHasher.ts`, formato `scrypt$<salt>$<hash>`, equivalente local de
`crypt()`/bcrypt de pgcrypto; funciona igual en local y Supabase). Reglas:

- Residentes empiezan **sin PIN**: la primera vez que entran, `LoginService` detecta
  `pinHash` vacío y devuelve `needs_pin` → `pin.astro` les pide inventarlo (modo `crear`).
  "¿Olvidó su PIN?" (modo `olvido`) reemplaza el PIN escribiendo el usuario + 2 veces el
  PIN nuevo — **solo para residentes** (`role !== 'resident'` → `not_allowed`): la admin no
  puede auto-resetearse así, para que nadie tome el panel.
- 5 intentos fallidos seguidos → bloqueo de 15 min (`MAX_ATTEMPTS`, `LOCK_WINDOW_MS` en
  `LoginService.ts`), contador y bloqueo en `users.failed_attempts`/`locked_until`.
- Para no revelar si un usuario existe, un login con usuario inexistente igual corre
  `verifyPinHash` contra un hash "dummy" (mismo tiempo de respuesta) y devuelve el mismo
  `invalid` que un PIN incorrecto real.
- Sesión: cookie **firmada** (HMAC, `src/services/auth/signedCookie.ts`, clave
  `config.sessionSecret()` — obligatoria en producción, ≥32 caracteres) con el id + un par
  de campos públicos (usuario/nombre para admin; houseId/houseNumber/condominiumId para
  residente). `admin_session` dura 12h; `resident_session` dura 90 días (fricción mínima
  para que no tengan que reescribir el PIN cada mes). Entrar como uno destruye la sesión
  del otro rol (una sola sesión activa a la vez).
- `src/middleware.ts` protege las áreas: `/admin*` y `/api/admin/*` exigen `locals.admin`;
  `/dashboard` y `/api/invoices/*` exigen `locals.resident`; en `/`, si ya hay sesión,
  redirige directo a `/dashboard` o `/admin`. Toda respuesta con sesión activa se marca
  `Cache-Control: private, no-store` (datos personales, nunca en caché compartida).

## 12. Esquema real de Supabase (producción)

Tablas (`public.*`, todas con RLS activado): `condominiums`, `houses`, `invoices`,
`house_debts`, `payments`, `billing_sheets`, `exchange_rates`, `users`, `budget_projects`.

- **`condominiums`**: `id, name, slug, city, rif, address, administrator_name,
  administrator_rif, payment_instructions, default_reserve_fund_percent, due_day,
  late_interest_monthly_percent (★ huérfana, ver §13), aliquot_scheme (jsonb), opening_balance,
  opening_balance_date, created_at, updated_at, bill_previous_month`.
- **`houses`**: `id, condominium_id, number, owner_name, owner_document, owner_email,
  owner_phone, occupancy, occupant_name, occupant_phone, notes, aliquot,
  aliquot_category_id, created_at, updated_at`.
- **`invoices`**: `id, house_id, month, year, amount, exchange_rate,
  exchange_rate_date, exchange_rate_source, issued_condominium_name, issued_house_number,
  issued_owner_name, issued_owner_document, issued_receipt_number, issued_rif,
  issued_address, issued_administrator_name, issued_administrator_rif,
  issued_payment_instructions, status (enum invoice_status: pending/generated/paid),
  generated_at, paid_at, detail (jsonb = InvoiceBreakdown), created_at, updated_at,
  source, import_batch`. **No tiene columna `imported` directa**: el dominio deriva
  `imported` de si `source`/`import_batch` están presentes (ver `invoiceAdapter.ts`).
- **`house_debts`**: `id, house_id, concept, detail, origin_date, amount, created_at,
  months, source, import_batch`.
- **`payments`**: `id, house_id, paid_on, amount, method, reference, amount_ves,
  exchange_rate, note, created_at, source, import_batch`.
- **`billing_sheets`** (PK compuesta `condominium_id, year, month`): `condominium_id, year,
  month, reserve_fund_percent, due_date, general_note, unit_notes (jsonb), expenses
  (jsonb array de BuildingExpense), unit_charges (jsonb array), updated_at, source,
  import_batch`.
- **`exchange_rates`** (PK `day`): `day, usd_to_ves, source, published_at, fetched_at`.
- **`users`**: `id, username, pin_hash, role, display_name, house_id, failed_attempts,
  locked_until, created_at`.
- **`budget_projects`**: `id, condominium_id, name, target_amount, billing_mode,
  collection_mode, start_year, start_month, months_count, created_at`.

Migraciones versionadas en `supabase/migrations/` (`0001_init.sql`,
`0002_remove_file_storage.sql`, `0003_freeze_receipt_header.sql`…). La de
`bill_previous_month` se aplicó directo con `mcp__supabase__apply_migration` en esta
sesión (no quedó como archivo `.sql` versionado en el repo — si se formaliza el historial
de migraciones, falta agregarla ahí).

## 13. Cómo correr scripts puntuales contra la base real (sin pasar por `container.ts`)

`container.ts`/`config.ts` importan `astro:env/server`, que **no existe fuera del runtime
de Astro** — un script corrido con `npx tsx` falla con `Cannot find module
'astro:env/server'` si los importa, aunque sea transitivamente. Patrón usado repetidas
veces en esta sesión para diagnósticos o correcciones puntuales de datos:

```ts
// 1. Cargar variables de entorno a mano (no hay astro:env/server aquí).
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
else if (existsSync('.env')) process.loadEnvFile('.env');

// 2. Cliente de Supabase directo, SIN pasar por container.ts.
import { createClient } from '@supabase/supabase-js';
import { SupabaseHouseRepository } from '@/services/repositories/SupabaseHouseRepository';
import { SupabaseInvoiceRepository } from '@/services/repositories/SupabaseInvoiceRepository';
// ...importar solo las clases Repository/Service concretas que hagan falta.

async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const houses = new SupabaseHouseRepository(db);
  // ...lógica puntual...
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Reglas de higiene:
- El archivo debe vivir en la **raíz del proyecto** (ej. `./_nombre.ts`), NO en una carpeta
  de scratch externa — `tsx` resuelve `node_modules` (y el alias `@/`) desde ahí; desde
  fuera del proyecto falla con `Cannot find module '@supabase/supabase-js'`.
- Correrlo con `npx tsx ./_nombre.ts`.
- **Borrarlo inmediatamente después** (`rm -f ./_nombre.ts`) y confirmar con `git status
  --short` que el working tree queda limpio. Nunca se comitea un script de este tipo.
- Si la tarea es puramente de LECTURA (diagnóstico), preferir `mcp__supabase__execute_sql`
  directamente en vez de un script — es más simple y no deja nada que limpiar.
- Para cambios de **esquema** (DDL, `ALTER TABLE`), usar `mcp__supabase__apply_migration`.
  Puede estar bloqueado por el clasificador de "auto mode" del harness aunque el usuario ya
  haya confirmado por chat — en ese caso, pasarle al usuario el SQL exacto para que lo
  corra él mismo desde el SQL Editor de Supabase (ya pasó en esta sesión con la migración
  de `bill_previous_month`).

## 14. Comandos de desarrollo

```bash
npm install
npm run dev              # astro dev (servidor local)
npm run build            # astro build
npm run preview          # astro preview
npm run check            # astro check (type-check de .astro también)
npx tsc --noEmit         # type-check de TypeScript puro (más rápido para iterar en src/*.ts)

npm run data:reset-history -- --apply   # borra recibos/pagos/deudas/gastos (conserva casas/usuarios)
npm run import:extract -- "<carpeta>" "<alicuotas.xlsx>" "<deudas.xlsx>"
npm run import -- plantilla.json [--apply | --undo <lote>]
npm run import:test      # tsx --test scripts/import/build.test.ts

npm run supabase:push [-- --dry-run]    # sube .local-data/db.json a Supabase
npm run supabase:pull [-- --install]    # trae Supabase a .local-data/supabase-export.json
```

No hace falta `.env` para desarrollo local (usa `.local-data/db.json`, se crea solo). Para
Supabase: `DATA_PROVIDER=supabase` + `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` + `SESSION_SECRET` (obligatorio en prod, ≥32 chars).

Este proyecto **no tiene suite de tests automatizados de la app** (solo
`scripts/import/build.test.ts` para el pipeline de importación). Verificar un cambio es
`npx tsc --noEmit` + revisión manual de la lógica +, cuando hace falta certeza sobre datos
reales, un script puntual de solo-lectura contra Supabase (§13) o `mcp__supabase__execute_sql`.

## 15. Convenciones de Git observadas en este proyecto

- Commits solo cuando el usuario los pide explícitamente — nunca por iniciativa propia.
- Mensajes de commit en español, en modo imperativo/descriptivo corto ("Corrige que...",
  "Agrega...", "Quita el interés de mora y corrige el PDF de recibos"), sin prefijos tipo
  Conventional Commits.
- Atribución al final del mensaje: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
  (verificar el texto exacto vigente en el system reminder de la sesión activa, puede
  variar con la versión del modelo).
- Nunca `--force`, nunca `--no-verify`, nunca amend de un commit ya existente (crear uno
  nuevo si hace falta corregir algo).
- `git status --short` antes y después de cualquier operación que toque archivos sueltos
  temporales, para confirmar que no queda nada fuera de lugar.

## 16. Cosas que un agente nuevo debe saber antes de tocar nada (gotchas)

1. **Un `house_debts.amount` negativo NO es un crédito que funcione.** `ledger.ts` lo
   recorta a 0 (`Math.max(0, cents(c.amount))`), y además `addDebt()`/`registerPayment()`
   rechazan montos ≤ 0 de entrada. La única forma real de dar un saldo a favor que predate
   cargos reales es un `payment` **positivo** fechado antes de esos cargos (§5, §10).
2. **`category` en un `BuildingExpense` es texto libre, totalmente independiente de
   `kind`.** Un gasto puede tener `category: "Proyectos"` y `kind: "ordinary"` a la vez
   (pasó de verdad: "Provision Cerco Electrico" en Manzana 3-A, octubre 2026, cargado o
   editado a mano). El cálculo del fondo de reserva y del Sub-total del PDF excluyen por
   `category === "Proyectos"` (insensible a mayúsculas), no por `kind`. Los proyectos
   generados por `BudgetService` siempre vienen con ambos campos correctos a la vez; los
   cargados/editados a mano, no necesariamente.
3. **El `interest` legado en `InvoiceLineKind` no es código muerto** — es deliberado para
   no romper el render de recibos históricos/importados que ya tienen esas líneas. La
   función de interés de mora EN VIVO sí se eliminó por completo (cálculo, settings, UI).
4. **`container.ts`/`config.ts` no se pueden importar desde un script `tsx` suelto**
   (dependen de `astro:env/server`). Ver el patrón exacto en §13.
5. **El `origin_date` de algunas `house_debts` importadas es la fecha de CARGA del dato,
   no la fecha real del periodo que representan.** Puede producir un orden de aplicación
   de pagos ligeramente distinto al esperado. Dejado así a propósito (decisión explícita
   del usuario), no es un bug a "arreglar" sin que te lo pidan.
6. **El bug de `scripts/import/build.ts` que descarta un `previousDebt` inicial negativo
   sigue sin corregirse en el código** — solo se parchearon los datos ya afectados en
   Manzana 3-A (16 casas). Si se importa un condominio nuevo, o se revisa Manzana 3-B a
   fondo, es MUY probable que aparezca el mismo patrón.
7. **Columna huérfana**: `condominiums.late_interest_monthly_percent` sigue existiendo en
   la base (con default `0`) aunque el dominio ya no la usa en absoluto (se quitó de
   `CondominiumSettings`, de los adapters, de la UI). Nunca se decidió si dropearla o
   dejarla; no se tocó. No hace falta mantenerla sincronizada con nada.
8. **`InvoiceService.generate()` hace un guardado en dos pasadas** por el problema de
   auto-referencia de `previousDebt` (§6). Si tocás esa función, no quites la segunda
   pasada pensando que es redundante — es la que arregla el bug de "recibo que queda
   desactualizado apenas se regenera".
9. **Un recibo con `imported = true` (derivado de tener `source`/`import_batch`) nunca se
   puede reemitir** — `InvoiceService.generate()` lanza `ConflictError` antes de calcular
   nada. Esto es intencional: preservar el recibo histórico tal cual se cargó.
10. **`billPreviousMonth` es por condominio, no global** — antes de asumir "qué mes toca
    facturar", consultar `condominiums.bill_previous_month` de ESE condominio específico.
    Hoy solo Manzana 3-B lo tiene en `true`.
11. **Todo necesita pasar por `container.ts`** para elegir implementación local/Supabase.
    Si una página o servicio nuevo instancia un `Supabase*Repository` directamente (fuera
    de `container.ts` o de un script puntual de mantenimiento), rompe el modo local y viola
    la regla de composition root único.
12. **Los PDFs nunca se guardan como archivo** — se regeneran al vuelo desde
    `invoice.detail` + `invoice.issued` + la tasa congelada cada vez que alguien los pide.
    No busques un bucket de almacenamiento ni una carpeta de archivos: no existe (se quitó
    la integración con Google Drive hace tiempo, ver migración
    `0002_remove_file_storage.sql`).
13. **Las fechas "de hoy"/"mes actual" se calculan en hora de **Caracas**, no UTC**
    (`src/utils/dates.ts`, `monthAndYearInCaracas`/`isoDateInCaracas`) — Vercel corre en
    UTC, así que esto importa de verdad cerca de la medianoche.
14. **No existe archivo `CLAUDE.md` en este repo** — la única directiva de arquitectura
    versionada en el repo es `.claude/rules/01-architecture-guidelines.md`. Las
    convenciones de memoria/sesión (como el formato de atribución de commits) viven fuera
    del repo, en la configuración de la sesión/harness, no acá.

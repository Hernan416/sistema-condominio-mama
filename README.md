# Portal MAGO Condominios (multi-condominio)

Astro (SSR en Vercel) + Supabase. Solo datos relacionales: no se guardan archivos. Un solo login para todos: **usuario + PIN de 4 números** (tabla `users`, con rol `admin` o `resident`):

- **Administradora** (rol `admin`) → panel con todos los condominios.
- **Residente** (rol `resident`, ligado a su casa) → ve y descarga sus recibos, cuánto debe (USD y Bs.), su historial y sus pagos.

Sistema cerrado: sin correo ni Supabase Auth. El PIN se guarda cifrado (scrypt, lo calcula la app) y tras 5 PIN equivocados seguidos el usuario queda pausado 15 minutos. Funciona igual en local y en Supabase, así que los PIN se mudan tal cual.

Pensado para condominios de **Isla de Margarita, Venezuela**:

- Las cuotas se fijan en **dólares (USD)** y siempre se muestra su equivalente en **bolívares (Bs.)**.
- La tasa es la **oficial del BCV**, tomada de [DolarApi](https://ve.dolarapi.com) (gratis, sin clave). **Se consulta una vez al día** y se guarda en la tabla `exchange_rates` (una fila por día de Caracas), compartida por todo el sistema:
  - Un **cron de Vercel** (`vercel.json`) llama a `/api/cron/exchange-rate` todos los días a las 00:05 hora de Caracas (04:05 UTC). Requiere la variable `CRON_SECRET` en Vercel.
  - Si el cron no corrió, la primera visita del día consulta la API y la guarda.
  - Si la API falla, se usa la última tasa guardada y se reintenta como máximo cada 15 min. Si nunca hubo tasa, se muestran solo dólares.
- Cada PDF imprime el monto en USD, su referencia en Bs. y la tasa BCV del día de emisión con su fecha (queda guardada en el recibo). El residente ve además el monto en Bs. a la tasa **de hoy**.
- Fechas y "mes actual" en hora de Caracas (Vercel corre en UTC).
- Modo claro por defecto, con modo oscuro opcional (se recuerda en una cookie).

**Recibos sin archivos:** emitir un recibo guarda en la base su desglose, la tasa y la fecha. El PDF se dibuja al momento cada vez que el residente lo descarga o el panel lo abre (`/api/invoices/download`, `/api/admin/recibos/:id`), siempre idéntico: al emitir se congela TODO lo que imprime (desglose y montos, tasa BCV y por tanto los Bs., fecha, número, condominio, RIF, dirección, administradora, cuentas para pagar, casa, dueño y cédula). Editar después esos datos no cambia los recibos ya emitidos; para reflejar un cambio hay que volver a emitir.

## Desarrollo local (sin Supabase)

```bash
npm install
npm run dev
```

No hace falta `.env`. Al primer uso se crea `.local-data/db.json` con los dos condominios (Manzana 3-A con 33 casas y 3-B con 38; alícuotas iguales de prueba hasta cargar las reales). Sin internet, usa `EXCHANGE_RATE_PROVIDER=fixed` y `EXCHANGE_RATE_FIXED=855.66`. Para empezar de cero, borra `.local-data/`.

| Quién | Usuario | PIN |
|---|---|---|
| Administradora María González (todos los condominios) | `maria` | `2508` |
| Residentes de Manzana 3-A (33 casas) | `3a-1` … `3a-33` | Lo crean obligatoriamente la primera vez que entran |
| Residentes de Manzana 3-B (38 casas) | `3b-1` … `3b-38` | Lo crean obligatoriamente la primera vez que entran |

**PIN de los residentes** (solo cambios en la tabla `users`, sin correo ni verificaciones):

- **Primera vez:** el residente escribe su usuario y toca «Entrar» (sin PIN). El sistema le pide inventar 4 números dos veces y entra.
- **¿Olvidó su PIN?:** en el ingreso, o «Cambiar mi PIN» en su cuenta. Escribe su usuario y 4 números nuevos; el anterior deja de funcionar.
- Solo residentes: la administradora no puede usar «olvidé mi PIN» (si no, cualquiera tomaría el panel). Si María olvida el suyo, se cambia en la tabla `users`.

> El PIN de la administradora es de prueba: cámbielo antes de usar el sistema con datos reales.

## Panel del administrador

Organizado por tareas (pensado para una administradora con poca experiencia digital). Cada condominio tiene 5 secciones en la barra lateral:

| Sección | Para qué |
|---|---|
| **Inicio** | "¿Qué desea hacer?" (anotar un pago, hacer los recibos, ver quién debe, ver una casa), lo que falta este mes y los números: facturado, cobrado, gastos, caja, gráfico de 6 meses y antigüedad de las deudas. |
| **Recibos** | Dos pasos: 1) anotar los gastos del mes (con "casos especiales" por casa, 1 a 1 o varias a la vez) y 2) revisar y emitir los recibos. |
| **Casas y pagos** | Ficha de cada casa: cuánto debe, anotar pagos o abonos, agregar deudas antiguas, datos del propietario e historial. |
| **Historial** | Recibos y deudas (pagados, con abono, pendientes, con la fecha del último pago) y todos los pagos recibidos. |
| **Ajustes** | Datos del recibo, saldo inicial de caja y alícuotas. |

### Pagos, abonos y deudas

- Un **pago** puede ser por cualquier monto (**abono**), en USD o en Bs. (se convierte con la tasa indicada, por defecto la BCV de hoy).
- Se aplica solo a lo **más antiguo primero**: deudas registradas y recibos, en orden de fecha. Lo que sobra queda como **saldo a favor** para el próximo recibo.
- **Deudas existentes**: saldos de antes de usar el sistema, multas, reparaciones… Llevan concepto, detalle y fecha de origen (define su antigüedad) y entran en la "Deuda anterior" del siguiente recibo.
- Anular un pago o eliminar una deuda recalcula todo automáticamente. El estado "pagado" nunca se guarda a mano: sale del libro de pagos.
- **Caja** = saldo inicial + cobrado + ingresos de la comunidad − gastos (de las relaciones de gastos guardadas hasta el mes actual).

## Carga de datos históricos (ene–sep 2026)

Se hace **primero en local**; cuando todo cuadra, se sube a Supabase. Tres pasos:

1. **Extraer** (no toca la base): `npm run import:extract -- "<carpeta>" "<alícuotas.xlsx>" "<deudas.xlsx>"`
   Lee `Condominio / Mes / {Recibos | Balance general} / *.pdf`, saca el texto de cada PDF (`pdftotext -layout`) y convierte los Excel a JSON en `.local-data/import/`, con un `inventario.json` (condominio, mes, tipo, páginas, duplicados, PDF escaneados).
2. **Plantilla**: todo se lleva a un JSON estándar (`scripts/import/plantilla.ts`): alícuotas y dueños, balances por mes, **cada recibo con todas sus líneas y conceptos exactos**, y la deuda al corte con sus meses. Cada dato guarda su archivo de origen.
3. **Importar**: `npm run import -- plantilla.json` (ensayo: concilia casa por casa y deja `reporte-<lote>.csv` para Excel) → `--apply` (respaldo automático y carga) · `npm run import -- --undo <lote>` (quita todo ese lote).

Reglas: los recibos importados se guardan tal cual (desglose y encabezado congelados) y **no se pueden volver a emitir**. La deuda de años anteriores entra como deuda registrada con sus **meses**. Si no hay pagos con fecha, se calculan de la cadena de recibos (deuda anterior + mes − deuda anterior del recibo siguiente). Cada casa debe cuadrar con el archivo de deudas en monto y meses. Pruebas: `npm run import:test`. Para empezar de cero: `npm run data:reset-history -- --apply` (borra recibos, pagos, deudas y gastos; conserva casas, usuarios y PIN).

**Meses que debe**: cada recibo pendiente cuenta 1 mes; una deuda registrada cuenta los meses que representa (en proporción a lo que falta). Se ve en la ficha, la lista de casas, Inicio y la pantalla del residente.

## Cómo se calcula cada recibo (Venezuela)

- **Alícuota** (LPH art. 7): % de participación de cada casa. Puede escribirse a mano o calcularse con **tipos de alícuota** con nombre propio ("Casa pequeña = 6", "Casa grande = 8"), como proporciones que se ajustan a 100 % o como porcentajes exactos.
- **Relación de gastos del mes** (en USD): gastos comunes, cuotas extraordinarias e ingresos, repartidos por alícuota o en partes iguales. Se propone copiando el mes anterior y hay que guardarla antes de emitir.
- **Personalización por casa**: cambiar cómo paga un concepto (monto fijo o "no aplica"; el resto lo absorben las demás), cargos y abonos propios (opcionalmente "cada mes") y nota en el recibo. Todo se puede hacer 1 a 1 o para varias casas a la vez.
- **Fondo de reserva**: % sobre los gastos comunes (la ley no lo fija; 10 % por defecto).
- **Deuda anterior** con **interés de mora** opcional (simple, nunca sobre intereses) y estado **solvente / con deuda**.
- **Reparto exacto**: cada gasto cuadra al céntimo con lo facturado, y casas con la misma alícuota pagan lo mismo (±1 céntimo).
- El PDF lleva RIF, datos del propietario y alícuota, relación de gastos, total en USD y Bs. (tasa BCV), forma de pago y la leyenda del art. 14 LPH. Cada recibo guarda su desglose: no cambia aunque luego se editen los datos.

> Confirmar con un contador: IVA (los aportes de copropietarios no lo generan), IGTF (no aplica a juntas que no son contribuyentes especiales) e ISLR.

## Pasar a la nube

Solo cambia en el `.env` (o en Vercel → Settings → Environment Variables):

```bash
DATA_PROVIDER=supabase     # + SUPABASE_*
SESSION_SECRET=...         # obligatorio en producción
```

Ningún archivo de código cambia: `src/services/container.ts` elige la implementación.

1. **Supabase** → SQL Editor: ejecuta `supabase/migrations/0001_init.sql` y (solo en desarrollo) `supabase/seed.sql`. El script se puede volver a ejecutar sobre una base ya creada: agrega las tablas `payments` y `house_debts` y las columnas nuevas sin borrar datos. Si la base se creó con la versión que usaba Google Drive, ejecuta también, en orden, `0002_remove_file_storage.sql` (quita `drive_file_id` y `drive_file_url`) y `0003_freeze_receipt_header.sql` (congela el encabezado de los recibos).
2. **Usuarios**: viven en la tabla `users` (`seed.sql` crea a `maria` y un residente por casa). Al mudar la base local, los usuarios y sus PIN se copian tal cual.

## Arquitectura

```
src/
├─ pages/            Rutas finas (Astro). api/ = controladores.
├─ middleware.ts     Protege /dashboard, /admin/*, /api/admin/*.
├─ components/ui     Presentación pura (Astro + React).
├─ components/domain Ensamblan UI para el negocio.
├─ hooks/            useInvoiceGeneration (estado del panel admin).
├─ services/
│  ├─ contracts.ts   Interfaces (DIP).
│  ├─ container.ts   Composition root: único sitio con implementaciones concretas.
│  ├─ pdf/PdfInvoiceFacade.ts        FACADE pdf-lib (PDF al momento, sin guardar archivos).
│  ├─ repositories/  Supabase → dominio (vía adapters).
│  ├─ invoices/InvoiceService.ts     Emisión de recibos.
│  ├─ billing/BillingService.ts      Relación de gastos → recibos.
│  ├─ accounts/AccountService.ts     Libro de cuentas: pagos, abonos y deudas.
│  ├─ metrics/MetricsService.ts      Consolidado del Resumen.
│  └─ api/           Cliente fetch para la isla React.
├─ adapters/         snake_case / DTO / vista ⇄ dominio.
├─ types/            domain.ts, database.ts, dto.ts.
└─ utils/            Funciones puras.
```

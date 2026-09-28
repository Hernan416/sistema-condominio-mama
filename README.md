# Portal MAGO Condominios (multi-condominio)

Astro (SSR en Vercel) + Supabase. Solo datos relacionales: no se guardan archivos. Un solo login para todos:

- **Residente** → escribe su usuario (ej. `3b-12`) y su PIN de 4 números → ve y descarga su factura, cuánto debe (USD y Bs.) y sus últimos pagos.
- **Administrador** → escribe su correo y contraseña → panel con todos los condominios que gestiona.

Pensado para condominios de **Isla de Margarita, Venezuela**:

- Las cuotas se fijan en **dólares (USD)** y siempre se muestra su equivalente en **bolívares (Bs.)**.
- La tasa es la **oficial del BCV**, tomada de [DolarApi](https://ve.dolarapi.com) (gratis, sin clave). **Se consulta una vez al día** y se guarda en la tabla `exchange_rates` (una fila por día de Caracas), compartida por todo el sistema:
  - Un **cron de Vercel** (`vercel.json`) llama a `/api/cron/exchange-rate` todos los días a las 00:05 hora de Caracas (04:05 UTC). Requiere la variable `CRON_SECRET` en Vercel.
  - Si el cron no corrió, la primera visita del día consulta la API y la guarda.
  - Si la API falla, se usa la última tasa guardada y se reintenta como máximo cada 15 min. Si nunca hubo tasa, se muestran solo dólares.
- Cada PDF imprime el monto en USD, su referencia en Bs. y la tasa BCV del día de emisión con su fecha (queda guardada en el recibo). El residente ve además el monto en Bs. a la tasa **de hoy**.
- Fechas y "mes actual" en hora de Caracas (Vercel corre en UTC).
- Modo claro por defecto, con modo oscuro opcional (se recuerda en una cookie).

**Recibos sin archivos:** emitir un recibo guarda en la base su desglose, la tasa y la fecha. El PDF se dibuja al momento cada vez que el residente lo descarga o el panel lo abre (`/api/invoices/download`, `/api/admin/recibos/:id`), siempre idéntico porque sale de esos datos congelados.

## Desarrollo local (sin Supabase)

```bash
npm install
npm run dev
```

No hace falta `.env`. Al primer uso se crea `.local-data/db.json` con dos condominios de prueba (Manzana 3-A y 3-B, cuota de 30 USD). Sin internet, usa `EXCHANGE_RATE_PROVIDER=fixed` y `EXCHANGE_RATE_FIXED=855.66`. Para empezar de cero, borra `.local-data/`.

| Quién | Usuario | Clave |
|---|---|---|
| Administrador (todos los condominios) | `admin@local.test` | `admin1234` |
| Residentes de Manzana 3-A | `3a-1` … `3a-12` | `1234` |
| Residentes de Manzana 3-B | `3b-1` … `3b-12` | `1234` |

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

1. **Supabase** → SQL Editor: ejecuta `supabase/migrations/0001_init.sql` y (solo en desarrollo) `supabase/seed.sql`. El script se puede volver a ejecutar sobre una base ya creada: agrega las tablas `payments` y `house_debts` y las columnas nuevas sin borrar datos. Si la base se creó con la versión que usaba Google Drive, ejecuta también `supabase/migrations/0002_remove_file_storage.sql` (quita `drive_file_id` y `drive_file_url`).
2. **Administradores**: créalos en Authentication → Users y dales acceso a sus condominios:
   ```sql
   insert into public.condominium_admins (user_id, condominium_id)
   select u.id, c.id from auth.users u, public.condominiums c
    where u.email = 'correo@ejemplo.com' and c.slug in ('manzana-3-a', 'manzana-3-b');
   ```
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

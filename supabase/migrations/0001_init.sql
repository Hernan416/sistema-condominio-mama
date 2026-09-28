-- ============================================================================
-- Sistema de Condominios (multi-condominio) — Esquema inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- ============================================================================
-- Modelo:
--   condominiums ─┬─< houses ─┬─< invoices      (recibos mensuales emitidos)
--                 │           ├─< house_debts   (deudas anteriores al sistema / cargos sueltos)
--                 │           └─< payments      (abonos y pagos; se aplican FIFO a lo más viejo)
--   users (admin | resident) ──> houses          (el residente pertenece a una casa)
--   * El estado "pagado" de un recibo NO se guarda: se calcula del libro de pagos.
--   * TODOS entran con usuario + PIN (tabla users). El rol decide: admin → panel (todos los
--     condominios), resident → su casa. Sistema cerrado: sin correo ni Supabase Auth.
-- Seguridad:
--   * El PIN se guarda como `pin_hash` (scrypt, lo calcula la app), nunca en texto plano.
--     La app verifica el PIN y lleva el bloqueo por intentos (igual en local y en Supabase).
--   * RLS activado SIN políticas para anon/authenticated: solo el servidor (service_role) accede.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.invoice_status as enum ('pending', 'generated', 'paid');
exception when duplicate_object then null; end $$;

-- ─── condominiums ───────────────────────────────────────────────────────────
create table if not exists public.condominiums (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city        text,
  -- Datos del recibo
  rif                   text,          -- RIF de la junta de condominio (J-xxxxxxxx-x)
  address               text,
  administrator_name    text,
  administrator_rif     text,
  payment_instructions  text,          -- cuentas, pago móvil… (siempre a nombre de la comunidad)
  -- Valores por defecto de facturación
  default_reserve_fund_percent   numeric(5, 2) not null default 10 check (default_reserve_fund_percent between 0 and 100),
  due_day                        smallint not null default 5 check (due_day between 1 and 28),
  -- La LPH no fija la mora: la aprueba la asamblea. 0 = no se cobra.
  late_interest_monthly_percent  numeric(5, 2) not null default 0 check (late_interest_monthly_percent between 0 and 10),
  -- Tipos de alícuota: { mode: proportional|percent, categories: [{ id, name, value }] }
  aliquot_scheme                 jsonb not null default '{"mode":"proportional","categories":[]}'::jsonb,
  -- Caja: saldo en banco/caja al empezar a usar el sistema (puede ser negativo).
  opening_balance       numeric(14, 2) not null default 0,
  opening_balance_date  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── houses ─────────────────────────────────────────────────────────────────
create table if not exists public.houses (
  id               uuid primary key default gen_random_uuid(),
  condominium_id   uuid not null references public.condominiums (id) on delete cascade,
  number           text not null check (length(trim(number)) > 0),
  owner_name       text,
  owner_document   text,                -- cédula o RIF del propietario
  owner_email      text,
  owner_phone      text,
  -- Quién vive: el propietario, un inquilino o nadie.
  occupancy        text not null default 'owner' check (occupancy in ('owner', 'tenant', 'vacant')),
  occupant_name    text,                -- solo si está alquilada
  occupant_phone   text,
  notes            text,
  -- Alícuota (LPH art. 7): % de participación fijado en el documento de condominio.
  aliquot          numeric(9, 4) not null default 0 check (aliquot >= 0 and aliquot <= 100),
  -- Tipo de alícuota asignado (id dentro de condominiums.aliquot_scheme); null = personalizada.
  aliquot_category_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- "12a" y " 12A " son la misma casa dentro de un condominio.
create unique index if not exists houses_number_per_condo_unique
  on public.houses (condominium_id, upper(trim(number)));

-- ─── invoices ───────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references public.houses (id) on delete cascade,
  month           smallint not null check (month between 1 and 12),
  year            smallint not null check (year between 2000 and 2100),
  -- La cuota se fija en dólares (USD). La referencia en bolívares se calcula con la tasa BCV.
  amount          numeric(12, 2) not null check (amount >= 0),
  -- Tasa BCV (Bs. por USD) del día de emisión, y fecha en que el BCV la publicó.
  exchange_rate       numeric(14, 4) check (exchange_rate is null or exchange_rate > 0),
  exchange_rate_date  date,
  exchange_rate_source text,            -- "BCV"
  -- Encabezado congelado al emitir: el PDF sale idéntico aunque luego cambien estos datos.
  issued_condominium_name      text,
  issued_house_number          text,
  issued_owner_name            text,
  issued_owner_document        text,
  issued_receipt_number        text,
  issued_rif                   text,
  issued_address               text,
  issued_administrator_name    text,
  issued_administrator_rif     text,
  issued_payment_instructions  text,
  status          public.invoice_status not null default 'pending',
  generated_at    timestamptz,
  paid_at         timestamptz,
  -- Desglose con el que se emitió el recibo (líneas, subtotales, deuda, mora). Inmutable tras emitir.
  -- No se guardan archivos: el PDF se dibuja al momento a partir de esta fila.
  detail          jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invoices_one_per_house_period unique (house_id, year, month),
  constraint invoices_generated_has_detail check (status = 'pending' or detail is not null)
);

create index if not exists invoices_period_idx on public.invoices (year, month);

-- ─── house_debts ────────────────────────────────────────────────────────────
-- Deudas que no salen de un recibo del sistema: saldos de antes de usarlo,
-- multas, reparaciones cargadas a una casa… Cuentan como deuda desde origin_date.
create table if not exists public.house_debts (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses (id) on delete cascade,
  concept      text not null check (length(trim(concept)) > 0),
  detail       text,
  origin_date  date not null,
  amount       numeric(12, 2) not null check (amount > 0),
  created_at   timestamptz not null default now()
);

create index if not exists house_debts_house_idx on public.house_debts (house_id, origin_date);

-- ─── payments ───────────────────────────────────────────────────────────────
-- Pagos y abonos de cada casa, en USD. Si se pagó en bolívares se guardan también
-- el monto en Bs. y la tasa usada. Se aplican a la deuda más antigua primero; el
-- excedente queda como saldo a favor.
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  house_id       uuid not null references public.houses (id) on delete cascade,
  paid_on        date not null,
  amount         numeric(12, 2) not null check (amount > 0),
  method         text not null check (method in ('transfer', 'mobile', 'zelle', 'cash_usd', 'cash_ves', 'other')),
  reference      text,
  amount_ves     numeric(16, 2) check (amount_ves is null or amount_ves > 0),
  exchange_rate  numeric(14, 4) check (exchange_rate is null or exchange_rate > 0),
  note           text,
  created_at     timestamptz not null default now()
);

create index if not exists payments_house_idx on public.payments (house_id, paid_on);

-- ─── billing_sheets ─────────────────────────────────────────────────────────
-- Relación de gastos mensual de cada condominio: la fuente de las facturas del mes.
-- expenses:     [{ id, concept, amount, kind: ordinary|extraordinary|income, distribution: aliquot|equal }]
-- unit_charges: [{ id, house_id, concept, amount }]  (monto negativo = abono)
create table if not exists public.billing_sheets (
  condominium_id        uuid not null references public.condominiums (id) on delete cascade,
  year                  smallint not null check (year between 2000 and 2100),
  month                 smallint not null check (month between 1 and 12),
  reserve_fund_percent  numeric(5, 2) not null default 10 check (reserve_fund_percent between 0 and 100),
  due_date              date,
  general_note          text,
  unit_notes            jsonb not null default '{}'::jsonb,
  expenses              jsonb not null default '[]'::jsonb,
  unit_charges          jsonb not null default '[]'::jsonb,
  updated_at            timestamptz not null default now(),
  primary key (condominium_id, year, month)
);

-- ─── exchange_rates ─────────────────────────────────────────────────────────
-- Tasa BCV (Bs. por USD), una fila por día de Caracas. La escribe el cron diario
-- (/api/cron/exchange-rate) o, si no corrió, la primera visita del día.
create table if not exists public.exchange_rates (
  day           date primary key,
  usd_to_ves    numeric(14, 4) not null check (usd_to_ves > 0),
  source        text not null,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now()
);

-- ─── users ──────────────────────────────────────────────────────────────────
-- Administradora y residentes. Todos entran con usuario + PIN.
create table if not exists public.users (
  id               uuid primary key default gen_random_uuid(),
  -- Usuario de acceso, único (ej. "maria", "3b-12"): minúsculas, números y guiones.
  username         text not null unique check (username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- "scrypt$<sal>$<hash>" (lo genera la app). null = el residente aún no ha creado su PIN:
  -- lo crea al entrar la primera vez, y si lo olvida pone uno nuevo (sin correo).
  pin_hash         text,
  role             text not null check (role in ('admin', 'resident')),
  display_name     text,                 -- "María González"
  house_id         uuid references public.houses (id) on delete cascade,
  failed_attempts  smallint not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  -- Un residente siempre pertenece a una casa; la administradora no.
  constraint users_resident_has_house check (role = 'admin' or house_id is not null),
  -- La administradora siempre tiene PIN (no puede usar "olvidé mi PIN").
  constraint users_admin_has_pin check (role = 'resident' or pin_hash is not null)
);

create index if not exists users_house_idx on public.users (house_id);

-- ─── Columnas agregadas después (idempotente, para bases ya creadas) ─────────
alter table public.condominiums add column if not exists opening_balance numeric(14, 2) not null default 0;
alter table public.condominiums add column if not exists opening_balance_date date;
alter table public.houses add column if not exists owner_phone text;
alter table public.houses add column if not exists occupancy text not null default 'owner' check (occupancy in ('owner', 'tenant', 'vacant'));
alter table public.houses add column if not exists occupant_name text;
alter table public.houses add column if not exists occupant_phone text;
alter table public.houses add column if not exists notes text;
-- ─── updated_at automático ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists condominiums_touch on public.condominiums;
create trigger condominiums_touch before update on public.condominiums
  for each row execute function public.touch_updated_at();

drop trigger if exists houses_touch on public.houses;
create trigger houses_touch before update on public.houses
  for each row execute function public.touch_updated_at();

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ─── RLS: cerrado por defecto ───────────────────────────────────────────────
alter table public.condominiums       enable row level security;
alter table public.houses             enable row level security;
alter table public.invoices           enable row level security;
alter table public.users              enable row level security;
alter table public.exchange_rates     enable row level security;
alter table public.billing_sheets     enable row level security;
alter table public.house_debts        enable row level security;
alter table public.payments           enable row level security;

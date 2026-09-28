-- ============================================================================
-- Sistema de Condominios (multi-condominio) — Esquema inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor (o `supabase db push`)
-- ============================================================================
-- Modelo:
--   condominiums ─┬─< houses ─┬─< invoices      (recibos mensuales emitidos)
--                 │           ├─< house_debts   (deudas anteriores al sistema / cargos sueltos)
--                 │           └─< payments      (abonos y pagos; se aplican FIFO a lo más viejo)
--                 └─< condominium_admins >── auth.users
--   * El estado "pagado" de un recibo NO se guarda: se calcula del libro de pagos.
--   * Un residente entra con `houses.username` (único en todo el sistema) + PIN.
--   * Un administrador (Supabase Auth, email) puede gestionar uno o varios condominios.
-- Seguridad:
--   * El PIN se guarda como `pin_hash` (bcrypt vía pgcrypto), nunca en texto plano.
--   * RLS activado SIN políticas para anon/authenticated: solo el servidor (service_role) accede.
--   * `verify_house_pin` verifica y aplica el bloqueo por intentos de forma atómica.
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
  -- Usuario de acceso del residente, único global (ej. "3b-12"). Sin "@": eso es un admin.
  username         text not null check (username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  pin_hash         text not null,
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
  failed_attempts  smallint not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists houses_username_unique on public.houses (username);
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
  -- Tasa BCV (Bs. por USD) usada al generar el PDF, y fecha en que el BCV la publicó.
  exchange_rate       numeric(14, 4) check (exchange_rate is null or exchange_rate > 0),
  exchange_rate_date  date,
  drive_file_id   text,
  drive_file_url  text,
  status          public.invoice_status not null default 'pending',
  generated_at    timestamptz,
  paid_at         timestamptz,
  -- Desglose con el que se emitió el recibo (líneas, subtotales, deuda, mora). Inmutable tras emitir.
  detail          jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invoices_one_per_house_period unique (house_id, year, month),
  constraint invoices_generated_has_file check (status = 'pending' or drive_file_id is not null)
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

-- ─── condominium_admins ─────────────────────────────────────────────────────
create table if not exists public.condominium_admins (
  user_id         uuid not null references auth.users (id) on delete cascade,
  condominium_id  uuid not null references public.condominiums (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, condominium_id)
);

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
alter table public.condominium_admins enable row level security;
alter table public.exchange_rates     enable row level security;
alter table public.billing_sheets     enable row level security;
alter table public.house_debts        enable row level security;
alter table public.payments           enable row level security;

-- ─── Funciones de PIN ───────────────────────────────────────────────────────
create or replace function public.set_house_pin(p_house_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener exactamente 4 dígitos';
  end if;

  update public.houses
     set pin_hash = crypt(p_pin, gen_salt('bf', 10)),
         failed_attempts = 0,
         locked_until = null
   where id = p_house_id;
end $$;

-- Verifica usuario + PIN con bloqueo progresivo. `status`:
--   'ok'      → credenciales válidas
--   'invalid' → usuario inexistente o PIN incorrecto (misma respuesta: no revela cuál)
--   'locked'  → demasiados intentos; `locked_until` indica hasta cuándo
create or replace function public.verify_house_pin(p_username text, p_pin text)
returns table (
  status text,
  house_id uuid,
  house_number text,
  condominium_id uuid,
  locked_until timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_house        public.houses%rowtype;
  v_max_attempts constant int := 5;
  v_lock_window  constant interval := interval '15 minutes';
begin
  select * into v_house
    from public.houses h
   where h.username = lower(trim(p_username))
   for update;

  if not found then
    -- Mismo costo que un bcrypt real para no revelar qué usuarios existen.
    perform crypt(p_pin, gen_salt('bf', 10));
    return query select 'invalid'::text, null::uuid, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  if v_house.locked_until is not null and v_house.locked_until > now() then
    return query select 'locked'::text, null::uuid, null::text, null::uuid, v_house.locked_until;
    return;
  end if;

  if v_house.pin_hash = crypt(p_pin, v_house.pin_hash) then
    update public.houses set failed_attempts = 0, locked_until = null where id = v_house.id;
    return query select 'ok'::text, v_house.id, v_house.number, v_house.condominium_id, null::timestamptz;
    return;
  end if;

  update public.houses
     set failed_attempts = case when failed_attempts + 1 >= v_max_attempts then 0 else failed_attempts + 1 end,
         locked_until    = case when failed_attempts + 1 >= v_max_attempts then now() + v_lock_window else null end
   where id = v_house.id
  returning houses.locked_until into v_house.locked_until;

  if v_house.locked_until is not null then
    return query select 'locked'::text, null::uuid, null::text, null::uuid, v_house.locked_until;
  else
    return query select 'invalid'::text, null::uuid, null::text, null::uuid, null::timestamptz;
  end if;
end $$;

revoke all on function public.set_house_pin(uuid, text)    from public, anon, authenticated;
revoke all on function public.verify_house_pin(text, text) from public, anon, authenticated;
grant execute on function public.set_house_pin(uuid, text)    to service_role;
grant execute on function public.verify_house_pin(text, text) to service_role;

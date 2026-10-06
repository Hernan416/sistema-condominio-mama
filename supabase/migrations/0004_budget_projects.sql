-- ─── budget_projects ────────────────────────────────────────────────────────
-- Presupuesto de un proyecto (ej. "Pintura de fachada: $250"), repartido por alícuota
-- entre las casas. Se factura como una cuota extraordinaria más (billing_sheets.expenses,
-- con project_id = este id) en uno o varios meses, según billing_mode:
--   single  = todo el monto en un solo mes (start_year/start_month).
--   spread  = en partes iguales a lo largo de months_count meses desde start_year/start_month.
-- collection_mode define cómo se cuenta "recaudado" cuando un recibo del mes (que mezcla el
-- gasto común con la cuota del proyecto) no está pagado del todo:
--   proportional    = se cuenta la misma proporción de la cuota que se pagó del recibo (por defecto).
--   all_or_nothing  = la cuota solo se cuenta recaudada cuando el recibo de ese mes queda 100 % pagado.
create table if not exists public.budget_projects (
  id             uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums (id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  target_amount  numeric(12, 2) not null check (target_amount > 0),
  billing_mode   text not null check (billing_mode in ('single', 'spread')),
  collection_mode text not null default 'proportional' check (collection_mode in ('proportional', 'all_or_nothing')),
  start_year     smallint not null check (start_year between 2000 and 2100),
  start_month    smallint not null check (start_month between 1 and 12),
  months_count   smallint not null default 1 check (months_count between 1 and 60),
  created_at     timestamptz not null default now()
);

create index if not exists budget_projects_condominium_idx on public.budget_projects (condominium_id);

-- Los gastos (columna ya existente, jsonb) ahora también pueden traer category y project_id.
comment on column public.billing_sheets.expenses is
  '[{ id, concept, category, amount, kind: ordinary|extraordinary|income, distribution: aliquot|equal, overrides, project_id }]';

alter table public.budget_projects enable row level security;

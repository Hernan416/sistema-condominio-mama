-- ============================================================================
-- Datos de prueba (SOLO desarrollo) — mismos datos que el modo local.
-- Montos en USD. PIN de todas las casas de prueba: 1234
--   Manzana 3-A:  3a-1 … 3a-12
--   Manzana 3-B:  3b-1 … 3b-12
-- ============================================================================
insert into public.condominiums (name, slug, city) values
  ('Manzana 3-A', 'manzana-3-a', 'Isla de Margarita'),
  ('Manzana 3-B', 'manzana-3-b', 'Isla de Margarita')
on conflict (slug) do nothing;

insert into public.houses (condominium_id, number, username, owner_name, aliquot, pin_hash)
select c.id,
       n::text,
       case c.slug when 'manzana-3-a' then '3a-' else '3b-' end || n,
       'Propietario casa ' || n,
       case when n = 1 then 8.3337 else 8.3333 end,  -- 12 casas iguales: suman 100
       extensions.crypt('1234', extensions.gen_salt('bf', 10))
  from public.condominiums c, generate_series(1, 12) as n
 where c.slug in ('manzana-3-a', 'manzana-3-b')
on conflict do nothing;

-- Relación de gastos del mes actual (USD, reparto por alícuota, fondo de reserva 10 %).
insert into public.billing_sheets (condominium_id, year, month, reserve_fund_percent, expenses)
select c.id,
       extract(year from now() at time zone 'America/Caracas')::smallint,
       extract(month from now() at time zone 'America/Caracas')::smallint,
       10,
       jsonb_build_array(
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Vigilancia privada', 'amount', 180, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Electricidad de áreas comunes y portón', 'amount', 25, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Mantenimiento del portón eléctrico', 'amount', 20, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Mantenimiento de áreas verdes', 'amount', 60, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Aseo y limpieza de áreas comunes', 'amount', 30, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Honorarios de administración', 'amount', 50, 'kind', 'ordinary', 'distribution', 'aliquot'),
         jsonb_build_object('id', gen_random_uuid(), 'concept', 'Comisiones bancarias', 'amount', 5, 'kind', 'ordinary', 'distribution', 'aliquot')
       )
  from public.condominiums c
on conflict (condominium_id, year, month) do nothing;

-- Administrador:
--   1. Supabase Dashboard → Authentication → Users → "Add user" (email + contraseña).
--   2. Darle acceso a las dos manzanas:
-- insert into public.condominium_admins (user_id, condominium_id)
-- select u.id, c.id from auth.users u, public.condominiums c
--  where u.email = 'admin@ejemplo.com' and c.slug in ('manzana-3-a', 'manzana-3-b');

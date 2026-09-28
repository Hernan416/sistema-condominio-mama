-- ============================================================================
-- Datos de prueba (SOLO desarrollo) — mismos datos que el modo local.
-- Montos en USD. Todos entran con usuario + PIN (tabla users):
--   Administradora: maria (PIN 2508) — cámbielo antes de producción
--   Manzana 3-A:    3a-1 … 3a-12 (PIN 1234)
--   Manzana 3-B:    3b-1 … 3b-12 (PIN 1234)
-- ============================================================================
insert into public.condominiums (name, slug, city) values
  ('Manzana 3-A', 'manzana-3-a', 'Isla de Margarita'),
  ('Manzana 3-B', 'manzana-3-b', 'Isla de Margarita')
on conflict (slug) do nothing;

insert into public.houses (condominium_id, number, owner_name, aliquot)
select c.id,
       n::text,
       'Propietario casa ' || n,
       case when n = 1 then 8.3337 else 8.3333 end  -- 12 casas iguales: suman 100
  from public.condominiums c, generate_series(1, 12) as n
 where c.slug in ('manzana-3-a', 'manzana-3-b')
on conflict do nothing;

-- Un usuario residente por casa (ej. "3b-12"). Hash scrypt del PIN 1234 (lo genera la app).
insert into public.users (username, pin_hash, role, display_name, house_id)
select case c.slug when 'manzana-3-a' then '3a-' else '3b-' end || h.number,
       'scrypt$rEdm2Oko4JWi9ufv7ZPTww$JrLH117cLn9ksH6DFHs2oENXrkjljByment0i1yvGTs',
       'resident',
       h.owner_name,
       h.id
  from public.houses h
  join public.condominiums c on c.id = h.condominium_id
 where c.slug in ('manzana-3-a', 'manzana-3-b')
on conflict (username) do nothing;

-- Administradora (ve todos los condominios). Hash scrypt del PIN 2508.
insert into public.users (username, pin_hash, role, display_name)
values ('maria', 'scrypt$UijZuHp-BwUGHA6V9R0loQ$HXXm2ibUJBlPlfrM1QgrDUjnTj-BvAPaX-h3PGxgVks', 'admin', 'María González')
on conflict (username) do nothing;

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

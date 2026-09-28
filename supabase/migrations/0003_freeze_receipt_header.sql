-- ============================================================================
-- 0003 · Recibos 100 % congelados al emitir
-- Solo hace falta en bases creadas antes de este cambio. Es idempotente.
-- ============================================================================
-- El desglose (`detail`), la tasa y la fecha ya estaban congelados. Ahora también todo lo
-- que imprime el encabezado: condominio, RIF, dirección, administradora, cuentas para pagar,
-- casa, dueño, cédula, número de recibo y fuente de la tasa. Los montos en Bs. salen de la
-- tasa congelada, así que tampoco cambian.

alter table public.invoices add column if not exists exchange_rate_source text;
alter table public.invoices add column if not exists issued_condominium_name text;
alter table public.invoices add column if not exists issued_house_number text;
alter table public.invoices add column if not exists issued_owner_name text;
alter table public.invoices add column if not exists issued_owner_document text;
alter table public.invoices add column if not exists issued_receipt_number text;
alter table public.invoices add column if not exists issued_rif text;
alter table public.invoices add column if not exists issued_address text;
alter table public.invoices add column if not exists issued_administrator_name text;
alter table public.invoices add column if not exists issued_administrator_rif text;
alter table public.invoices add column if not exists issued_payment_instructions text;

-- Recibos ya emitidos: se congelan con los datos actuales (lo más cercano a como estaban).
-- Número de recibo: AAAA-MM-NNN (casa en mayúsculas, mínimo 3 caracteres con ceros a la
-- izquierda, sin recortar), igual que receiptNumber() en src/utils/dueDate.ts.
update public.invoices i
   set issued_condominium_name     = c.name,
       issued_house_number         = h.number,
       issued_owner_name           = h.owner_name,
       issued_owner_document       = h.owner_document,
       issued_receipt_number       = i.year || '-' || lpad(i.month::text, 2, '0') || '-' || (
                                       select case when length(u) >= 3 then u else lpad(u, 3, '0') end
                                         from (select upper(regexp_replace(h.number, '[^A-Za-z0-9_]', '', 'g')) as u) n
                                     ),
       issued_rif                  = c.rif,
       issued_address              = c.address,
       issued_administrator_name   = c.administrator_name,
       issued_administrator_rif    = c.administrator_rif,
       issued_payment_instructions = c.payment_instructions,
       exchange_rate_source        = case when i.exchange_rate is null then null else 'BCV' end
  from public.houses h
  join public.condominiums c on c.id = h.condominium_id
 where h.id = i.house_id
   and i.status <> 'pending'
   and i.issued_condominium_name is null;

-- ============================================================================
-- 0002 · Sin almacenamiento de archivos (se elimina Google Drive)
-- Solo hace falta en bases creadas con la versión anterior de 0001_init.sql.
-- Es idempotente: se puede ejecutar más de una vez.
-- ============================================================================
-- Los recibos quedan como datos relacionales: su desglose (`detail`), la tasa BCV y la
-- fecha de emisión. El PDF se dibuja al momento cada vez que alguien lo abre o descarga.

alter table public.invoices drop constraint if exists invoices_generated_has_file;
alter table public.invoices drop column if exists drive_file_url;
alter table public.invoices drop column if exists drive_file_id;

-- Un recibo emitido debe tener su desglose (es lo que permite volver a dibujar el PDF).
do $$ begin
  alter table public.invoices
    add constraint invoices_generated_has_detail check (status = 'pending' or detail is not null);
exception when duplicate_object then null; end $$;

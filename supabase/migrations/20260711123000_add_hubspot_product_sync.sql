alter table public.products
  add column if not exists hubspot_product_id text,
  add column if not exists hubspot_sync_status text not null default 'manual'
    check (hubspot_sync_status in ('active', 'archived', 'manual')),
  add column if not exists source_provider text;

create unique index if not exists products_brand_hubspot_product_uidx
  on public.products (brand_id, hubspot_product_id)
  where hubspot_product_id is not null;

create index if not exists products_brand_active_idx
  on public.products (brand_id, is_active, name);

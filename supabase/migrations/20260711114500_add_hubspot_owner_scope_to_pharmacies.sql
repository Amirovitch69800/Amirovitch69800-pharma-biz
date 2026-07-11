alter table public.pharmacies
  add column if not exists hubspot_owner_id text,
  add column if not exists hubspot_sync_status text not null default 'active'
    check (hubspot_sync_status in ('active', 'out_of_scope', 'manual'));

create index if not exists pharmacies_hubspot_owner_scope_idx
  on public.pharmacies (hubspot_owner_id, hubspot_sync_status)
  where hubspot_company_id is not null;

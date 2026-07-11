create table if not exists public.brand_integrations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'pipedrive', 'salesforce', 'csv', 'none')),
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  display_name text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, provider)
);

create table if not exists public.external_sync_links (
  id uuid primary key default gen_random_uuid(),
  brand_integration_id uuid not null references public.brand_integrations(id) on delete cascade,
  local_table text not null,
  local_id uuid not null,
  external_object_type text not null,
  external_object_id text,
  provider text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'pending' check (status in ('pending', 'synced', 'error', 'disabled')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_integration_id, local_table, local_id, external_object_type)
);

alter table public.brand_integrations enable row level security;
alter table public.external_sync_links enable row level security;

drop policy if exists "brand integrations readable by authenticated users" on public.brand_integrations;
create policy "brand integrations readable by authenticated users"
  on public.brand_integrations
  for select
  to authenticated
  using (true);

drop policy if exists "brand integrations admin write" on public.brand_integrations;
create policy "brand integrations admin write"
  on public.brand_integrations
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "external sync links readable by owning agent" on public.external_sync_links;
create policy "external sync links readable by owning agent"
  on public.external_sync_links
  for select
  to authenticated
  using (
    is_admin()
    or exists (
      select 1
      from public.orders orders
      where external_sync_links.local_table = 'orders'
        and orders.id = external_sync_links.local_id
        and orders.agent_id = current_agent_id()
    )
  );

drop policy if exists "external sync links admin write" on public.external_sync_links;
create policy "external sync links admin write"
  on public.external_sync_links
  for all
  to authenticated
  using (is_admin())
  with check (is_admin());

grant select on public.brand_integrations to authenticated;
grant select on public.external_sync_links to authenticated;

create index if not exists brand_integrations_brand_status_idx
  on public.brand_integrations (brand_id, provider, status);

create index if not exists external_sync_links_local_idx
  on public.external_sync_links (local_table, local_id, provider);

insert into public.brand_integrations (brand_id, provider, status, display_name, config)
select
  brands.id,
  'hubspot',
  'active',
  'Naali HubSpot',
  jsonb_build_object(
    'scope', 'naali',
    'pipeline_id', '1543644371',
    'default_dealstage', '2110945486',
    'hubspot_owner_id', '727665403',
    'origin', 'Commercial Naali',
    'default_closed_won_reason', 'Classique',
    'deal_to_company_association_type_id', 5
  )
from public.brands brands
where lower(brands.name) = 'naali'
on conflict (brand_id, provider) do update
set
  status = excluded.status,
  display_name = excluded.display_name,
  config = public.brand_integrations.config || excluded.config,
  updated_at = now();

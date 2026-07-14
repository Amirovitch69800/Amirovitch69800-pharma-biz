alter table public.orders
  add column if not exists mission_id uuid references public.field_missions(id) on delete set null,
  add column if not exists source text not null default 'spontaneous'
    check (source in ('spontaneous', 'mission', 'reorder', 'imported_crm', 'pharmacy_link', 'whatsapp')),
  add column if not exists created_by_type text not null default 'agent'
    check (created_by_type in ('agent', 'brand', 'pharmacy_link', 'ai_assistant', 'admin')),
  add column if not exists attributed_agent_id uuid references public.agents(id) on delete set null,
  add column if not exists validation_status text not null default 'not_required'
    check (validation_status in ('not_required', 'required', 'approved', 'rejected', 'blocked')),
  add column if not exists validation_required_reason text,
  add column if not exists external_deal_id text;

create table if not exists public.brand_order_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null default 'Règles commandes',
  status text not null default 'active' check (status in ('active', 'disabled')),
  max_auto_discount_rate numeric(5,2),
  max_auto_total_ht numeric(12,2),
  require_validation_for_new_customer boolean not null default true,
  require_validation_for_mission_orders boolean not null default false,
  require_validation_for_pharmacy_link_orders boolean not null default false,
  require_validation_for_whatsapp_orders boolean not null default true,
  block_missing_catalog_price boolean not null default true,
  sensitive_product_ids jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table if not exists public.order_approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reason text,
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brand_order_rules enable row level security;
alter table public.order_approvals enable row level security;

grant select, insert, update, delete on public.brand_order_rules to authenticated;
grant select, insert, update, delete on public.order_approvals to authenticated;

create index if not exists orders_mission_idx
  on public.orders(mission_id);

create index if not exists orders_source_validation_idx
  on public.orders(source, validation_status);

create index if not exists orders_attributed_agent_idx
  on public.orders(attributed_agent_id);

create index if not exists orders_external_deal_idx
  on public.orders(external_deal_id)
  where external_deal_id is not null;

create index if not exists brand_order_rules_brand_status_idx
  on public.brand_order_rules(brand_id, status);

create index if not exists order_approvals_order_status_idx
  on public.order_approvals(order_id, status);

drop policy if exists "brand order rules visible to brand agents or admin" on public.brand_order_rules;
create policy "brand order rules visible to brand agents or admin"
  on public.brand_order_rules
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_brand_access(brand_id)
    or exists (
      select 1
      from public.agent_brand_assignments assignment
      where assignment.brand_id = brand_order_rules.brand_id
        and assignment.agent_id = public.current_agent_id()
        and assignment.status = 'active'
    )
  );

drop policy if exists "brand order rules admin write" on public.brand_order_rules;
create policy "brand order rules admin write"
  on public.brand_order_rules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "order approvals visible to order participants" on public.order_approvals;
create policy "order approvals visible to order participants"
  on public.order_approvals
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.orders orders
      where orders.id = order_approvals.order_id
        and (
          orders.agent_id = public.current_agent_id()
          or orders.attributed_agent_id = public.current_agent_id()
          or public.has_brand_access(orders.brand_id)
        )
    )
  );

drop policy if exists "order approvals admin or brand write" on public.order_approvals;
create policy "order approvals admin or brand write"
  on public.order_approvals
  for all
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.orders orders
      where orders.id = order_approvals.order_id
        and public.has_brand_access(orders.brand_id)
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.orders orders
      where orders.id = order_approvals.order_id
        and public.has_brand_access(orders.brand_id)
    )
  );

update public.orders
set attributed_agent_id = agent_id
where attributed_agent_id is null
  and agent_id is not null;

update public.orders
set external_deal_id = links.external_object_id
from public.external_sync_links links
where links.local_table = 'orders'
  and links.local_id = orders.id
  and links.external_object_type = 'deal'
  and links.external_object_id is not null
  and orders.external_deal_id is null;

insert into public.brand_order_rules (
  brand_id,
  name,
  max_auto_discount_rate,
  max_auto_total_ht,
  require_validation_for_new_customer,
  require_validation_for_whatsapp_orders,
  block_missing_catalog_price
)
select
  brands.id,
  'Règles commandes standard',
  15,
  1000,
  true,
  true,
  true
from public.brands brands
where lower(brands.name) = 'naali'
on conflict (brand_id, name) do update
set
  max_auto_discount_rate = excluded.max_auto_discount_rate,
  max_auto_total_ht = excluded.max_auto_total_ht,
  require_validation_for_new_customer = excluded.require_validation_for_new_customer,
  require_validation_for_whatsapp_orders = excluded.require_validation_for_whatsapp_orders,
  block_missing_catalog_price = excluded.block_missing_catalog_price,
  updated_at = now();

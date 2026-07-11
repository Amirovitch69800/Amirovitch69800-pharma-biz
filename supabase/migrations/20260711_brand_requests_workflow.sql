create table if not exists public.brand_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  request_type text not null,
  zone text,
  objective text not null,
  target_pharmacies integer default 0,
  desired_date date,
  budget_ht numeric(12,2) default 0,
  brief text,
  status text not null default 'submitted' check (status in ('draft','submitted','qualifying','approved','sourcing','profiles_proposed','assigned','in_progress','to_validate','completed','rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.field_missions add column if not exists brand_request_id uuid null references public.brand_requests(id) on delete set null;
alter table public.field_missions add column if not exists provider_role text default 'animateur';
alter table public.field_missions add column if not exists proof_status text default 'pending';

create index if not exists brand_requests_brand_id_idx on public.brand_requests(brand_id);
create index if not exists brand_requests_status_idx on public.brand_requests(status);
create index if not exists field_missions_brand_request_id_idx on public.field_missions(brand_request_id);

alter table public.brand_requests enable row level security;

create policy "brand users read own requests" on public.brand_requests
for select to authenticated using (created_by = auth.uid() or exists (
  select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, p.user_type, p.account_type, '')) in ('admin','admin_pharmabiz','pharmabiz')
));

create policy "brand users create requests" on public.brand_requests
for insert to authenticated with check (created_by = auth.uid());

create policy "brand users update own drafts" on public.brand_requests
for update to authenticated using (created_by = auth.uid() or exists (
  select 1 from public.profiles p where p.id = auth.uid() and lower(coalesce(p.role, p.user_type, p.account_type, '')) in ('admin','admin_pharmabiz','pharmabiz')
));

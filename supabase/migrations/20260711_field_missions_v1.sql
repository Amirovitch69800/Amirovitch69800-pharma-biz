create extension if not exists pgcrypto;

create table if not exists public.field_animators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  zones text[] not null default '{}',
  daily_rate_ht numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive','pending')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.field_missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mission_type text not null default 'animation' check (mission_type in ('animation','formation','merchandising','audit')),
  pharmacy_id uuid references public.pharmacies(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  animator_id uuid references public.field_animators(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','proposed','assigned','accepted','completed','validated','cancelled')),
  objective text,
  brief text,
  fee_ht numeric(12,2) not null default 0,
  units_sold integer not null default 0,
  revenue_ht numeric(12,2) not null default 0,
  report text,
  payment_status text not null default 'pending' check (payment_status in ('pending','approved','invoiced','paid')),
  completed_at timestamptz,
  validated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_missions_animator_idx on public.field_missions(animator_id);
create index if not exists field_missions_pharmacy_idx on public.field_missions(pharmacy_id);
create index if not exists field_missions_brand_idx on public.field_missions(brand_id);
create index if not exists field_missions_starts_at_idx on public.field_missions(starts_at);

alter table public.field_animators enable row level security;
alter table public.field_missions enable row level security;

create policy "authenticated users can read field animators" on public.field_animators for select to authenticated using (true);
create policy "authenticated users can create field animators" on public.field_animators for insert to authenticated with check (true);
create policy "authenticated users can update field animators" on public.field_animators for update to authenticated using (true) with check (true);

create policy "authenticated users can read field missions" on public.field_missions for select to authenticated using (true);
create policy "authenticated users can create field missions" on public.field_missions for insert to authenticated with check (true);
create policy "authenticated users can update field missions" on public.field_missions for update to authenticated using (true) with check (true);

comment on table public.field_animators is 'Independent field animators and trainers available for pharmacy missions.';
comment on table public.field_missions is 'Animations, trainings, merchandising visits and audits assigned to field workers.';

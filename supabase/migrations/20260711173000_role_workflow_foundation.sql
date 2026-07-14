create extension if not exists pgcrypto;

create or replace function public.current_profile_role()
returns text
language sql
stable
as $$
  select coalesce(
    (select role::text from public.profiles where id = (select auth.uid())),
    'agent'
  );
$$;

create or replace function public.is_pharmabiz_admin()
returns boolean
language sql
stable
as $$
  select public.current_profile_role() in ('admin', 'pharmabiz', 'admin_pharmabiz');
$$;

alter table if exists public.brand_requests
  add column if not exists targeted_pharmacies jsonb not null default '[]'::jsonb,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists documents jsonb not null default '[]'::jsonb,
  add column if not exists constraints_text text,
  add column if not exists expected_deliverables text,
  add column if not exists internal_notes text,
  add column if not exists qualified_by uuid references public.profiles(id) on delete set null,
  add column if not exists qualified_at timestamptz;

alter table if exists public.brand_requests
  drop constraint if exists brand_requests_status_check;

alter table if exists public.brand_requests
  add constraint brand_requests_status_check
  check (status in (
    'draft',
    'submitted',
    'qualifying',
    'waiting_for_information',
    'approved',
    'campaign_preparation',
    'sourcing',
    'profiles_proposed',
    'assigned',
    'in_progress',
    'to_validate',
    'completed',
    'rejected',
    'cancelled'
  ));

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  brand_request_id uuid references public.brand_requests(id) on delete set null,
  name text not null,
  objective text,
  zones text[] not null default '{}',
  starts_on date,
  ends_on date,
  budget_ht numeric(12,2),
  products jsonb not null default '[]'::jsonb,
  target text,
  pharmacy_count integer not null default 0,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'staffing', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.field_missions(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  animator_id uuid references public.field_animators(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'refused', 'assigned', 'cancelled')),
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_reports (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.field_missions(id) on delete cascade,
  assignment_id uuid references public.mission_assignments(id) on delete set null,
  report_type text not null default 'field',
  payload jsonb not null default '{}'::jsonb,
  comment text,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'under_review', 'validated', 'rejected')),
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mission_proofs (
  id uuid primary key default gen_random_uuid(),
  mission_report_id uuid not null references public.mission_reports(id) on delete cascade,
  file_url text not null,
  proof_type text not null default 'photo',
  status text not null default 'pending' check (status in ('pending', 'valid', 'rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  object_table text not null,
  object_id uuid,
  old_value jsonb,
  new_value jsonb,
  comment text,
  ip_address inet,
  created_at timestamptz not null default now()
);

alter table if exists public.field_missions
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists role_required text,
  add column if not exists address text,
  add column if not exists pharmacy_contact text,
  add column if not exists quantitative_goals jsonb not null default '{}'::jsonb,
  add column if not exists qualitative_goals text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists documents jsonb not null default '[]'::jsonb,
  add column if not exists expenses_ht numeric(12,2) not null default 0,
  add column if not exists expected_proofs jsonb not null default '[]'::jsonb,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists payable_at timestamptz;

alter table if exists public.field_missions
  drop constraint if exists field_missions_status_check;

alter table if exists public.field_missions
  add constraint field_missions_status_check
  check (status in (
    'draft',
    'approved',
    'published',
    'proposed',
    'accepted',
    'refused',
    'assigned',
    'confirmed',
    'scheduled',
    'in_progress',
    'report_submitted',
    'under_review',
    'completed',
    'validated',
    'payable',
    'paid',
    'cancelled'
  ));

create index if not exists brand_requests_brand_status_idx on public.brand_requests(brand_id, status);
create index if not exists campaigns_brand_status_idx on public.campaigns(brand_id, status);
create index if not exists campaigns_request_idx on public.campaigns(brand_request_id);
create index if not exists field_missions_campaign_idx on public.field_missions(campaign_id);
create index if not exists mission_assignments_mission_idx on public.mission_assignments(mission_id);
create index if not exists mission_assignments_animator_idx on public.mission_assignments(animator_id);
create index if not exists mission_reports_mission_idx on public.mission_reports(mission_id);
create index if not exists audit_logs_object_idx on public.audit_logs(object_table, object_id);

alter table public.campaigns enable row level security;
alter table public.mission_assignments enable row level security;
alter table public.mission_reports enable row level security;
alter table public.mission_proofs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "authenticated users can create field animators" on public.field_animators;
drop policy if exists "authenticated users can update field animators" on public.field_animators;
drop policy if exists "authenticated users can read field animators" on public.field_animators;
drop policy if exists "authenticated users can read field missions" on public.field_missions;
drop policy if exists "authenticated users can create field missions" on public.field_missions;
drop policy if exists "authenticated users can update field missions" on public.field_missions;

drop policy if exists "field animators visible by role" on public.field_animators;
create policy "field animators visible by role"
  on public.field_animators
  for select
  to authenticated
  using (public.is_pharmabiz_admin() or user_id = (select auth.uid()));

drop policy if exists "pharmabiz admins manage field animators" on public.field_animators;
create policy "pharmabiz admins manage field animators"
  on public.field_animators
  for all
  to authenticated
  using (public.is_pharmabiz_admin())
  with check (public.is_pharmabiz_admin());

drop policy if exists "field missions visible by workflow role" on public.field_missions;
create policy "field missions visible by workflow role"
  on public.field_missions
  for select
  to authenticated
  using (
    public.is_pharmabiz_admin()
    or exists (
      select 1
      from public.field_animators animator
      where animator.id = field_missions.animator_id
        and animator.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.brand_requests request
      join public.campaigns campaign on campaign.brand_request_id = request.id
      where campaign.id = field_missions.campaign_id
        and request.created_by = (select auth.uid())
    )
  );

drop policy if exists "pharmabiz admins create field missions" on public.field_missions;
create policy "pharmabiz admins create field missions"
  on public.field_missions
  for insert
  to authenticated
  with check (public.is_pharmabiz_admin());

drop policy if exists "pharmabiz admins update field missions" on public.field_missions;
create policy "pharmabiz admins update field missions"
  on public.field_missions
  for update
  to authenticated
  using (public.is_pharmabiz_admin())
  with check (public.is_pharmabiz_admin());

drop policy if exists "assigned providers update their mission execution" on public.field_missions;
create policy "assigned providers update their mission execution"
  on public.field_missions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.field_animators animator
      where animator.id = field_missions.animator_id
        and animator.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.field_animators animator
      where animator.id = field_missions.animator_id
        and animator.user_id = (select auth.uid())
    )
    and status in ('accepted', 'completed')
  );

drop policy if exists "campaigns visible by workflow role" on public.campaigns;
create policy "campaigns visible by workflow role"
  on public.campaigns
  for select
  to authenticated
  using (
    public.is_pharmabiz_admin()
    or created_by = (select auth.uid())
    or exists (
      select 1 from public.brand_requests request
      where request.id = campaigns.brand_request_id
        and request.created_by = (select auth.uid())
    )
  );

drop policy if exists "pharmabiz admins manage campaigns" on public.campaigns;
create policy "pharmabiz admins manage campaigns"
  on public.campaigns
  for all
  to authenticated
  using (public.is_pharmabiz_admin())
  with check (public.is_pharmabiz_admin());

drop policy if exists "assignments visible to admins and assigned providers" on public.mission_assignments;
create policy "assignments visible to admins and assigned providers"
  on public.mission_assignments
  for select
  to authenticated
  using (
    public.is_pharmabiz_admin()
    or profile_id = (select auth.uid())
    or exists (
      select 1 from public.field_animators animator
      where animator.id = mission_assignments.animator_id
        and animator.user_id = (select auth.uid())
    )
  );

drop policy if exists "pharmabiz admins manage assignments" on public.mission_assignments;
create policy "pharmabiz admins manage assignments"
  on public.mission_assignments
  for all
  to authenticated
  using (public.is_pharmabiz_admin())
  with check (public.is_pharmabiz_admin());

drop policy if exists "reports visible to workflow participants" on public.mission_reports;
create policy "reports visible to workflow participants"
  on public.mission_reports
  for select
  to authenticated
  using (public.is_pharmabiz_admin() or submitted_by = (select auth.uid()));

drop policy if exists "providers create own mission reports" on public.mission_reports;
create policy "providers create own mission reports"
  on public.mission_reports
  for insert
  to authenticated
  with check (submitted_by = (select auth.uid()) or public.is_pharmabiz_admin());

drop policy if exists "pharmabiz admins review mission reports" on public.mission_reports;
create policy "pharmabiz admins review mission reports"
  on public.mission_reports
  for update
  to authenticated
  using (public.is_pharmabiz_admin())
  with check (public.is_pharmabiz_admin());

drop policy if exists "proofs visible to workflow participants" on public.mission_proofs;
create policy "proofs visible to workflow participants"
  on public.mission_proofs
  for select
  to authenticated
  using (public.is_pharmabiz_admin() or created_by = (select auth.uid()));

drop policy if exists "providers create own proofs" on public.mission_proofs;
create policy "providers create own proofs"
  on public.mission_proofs
  for insert
  to authenticated
  with check (created_by = (select auth.uid()) or public.is_pharmabiz_admin());

drop policy if exists "audit logs visible to pharmabiz admins" on public.audit_logs;
create policy "audit logs visible to pharmabiz admins"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_pharmabiz_admin());

grant select, insert, update on public.campaigns to authenticated;
grant select, insert, update on public.mission_assignments to authenticated;
grant select, insert, update on public.mission_reports to authenticated;
grant select, insert on public.mission_proofs to authenticated;
grant select on public.audit_logs to authenticated;

comment on table public.campaigns is 'Operational campaign grouping one brand request into zones, pharmacies, missions and results.';
comment on table public.audit_logs is 'Operational history for status changes, assignments, validations and payments.';

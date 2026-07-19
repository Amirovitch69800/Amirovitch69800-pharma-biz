-- Missions terrain : animations, formations, implantations créées par l'agent
create table if not exists public.missions (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid references public.agents(id) on delete cascade,
  pharmacy_id  uuid references public.pharmacies(id) on delete cascade,
  brand_id     uuid references public.brands(id) on delete set null,
  type         text not null,
  title        text,
  planned_date date,
  notes        text,
  status       text not null default 'draft',
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'missions_type_check'
  ) then
    alter table public.missions
      add constraint missions_type_check
      check (type in ('animation', 'formation', 'implantation', 'merchandising', 'sell_out', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'missions_status_check'
  ) then
    alter table public.missions
      add constraint missions_status_check
      check (status in ('draft', 'requested', 'qualified', 'proposed', 'accepted', 'assigned', 'confirmed', 'scheduled', 'in_progress', 'report_submitted', 'under_review', 'completed', 'validated', 'payable', 'paid', 'refused', 'cancelled'));
  end if;
end $$;

create index if not exists missions_agent_id_idx    on public.missions(agent_id);
create index if not exists missions_pharmacy_id_idx on public.missions(pharmacy_id);
create index if not exists missions_brand_id_idx    on public.missions(brand_id);
create index if not exists missions_status_idx      on public.missions(status);
create index if not exists missions_created_by_idx  on public.missions(created_by);

create or replace function public.set_missions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_missions_updated_at on public.missions;
create trigger set_missions_updated_at
before update on public.missions
for each row
execute function public.set_missions_updated_at();

alter table public.missions enable row level security;

drop policy if exists "Agents can manage their own missions" on public.missions;

create policy "Agents can manage their own missions"
  on public.missions
  for all
  to authenticated
  using (
    (select auth.uid()) = created_by
    or agent_id in (
      select id from public.agents where user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = created_by
    or agent_id in (
      select id from public.agents where user_id = (select auth.uid())
    )
  );

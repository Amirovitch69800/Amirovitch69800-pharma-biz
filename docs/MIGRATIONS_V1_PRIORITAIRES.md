# PharmaBiz — Migrations V1 prioritaires

Date : 2026-07-14

Statut : plan SQL préparatoire, pas une migration exécutable.

Raison :

- la CLI Supabase n'est pas disponible localement ;
- `npx supabase` n'a pas abouti dans l'environnement actuel ;
- conformément au workflow Supabase, ne pas inventer un nom de migration manuellement.

## Migration 1 — Socle rôles et capacités

Nom recommandé :

```bash
supabase migration new v1_roles_capabilities_portfolios
```

Objectifs :

- ajouter `brands.operating_mode` ;
- ajouter `user_capabilities` ;
- ajouter `agent_brand_assignments` ;
- ajouter `agent_portfolios` ;
- conserver compatibilité avec `profiles.role`, `brand_users`, `pharmacies.assigned_agent_id`, `pharmacy_brand_relations.agent_id`.

### SQL cible

```sql
alter table public.brands
  add column if not exists operating_mode text not null default 'pharmabiz_native'
    check (operating_mode in ('connected_crm', 'pharmabiz_native', 'hybrid'));

create table if not exists public.user_capabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null check (capability in (
    'can_sell',
    'can_train',
    'can_animate',
    'can_validate_orders',
    'can_manage_brand',
    'can_view_finance',
    'can_manage_integrations',
    'can_admin'
  )),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, capability)
);

create table if not exists public.agent_brand_assignments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  assignment_type text not null default 'commercial' check (assignment_type in ('commercial', 'mission', 'dedicated', 'temporary')),
  starts_on date,
  ends_on date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, brand_id, assignment_type)
);

create table if not exists public.agent_portfolios (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'transferred', 'ended')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'priority')),
  territory text,
  source text not null default 'manual' check (source in ('manual', 'hubspot', 'import', 'mission', 'backfill')),
  last_contact_at timestamptz,
  next_action_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, pharmacy_id)
);

alter table public.user_capabilities enable row level security;
alter table public.agent_brand_assignments enable row level security;
alter table public.agent_portfolios enable row level security;

create index if not exists user_capabilities_user_idx
  on public.user_capabilities(user_id);

create index if not exists agent_brand_assignments_agent_brand_idx
  on public.agent_brand_assignments(agent_id, brand_id, status);

create index if not exists agent_portfolios_agent_status_idx
  on public.agent_portfolios(agent_id, status);

create index if not exists agent_portfolios_pharmacy_idx
  on public.agent_portfolios(pharmacy_id);
```

### RLS cible

```sql
drop policy if exists "user capabilities visible to self or admin" on public.user_capabilities;
create policy "user capabilities visible to self or admin"
  on public.user_capabilities
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "user capabilities admin write" on public.user_capabilities;
create policy "user capabilities admin write"
  on public.user_capabilities
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "agent brand assignments visible to agent brand or admin" on public.agent_brand_assignments;
create policy "agent brand assignments visible to agent brand or admin"
  on public.agent_brand_assignments
  for select
  to authenticated
  using (
    public.is_admin()
    or agent_id = public.current_agent_id()
    or public.has_brand_access(brand_id)
  );

drop policy if exists "agent brand assignments admin write" on public.agent_brand_assignments;
create policy "agent brand assignments admin write"
  on public.agent_brand_assignments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "agent portfolios visible to owner or admin" on public.agent_portfolios;
create policy "agent portfolios visible to owner or admin"
  on public.agent_portfolios
  for select
  to authenticated
  using (
    public.is_admin()
    or agent_id = public.current_agent_id()
  );

drop policy if exists "agent portfolios admin write" on public.agent_portfolios;
create policy "agent portfolios admin write"
  on public.agent_portfolios
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### Backfill cible

```sql
update public.brands
set operating_mode = 'connected_crm'
where lower(name) = 'naali';

insert into public.user_capabilities (user_id, capability)
select id, 'can_admin'
from public.profiles
where role = 'admin'
on conflict do nothing;

insert into public.user_capabilities (user_id, capability)
select id, 'can_sell'
from public.profiles
where role = 'agent'
on conflict do nothing;

insert into public.user_capabilities (user_id, capability)
select id, 'can_manage_brand'
from public.profiles
where role = 'brand'
on conflict do nothing;

insert into public.agent_portfolios (
  agent_id,
  pharmacy_id,
  priority,
  source,
  last_contact_at,
  next_action_at,
  created_by
)
select distinct
  pbr.agent_id,
  pbr.pharmacy_id,
  case pbr.potential::text
    when 'priority' then 'priority'
    when 'high' then 'high'
    when 'low' then 'low'
    else 'medium'
  end,
  'backfill',
  null,
  pbr.next_action_at,
  pbr.created_by
from public.pharmacy_brand_relations pbr
where pbr.agent_id is not null
on conflict (agent_id, pharmacy_id) do update
set
  priority = excluded.priority,
  next_action_at = coalesce(excluded.next_action_at, public.agent_portfolios.next_action_at),
  updated_at = now();

insert into public.agent_portfolios (
  agent_id,
  pharmacy_id,
  priority,
  source,
  last_contact_at,
  next_action_at,
  created_by
)
select
  pharmacies.assigned_agent_id,
  pharmacies.id,
  case pharmacies.potential::text
    when 'priority' then 'priority'
    when 'high' then 'high'
    when 'low' then 'low'
    else 'medium'
  end,
  'backfill',
  pharmacies.last_contact_at,
  pharmacies.next_follow_up_at,
  pharmacies.created_by
from public.pharmacies
where pharmacies.assigned_agent_id is not null
on conflict (agent_id, pharmacy_id) do nothing;

insert into public.agent_brand_assignments (
  agent_id,
  brand_id,
  assignment_type,
  status,
  created_by
)
select distinct
  pbr.agent_id,
  pbr.brand_id,
  'commercial',
  'active',
  pbr.created_by
from public.pharmacy_brand_relations pbr
where pbr.agent_id is not null
on conflict do nothing;
```

## Migration 2 — Commandes V1 contrôlées

Nom recommandé :

```bash
supabase migration new v1_order_sources_validation
```

Objectifs :

- préparer commandes libres, missions, liens pharmacie, WhatsApp ;
- ajouter validation selon règles ;
- éviter sync CRM directe sans contrôle.

Champs à ajouter :

- `orders.mission_id`
- `orders.source`
- `orders.created_by_type`
- `orders.attributed_agent_id`
- `orders.validation_status`
- `orders.validation_required_reason`
- `orders.external_deal_id`

Table à créer :

- `brand_order_rules`

## Migration 3 — Liens sécurisés pharmacie

Nom recommandé :

```bash
supabase migration new v1_pharmacy_secure_links
```

Tables à créer :

- `public_action_links`
- `pharmacy_link_events`

Contraintes :

- token hashé ou opaque ;
- expiration ;
- action limitée ;
- attribution agent automatique via `agent_portfolios`.

## Migration 4 — Sécurité fonctions Supabase

Nom recommandé :

```bash
supabase migration new harden_security_definer_functions
```

Objectifs :

- corriger warnings advisors ;
- ajouter `set search_path` ;
- révoquer `EXECUTE` des fonctions sensibles pour `anon` quand non nécessaire ;
- documenter fonctions volontairement appelables publiquement.

À traiter en priorité :

- `current_agent_id`
- `has_brand_access`
- `is_admin`
- `recalculate_order_totals`
- fonctions WhatsApp CRM
- fonctions IA.

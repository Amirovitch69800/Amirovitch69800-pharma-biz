create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'outlook', 'google')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disabled')),
  external_account_id text,
  external_account_email text,
  scopes text[] not null default '{}',
  credential_reference text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  object_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  records_processed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null,
  event_type text not null,
  external_object_type text,
  external_object_id text,
  local_object_type text,
  local_object_id uuid,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create schema if not exists integration_private;

create table if not exists integration_private.oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'outlook', 'google')),
  redirect_to text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists integration_private.oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'outlook', 'google')),
  access_token text,
  refresh_token text,
  token_type text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_connections enable row level security;
alter table public.integration_sync_jobs enable row level security;
alter table public.integration_events enable row level security;

drop policy if exists "integration connections are owned by user" on public.integration_connections;
create policy "integration connections are owned by user"
  on public.integration_connections
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "integration jobs readable by connection owner" on public.integration_sync_jobs;
create policy "integration jobs readable by connection owner"
  on public.integration_sync_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.integration_connections connections
      where connections.id = integration_sync_jobs.connection_id
        and connections.user_id = (select auth.uid())
    )
  );

drop policy if exists "integration events readable by connection owner" on public.integration_events;
create policy "integration events readable by connection owner"
  on public.integration_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.integration_connections connections
      where connections.id = integration_events.connection_id
        and connections.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.integration_connections to authenticated;
grant select on public.integration_sync_jobs to authenticated;
grant select on public.integration_events to authenticated;

revoke all on schema integration_private from public, anon, authenticated;
revoke all on all tables in schema integration_private from public, anon, authenticated;

create index if not exists integration_connections_user_provider_idx
  on public.integration_connections (user_id, provider);

create index if not exists integration_sync_jobs_connection_created_idx
  on public.integration_sync_jobs (connection_id, created_at desc);

create index if not exists integration_events_provider_object_idx
  on public.integration_events (provider, external_object_type, external_object_id);

create index if not exists integration_private_oauth_states_lookup_idx
  on integration_private.oauth_states (id, provider, expires_at);

create index if not exists integration_private_oauth_credentials_connection_idx
  on integration_private.oauth_credentials (connection_id, provider);

create or replace function public.get_integration_oauth_credentials(p_connection_id uuid)
returns table (
  id uuid,
  connection_id uuid,
  provider text,
  access_token text,
  refresh_token text,
  token_type text,
  scopes text[],
  expires_at timestamptz,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = integration_private, public
as $$
  select
    credentials.id,
    credentials.connection_id,
    credentials.provider,
    credentials.access_token,
    credentials.refresh_token,
    credentials.token_type,
    credentials.scopes,
    credentials.expires_at,
    credentials.metadata,
    credentials.created_at,
    credentials.updated_at
  from integration_private.oauth_credentials credentials
  where credentials.connection_id = p_connection_id
  order by credentials.created_at desc
  limit 1;
$$;

revoke all on function public.get_integration_oauth_credentials(uuid) from public, anon, authenticated;

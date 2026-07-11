create or replace function public.create_integration_oauth_state(
  p_user_id uuid,
  p_provider text,
  p_redirect_to text
)
returns uuid
language plpgsql
security definer
set search_path = integration_private, public
as $$
declare
  v_state_id uuid;
begin
  insert into integration_private.oauth_states (user_id, provider, redirect_to)
  values (p_user_id, p_provider, p_redirect_to)
  returning id into v_state_id;

  return v_state_id;
end;
$$;

create or replace function public.consume_integration_oauth_state(
  p_state_id uuid
)
returns table (
  state_id uuid,
  user_id uuid,
  provider text,
  redirect_to text
)
language plpgsql
security definer
set search_path = integration_private, public
as $$
begin
  return query
  update integration_private.oauth_states states
    set consumed_at = now()
  where states.id = p_state_id
    and states.consumed_at is null
    and states.expires_at > now()
  returning states.id, states.user_id, states.provider, states.redirect_to;
end;
$$;

create or replace function public.store_integration_oauth_credentials(
  p_connection_id uuid,
  p_provider text,
  p_access_token text,
  p_refresh_token text,
  p_token_type text,
  p_scopes text[],
  p_expires_at timestamptz,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = integration_private, public
as $$
declare
  v_credential_id uuid;
begin
  insert into integration_private.oauth_credentials (
    connection_id,
    provider,
    access_token,
    refresh_token,
    token_type,
    scopes,
    expires_at,
    metadata
  )
  values (
    p_connection_id,
    p_provider,
    p_access_token,
    p_refresh_token,
    p_token_type,
    coalesce(p_scopes, '{}'::text[]),
    p_expires_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_credential_id;

  return v_credential_id;
end;
$$;

revoke all on function public.create_integration_oauth_state(uuid, text, text) from public, anon, authenticated;
revoke all on function public.consume_integration_oauth_state(uuid) from public, anon, authenticated;
revoke all on function public.store_integration_oauth_credentials(uuid, text, text, text, text, text[], timestamptz, jsonb) from public, anon, authenticated;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const providerConfig = {
  hubspot: {
    clientIdEnv: 'HUBSPOT_CLIENT_ID',
    clientSecretEnv: 'HUBSPOT_CLIENT_SECRET',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    tokenInfoUrl: (token: string) => `https://api.hubapi.com/oauth/v1/access-tokens/${token}`,
  },
};

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service configuration is missing.');
  return { supabaseUrl, serviceRoleKey };
}

function redirectWithStatus(redirectTo: string, provider: string, status: string) {
  const url = new URL(redirectTo || 'https://pharma-biz.vercel.app');
  url.searchParams.set('integration', provider);
  url.searchParams.set('status', status);
  return Response.redirect(url.toString(), 303);
}

async function restRequest(path: string, init: RequestInit = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}

async function rpc(functionName: string, body: Record<string, unknown>) {
  return restRequest(`rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function getOAuthState(state: string) {
  const rows = await rpc('consume_integration_oauth_state', { p_state_id: state });
  return rows?.[0] || null;
}

async function exchangeHubSpotCode(code: string) {
  const clientId = Deno.env.get(providerConfig.hubspot.clientIdEnv);
  const clientSecret = Deno.env.get(providerConfig.hubspot.clientSecretEnv);
  const redirectUri = Deno.env.get('INTEGRATION_OAUTH_CALLBACK_URL');
  if (!clientId || !clientSecret || !redirectUri) throw new Error('HubSpot OAuth secrets are not configured.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(providerConfig.hubspot.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getHubSpotTokenInfo(accessToken: string) {
  const response = await fetch(providerConfig.hubspot.tokenInfoUrl(accessToken));
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function upsertConnection(stateRecord: Record<string, string>, token: Record<string, unknown>, tokenInfo: Record<string, unknown>) {
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 1800) * 1000).toISOString();
  const scopes = Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : [];
  const connectionRows = await restRequest('integration_connections?on_conflict=user_id,provider&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: stateRecord.user_id,
      provider: stateRecord.provider,
      status: 'connected',
      external_account_id: tokenInfo.hub_id ? String(tokenInfo.hub_id) : null,
      external_account_email: tokenInfo.user || null,
      scopes,
      metadata: {
        hub_domain: tokenInfo.hub_domain || null,
        app_id: tokenInfo.app_id || null,
        token_user_id: tokenInfo.user_id || null,
      },
      last_synced_at: new Date().toISOString(),
      expires_at: expiresAt,
    }),
  });
  const connection = connectionRows?.[0];
  if (!connection?.id) throw new Error('Unable to persist HubSpot connection.');

  const credentialId = await rpc('store_integration_oauth_credentials', {
    p_connection_id: connection.id,
    p_provider: stateRecord.provider,
    p_access_token: token.access_token || null,
    p_refresh_token: token.refresh_token || null,
    p_token_type: token.token_type || 'bearer',
    p_scopes: scopes,
    p_expires_at: expiresAt,
    p_metadata: {
      hub_id: tokenInfo.hub_id || null,
      hub_domain: tokenInfo.hub_domain || null,
    },
  });
  if (credentialId) {
    await restRequest(`integration_connections?id=eq.${connection.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ credential_reference: credentialId }),
    });
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return Response.json({ error: 'Missing OAuth code or state.' }, { status: 400, headers: corsHeaders });
  }

  const stateRecord = await getOAuthState(state);
  if (!stateRecord) {
    return Response.json({ error: 'OAuth state is invalid or expired.' }, { status: 400, headers: corsHeaders });
  }

  try {
    if (stateRecord.provider !== 'hubspot') {
      throw new Error('Only HubSpot callback is active for now.');
    }
    const token = await exchangeHubSpotCode(code);
    const tokenInfo = await getHubSpotTokenInfo(token.access_token);
    await upsertConnection(stateRecord, token, tokenInfo);
    return redirectWithStatus(stateRecord.redirect_to, stateRecord.provider, 'connected');
  } catch (error) {
    await restRequest('integration_connections?on_conflict=user_id,provider', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: stateRecord.user_id,
        provider: stateRecord.provider,
        status: 'error',
        metadata: { error: error instanceof Error ? error.message : 'Unknown OAuth error' },
      }),
    });
    return redirectWithStatus(stateRecord.redirect_to, stateRecord.provider, 'error');
  }
});

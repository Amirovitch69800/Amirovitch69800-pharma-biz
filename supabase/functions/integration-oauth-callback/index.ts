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
  google: {
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    tokenUrl: 'https://oauth2.googleapis.com/token',
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

async function getExistingRefreshToken(connectionId: string) {
  try {
    const rows = await rpc('get_integration_oauth_credentials', { p_connection_id: connectionId });
    return rows?.[0]?.refresh_token || null;
  } catch {
    return null;
  }
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

async function exchangeGoogleCode(code: string) {
  const clientId = Deno.env.get(providerConfig.google.clientIdEnv);
  const clientSecret = Deno.env.get(providerConfig.google.clientSecretEnv);
  const redirectUri = Deno.env.get('INTEGRATION_OAUTH_CALLBACK_URL');
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Google OAuth secrets are not configured.');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(providerConfig.google.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function upsertConnection(stateRecord: Record<string, string>, token: Record<string, unknown>, tokenInfo: Record<string, unknown>) {
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 1800) * 1000).toISOString();
  const scopes = Array.isArray(tokenInfo.scopes)
    ? tokenInfo.scopes
    : String(token.scope || '').split(' ').filter(Boolean);
  const isGoogle = stateRecord.provider === 'google';
  const connectionRows = await restRequest('integration_connections?on_conflict=user_id,provider&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: stateRecord.user_id,
      provider: stateRecord.provider,
      status: 'connected',
      external_account_id: isGoogle ? String(tokenInfo.id || tokenInfo.sub || '') || null : tokenInfo.hub_id ? String(tokenInfo.hub_id) : null,
      external_account_email: isGoogle ? tokenInfo.email || null : tokenInfo.user || null,
      scopes,
      metadata: {
        hub_domain: isGoogle ? null : tokenInfo.hub_domain || null,
        app_id: isGoogle ? null : tokenInfo.app_id || null,
        token_user_id: isGoogle ? tokenInfo.id || null : tokenInfo.user_id || null,
        name: tokenInfo.name || null,
        verified_email: tokenInfo.verified_email || null,
      },
      last_synced_at: new Date().toISOString(),
      expires_at: expiresAt,
    }),
  });
  const connection = connectionRows?.[0];
  if (!connection?.id) throw new Error(`Unable to persist ${stateRecord.provider} connection.`);

  const previousRefreshToken = token.refresh_token ? null : await getExistingRefreshToken(connection.id);
  const credentialId = await rpc('store_integration_oauth_credentials', {
    p_connection_id: connection.id,
    p_provider: stateRecord.provider,
    p_access_token: token.access_token || null,
    p_refresh_token: token.refresh_token || previousRefreshToken,
    p_token_type: token.token_type || 'bearer',
    p_scopes: scopes,
    p_expires_at: expiresAt,
    p_metadata: {
      hub_id: tokenInfo.hub_id || null,
      hub_domain: tokenInfo.hub_domain || null,
      google_user_id: isGoogle ? tokenInfo.id || null : null,
      email: tokenInfo.email || null,
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

  let stateRecord: Record<string, string> | null = null;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return Response.json({ error: 'Missing OAuth code or state.' }, { status: 400, headers: corsHeaders });
    }

    stateRecord = await getOAuthState(state);
    if (!stateRecord) {
      return Response.json({ error: 'OAuth state is invalid or expired.' }, { status: 400, headers: corsHeaders });
    }

    if (stateRecord.provider === 'hubspot') {
      const token = await exchangeHubSpotCode(code);
      const tokenInfo = await getHubSpotTokenInfo(token.access_token);
      await upsertConnection(stateRecord, token, tokenInfo);
      return redirectWithStatus(stateRecord.redirect_to, stateRecord.provider, 'connected');
    }
    if (stateRecord.provider === 'google') {
      const token = await exchangeGoogleCode(code);
      const tokenInfo = {
        email: null,
        id: null,
        name: null,
        scopes: String(token.scope || '').split(' ').filter(Boolean),
      };
      await upsertConnection(stateRecord, token, tokenInfo);
      return redirectWithStatus(stateRecord.redirect_to, stateRecord.provider, 'connected');
    }
    throw new Error(`Unsupported OAuth provider: ${stateRecord.provider}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OAuth error';
    if (stateRecord?.user_id && stateRecord?.provider) {
      try {
        await restRequest('integration_connections?on_conflict=user_id,provider', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            user_id: stateRecord.user_id,
            provider: stateRecord.provider,
            status: 'error',
            metadata: { error: message },
          }),
        });
      } catch {
        // Keep the OAuth callback user-facing instead of returning a raw 500.
      }
      return redirectWithStatus(stateRecord.redirect_to, stateRecord.provider, 'error');
    }
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});

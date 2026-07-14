const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const providers = {
  hubspot: {
    authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
    clientIdEnv: 'HUBSPOT_CLIENT_ID',
    scopes: ['crm.objects.companies.read', 'crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.objects.notes.write'],
  },
  outlook: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    scopes: ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.ReadWrite', 'Contacts.Read'],
  },
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  },
};

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service configuration is missing.');
  return { supabaseUrl, serviceRoleKey };
}

async function getUserId(authorization: string) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id || null;
}

async function rpc(functionName: string, body: Record<string, unknown>) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function persistOAuthState(userId: string, provider: string, redirectTo: string) {
  return rpc('create_integration_oauth_state', {
    p_user_id: userId,
    p_provider: provider,
    p_redirect_to: redirectTo,
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return Response.json({ error: 'Missing authenticated session.' }, { status: 401, headers: corsHeaders });
  }
  const userId = await getUserId(authorization);
  if (!userId) {
    return Response.json({ error: 'Invalid authenticated session.' }, { status: 401, headers: corsHeaders });
  }

  const { provider, redirectTo } = await request.json().catch(() => ({}));
  const config = providers[provider as keyof typeof providers];
  if (!config) {
    return Response.json({ error: 'Unsupported integration provider.' }, { status: 400, headers: corsHeaders });
  }

  const clientId = Deno.env.get(config.clientIdEnv);
  const callbackUrl = Deno.env.get('INTEGRATION_OAUTH_CALLBACK_URL');
  if (!clientId || !callbackUrl) {
    const missing = [
      !clientId ? config.clientIdEnv : null,
      !callbackUrl ? 'INTEGRATION_OAUTH_CALLBACK_URL' : null,
    ].filter(Boolean).join(', ');
    return Response.json({ error: `OAuth ${provider} non configuré : variable(s) manquante(s) ${missing}.` }, { status: 412, headers: corsHeaders });
  }

  const state = await persistOAuthState(userId, provider, redirectTo || 'https://pharma-biz.vercel.app');
  const url = new URL(config.authorizationUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);
  if (provider === 'google') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
  }

  return Response.json({ authorizationUrl: url.toString(), state }, { headers: corsHeaders });
});

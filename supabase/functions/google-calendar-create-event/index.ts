const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type IntegrationConnection = {
  id: string;
  user_id: string;
  provider: string;
  status: string;
};

type OAuthCredential = {
  id: string;
  connection_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  scopes: string[];
  expires_at: string | null;
  metadata: Record<string, unknown>;
};

type AgentRow = {
  id: string;
};

type ActivityRow = {
  id: string;
  pharmacy_id: string | null;
  brand_id: string | null;
  agent_id: string | null;
  activity_type: string;
  activity_date: string;
  title: string | null;
  notes: string | null;
};

type PharmacyRow = {
  id: string;
  name: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSupabaseConfig(): SupabaseConfig {
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

async function supabaseRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null as T;
  return response.json();
}

async function rpc<T>(functionName: string, body: Record<string, unknown>) {
  return supabaseRest<T>(`rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function getAgent(userId: string) {
  const rows = await supabaseRest<AgentRow[]>(`agents?select=id&user_id=eq.${userId}&limit=1`);
  return rows[0] || null;
}

async function getGoogleConnection(userId: string) {
  const rows = await supabaseRest<IntegrationConnection[]>(`integration_connections?select=*&user_id=eq.${userId}&provider=eq.google&status=eq.connected&limit=1`);
  return rows[0] || null;
}

async function getCredential(connectionId: string) {
  const rows = await rpc<OAuthCredential[]>('get_integration_oauth_credentials', { p_connection_id: connectionId });
  return rows?.[0] || null;
}

async function storeCredential(connection: IntegrationConnection, token: Record<string, unknown>, previous: OAuthCredential) {
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  const scopes = String(token.scope || previous.scopes?.join(' ') || '').split(' ').filter(Boolean);
  const credentialId = await rpc<string>('store_integration_oauth_credentials', {
    p_connection_id: connection.id,
    p_provider: 'google',
    p_access_token: token.access_token || previous.access_token,
    p_refresh_token: token.refresh_token || previous.refresh_token,
    p_token_type: token.token_type || previous.token_type || 'bearer',
    p_scopes: scopes,
    p_expires_at: expiresAt,
    p_metadata: previous.metadata || {},
  });
  await supabaseRest(`integration_connections?id=eq.${connection.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      credential_reference: credentialId,
      expires_at: expiresAt,
      scopes,
    }),
  });
  return { ...previous, access_token: String(token.access_token || previous.access_token || ''), expires_at: expiresAt, scopes };
}

async function refreshGoogleToken(connection: IntegrationConnection, credential: OAuthCredential) {
  const expiresAt = credential.expires_at ? new Date(credential.expires_at).getTime() : 0;
  if (credential.access_token && expiresAt > Date.now() + 60_000) return credential;
  if (!credential.refresh_token) throw new Error('Google Calendar doit être reconnecté : refresh token absent.');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Google OAuth secrets are not configured.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credential.refresh_token,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return storeCredential(connection, await response.json(), credential);
}

function getEndDate(startAt: string, durationMinutes: number) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new Error('Date de visite invalide.');
  return new Date(start.getTime() + Math.min(480, Math.max(15, durationMinutes || 45)) * 60_000);
}

function buildLocation(pharmacy: PharmacyRow | null) {
  return [pharmacy?.address_line1, pharmacy?.postal_code, pharmacy?.city].filter(Boolean).join(', ');
}

async function createGoogleEvent(accessToken: string, activity: ActivityRow, pharmacy: PharmacyRow | null, durationMinutes: number) {
  const startAt = activity.activity_date;
  const endAt = getEndDate(startAt, durationMinutes);
  const title = activity.title || `Visite · ${pharmacy?.name || 'Pharmacie'}`;
  const location = buildLocation(pharmacy);
  const description = [
    activity.notes,
    pharmacy?.name ? `Pharmacie : ${pharmacy.name}` : null,
    'Créé depuis PharmaBiz.',
  ].filter(Boolean).join('\n\n');

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: title,
      location: location || undefined,
      description,
      start: { dateTime: new Date(startAt).toISOString(), timeZone: 'Europe/Paris' },
      end: { dateTime: endAt.toISOString(), timeZone: 'Europe/Paris' },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 30 }],
      },
      extendedProperties: {
        private: {
          pharmabiz_activity_id: activity.id,
          pharmabiz_pharmacy_id: activity.pharmacy_id || '',
        },
      },
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function storeEvent(connectionId: string, activity: ActivityRow, event: Record<string, unknown>) {
  return supabaseRest('integration_events?select=id', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: connectionId,
      provider: 'google',
      event_type: 'calendar_event_created',
      external_object_type: 'calendar_event',
      external_object_id: event.id,
      local_object_type: 'activity',
      local_object_id: activity.id,
      payload: event,
      processed_at: new Date().toISOString(),
    }),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Missing authenticated session.' }, 401);

    const userId = await getUserId(authorization);
    if (!userId) return jsonResponse({ error: 'Invalid authenticated session.' }, 401);

    const { activityId, durationMinutes = 45 } = await request.json().catch(() => ({}));
    if (!activityId) return jsonResponse({ error: 'Activité introuvable.' }, 400);

    const agent = await getAgent(userId);
    if (!agent) return jsonResponse({ error: 'Profil agent introuvable.' }, 404);

    const activities = await supabaseRest<ActivityRow[]>(`activities?select=*&id=eq.${activityId}&agent_id=eq.${agent.id}&limit=1`);
    const activity = activities[0] || null;
    if (!activity) return jsonResponse({ error: 'Cette visite n’appartient pas à cet agent.' }, 403);

    const existing = await supabaseRest<Array<{ id: string; external_object_id: string }>>(`integration_events?select=id,external_object_id&provider=eq.google&external_object_type=eq.calendar_event&local_object_type=eq.activity&local_object_id=eq.${activity.id}&limit=1`);
    if (existing[0]?.external_object_id) {
      return jsonResponse({ created: false, externalEventId: existing[0].external_object_id, skipped: 'already_exists' });
    }

    const connection = await getGoogleConnection(userId);
    if (!connection) return jsonResponse({ error: 'Google Agenda non connecté.' }, 404);

    const credential = await getCredential(connection.id);
    if (!credential) return jsonResponse({ error: 'Identifiants Google introuvables. Reconnecte Google Agenda.' }, 404);

    const freshCredential = await refreshGoogleToken(connection, credential);
    if (!freshCredential.access_token) return jsonResponse({ error: 'Token Google absent. Reconnecte Google Agenda.' }, 412);

    const pharmacies = activity.pharmacy_id
      ? await supabaseRest<PharmacyRow[]>(`pharmacies?select=id,name,address_line1,postal_code,city&id=eq.${activity.pharmacy_id}&limit=1`)
      : [];
    const event = await createGoogleEvent(freshCredential.access_token, activity, pharmacies[0] || null, Number(durationMinutes));
    await storeEvent(connection.id, activity, event);
    await supabaseRest(`integration_connections?id=eq.${connection.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
    });

    return jsonResponse({ created: true, externalEventId: event.id, htmlLink: event.htmlLink || null });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erreur création événement Google Calendar.' }, 500);
  }
});

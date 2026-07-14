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
  credential_reference: string | null;
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

type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  organizer?: { email?: string; displayName?: string };
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string }>;
  updated?: string;
};

function normalizeGoogleApiError(message: string) {
  try {
    const payload = JSON.parse(message);
    const error = payload?.error || {};
    const details = Array.isArray(error.details) ? error.details : [];
    const serviceDisabled = details.some((detail) => detail?.reason === 'SERVICE_DISABLED')
      || error.reason === 'SERVICE_DISABLED'
      || error.status === 'PERMISSION_DENIED' && String(error.message || '').includes('Calendar API');
    const activationUrl = details
      .map((detail) => detail?.metadata?.activationUrl)
      .find(Boolean);

    if (serviceDisabled) {
      return [
        'Google Calendar API est désactivée sur ton projet Google Cloud.',
        'Active “Google Calendar API”, attends 1 à 5 minutes, puis relance Sync agenda.',
        activationUrl ? `Lien : ${activationUrl}` : null,
      ].filter(Boolean).join(' ');
    }

    return error.message || message;
  } catch {
    return message;
  }
}

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
      last_synced_at: new Date().toISOString(),
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

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credential.refresh_token,
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await response.text());
  const token = await response.json();
  return storeCredential(connection, token, credential);
}

async function fetchGoogleEvents(accessToken: string, daysAhead: number) {
  const timeMin = new Date();
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());
  url.searchParams.set('maxResults', '100');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(normalizeGoogleApiError(await response.text()));
  const data = await response.json();
  return (data.items || []) as GoogleCalendarEvent[];
}

async function replaceCalendarEvents(connectionId: string, events: GoogleCalendarEvent[]) {
  await supabaseRest(`integration_events?connection_id=eq.${connectionId}&provider=eq.google&external_object_type=eq.calendar_event`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!events.length) return [];
  return supabaseRest('integration_events?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(events.map((event) => ({
      connection_id: connectionId,
      provider: 'google',
      event_type: 'calendar_event_synced',
      external_object_type: 'calendar_event',
      external_object_id: event.id,
      payload: {
        id: event.id,
        status: event.status || null,
        summary: event.summary || 'Rendez-vous',
        title: event.summary || 'Rendez-vous',
        description: event.description || null,
        location: event.location || null,
        htmlLink: event.htmlLink || null,
        start: event.start || null,
        end: event.end || null,
        organizer: event.organizer || null,
        attendees: event.attendees || [],
        updated: event.updated || null,
      },
      processed_at: new Date().toISOString(),
    }))),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Missing authenticated session.' }, 401);

    const userId = await getUserId(authorization);
    if (!userId) return jsonResponse({ error: 'Invalid authenticated session.' }, 401);

    const { daysAhead = 14 } = await request.json().catch(() => ({}));
    const connection = await getGoogleConnection(userId);
    if (!connection) return jsonResponse({ error: 'Google Agenda non connecté.' }, 404);

    const credential = await getCredential(connection.id);
    if (!credential) return jsonResponse({ error: 'Identifiants Google introuvables. Reconnecte Google Agenda.' }, 404);

    const freshCredential = await refreshGoogleToken(connection, credential);
    if (!freshCredential.access_token) return jsonResponse({ error: 'Token Google absent. Reconnecte Google Agenda.' }, 412);

    const events = await fetchGoogleEvents(freshCredential.access_token, Math.min(60, Math.max(1, Number(daysAhead) || 14)));
    const activeEvents = events.filter((event) => event.status !== 'cancelled');
    await replaceCalendarEvents(connection.id, activeEvents);

    await supabaseRest(`integration_connections?id=eq.${connection.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_synced_at: new Date().toISOString() }),
    });

    return jsonResponse({ fetched: events.length, imported: activeEvents.length });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erreur sync Google Calendar.' }, 500);
  }
});

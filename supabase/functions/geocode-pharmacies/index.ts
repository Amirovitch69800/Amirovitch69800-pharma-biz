const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type PharmacyRow = {
  id: string;
  name: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoding_status: string | null;
};

type AgentRow = {
  id: string;
};

type PortfolioRow = {
  pharmacy_id: string;
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

function buildAddressQuery(pharmacy: PharmacyRow) {
  return [pharmacy.address_line1, pharmacy.postal_code, pharmacy.city]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function geocodeAddress(query: string) {
  const url = new URL('https://api-adresse.data.gouv.fr/search/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`BAN ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const feature = data?.features?.[0];
  if (!feature?.geometry?.coordinates?.length) return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  const score = Number(feature.properties?.score || 0);
  return {
    latitude,
    longitude,
    label: feature.properties?.label || query,
    score,
    status: score >= 0.72 ? 'geocoded' : 'approximate',
  };
}

async function getAgentPortfolioPharmacyIds(userId: string) {
  const agents = await supabaseRest<AgentRow[]>(`agents?select=id&user_id=eq.${userId}&limit=1`);
  const agent = agents[0];
  if (!agent) return [];
  const portfolio = await supabaseRest<PortfolioRow[]>(`agent_portfolios?select=pharmacy_id&agent_id=eq.${agent.id}&status=eq.active`);
  return portfolio.map((item) => item.pharmacy_id).filter(Boolean);
}

async function updatePharmacy(id: string, payload: Record<string, unknown>) {
  return supabaseRest<PharmacyRow[]>(`pharmacies?id=eq.${id}&select=id`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Missing authenticated session.' }, 401);

    const userId = await getUserId(authorization);
    if (!userId) return jsonResponse({ error: 'Invalid authenticated session.' }, 401);

    const { limit = 25, force = false } = await request.json().catch(() => ({}));
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const pharmacyIds = await getAgentPortfolioPharmacyIds(userId);
    if (!pharmacyIds.length) return jsonResponse({ processed: 0, geocoded: 0, approximate: 0, errors: 0, skipped: 0 });

    const idFilter = pharmacyIds.map((id) => `id.eq.${id}`).join(',');
    const portfolioPharmacies = await supabaseRest<PharmacyRow[]>(`pharmacies?select=id,name,address_line1,postal_code,city,latitude,longitude,geocoding_status&or=(${idFilter})`);
    const pharmacies = portfolioPharmacies
      .filter((pharmacy) => force || !pharmacy.latitude || !pharmacy.longitude || ['pending', 'error'].includes(pharmacy.geocoding_status || 'pending'))
      .slice(0, safeLimit);

    const result = { processed: 0, geocoded: 0, approximate: 0, errors: 0, skipped: 0 };

    for (const pharmacy of pharmacies) {
      result.processed += 1;
      const query = buildAddressQuery(pharmacy);
      if (!query) {
        await updatePharmacy(pharmacy.id, {
          geocoding_status: 'skipped',
          geocoding_provider: 'ban',
          geocoding_error: 'Adresse absente',
          geocoded_at: new Date().toISOString(),
        });
        result.skipped += 1;
        continue;
      }

      try {
        const geocoded = await geocodeAddress(query);
        if (!geocoded) {
          await updatePharmacy(pharmacy.id, {
            geocoding_status: 'error',
            geocoding_provider: 'ban',
            geocoding_error: 'Aucun résultat BAN',
            geocoded_at: new Date().toISOString(),
          });
          result.errors += 1;
          continue;
        }

        await updatePharmacy(pharmacy.id, {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          geocoding_status: geocoded.status,
          geocoding_provider: 'ban',
          geocoding_score: geocoded.score,
          geocoding_label: geocoded.label,
          geocoding_error: null,
          geocoded_at: new Date().toISOString(),
        });
        if (geocoded.status === 'geocoded') result.geocoded += 1;
        else result.approximate += 1;
      } catch (error) {
        await updatePharmacy(pharmacy.id, {
          geocoding_status: 'error',
          geocoding_provider: 'ban',
          geocoding_error: error instanceof Error ? error.message : 'Erreur géocodage',
          geocoded_at: new Date().toISOString(),
        });
        result.errors += 1;
      }
    }

    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erreur géocodage.' }, 500);
  }
});

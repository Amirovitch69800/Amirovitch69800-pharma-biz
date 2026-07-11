const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type Agent = {
  id: string;
  user_id: string;
};

type Pharmacy = {
  id: string;
  name: string;
  assigned_agent_id: string | null;
  hubspot_company_id: string | null;
};

type BrandIntegration = {
  id: string;
  brand_id: string;
  provider: string;
  status: string;
  config: Record<string, unknown>;
};

type HubSpotDeal = {
  id: string;
  properties?: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
};

type HubSpotSearchResponse = {
  total?: number;
  results?: HubSpotDeal[];
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

function getHubSpotToken() {
  return Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN') || Deno.env.get('HUBSPOT_CLIENT_ID');
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

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
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

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

async function hubspotPost<T>(path: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HubSpot ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

function textConfig(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === 'string' && value ? value : fallback;
}

function parseDiscountRate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace('%', '').replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getAgentForUser(userId: string) {
  const [agent] = await supabaseRest<Agent[]>(`agents?select=id,user_id&user_id=eq.${userId}&limit=1`);
  return agent || null;
}

async function getPharmacy(pharmacyId: string) {
  const [pharmacy] = await supabaseRest<Pharmacy[]>(
    `pharmacies?select=id,name,assigned_agent_id,hubspot_company_id&id=eq.${pharmacyId}&limit=1`,
  );
  return pharmacy || null;
}

async function getBrandIntegration(brandId: string) {
  const [integration] = await supabaseRest<BrandIntegration[]>(
    `brand_integrations?select=*&brand_id=eq.${brandId}&provider=eq.hubspot&status=eq.active&limit=1`,
  );
  return integration || null;
}

async function fetchDealsForCompany(companyId: string, integration: BrandIntegration, token: string) {
  const config = integration.config || {};
  const pipelineId = textConfig(config, 'pipeline_id', '1543644371');

  return hubspotPost<HubSpotSearchResponse>('/crm/v3/objects/deals/search', token, {
    limit: 50,
    properties: [
      'dealname',
      'amount',
      'montant_total',
      'remise____',
      'type_de_commande',
      'dealstage',
      'pipeline',
      'createdate',
      'closedate',
      'hubspot_owner_id',
    ],
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'associations.company',
            operator: 'EQ',
            value: companyId,
          },
          {
            propertyName: 'pipeline',
            operator: 'EQ',
            value: pipelineId,
          },
        ],
      },
    ],
    sorts: [
      {
        propertyName: 'createdate',
        direction: 'DESCENDING',
      },
    ],
  });
}

function mapDeal(deal: HubSpotDeal) {
  const properties = deal.properties || {};
  const amount = properties.amount || properties.montant_total || null;
  return {
    id: deal.id,
    name: properties.dealname || 'Commande HubSpot',
    amount: amount ? Number(amount) : null,
    discountLabel: properties.remise____ || null,
    discountRate: parseDiscountRate(properties.remise____),
    orderType: properties.type_de_commande || null,
    stage: properties.dealstage || null,
    createdAt: properties.createdate || deal.createdAt || null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authenticated session.' }, 401);
  }

  const userId = await getUserId(authorization);
  if (!userId) return jsonResponse({ error: 'Invalid authenticated session.' }, 401);

  const token = getHubSpotToken();
  if (!token) return jsonResponse({ error: 'HubSpot private app token is missing.' }, 412);

  const { pharmacyId, brandId } = await request.json().catch(() => ({}));
  if (!pharmacyId || !brandId) return jsonResponse({ error: 'pharmacyId and brandId are required.' }, 400);

  const agent = await getAgentForUser(userId);
  if (!agent) return jsonResponse({ error: 'Profil agent introuvable.' }, 403);

  const pharmacy = await getPharmacy(pharmacyId);
  if (!pharmacy) return jsonResponse({ error: 'Pharmacie introuvable.' }, 404);
  if (pharmacy.assigned_agent_id && pharmacy.assigned_agent_id !== agent.id) {
    return jsonResponse({ error: 'Pharmacie non autorisée pour cet agent.' }, 403);
  }

  const integration = await getBrandIntegration(brandId);
  if (!integration || !pharmacy.hubspot_company_id) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: !integration ? 'Aucun connecteur HubSpot actif pour cette marque.' : 'Pharmacie non liée à HubSpot.',
      lastDiscountRate: null,
      deals: [],
    });
  }

  try {
    const response = await fetchDealsForCompany(pharmacy.hubspot_company_id, integration, token);
    const deals = (response.results || []).map(mapDeal);
    const lastDiscountDeal = deals.find((deal) => deal.discountRate !== null);

    return jsonResponse({
      ok: true,
      hubspotCompanyId: pharmacy.hubspot_company_id,
      total: response.total || deals.length,
      lastDiscountRate: lastDiscountDeal?.discountRate ?? null,
      lastDiscountLabel: lastDiscountDeal?.discountLabel || null,
      lastDeal: deals[0] || null,
      inspectedDeals: deals.length,
      deals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot customer context failed.';
    return jsonResponse({ error: message }, 502);
  }
});

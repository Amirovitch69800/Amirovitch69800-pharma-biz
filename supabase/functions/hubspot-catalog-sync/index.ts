const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HubSpotObject = {
  id: string;
  properties?: Record<string, string | null>;
};

type HubSpotListResponse = {
  results?: HubSpotObject[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type BrandIntegration = {
  id: string;
  brand_id: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSupabaseConfig() {
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

async function hubspotGet<T>(path: string, token: string) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HubSpot ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',');
}

async function fetchProductsPage(token: string, after = '') {
  const params = new URLSearchParams({
    limit: '100',
    properties: ['name', 'hs_sku', 'price', 'description', 'hs_url', 'hs_lastmodifieddate'].join(','),
    archived: 'false',
  });
  if (after) params.set('after', after);
  return hubspotGet<HubSpotListResponse>(`/crm/v3/objects/products?${params.toString()}`, token);
}

async function fetchAllProducts(token: string) {
  const results: HubSpotObject[] = [];
  let after = '';
  let guard = 0;

  do {
    const page = await fetchProductsPage(token, after);
    results.push(...(page.results || []));
    after = page.paging?.next?.after || '';
    guard += 1;
  } while (after && guard < 25);

  return results;
}

async function getNaaliIntegration() {
  const [integration] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=id,brand_id&provider=eq.hubspot&status=eq.active&display_name=ilike.*Naali*&limit=1',
  );
  if (integration) return integration;
  const [fallback] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=id,brand_id&provider=eq.hubspot&status=eq.active&limit=1',
  );
  return fallback || null;
}

function numberOrNull(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferProductCategory(product: HubSpotObject) {
  const properties = product.properties || {};
  const text = `${properties.name || ''} ${properties.description || ''} ${properties.hs_sku || ''}`.toLowerCase();
  if (text.includes('plv') || text.includes('présentoir') || text.includes('presentoir') || text.includes('catalogue') || text.includes('stop rayon')) return 'PLV';
  if (text.includes('échantillon') || text.includes('echantillon') || text.includes('sample')) return 'Échantillon';
  if (text.startsWith('ug ') || text.includes(' ug ')) return 'UG';
  if (text.startsWith('up ') || text.includes(' up ')) return 'UP';
  if (text.includes('vrac') || text.includes('pot ') || text.includes('couvercle') || text.includes('doypack')) return 'Composant';
  return 'Produit';
}

function mapProduct(product: HubSpotObject, brandId: string) {
  const properties = product.properties || {};
  const price = numberOrNull(properties.price);
  return {
    brand_id: brandId,
    hubspot_product_id: product.id,
    source_provider: 'hubspot',
    hubspot_sync_status: 'active',
    name: properties.name?.trim() || `HubSpot product ${product.id}`,
    reference: properties.hs_sku || null,
    category: inferProductCategory(product),
    unit_price_ht: price ?? 0,
    public_price_ttc: price ? Number((price * 1.2).toFixed(2)) : null,
    vat_rate: 20,
    is_active: true,
    notes: properties.description || null,
    updated_at: new Date().toISOString(),
  };
}

async function importProducts(products: HubSpotObject[], brandId: string) {
  if (products.length === 0) return { created: 0, updated: 0 };

  const ids = products.map((product) => product.id);
  const existingRows = await supabaseRest<Array<{ id: string; hubspot_product_id: string }>>(
    `products?select=id,hubspot_product_id&brand_id=eq.${brandId}&hubspot_product_id=in.(${encodeInFilter(ids)})`,
  );
  const existingByHubSpotId = new Map(existingRows.map((row) => [row.hubspot_product_id, row.id]));
  const mappedProducts = products.map((product) => mapProduct(product, brandId));
  const toUpdate = mappedProducts
    .filter((product) => existingByHubSpotId.has(product.hubspot_product_id))
    .map((product) => ({ ...product, id: existingByHubSpotId.get(product.hubspot_product_id) }));
  const toCreate = mappedProducts.filter((product) => !existingByHubSpotId.has(product.hubspot_product_id));

  await Promise.all(toUpdate.map((product) => supabaseRest(`products?id=eq.${product.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(product),
  })));

  if (toCreate.length > 0) {
    await supabaseRest('products', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(toCreate),
    });
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Missing authenticated session.' }, 401);

  const userId = await getUserId(authorization);
  if (!userId) return jsonResponse({ error: 'Invalid authenticated session.' }, 401);

  const token = getHubSpotToken();
  if (!token) return jsonResponse({ error: 'HubSpot private app token is missing.' }, 412);

  try {
    const integration = await getNaaliIntegration();
    if (!integration) return jsonResponse({ error: 'Connecteur Naali HubSpot introuvable.' }, 412);

    const products = await fetchAllProducts(token);
    const result = await importProducts(products, integration.brand_id);

    return jsonResponse({
      ok: true,
      provider: 'hubspot',
      brandId: integration.brand_id,
      products: {
        fetched: products.length,
        created: result.created,
        updated: result.updated,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot catalog sync failed.';
    return jsonResponse({ error: message }, 502);
  }
});

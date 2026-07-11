const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HubSpotObject = {
  id: string;
  properties?: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
};

type HubSpotListResponse = {
  results?: HubSpotObject[];
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type HubSpotOwnersResponse = {
  results?: Array<{
    id: string;
    email?: string;
    userId?: number;
  }>;
};

type BrandIntegration = {
  id: string;
  brand_id: string;
  config?: Record<string, unknown>;
};

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
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

function getHubSpotOwnerConfig() {
  return {
    ownerId: Deno.env.get('HUBSPOT_OWNER_ID') || '',
    ownerEmail: Deno.env.get('HUBSPOT_OWNER_EMAIL') || '',
  };
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

async function resolveHubSpotOwnerId(token: string) {
  const { ownerId, ownerEmail } = getHubSpotOwnerConfig();
  if (ownerId) return ownerId;
  if (!ownerEmail) return '';

  const owners = await hubspotGet<HubSpotOwnersResponse>(
    `/crm/v3/owners?email=${encodeURIComponent(ownerEmail)}`,
    token,
  );
  return owners.results?.[0]?.id || '';
}

async function fetchCompaniesForOwnerPage(token: string, ownerId: string, after = '') {
  return hubspotPost<HubSpotListResponse>('/crm/v3/objects/companies/search', token, {
    limit: 100,
    properties: ['name', 'domain', 'city', 'zip', 'address', 'phone', 'industry', 'hubspot_owner_id'],
    ...(after ? { after } : {}),
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'hubspot_owner_id',
            operator: 'EQ',
            value: ownerId,
          },
        ],
      },
    ],
    sorts: [
      {
        propertyName: 'hs_lastmodifieddate',
        direction: 'DESCENDING',
      },
    ],
  });
}

async function fetchAllCompaniesForOwner(token: string, ownerId: string) {
  const results: HubSpotObject[] = [];
  let after = '';
  let guard = 0;

  do {
    const page = await fetchCompaniesForOwnerPage(token, ownerId, after);
    results.push(...(page.results || []));
    after = page.paging?.next?.after || '';
    guard += 1;
  } while (after && guard < 25);

  return results;
}

async function fetchProductsPage(token: string, after = '') {
  const properties = [
    'name',
    'hs_sku',
    'price',
    'description',
    'hs_url',
    'hs_lastmodifieddate',
  ].join(',');
  const params = new URLSearchParams({
    limit: '100',
    properties,
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

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',');
}

function mapCompanyToPharmacy(company: HubSpotObject, userId: string, ownerId: string) {
  const properties = company.properties || {};
  const name = properties.name?.trim() || `HubSpot company ${company.id}`;
  const notes = [
    'Importé depuis HubSpot.',
    properties.domain ? `Domaine: ${properties.domain}` : '',
    properties.industry ? `Secteur: ${properties.industry}` : '',
  ].filter(Boolean).join('\n');

  return {
    hubspot_company_id: company.id,
    name,
    address_line1: properties.address || null,
    postal_code: properties.zip || null,
    city: properties.city || null,
    phone: properties.phone || null,
    hubspot_owner_id: properties.hubspot_owner_id || ownerId,
    hubspot_sync_status: 'active',
    created_by: userId,
    country: 'France',
    potential: 'medium',
    status: 'prospect',
    notes,
    updated_at: new Date().toISOString(),
  };
}

async function upsertConnection(userId: string, status: 'connected' | 'error', metadata: Record<string, unknown>) {
  const [connection] = await supabaseRest<Array<{ id: string }>>(
    'integration_connections?on_conflict=user_id,provider&select=id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        provider: 'hubspot',
        status,
        external_account_id: 'private_app',
        external_account_email: 'HubSpot Private App',
        scopes: ['private_app_token'],
        credential_reference: 'supabase_secret:HUBSPOT_PRIVATE_APP_TOKEN|HUBSPOT_CLIENT_ID',
        metadata,
        last_synced_at: status === 'connected' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!connection?.id) throw new Error('Unable to persist HubSpot connection.');
  return connection;
}

async function createSyncJob(
  connectionId: string,
  status: 'succeeded' | 'failed',
  recordsProcessed: number,
  metadata: Record<string, unknown>,
  errorMessage?: string,
) {
  await supabaseRest('integration_sync_jobs', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      connection_id: connectionId,
      direction: 'inbound',
      object_type: 'hubspot_companies',
      status,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      error_message: errorMessage || null,
      metadata,
    }),
  });
}

async function importCompanies(companies: HubSpotObject[], userId: string, ownerId: string) {
  if (companies.length === 0) return { created: 0, updated: 0 };

  const ids = companies.map((company) => company.id);
  const existingRows = await supabaseRest<Array<{ id: string; hubspot_company_id: string }>>(
    `pharmacies?select=id,hubspot_company_id&hubspot_company_id=in.(${encodeInFilter(ids)})`,
  );
  const existingByHubSpotId = new Map(existingRows.map((row) => [row.hubspot_company_id, row.id]));
  const mappedCompanies = companies.map((company) => mapCompanyToPharmacy(company, userId, ownerId));
  const toUpdate = mappedCompanies
    .filter((pharmacy) => existingByHubSpotId.has(pharmacy.hubspot_company_id))
    .map((pharmacy) => ({ ...pharmacy, id: existingByHubSpotId.get(pharmacy.hubspot_company_id) }));
  const toCreate = mappedCompanies.filter((pharmacy) => !existingByHubSpotId.has(pharmacy.hubspot_company_id));

  await Promise.all(toUpdate.map((pharmacy) => supabaseRest(`pharmacies?id=eq.${pharmacy.id}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(pharmacy),
  })));

  if (toCreate.length > 0) {
    await supabaseRest('pharmacies', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(toCreate),
    });
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

async function getNaaliIntegration() {
  const [integration] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=id,brand_id,config&provider=eq.hubspot&status=eq.active&display_name=ilike.*Naali*&limit=1',
  );
  if (integration) return integration;

  const [fallback] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=id,brand_id,config&provider=eq.hubspot&status=eq.active&limit=1',
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

function mapProductToPayload(product: HubSpotObject, brandId: string) {
  const properties = product.properties || {};
  const name = properties.name?.trim() || `HubSpot product ${product.id}`;
  const price = numberOrNull(properties.price);

  return {
    brand_id: brandId,
    hubspot_product_id: product.id,
    source_provider: 'hubspot',
    hubspot_sync_status: 'active',
    name,
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

async function importProducts(products: HubSpotObject[]) {
  const integration = await getNaaliIntegration();
  if (!integration) return { fetched: products.length, created: 0, updated: 0, skipped: true };
  if (products.length === 0) return { fetched: 0, created: 0, updated: 0, skipped: false };

  const ids = products.map((product) => product.id);
  const existingRows = await supabaseRest<Array<{ id: string; hubspot_product_id: string }>>(
    `products?select=id,hubspot_product_id&brand_id=eq.${integration.brand_id}&hubspot_product_id=in.(${encodeInFilter(ids)})`,
  );
  const existingByHubSpotId = new Map(existingRows.map((row) => [row.hubspot_product_id, row.id]));
  const mappedProducts = products.map((product) => mapProductToPayload(product, integration.brand_id));
  const toUpdate = mappedProducts
    .filter((product) => existingByHubSpotId.has(product.hubspot_product_id))
    .map((product) => ({ ...product, id: existingByHubSpotId.get(product.hubspot_product_id) }));
  const toCreate = mappedProducts.filter((product) => !existingByHubSpotId.has(product.hubspot_product_id));

  await Promise.all(toUpdate.map((product) => supabaseRest(`products?id=eq.${product.id}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(product),
  })));

  if (toCreate.length > 0) {
    await supabaseRest('products', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(toCreate),
    });
  }

  return { fetched: products.length, created: toCreate.length, updated: toUpdate.length, skipped: false };
}

async function markOutOfScopePharmacies(ownerId: string, activeCompanyIds: string[]) {
  const activeIds = new Set(activeCompanyIds);
  const rows = await supabaseRest<Array<{ id: string; hubspot_company_id: string | null; name: string; notes: string | null }>>(
    'pharmacies?select=id,hubspot_company_id,name,notes&hubspot_company_id=not.is.null&hubspot_sync_status=neq.out_of_scope',
  );
  const outOfScope = rows.filter((row) => row.hubspot_company_id && !activeIds.has(row.hubspot_company_id));

  await Promise.all(outOfScope.map((pharmacy) => {
    const marker = `Hors portefeuille HubSpot owner ${ownerId}.`;
    const notes = pharmacy.notes?.includes(marker) ? pharmacy.notes : [pharmacy.notes, marker].filter(Boolean).join('\n');
    return supabaseRest(`pharmacies?id=eq.${pharmacy.id}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status: 'inactive',
        hubspot_sync_status: 'out_of_scope',
        notes,
        updated_at: new Date().toISOString(),
      }),
    });
  }));

  return outOfScope.length;
}

async function recordSyncEvent(connectionId: string, payload: Record<string, unknown>) {
  await supabaseRest('integration_events', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      connection_id: connectionId,
      provider: 'hubspot',
      event_type: 'manual_sync',
      external_object_type: 'companies',
      payload,
      processed_at: new Date().toISOString(),
    }),
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authenticated session.' }, 401);
  }

  const userId = await getUserId(authorization);
  if (!userId) {
    return jsonResponse({ error: 'Invalid authenticated session.' }, 401);
  }

  const hubspotToken = getHubSpotToken();
  if (!hubspotToken) {
    return jsonResponse({
      error: 'HubSpot private app token is missing. Add HUBSPOT_PRIVATE_APP_TOKEN, or keep HUBSPOT_CLIENT_ID as the private token fallback.',
    }, 412);
  }

  const ownerId = await resolveHubSpotOwnerId(hubspotToken);
  if (!ownerId) {
    return jsonResponse({
      error: 'HubSpot owner is missing. Add HUBSPOT_OWNER_ID, or HUBSPOT_OWNER_EMAIL if the private app can read owners.',
    }, 412);
  }

  let connectionId = '';

  try {
    const companyResults = await fetchAllCompaniesForOwner(hubspotToken, ownerId);
    const importResult = await importCompanies(companyResults, userId, ownerId);
    const outOfScopeCount = await markOutOfScopePharmacies(ownerId, companyResults.map((company) => company.id));
    const productResults = await fetchAllProducts(hubspotToken);
    const productImportResult = await importProducts(productResults);
    const metadata = {
      mode: 'private_app_token',
      provider: 'hubspot',
      hubspot_owner_id: ownerId,
      fetched: companyResults.length,
      imported: importResult,
      marked_out_of_scope: outOfScopeCount,
      products: productImportResult,
    };
    const connection = await upsertConnection(userId, 'connected', metadata);
    connectionId = connection.id;

    await createSyncJob(connectionId, 'succeeded', companyResults.length, metadata);
    await recordSyncEvent(connectionId, {
      ...metadata,
      sample_company_ids: companyResults.slice(0, 10).map((company) => company.id),
    });

    return jsonResponse({
      ok: true,
      connectionId,
      companies: {
        fetched: companyResults.length,
        created: importResult.created,
        updated: importResult.updated,
        markedOutOfScope: outOfScopeCount,
      },
      products: productImportResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot sync failed.';
    const connection = await upsertConnection(userId, 'error', {
      mode: 'private_app_token',
      provider: 'hubspot',
      error: message,
    });
    await createSyncJob(connection.id, 'failed', 0, { mode: 'private_app_token' }, message);
    return jsonResponse({ error: message }, 502);
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HubSpotObject = {
  id: string;
  properties?: Record<string, string | null>;
  createdAt?: string;
  updatedAt?: string;
  associations?: Record<string, {
    results?: Array<{ id?: string; type?: string }>;
  }>;
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

type HubSpotBatchReadResponse = {
  results?: HubSpotObject[];
};

type HubSpotAssociationResponse = {
  results?: Array<{ toObjectId?: number | string; id?: string }>;
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type BrandIntegration = {
  id: string;
  brand_id: string;
  config?: Record<string, unknown>;
};

type AgentRow = {
  id: string;
};

type PharmacyRow = {
  id: string;
  hubspot_company_id: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  reference: string | null;
  hubspot_product_id: string | null;
  unit_price_ht: number | null;
};

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

const COMPANY_PROPERTIES = [
  'name',
  'domain',
  'city',
  'zip',
  'address',
  'phone',
  'industry',
  'hubspot_owner_id',
  'client_naali',
  'catalogue_naali_reference',
  'total_revenue',
  'annualrevenue',
  'hs_lastmodifieddate',
];

const DEAL_PROPERTIES = [
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
  'hs_is_closed',
  'hs_is_closed_won',
  'hs_lastmodifieddate',
  'quantite',
  'origine_de_la_commande',
  'prise_de_commande',
];

let lastHubSpotRequestAt = 0;

function normalize(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

function getHubSpotToken() {
  return Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN') || Deno.env.get('HUBSPOT_CLIENT_ID');
}

function getHubSpotOwnerConfig() {
  return {
    ownerId: Deno.env.get('HUBSPOT_OWNER_ID') || '',
    ownerEmail: Deno.env.get('HUBSPOT_OWNER_EMAIL') || '',
  };
}

function shouldImportHubSpotLineItems() {
  return Deno.env.get('HUBSPOT_SYNC_LINE_ITEMS') === 'true';
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after');
  const retrySeconds = retryAfter ? Number(retryAfter) : 0;
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) return Math.min(30000, retrySeconds * 1000);
  return Math.min(30000, 1000 * 2 ** attempt);
}

async function waitForHubSpotSlot() {
  const minDelayMs = Number(Deno.env.get('HUBSPOT_MIN_REQUEST_INTERVAL_MS') || 350);
  const elapsed = Date.now() - lastHubSpotRequestAt;
  if (elapsed < minDelayMs) await sleep(minDelayMs - elapsed);
  lastHubSpotRequestAt = Date.now();
}

async function hubspotGet<T>(path: string, token: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForHubSpotSlot();
    const response = await fetch(`https://api.hubapi.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) return response.json() as Promise<T>;
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 7) {
        await sleep(getRetryDelay(response, attempt));
        continue;
      }
    }

    const message = await response.text();
    throw new Error(`HubSpot ${response.status}: ${message}`);
  }

  throw new Error('HubSpot request failed after retries.');
}

async function hubspotPost<T>(path: string, token: string, body: Record<string, unknown>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForHubSpotSlot();
    const response = await fetch(`https://api.hubapi.com${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.ok) return response.json() as Promise<T>;
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 7) {
        await sleep(getRetryDelay(response, attempt));
        continue;
      }
    }

    const message = await response.text();
    throw new Error(`HubSpot ${response.status}: ${message}`);
  }

  throw new Error('HubSpot request failed after retries.');
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
    properties: COMPANY_PROPERTIES,
    ...(after ? { after } : {}),
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'hubspot_owner_id',
            operator: 'EQ',
            value: ownerId,
          },
          {
            propertyName: 'client_naali',
            operator: 'EQ',
            value: 'true',
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

async function fetchCompaniesByIds(token: string, ids: string[]) {
  if (ids.length === 0) return [];
  const results: HubSpotObject[] = [];

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const page = await hubspotPost<HubSpotBatchReadResponse>('/crm/v3/objects/companies/batch/read', token, {
      properties: COMPANY_PROPERTIES,
      inputs: chunk.map((id) => ({ id })),
    });
    results.push(...(page.results || []));
  }

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

function getAssociatedCompanyId(deal: HubSpotObject, companyIds: Set<string>) {
  const associationGroups = [
    deal.associations?.companies?.results,
    deal.associations?.company?.results,
  ].filter(Boolean) as Array<Array<{ id?: string }>>;

  for (const associations of associationGroups) {
    const match = associations
      .map((association) => String(association.id || ''))
      .find((id) => companyIds.has(id));
    if (match) return match;
  }

  return '';
}

async function fetchDealsPage(token: string, after = '') {
  const params = new URLSearchParams({
    limit: '100',
    properties: DEAL_PROPERTIES.join(','),
    associations: 'companies',
    archived: 'false',
  });
  if (after) params.set('after', after);
  return hubspotGet<HubSpotListResponse>(`/crm/v3/objects/deals?${params.toString()}`, token);
}

async function fetchDealsForCompanyPage(token: string, companyId: string, integration: BrandIntegration, after = '') {
  const pipelineId = String(integration.config?.pipeline_id || '');
  const filters = [
    {
      propertyName: 'associations.company',
      operator: 'EQ',
      value: companyId,
    },
  ];

  if (pipelineId) {
    filters.push({
      propertyName: 'pipeline',
      operator: 'EQ',
      value: pipelineId,
    });
  }

  filters.push({
    propertyName: 'hs_is_closed_won',
    operator: 'EQ',
    value: 'true',
  });

  return hubspotPost<HubSpotListResponse>('/crm/v3/objects/deals/search', token, {
    limit: 100,
    properties: DEAL_PROPERTIES,
    ...(after ? { after } : {}),
    filterGroups: [{ filters }],
    sorts: [
      {
        propertyName: 'createdate',
        direction: 'DESCENDING',
      },
    ],
  });
}

async function fetchDealIdsForCompany(token: string, companyId: string) {
  const endpointBases = [
    `/crm/v4/objects/companies/${companyId}/associations/deals`,
    `/crm/v4/objects/companies/${companyId}/associations/deal`,
  ];

  for (const endpointBase of endpointBases) {
    try {
      const ids: string[] = [];
      let after = '';
      let guard = 0;

      do {
        const params = new URLSearchParams({ limit: '500' });
        if (after) params.set('after', after);
        const response = await hubspotGet<HubSpotAssociationResponse>(`${endpointBase}?${params.toString()}`, token);
        ids.push(...(response.results || [])
          .map((item) => String(item.toObjectId || item.id || ''))
          .filter(Boolean));
        after = response.paging?.next?.after || '';
        guard += 1;
      } while (after && guard < 20);

      if (ids.length) return ids;
    } catch (error) {
      if (endpointBase === endpointBases[endpointBases.length - 1]) throw error;
    }
  }

  return [];
}

async function fetchDealsByIds(token: string, ids: string[]) {
  if (ids.length === 0) return [];

  const results: HubSpotObject[] = [];

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const page = await hubspotPost<HubSpotBatchReadResponse>('/crm/v3/objects/deals/batch/read', token, {
      properties: DEAL_PROPERTIES,
      inputs: chunk.map((id) => ({ id })),
    });
    results.push(...(page.results || []));
  }

  return results;
}

async function fetchAllDealsForCompanies(token: string, companyIds: string[], integration: BrandIntegration) {
  const results: Array<HubSpotObject & { companyId: string }> = [];
  const seenDealIds = new Set<string>();
  const pipelineId = String(integration.config?.pipeline_id || '');
  const companyIdSet = new Set(companyIds);
  const maxPages = Number(Deno.env.get('HUBSPOT_DEALS_MAX_PAGES') || 60);
  let after = '';
  let guard = 0;

  do {
    const page = await fetchDealsPage(token, after);
    results.push(...(page.results || [])
      .filter((deal) => !seenDealIds.has(deal.id))
      .map((deal) => ({ deal, companyId: getAssociatedCompanyId(deal, companyIdSet) }))
      .filter(({ companyId }) => Boolean(companyId))
      .map(({ deal, companyId }) => {
        seenDealIds.add(deal.id);
        return { ...deal, companyId };
      })
      .filter((deal) => !pipelineId || deal.properties?.pipeline === pipelineId)
      .filter((deal) => isClosedOrderDeal(deal) && !isPreorderDeal(deal)));
    after = page.paging?.next?.after || '';
    guard += 1;
  } while (after && guard < maxPages);

  if (results.length > 0 || guard >= maxPages) return results;

  for (const companyId of companyIds) {
    const associatedDealIds = await fetchDealIdsForCompany(token, companyId);

    if (associatedDealIds.length > 0) {
      const deals = await fetchDealsByIds(token, associatedDealIds);
      results.push(...deals
        .filter((deal) => !seenDealIds.has(deal.id))
        .filter((deal) => !pipelineId || deal.properties?.pipeline === pipelineId)
        .filter((deal) => isClosedOrderDeal(deal) && !isPreorderDeal(deal))
        .map((deal) => {
          seenDealIds.add(deal.id);
          return { ...deal, companyId };
        }));
      continue;
    }

    let after = '';
    let guard = 0;

    do {
      const page = await fetchDealsForCompanyPage(token, companyId, integration, after);
      results.push(...(page.results || [])
        .filter((deal) => !seenDealIds.has(deal.id))
        .filter((deal) => isClosedOrderDeal(deal) && !isPreorderDeal(deal))
        .map((deal) => {
          seenDealIds.add(deal.id);
          return { ...deal, companyId };
        }));
      after = page.paging?.next?.after || '';
      guard += 1;
    } while (after && guard < 20);
  }

  return results;
}

async function fetchLineItemIdsForDeal(token: string, dealId: string) {
  const endpointBases = [
    `/crm/v4/objects/deals/${dealId}/associations/line_items`,
    `/crm/v4/objects/deals/${dealId}/associations/line_item`,
  ];

  for (const endpointBase of endpointBases) {
    try {
      const ids: string[] = [];
      let after = '';
      let guard = 0;

      do {
        const params = new URLSearchParams({ limit: '500' });
        if (after) params.set('after', after);
        const response = await hubspotGet<HubSpotAssociationResponse>(`${endpointBase}?${params.toString()}`, token);
        ids.push(...(response.results || [])
          .map((item) => String(item.toObjectId || item.id || ''))
          .filter(Boolean));
        after = response.paging?.next?.after || '';
        guard += 1;
      } while (after && guard < 20);

      if (ids.length) return ids;
    } catch (error) {
      if (endpointBase === endpointBases[endpointBases.length - 1]) throw error;
    }
  }

  return [];
}

async function fetchLineItemsForDealBySearch(token: string, dealId: string) {
  const results: HubSpotObject[] = [];
  let after = '';
  let guard = 0;

  do {
    const page = await hubspotPost<HubSpotListResponse>('/crm/v3/objects/line_items/search', token, {
      limit: 100,
      properties: [
        'name',
        'quantity',
        'price',
        'amount',
        'hs_sku',
        'hs_product_id',
        'hs_discount_percentage',
        'createdate',
      ],
      ...(after ? { after } : {}),
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'associations.deal',
              operator: 'EQ',
              value: dealId,
            },
          ],
        },
      ],
    });
    results.push(...(page.results || []));
    after = page.paging?.next?.after || '';
    guard += 1;
  } while (after && guard < 10);

  return results;
}

async function fetchLineItemsByIds(token: string, ids: string[]) {
  if (ids.length === 0) return [];

  const results: HubSpotObject[] = [];
  const properties = [
    'name',
    'quantity',
    'price',
    'amount',
    'hs_sku',
    'hs_product_id',
    'hs_discount_percentage',
    'createdate',
  ];

  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const page = await hubspotPost<HubSpotBatchReadResponse>('/crm/v3/objects/line_items/batch/read', token, {
      properties,
      inputs: chunk.map((id) => ({ id })),
    });
    results.push(...(page.results || []));
  }

  return results;
}

async function fetchLineItemsForDeals(token: string, dealIds: string[]) {
  const lineItemIdsByDealId = new Map<string, string[]>();
  const allLineItemIds = new Set<string>();

  for (const dealId of dealIds) {
    const ids = await fetchLineItemIdsForDeal(token, dealId);
    lineItemIdsByDealId.set(dealId, ids);
    ids.forEach((id) => allLineItemIds.add(id));
  }

  const lineItems = await fetchLineItemsByIds(token, [...allLineItemIds]);
  const lineItemsById = new Map(lineItems.map((item) => [item.id, item]));
  const result = new Map<string, HubSpotObject[]>();

  for (const [dealId, ids] of lineItemIdsByDealId.entries()) {
    const associatedLineItems = ids.map((id) => lineItemsById.get(id)).filter((item): item is HubSpotObject => Boolean(item));
    result.set(dealId, associatedLineItems.length ? associatedLineItems : await fetchLineItemsForDealBySearch(token, dealId));
  }

  return result;
}

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',');
}

function chunkValues<T>(values: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function parseHubSpotMultiCheckbox(value: string | null | undefined) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isClosedOrderDeal(deal: HubSpotObject) {
  const properties = deal.properties || {};
  return properties.hs_is_closed_won === 'true' || properties.hs_is_closed === 'true' || Boolean(properties.closedate);
}

function isPreorderDeal(deal: HubSpotObject) {
  const properties = deal.properties || {};
  const text = normalize([
    properties.dealname,
    properties.type_de_commande,
    properties.origine_de_la_commande,
    properties.prise_de_commande,
  ].filter(Boolean).join(' '));
  return text.includes('précommande') || text.includes('precommande') || text.includes('pre-order') || text.includes('pre order');
}

function mapCompanyToPharmacy(company: HubSpotObject, userId: string, ownerId: string) {
  const properties = company.properties || {};
  const name = properties.name?.trim() || `HubSpot company ${company.id}`;
  const catalogueNaaliReference = parseHubSpotMultiCheckbox(properties.catalogue_naali_reference);
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
    hubspot_total_revenue: numberOrNull(properties.total_revenue),
    hubspot_annual_revenue: numberOrNull(properties.annualrevenue),
    hubspot_catalogue_naali_reference: catalogueNaaliReference,
    hubspot_catalogue_naali_reference_raw: properties.catalogue_naali_reference || null,
    hubspot_last_modified_at: properties.hs_lastmodifieddate || company.updatedAt || null,
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

async function replaceNaaliPortfolioWithClientCompanies(companies: HubSpotObject[], userId: string) {
  const integration = await getNaaliIntegration();
  if (!integration) return { linked: 0, skipped: true, mode: 'missing_integration' };

  await supabaseRest(`pharmacy_brand_relations?brand_id=eq.${integration.brand_id}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal',
    },
  });

  if (companies.length === 0) return { linked: 0, skipped: false, mode: 'replace' };

  const ids = companies.map((company) => company.id);
  const pharmacyRows = await supabaseRest<Array<{
    id: string;
    hubspot_company_id: string;
    hubspot_total_revenue: number | null;
  }>>(
    `pharmacies?select=id,hubspot_company_id,hubspot_total_revenue&hubspot_company_id=in.(${encodeInFilter(ids)})`,
  );

  const payload = pharmacyRows.map((pharmacy) => {
    const revenue = Number(pharmacy.hubspot_total_revenue || 0);
    return {
      pharmacy_id: pharmacy.id,
      brand_id: integration.brand_id,
      status: 'client',
      potential: revenue >= 5000 ? 'priority' : revenue >= 1500 ? 'high' : 'medium',
      segment: revenue >= 5000 ? 'priority' : 'to_develop',
      annual_revenue_ht: revenue,
      created_by: userId,
      notes: 'Relation reconstruite depuis HubSpot: owner configuré + client_naali=true.',
      updated_at: new Date().toISOString(),
    };
  });

  if (payload.length > 0) {
    await supabaseRest('pharmacy_brand_relations?on_conflict=pharmacy_id,brand_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
  }

  return { linked: payload.length, skipped: false, mode: 'replace' };
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

async function getNaaliPortfolioCompanyIds(brandId: string) {
  const relations = await supabaseRest<Array<{ pharmacy_id: string }>>(
    `pharmacy_brand_relations?select=pharmacy_id&brand_id=eq.${brandId}`,
  );
  const pharmacyIds = relations.map((relation) => relation.pharmacy_id).filter(Boolean);
  if (pharmacyIds.length === 0) return [];

  const pharmacies = await supabaseRest<Array<{ hubspot_company_id: string | null }>>(
    `pharmacies?select=hubspot_company_id&id=in.(${encodeInFilter(pharmacyIds)})&hubspot_company_id=not.is.null`,
  );

  return [...new Set(pharmacies.map((pharmacy) => pharmacy.hubspot_company_id).filter((id): id is string => Boolean(id)))];
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

async function getAgentForUser(userId: string) {
  const [agent] = await supabaseRest<AgentRow[]>(
    `agents?select=id&user_id=eq.${userId}&limit=1`,
  );
  return agent || null;
}

async function getPharmaciesByHubSpotCompanyIds(companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, PharmacyRow>();

  const rows = await supabaseRest<PharmacyRow[]>(
    `pharmacies?select=id,hubspot_company_id&hubspot_company_id=in.(${encodeInFilter(companyIds)})`,
  );

  return new Map(rows
    .filter((row) => row.hubspot_company_id)
    .map((row) => [row.hubspot_company_id as string, row]));
}

async function getProductsForBrand(brandId: string) {
  const rows = await supabaseRest<ProductRow[]>(
    `products?select=id,name,reference,hubspot_product_id,unit_price_ht&brand_id=eq.${brandId}`,
  );
  return {
    byHubSpotId: new Map(rows.filter((row) => row.hubspot_product_id).map((row) => [row.hubspot_product_id as string, row])),
    byReference: new Map(rows.filter((row) => row.reference).map((row) => [String(row.reference).toLowerCase(), row])),
  };
}

function parseHubSpotNumber(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.replace(',', '.').replace('%', '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDealAmount(deal: HubSpotObject) {
  const properties = deal.properties || {};
  return parseHubSpotNumber(properties.amount) || parseHubSpotNumber(properties.montant_total);
}

function normalizeOrderType(value: string | null | undefined) {
  const text = normalize(value);
  if (text.includes('implant')) return 'implantation';
  if (text.includes('réassort') || text.includes('reassort')) return 'reassort';
  if (text.includes('sample') || text.includes('échantillon') || text.includes('echantillon')) return 'sample';
  return 'other';
}

function mapDealToOrderPayload(
  deal: HubSpotObject & { companyId: string },
  pharmacyId: string,
  brandId: string,
  agentId: string,
  userId: string,
) {
  const properties = deal.properties || {};
  const totalHt = getDealAmount(deal);
  const discountRate = parseHubSpotNumber(properties.remise____);
  const orderDate = properties.closedate || properties.createdate || deal.createdAt || new Date().toISOString();
  const dealName = properties.dealname?.trim() || `Deal HubSpot ${deal.id}`;
  const notes = [
    `Historique importé depuis HubSpot: ${dealName}.`,
    properties.type_de_commande ? `Type: ${properties.type_de_commande}` : '',
    properties.dealstage ? `Stage HubSpot: ${properties.dealstage}` : '',
    properties.origine_de_la_commande ? `Origine: ${properties.origine_de_la_commande}` : '',
    properties.prise_de_commande ? `Prise de commande: ${properties.prise_de_commande}` : '',
  ].filter(Boolean).join('\n');

  return {
    order_number: `HS-${deal.id}`,
    pharmacy_id: pharmacyId,
    brand_id: brandId,
    agent_id: agentId,
    attributed_agent_id: agentId,
    status: 'invoiced',
    order_type: normalizeOrderType(properties.type_de_commande),
    order_date: orderDate,
    source: 'imported_crm',
    created_by_type: 'agent',
    validation_status: 'not_required',
    external_deal_id: deal.id,
    total_ht: totalHt,
    discount_rate: discountRate,
    discount_amount_ht: 0,
    total_after_discount_ht: totalHt,
    vat_amount: Number((totalHt * 0.2).toFixed(2)),
    total_ttc: Number((totalHt * 1.2).toFixed(2)),
    notes,
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
}

function mapLineItemToPayload(
  lineItem: HubSpotObject,
  orderId: string,
  productsByHubSpotId: Map<string, ProductRow>,
  productsByReference: Map<string, ProductRow>,
) {
  const properties = lineItem.properties || {};
  const hubspotProductId = properties.hs_product_id || '';
  const reference = properties.hs_sku || '';
  const product = (hubspotProductId && productsByHubSpotId.get(hubspotProductId))
    || (reference && productsByReference.get(reference.toLowerCase()))
    || null;
  const quantity = parseHubSpotNumber(properties.quantity) || 1;
  const unitPriceHt = parseHubSpotNumber(properties.price) || Number(product?.unit_price_ht || 0);
  const discountRate = parseHubSpotNumber(properties.hs_discount_percentage);

  return {
    order_id: orderId,
    product_id: product?.id || null,
    product_name_snapshot: properties.name || product?.name || `Produit HubSpot ${lineItem.id}`,
    reference_snapshot: reference || product?.reference || null,
    quantity,
    pcb: 1,
    unit_price_ht: unitPriceHt,
    discount_rate: discountRate,
  };
}

async function syncExternalDealLinks(integrationId: string, orders: Array<{ id: string; external_deal_id: string }>) {
  if (orders.length === 0) return;

  await supabaseRest('external_sync_links?on_conflict=brand_integration_id,local_table,local_id,external_object_type', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(orders.map((order) => ({
      brand_integration_id: integrationId,
      local_table: 'orders',
      local_id: order.id,
      external_object_type: 'deal',
      external_object_id: order.external_deal_id,
      provider: 'hubspot',
      direction: 'inbound',
      status: 'synced',
      metadata: { source: 'hubspot-sync' },
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))),
  });
}

async function importDealsAsOrders(
  deals: Array<HubSpotObject & { companyId: string }>,
  lineItemsByDealId: Map<string, HubSpotObject[]>,
  integration: BrandIntegration,
  userId: string,
) {
  if (deals.length === 0) return { fetched: 0, created: 0, updated: 0, withLineItems: 0, skipped: 0 };

  const agent = await getAgentForUser(userId);
  if (!agent) return { fetched: deals.length, created: 0, updated: 0, withLineItems: 0, skipped: deals.length, reason: 'missing_agent' };

  const companyIds = [...new Set(deals.map((deal) => deal.companyId))];
  const pharmaciesByCompanyId = await getPharmaciesByHubSpotCompanyIds(companyIds);
  const products = await getProductsForBrand(integration.brand_id);
  const dealIds = deals.map((deal) => deal.id);
  const existingRows = (
    await Promise.all(chunkValues(dealIds).map((chunk) => supabaseRest<Array<{ id: string; external_deal_id: string }>>(
      `orders?select=id,external_deal_id&brand_id=eq.${integration.brand_id}&external_deal_id=in.(${encodeInFilter(chunk)})`,
    )))
  ).flat();
  const existingByDealId = new Map(existingRows.map((row) => [row.external_deal_id, row.id]));
  const createdOrders: Array<{ id: string; external_deal_id: string }> = [];
  const updatedOrders: Array<{ id: string; external_deal_id: string }> = [];
  let skipped = 0;

  for (const deal of deals) {
    const pharmacy = pharmaciesByCompanyId.get(deal.companyId);
    if (!pharmacy) {
      skipped += 1;
      continue;
    }

    const payload = mapDealToOrderPayload(deal, pharmacy.id, integration.brand_id, agent.id, userId);
    const existingOrderId = existingByDealId.get(deal.id);

    if (existingOrderId) {
      await supabaseRest(`orders?id=eq.${existingOrderId}`, {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(payload),
      });
      updatedOrders.push({ id: existingOrderId, external_deal_id: deal.id });
      continue;
    }

    const [createdOrder] = await supabaseRest<Array<{ id: string; external_deal_id: string }>>('orders?select=id,external_deal_id', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (createdOrder) {
      createdOrders.push(createdOrder);
      existingByDealId.set(deal.id, createdOrder.id);
    }
  }

  const touchedOrders = [...createdOrders, ...updatedOrders];
  await syncExternalDealLinks(integration.id, touchedOrders);

  if (touchedOrders.length > 0) {
    const touchedOrderIds = touchedOrders.map((order) => order.id);
    await Promise.all(chunkValues(touchedOrderIds).map((chunk) => supabaseRest(`order_items?order_id=in.(${encodeInFilter(chunk)})`, {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      })));

    const orderItems = touchedOrders.flatMap((order) => {
      const lineItems = lineItemsByDealId.get(order.external_deal_id) || [];
      return lineItems.map((lineItem) => mapLineItemToPayload(
        lineItem,
        order.id,
        products.byHubSpotId,
        products.byReference,
      ));
    });

    if (orderItems.length > 0) {
      await Promise.all(chunkValues(orderItems).map((chunk) => supabaseRest('order_items', {
        method: 'POST',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(chunk),
      })));
    }
  }

  return {
    fetched: deals.length,
    created: createdOrders.length,
    updated: updatedOrders.length,
    withLineItems: [...lineItemsByDealId.values()].filter((lineItems) => lineItems.length > 0).length,
    skipped,
  };
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
    const integration = await getNaaliIntegration();
    if (!integration) {
      return jsonResponse({ error: 'Naali HubSpot integration is missing.' }, 412);
    }

    const companyResults = await fetchAllCompaniesForOwner(hubspotToken, ownerId);
    const importResult = await importCompanies(companyResults, userId, ownerId);
    const linkResult = await replaceNaaliPortfolioWithClientCompanies(companyResults, userId);
    const productImportResult = {
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: true,
      reason: 'dn_uses_company_catalogue_naali_reference',
    };
    const portfolioCompanyIds = await getNaaliPortfolioCompanyIds(integration.brand_id);
    const dealResults = await fetchAllDealsForCompanies(hubspotToken, portfolioCompanyIds, integration);
    const lineItemsByDealId = shouldImportHubSpotLineItems()
      ? await fetchLineItemsForDeals(hubspotToken, dealResults.map((deal) => deal.id))
      : new Map<string, HubSpotObject[]>();
    const dealImportResult = await importDealsAsOrders(dealResults, lineItemsByDealId, integration, userId);
    const metadata = {
      mode: 'private_app_token',
      provider: 'hubspot',
      scope: 'naali_owner_clients',
      hubspot_owner_id: ownerId,
      company_filter: {
        hubspot_owner_id: ownerId,
        client_naali: 'true',
      },
      deal_filter: {
        hs_is_closed_won: 'true',
        exclude_preorders: true,
        source: 'global_deals_with_company_associations',
        line_items: shouldImportHubSpotLineItems() ? 'enabled' : 'disabled',
      },
      fetched: companyResults.length,
      imported: importResult,
      linked: linkResult,
      marked_out_of_scope: 0,
      products: productImportResult,
      deals: dealImportResult,
    };
    const connection = await upsertConnection(userId, 'connected', metadata);
    connectionId = connection.id;

    await createSyncJob(connectionId, 'succeeded', companyResults.length + dealResults.length, metadata);
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
        filter: {
          hubspot_owner_id: ownerId,
          client_naali: 'true',
        },
        linked: linkResult.linked,
        markedOutOfScope: 0,
      },
      products: productImportResult,
      deals: dealImportResult,
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

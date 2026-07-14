const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HubSpotObject = {
  id: string;
  properties?: Record<string, string | null>;
};

type HubSpotAssociationResponse = {
  results?: Array<{ toObjectId?: number | string; id?: string }>;
  paging?: {
    next?: {
      after?: string;
    };
  };
};

type HubSpotBatchReadResponse = {
  results?: HubSpotObject[];
};

type BrandIntegration = {
  brand_id: string;
};

type OrderRow = {
  id: string;
  brand_id: string;
  external_deal_id: string;
};

type ProductRow = {
  id: string;
  name: string;
  reference: string | null;
  hubspot_product_id: string | null;
  unit_price_ht: number | null;
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
  return text ? JSON.parse(text) as T : null as T;
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

async function hubspotGet<T>(path: string, token: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(Number(Deno.env.get('HUBSPOT_LINE_ITEMS_REQUEST_DELAY_MS') || 250));
    const response = await fetch(`https://api.hubapi.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (response.ok) return response.json() as Promise<T>;
    if ((response.status === 429 || response.status >= 500) && attempt < 7) {
      await sleep(getRetryDelay(response, attempt));
      continue;
    }
    throw new Error(`HubSpot ${response.status}: ${await response.text()}`);
  }
  throw new Error('HubSpot request failed after retries.');
}

async function hubspotPost<T>(path: string, token: string, body: Record<string, unknown>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(Number(Deno.env.get('HUBSPOT_LINE_ITEMS_REQUEST_DELAY_MS') || 250));
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
    if ((response.status === 429 || response.status >= 500) && attempt < 7) {
      await sleep(getRetryDelay(response, attempt));
      continue;
    }
    throw new Error(`HubSpot ${response.status}: ${await response.text()}`);
  }
  throw new Error('HubSpot request failed after retries.');
}

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',');
}

function parseHubSpotNumber(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Number(String(value).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNaaliIntegration() {
  const [integration] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=brand_id&provider=eq.hubspot&status=eq.active&display_name=ilike.*Naali*&limit=1',
  );
  if (integration) return integration;
  const [fallback] = await supabaseRest<BrandIntegration[]>(
    'brand_integrations?select=brand_id&provider=eq.hubspot&status=eq.active&limit=1',
  );
  return fallback || null;
}

async function getCandidateOrders(brandId: string, limit: number, force: boolean) {
  const orders = await supabaseRest<OrderRow[]>(
    `orders?select=id,brand_id,external_deal_id&brand_id=eq.${brandId}&external_deal_id=not.is.null&order=order_date.desc.nullslast&limit=${limit * 3}`,
  );
  if (force) return orders.slice(0, limit);

  const orderIds = orders.map((order) => order.id);
  if (!orderIds.length) return [];
  const existingItems = await supabaseRest<Array<{ order_id: string }>>(
    `order_items?select=order_id&order_id=in.(${encodeInFilter(orderIds)})`,
  );
  const ordersWithItems = new Set(existingItems.map((item) => item.order_id));
  return orders.filter((order) => !ordersWithItems.has(order.id)).slice(0, limit);
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

async function fetchLineItemsByIds(token: string, ids: string[]) {
  if (!ids.length) return [];
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
  const unitPriceHt = parseHubSpotNumber(properties.price) || parseHubSpotNumber(properties.amount) || Number(product?.unit_price_ht || 0);
  const discountRate = parseHubSpotNumber(properties.hs_discount_percentage);
  const lineTotalHt = Number((quantity * unitPriceHt * (1 - discountRate / 100)).toFixed(2));

  return {
    order_id: orderId,
    product_id: product?.id || null,
    product_name_snapshot: properties.name || product?.name || `Produit HubSpot ${lineItem.id}`,
    reference_snapshot: reference || product?.reference || null,
    quantity,
    pcb: 1,
    unit_price_ht: unitPriceHt,
    discount_rate: discountRate,
    line_total_ht: lineTotalHt,
    updated_at: new Date().toISOString(),
  };
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
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));
    const force = Boolean(body.force);
    const integration = await getNaaliIntegration();
    if (!integration) return jsonResponse({ error: 'Naali HubSpot integration is missing.' }, 412);

    const orders = await getCandidateOrders(integration.brand_id, limit, force);
    const products = await getProductsForBrand(integration.brand_id);
    const lineItemIdsByOrderId = new Map<string, string[]>();
    const lineItemIdToOrderId = new Map<string, string>();
    const allLineItemIds = new Set<string>();

    for (const order of orders) {
      const ids = await fetchLineItemIdsForDeal(token, order.external_deal_id);
      lineItemIdsByOrderId.set(order.id, ids);
      ids.forEach((id) => {
        allLineItemIds.add(id);
        lineItemIdToOrderId.set(id, order.id);
      });
    }

    const lineItems = await fetchLineItemsByIds(token, [...allLineItemIds]);
    const rows = lineItems
      .map((lineItem) => {
        const orderId = lineItemIdToOrderId.get(lineItem.id);
        if (!orderId) return null;
        return mapLineItemToPayload(lineItem, orderId, products.byHubSpotId, products.byReference);
      })
      .filter((row): row is ReturnType<typeof mapLineItemToPayload> => Boolean(row));

    const touchedOrderIds = [...new Set(rows.map((row) => row.order_id))];
    if (force && touchedOrderIds.length) {
      await supabaseRest(`order_items?order_id=in.(${encodeInFilter(touchedOrderIds)})`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }

    if (rows.length) {
      await supabaseRest('order_items', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
    }

    return jsonResponse({
      ok: true,
      checkedOrders: orders.length,
      ordersWithHubSpotLineItems: Array.from(lineItemIdsByOrderId.values()).filter((ids) => ids.length > 0).length,
      importedLineItems: rows.length,
      force,
      limit,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'HubSpot line item sync failed.' }, 502);
  }
});

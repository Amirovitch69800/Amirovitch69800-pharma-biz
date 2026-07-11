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

type Order = {
  id: string;
  order_number: string | null;
  pharmacy_id: string;
  brand_id: string;
  agent_id: string;
  status: string;
  order_type: string;
  order_date: string;
  total_ht: number | string;
  discount_rate: number | string;
  total_after_discount_ht: number | string;
  notes: string | null;
  brands?: {
    id: string;
    name: string;
  };
  pharmacies?: {
    id: string;
    name: string;
    hubspot_company_id: string | null;
  };
  order_items?: OrderItem[];
};

type OrderItem = {
  id: string;
  product_id: string | null;
  product_name_snapshot: string;
  reference_snapshot: string | null;
  quantity: number | string;
  unit_price_ht: number | string;
  discount_rate: number | string;
  line_total_ht: number | string;
  products?: {
    hubspot_product_id: string | null;
    reference: string | null;
  };
};

type BrandIntegration = {
  id: string;
  brand_id: string;
  provider: string;
  status: string;
  config: Record<string, unknown>;
};

type SyncLink = {
  id: string;
  external_object_id: string | null;
  status: string;
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

function hubspotOrderType(orderType: string) {
  const labels: Record<string, string> = {
    implantation: 'Implantation',
    reassort: 'Réassort',
    sample: 'Réassort',
    other: 'Réassort',
  };
  return labels[orderType] || 'Réassort';
}

function textConfig(config: Record<string, unknown>, key: string, fallback: string) {
  const value = config[key];
  return typeof value === 'string' && value ? value : fallback;
}

function intConfig(config: Record<string, unknown>, key: string, fallback: number) {
  const value = config[key];
  return typeof value === 'number' ? value : fallback;
}

async function getAgentForUser(userId: string) {
  const [agent] = await supabaseRest<Agent[]>(`agents?select=id,user_id&user_id=eq.${userId}&limit=1`);
  return agent || null;
}

async function getOrder(orderId: string) {
  const [order] = await supabaseRest<Order[]>(
    `orders?select=*,brands(id,name),pharmacies(id,name,hubspot_company_id),order_items(*,products(hubspot_product_id,reference))&id=eq.${orderId}&limit=1`,
  );
  return order || null;
}

async function getBrandIntegration(brandId: string) {
  const [integration] = await supabaseRest<BrandIntegration[]>(
    `brand_integrations?select=*&brand_id=eq.${brandId}&provider=eq.hubspot&status=eq.active&limit=1`,
  );
  return integration || null;
}

async function getExistingSyncLink(integrationId: string, orderId: string) {
  const [link] = await supabaseRest<SyncLink[]>(
    `external_sync_links?select=id,external_object_id,status&brand_integration_id=eq.${integrationId}&local_table=eq.orders&local_id=eq.${orderId}&external_object_type=eq.deal&limit=1`,
  );
  return link || null;
}

async function upsertSyncLink(
  integrationId: string,
  orderId: string,
  status: 'synced' | 'error' | 'pending',
  metadata: Record<string, unknown>,
  externalObjectId?: string,
  lastError?: string,
) {
  const [link] = await supabaseRest<Array<{ id: string }>>(
    'external_sync_links?on_conflict=brand_integration_id,local_table,local_id,external_object_type&select=id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        brand_integration_id: integrationId,
        local_table: 'orders',
        local_id: orderId,
        external_object_type: 'deal',
        external_object_id: externalObjectId || null,
        provider: 'hubspot',
        direction: 'outbound',
        status,
        last_error: lastError || null,
        metadata,
        synced_at: status === 'synced' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return link;
}

async function recordIntegrationEvent(payload: Record<string, unknown>, externalObjectId?: string) {
  await supabaseRest('integration_events', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      provider: 'hubspot',
      event_type: 'order_deal_sync',
      external_object_type: 'deal',
      external_object_id: externalObjectId || null,
      local_object_type: 'orders',
      local_object_id: payload.order_id,
      payload,
      processed_at: new Date().toISOString(),
    }),
  });
}

function formatHubSpotDiscount(value: number | string | null | undefined) {
  const discountRate = Number(value || 0);
  if (!Number.isFinite(discountRate) || discountRate <= 0) return undefined;
  return `${Math.round(discountRate)}%`;
}

async function createHubSpotDeal(order: Order, integration: BrandIntegration, token: string) {
  const config = integration.config || {};
  const companyId = order.pharmacies?.hubspot_company_id;
  if (!companyId) throw new Error('La pharmacie n’a pas encore de hubspot_company_id.');

  const pipelineId = textConfig(config, 'pipeline_id', '1543644371');
  const dealstage = textConfig(config, 'default_dealstage', '2110945486');
  const ownerId = textConfig(config, 'hubspot_owner_id', Deno.env.get('HUBSPOT_OWNER_ID') || '727665403');
  const origin = textConfig(config, 'origin', 'Commercial Naali');
  const closedWonReason = textConfig(config, 'default_closed_won_reason', 'Classique');
  const associationTypeId = intConfig(config, 'deal_to_company_association_type_id', 5);
  const amount = Number(order.total_after_discount_ht || 0).toFixed(2);
  const dealname = `${order.pharmacies?.name || 'Pharmacie'}${order.order_number ? ` — ${order.order_number}` : ''}`;
  const discountLabel = formatHubSpotDiscount(order.discount_rate);

  return hubspotPost<{ id: string }>('/crm/v3/objects/deals', token, {
    properties: {
      dealname,
      pipeline: pipelineId,
      dealstage,
      hubspot_owner_id: ownerId,
      amount,
      type_de_commande: hubspotOrderType(order.order_type),
      origine_de_la_commande: origin,
      prise_de_commande: ownerId,
      closed_won_reason: closedWonReason,
      ...(discountLabel ? { remise____: discountLabel } : {}),
      quantite: String((order.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
      montant_total: amount,
    },
    associations: [
      {
        to: { id: companyId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId,
          },
        ],
      },
    ],
  });
}

async function getLineItemDealAssociationTypeId(token: string) {
  try {
    const response = await hubspotGet<{ results?: Array<{ typeId?: number; category?: string }> }>(
      '/crm/v4/associations/line_items/deals/labels',
      token,
    );
    const hubspotDefined = response.results?.find((item) => item.category === 'HUBSPOT_DEFINED' && item.typeId);
    return hubspotDefined?.typeId || response.results?.[0]?.typeId || 20;
  } catch (_) {
    return 20;
  }
}

async function createHubSpotLineItems(order: Order, dealId: string, token: string) {
  const items = order.order_items || [];
  if (items.length === 0) return { created: 0 };

  const associationTypeId = await getLineItemDealAssociationTypeId(token);

  await Promise.all(items.map((item) => {
    const discountRate = Number(item.discount_rate || order.discount_rate || 0);
    const properties: Record<string, string> = {
      name: item.product_name_snapshot,
      quantity: String(item.quantity || 0),
      price: Number(item.unit_price_ht || 0).toFixed(2),
      amount: Number(item.line_total_ht || 0).toFixed(2),
      hs_line_item_currency_code: 'EUR',
    };
    if (item.reference_snapshot || item.products?.reference) {
      properties.hs_sku = item.reference_snapshot || item.products?.reference || '';
    }
    if (item.products?.hubspot_product_id) {
      properties.hs_product_id = item.products.hubspot_product_id;
    }
    if (discountRate > 0) {
      properties.hs_discount_percentage = String(discountRate);
    }

    return hubspotPost('/crm/v3/objects/line_items', token, {
      properties,
      associations: [
        {
          to: { id: dealId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId,
            },
          ],
        },
      ],
    });
  }));

  return { created: items.length };
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

  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId) return jsonResponse({ error: 'orderId is required.' }, 400);

  const agent = await getAgentForUser(userId);
  if (!agent) return jsonResponse({ error: 'Profil agent introuvable.' }, 403);

  const order = await getOrder(orderId);
  if (!order) return jsonResponse({ error: 'Commande introuvable.' }, 404);
  if (order.agent_id !== agent.id) return jsonResponse({ error: 'Commande non autorisée pour cet agent.' }, 403);

  const integration = await getBrandIntegration(order.brand_id);
  if (!integration) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: 'Aucun connecteur HubSpot actif pour cette marque.',
    });
  }

  const existingLink = await getExistingSyncLink(integration.id, order.id);
  if (existingLink?.status === 'synced' && existingLink.external_object_id) {
    return jsonResponse({
      ok: true,
      alreadySynced: true,
      provider: 'hubspot',
      externalObjectId: existingLink.external_object_id,
    });
  }

  try {
    await upsertSyncLink(integration.id, order.id, 'pending', {
      order_id: order.id,
      brand: order.brands?.name || null,
    });

    const deal = await createHubSpotDeal(order, integration, token);
    let lineItems: { created: number; warning?: string } = { created: 0 };
    try {
      lineItems = await createHubSpotLineItems(order, deal.id, token);
    } catch (lineItemError) {
      lineItems = {
        created: 0,
        warning: lineItemError instanceof Error ? lineItemError.message : 'HubSpot line item sync failed.',
      };
    }
    await upsertSyncLink(integration.id, order.id, 'synced', {
      order_id: order.id,
      order_number: order.order_number,
      brand: order.brands?.name || null,
      pharmacy: order.pharmacies?.name || null,
      hubspot_company_id: order.pharmacies?.hubspot_company_id || null,
      hubspot_line_items: lineItems.created,
    }, deal.id);
    await recordIntegrationEvent({
      order_id: order.id,
      order_number: order.order_number,
      brand_integration_id: integration.id,
      brand: order.brands?.name || null,
      amount: order.total_after_discount_ht,
      line_items: lineItems.created,
    }, deal.id);

    return jsonResponse({
      ok: true,
      provider: 'hubspot',
      externalObjectType: 'deal',
      externalObjectId: deal.id,
      lineItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HubSpot order sync failed.';
    await upsertSyncLink(integration.id, order.id, 'error', {
      order_id: order.id,
      brand: order.brands?.name || null,
    }, undefined, message);
    await recordIntegrationEvent({
      order_id: order.id,
      brand_integration_id: integration.id,
      error: message,
    });
    return jsonResponse({ error: message }, 502);
  }
});

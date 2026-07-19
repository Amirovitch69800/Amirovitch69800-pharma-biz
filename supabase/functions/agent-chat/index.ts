const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type PharmacySummary = {
  name: string;
  city: string;
  dn: string | null;
  lastOrder: string | null;
  daysSinceOrder: number | null;
  priority: string | null;
  revenue: number | null;
  action: string;
};

type AgentContext = {
  agentName: string;
  date: string;
  totalPharmacies: number;
  totalRevenue: number;
  dnRate: string;
  urgentCount: number;
  pharmacies: PharmacySummary[];
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

async function getUser(authorization: string) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function supabaseRest<T>(path: string) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text ? JSON.parse(text) as T : null as T;
}

function encodeInFilter(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(',');
}

function getOrderTotal(order: Record<string, unknown>) {
  return Number(order.total_after_discount_ht || order.total_ht || order.amount || 0) || 0;
}

function getOrderDate(order: Record<string, unknown>) {
  return String(order.order_date || order.created_at || '');
}

async function buildServerContext(authorization: string, fallbackContext: Partial<AgentContext>): Promise<AgentContext> {
  const user = await getUser(authorization);
  if (!user?.id) throw new Error('Session invalide.');

  const [profile] = await supabaseRest<Array<Record<string, unknown>>>(
    `profiles?select=*&id=eq.${user.id}&limit=1`,
  ).catch(() => []);
  const [agent] = await supabaseRest<Array<Record<string, unknown>>>(
    `agents?select=*&user_id=eq.${user.id}&limit=1`,
  ).catch(() => []);

  if (!agent?.id) throw new Error('Profil agent introuvable.');

  const portfolio = await supabaseRest<Array<Record<string, unknown>>>(
    `agent_portfolios?select=pharmacy_id,priority,next_action_at,pharmacies(*)&agent_id=eq.${agent.id}&status=eq.active&limit=200`,
  ).catch(() => []);
  const pharmacyIds = portfolio.map((item) => String(item.pharmacy_id || '')).filter(Boolean);
  const fallbackByName = new Map((fallbackContext.pharmacies || []).map((item) => [String(item.name || '').toLowerCase(), item]));

  const orders = pharmacyIds.length
    ? await supabaseRest<Array<Record<string, unknown>>>(
      `v_orders_summary?select=*&pharmacy_id=in.(${encodeInFilter(pharmacyIds)})&order=created_at.desc&limit=1000`,
    ).catch(() => [])
    : [];
  const ordersByPharmacy = orders.reduce((acc, order) => {
    const pharmacyId = String(order.pharmacy_id || '');
    if (!acc.has(pharmacyId)) acc.set(pharmacyId, []);
    acc.get(pharmacyId)?.push(order);
    return acc;
  }, new Map<string, Array<Record<string, unknown>>>());

  const pharmacies = portfolio.map((item) => {
    const pharmacy = (item.pharmacies || {}) as Record<string, unknown>;
    const name = String(pharmacy.name || 'Pharmacie');
    const pharmacyOrders = ordersByPharmacy.get(String(item.pharmacy_id || '')) || [];
    const lastOrder = pharmacyOrders
      .map(getOrderDate)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const fallback = fallbackByName.get(name.toLowerCase());
    const lastOrderDate = lastOrder ? new Date(lastOrder) : null;
    return {
      action: fallback?.action || (pharmacyOrders.length ? 'Suivre' : 'Qualifier'),
      city: String(pharmacy.city || ''),
      daysSinceOrder: lastOrderDate && !Number.isNaN(lastOrderDate.getTime())
        ? Math.floor((Date.now() - lastOrderDate.getTime()) / 86400000)
        : null,
      dn: fallback?.dn || null,
      lastOrder,
      name,
      priority: String(item.priority || fallback?.priority || ''),
      revenue: pharmacyOrders.reduce((sum, order) => sum + getOrderTotal(order), 0),
    };
  });

  return {
    agentName: String(profile?.full_name || profile?.name || user.email || 'Agent PharmaBiz'),
    date: new Date().toLocaleDateString('fr-FR'),
    dnRate: String(fallbackContext.dnRate || 'Non calculée'),
    pharmacies,
    totalPharmacies: pharmacies.length,
    totalRevenue: pharmacies.reduce((sum, pharmacy) => sum + Number(pharmacy.revenue || 0), 0),
    urgentCount: pharmacies.filter((pharmacy) => ['priority', 'high'].includes(String(pharmacy.priority))).length,
  };
}

function sanitizeMessages(messages: Message[]) {
  return (messages || [])
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 1200),
    }))
    .filter((message) => message.content.trim());
}

function buildSystemPrompt(context: AgentContext): string {
  const pharmacyLines = (context.pharmacies || [])
    .slice(0, 40)
    .map((p) => {
      const parts = [
        p.name,
        p.city,
        p.action,
        p.dn ? `DN ${p.dn}` : null,
        p.daysSinceOrder !== null ? `derniere commande il y a ${p.daysSinceOrder}j` : p.lastOrder ? `derniere commande ${p.lastOrder}` : 'aucune commande',
        p.revenue ? `CA ${p.revenue}EUR` : null,
        p.priority === 'priority' || p.priority === 'high' ? 'PRIORITAIRE' : null,
      ].filter(Boolean).join(' | ');
      return `- ${parts}`;
    })
    .join('\n');

  return `Tu es un assistant commercial terrain pour ${context.agentName}, agent VRP multi-marques pharmaceutique en France.

Date du jour : ${context.date}
Portefeuille : ${context.totalPharmacies} pharmacies actives
CA suivi total : ${context.totalRevenue} EUR
DN produit moyenne : ${context.dnRate}
Comptes urgents : ${context.urgentCount}

PORTEFEUILLE DÉTAILLÉ :
${pharmacyLines}

Ton rôle :
- Aider l'agent à prioriser ses actions terrain du jour
- Suggérer des pharmacies à visiter ou relancer
- Préparer des arguments de vente pour les réassorts
- Analyser le portefeuille et identifier les opportunités
- Répondre en français, de façon concise et orientée action
- Ne jamais inventer de données : utilise uniquement ce qui est fourni ci-dessus

Si on te pose une question sur une pharmacie spécifique, réponds en te basant sur ses données du portefeuille.
Si une donnée est manquante, dis-le clairement.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Session PharmaBiz requise.' }, 401);
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      return jsonResponse({ error: 'Clé OpenAI non configurée.' }, 500);
    }

    const body = await req.json();
    const messages = sanitizeMessages(body.messages || []);
    const context = await buildServerContext(authorization, body.context || {});

    if (!messages.length) {
      return jsonResponse({ error: 'Aucun message fourni.' }, 400);
    }

    const systemPrompt = buildSystemPrompt(context);
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_AGENT_CHAT_MODEL') || 'gpt-4o',
        messages: openaiMessages,
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      return jsonResponse({ error: `OpenAI error: ${err}` }, 502);
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || '';

    return jsonResponse({ reply });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { createGoogleCalendarEvent } from '../../lib/integrations.js';

const emptyAgentState = {
  profile: null,
  agent: null,
  capabilities: [],
  brandAssignments: [],
  portfolio: [],
  brands: [],
  products: [],
  pharmacies: [],
  relations: [],
  orders: [],
  orderItems: [],
  followUps: [],
  activities: [],
  integrationConnections: [],
  calendarEvents: [],
  whatsappMessages: [],
  aiActions: [],
};

function isMissingTable(error) {
  return error?.code === '42P01' || /does not exist/i.test(error?.message || '');
}

function uniqueById(items) {
  const byId = new Map();
  (items || []).forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return Array.from(byId.values());
}

function portfolioFromLegacyData({ pharmacies, relations }) {
  const relationPharmacies = (relations || [])
    .map((relation) => relation.pharmacies ? {
      id: relation.pharmacy_id,
      name: relation.pharmacies.name,
      city: relation.pharmacies.city,
    } : null)
    .filter(Boolean);

  return uniqueById([...(pharmacies || []), ...relationPharmacies]).map((pharmacy) => ({
    id: `legacy-${pharmacy.id}`,
    pharmacy_id: pharmacy.id,
    status: 'active',
    priority: pharmacy.potential || 'medium',
    source: 'legacy',
    next_action_at: pharmacy.next_follow_up_at || null,
    pharmacies: pharmacy,
  }));
}

export function useAgentWorkspaceData(session) {
  const [state, setState] = useState(emptyAgentState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    setError('');

    const userId = session.user.id;
    const [profileResponse, agentResponse] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('agents').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const profile = profileResponse.data || null;
    const agent = agentResponse.data || null;

    if (profileResponse.error || agentResponse.error) {
      setError([profileResponse.error, agentResponse.error].filter(Boolean).map((item) => item.message).join(' · '));
      setState({ ...emptyAgentState, profile, agent });
      setLastSyncedAt(new Date());
      setLoading(false);
      return;
    }

    const calls = await Promise.all([
      supabase.from('user_capabilities').select('capability').eq('user_id', userId),
      agent?.id
        ? supabase.from('agent_brand_assignments').select('*, brands(*)').eq('agent_id', agent.id).eq('status', 'active')
        : Promise.resolve({ data: [], error: null }),
      agent?.id
        ? supabase.from('agent_portfolios').select('*, pharmacies(*)').eq('agent_id', agent.id).eq('status', 'active').order('updated_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from('brands').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('pharmacies').select('*').neq('hubspot_sync_status', 'out_of_scope').order('name'),
      supabase.from('pharmacy_brand_relations').select('*, brands(name), pharmacies(name, city)').order('updated_at', { ascending: false }),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*, orders(id, brand_id, pharmacy_id, status, order_type, order_date, created_at), products(name, category)').order('created_at', { ascending: false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name), brands(name)').order('due_at', { ascending: true }),
      supabase.from('activities').select('*, pharmacies(name), brands(name)').order('activity_date', { ascending: false }).limit(100),
      supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('ai_actions').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('integration_connections').select('*').eq('user_id', userId),
      supabase.from('integration_events').select('*').eq('provider', 'google').order('created_at', { ascending: false }).limit(100),
    ]);

    const capabilitiesMissing = isMissingTable(calls[0].error);
    const assignmentsMissing = isMissingTable(calls[1].error);
    const portfoliosMissing = isMissingTable(calls[2].error);
    const orderItemsMissing = isMissingTable(calls[8].error);
    const activitiesMissing = isMissingTable(calls[10].error);
    const integrationsMissing = isMissingTable(calls[13].error);
    const integrationEventsMissing = isMissingTable(calls[14].error);

    const errors = calls
      .map((result, index) => {
        if (index === 0 && capabilitiesMissing) return null;
        if (index === 1 && assignmentsMissing) return null;
        if (index === 2 && portfoliosMissing) return null;
        if (index === 8 && orderItemsMissing) return null;
        if (index === 10 && activitiesMissing) return null;
        if (index === 13 && integrationsMissing) return null;
        if (index === 14 && integrationEventsMissing) return null;
        return result.error;
      })
      .filter(Boolean);

    const allRelations = calls[6].data || [];
    const allPharmacies = calls[5].data || [];
    const portfolio = portfoliosMissing || !calls[2].data?.length
      ? portfolioFromLegacyData({ pharmacies: allPharmacies, relations: allRelations })
      : calls[2].data || [];
    const portfolioPharmacyIds = new Set(portfolio.map((item) => item.pharmacy_id).filter(Boolean));
    const assignedBrandIds = new Set((calls[1].data || []).map((item) => item.brand_id));
    const relations = allRelations.filter((relation) => {
      const belongsToPortfolio = portfolioPharmacyIds.has(relation.pharmacy_id);
      const belongsToAssignedBrand = !assignedBrandIds.size || assignedBrandIds.has(relation.brand_id);
      return belongsToPortfolio && belongsToAssignedBrand;
    });
    const pharmacies = allPharmacies.filter((pharmacy) => portfolioPharmacyIds.has(pharmacy.id));

    const relationBrandIds = new Set(relations.map((item) => item.brand_id).filter(Boolean));
    const visibleBrandIds = new Set([...assignedBrandIds, ...relationBrandIds]);

    const brands = (calls[3].data || []).filter((brand) => !visibleBrandIds.size || visibleBrandIds.has(brand.id));
    const products = (calls[4].data || []).filter((product) => !visibleBrandIds.size || visibleBrandIds.has(product.brand_id));

    const orders = (calls[7].data || []).filter((order) => portfolioPharmacyIds.has(order.pharmacy_id));
    const orderItems = orderItemsMissing ? [] : (calls[8].data || [])
      .map((item) => ({
        ...item,
        brand_id: item.orders?.brand_id,
        pharmacy_id: item.orders?.pharmacy_id,
      }))
      .filter((item) => portfolioPharmacyIds.has(item.pharmacy_id));
    const followUps = (calls[9].data || []).filter((task) => portfolioPharmacyIds.has(task.pharmacy_id));
    const activities = activitiesMissing ? [] : (calls[10].data || []).filter((activity) => portfolioPharmacyIds.has(activity.pharmacy_id));

    setState({
      profile,
      agent,
      capabilities: capabilitiesMissing ? [] : (calls[0].data || []).map((item) => item.capability),
      brandAssignments: assignmentsMissing ? [] : calls[1].data || [],
      portfolio,
      brands,
      products,
      pharmacies,
      relations,
      orders,
      orderItems,
      followUps,
      activities,
      integrationConnections: integrationsMissing ? [] : calls[13].data || [],
      calendarEvents: integrationEventsMissing ? [] : calls[14].data || [],
      whatsappMessages: calls[11].data || [],
      aiActions: calls[12].data || [],
    });
    setError(errors.map((item) => item.message).join(' · '));
    setLastSyncedAt(new Date());
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const createFieldActivity = useCallback(async ({ activityDate, brandId, durationMinutes, notes, pharmacyId, syncGoogleCalendar = false, title, type }) => {
    if (!state.agent?.id) return { error: 'Profil agent introuvable.' };
    if (!pharmacyId) return { error: 'Sélectionne une pharmacie.' };

    const scheduledAt = activityDate ? new Date(activityDate) : new Date();
    if (Number.isNaN(scheduledAt.getTime())) return { error: 'Date de visite invalide.' };

    const { data: insertedActivity, error: insertError } = await supabase.from('activities').insert({
      agent_id: state.agent.id,
      pharmacy_id: pharmacyId,
      brand_id: brandId || null,
      activity_type: type || 'note',
      activity_date: scheduledAt.toISOString(),
      title: title || 'Action terrain',
      notes: notes || null,
      completed_at: activityDate ? null : new Date().toISOString(),
      created_by: state.profile?.id || null,
    }).select('id').single();

    if (insertError) return { error: insertError.message };

    let calendar = null;
    if (syncGoogleCalendar && insertedActivity?.id) {
      calendar = await createGoogleCalendarEvent({
        activityId: insertedActivity.id,
        durationMinutes,
      });
    }

    await load();
    if (calendar?.error) return { error: null, calendarWarning: calendar.error, activityId: insertedActivity?.id || null };
    return { error: null, calendar: calendar?.data || null, activityId: insertedActivity?.id || null };
  }, [load, state.agent?.id, state.profile?.id]);

  const createFollowUp = useCallback(async ({ brandId, dueAt, pharmacyId, priority, reason, title }) => {
    if (!state.agent?.id) return { error: 'Profil agent introuvable.' };
    if (!pharmacyId) return { error: 'Sélectionne une pharmacie.' };

    const { error: insertError } = await supabase.from('follow_up_tasks').insert({
      agent_id: state.agent.id,
      pharmacy_id: pharmacyId,
      brand_id: brandId || null,
      title: title || 'Relancer la pharmacie',
      reason: reason || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      priority: priority || 'medium',
      status: 'todo',
      created_by: state.profile?.id || null,
    });

    if (insertError) return { error: insertError.message };
    await load();
    return { error: null };
  }, [load, state.agent?.id, state.profile?.id]);

  const createOrderDraft = useCallback(async ({ brandId, items, notes, pharmacyId }) => {
    if (!state.agent?.id) return { error: 'Profil agent introuvable.' };
    if (!pharmacyId || !brandId) return { error: 'Sélectionne une pharmacie et une marque.' };
    const orderLines = (items || [])
      .map((item) => {
        const product = state.products.find((candidate) => candidate.id === item.productId);
        const quantity = Math.max(0, Number(item.quantity || 0));
        const unitPriceHt = Math.max(0, Number(product?.unit_price_ht || item.unitPriceHt || 0));
        const discountRate = Math.min(100, Math.max(0, Number(item.discountRate || 0)));
        const lineTotalHt = Number((quantity * unitPriceHt * (1 - discountRate / 100)).toFixed(2));
        return {
          discountRate,
          lineTotalHt,
          product,
          productId: item.productId,
          quantity,
          unitPriceHt,
        };
      })
      .filter((item) => item.product && item.quantity > 0);
    if (!orderLines.length) return { error: 'Sélectionne au moins un produit avec une quantité.' };

    const totalHt = Number(orderLines.reduce((sum, item) => sum + item.lineTotalHt, 0).toFixed(2));
    const vatAmount = Number((totalHt * 0.2).toFixed(2));
    const totalTtc = Number((totalHt + vatAmount).toFixed(2));

    const { data: insertedOrder, error: insertError } = await supabase.from('orders').insert({
      order_number: `PB-${Date.now().toString().slice(-8)}`,
      pharmacy_id: pharmacyId,
      brand_id: brandId,
      agent_id: state.agent.id,
      attributed_agent_id: state.agent.id,
      status: 'draft',
      order_type: 'reassort',
      order_date: new Date().toISOString().slice(0, 10),
      source: 'spontaneous',
      created_by_type: 'agent',
      validation_status: 'not_required',
      total_ht: totalHt,
      discount_rate: 0,
      discount_amount_ht: 0,
      total_after_discount_ht: totalHt,
      vat_amount: vatAmount,
      total_ttc: totalTtc,
      notes: notes || 'Brouillon commande créé depuis l’espace agent.',
      created_by: state.profile?.id || null,
    }).select('id').single();

    if (insertError) return { error: insertError.message };
    if (insertedOrder?.id && orderLines.length) {
      const { error: itemsError } = await supabase.from('order_items').insert(orderLines.map((item) => ({
        order_id: insertedOrder.id,
        product_id: item.productId,
        product_name_snapshot: item.product.name,
        reference_snapshot: item.product.reference || null,
        quantity: item.quantity,
        pcb: item.product.pcb || null,
        unit_price_ht: item.unitPriceHt,
        discount_rate: item.discountRate,
      })));
      if (itemsError) return { error: itemsError.message };
    }
    await load();
    return { error: null, orderId: insertedOrder?.id || null };
  }, [load, state.agent?.id, state.products, state.profile?.id]);

  return {
    clearError: () => setError(''),
    createFieldActivity,
    createFollowUp,
    createOrderDraft,
    error,
    lastSyncedAt,
    loading,
    reload: load,
    state,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const emptyState = {
  profile: null,
  agent: null,
  brands: [],
  products: [],
  pharmacies: [],
  relations: [],
  orders: [],
  commissions: [],
  followUps: [],
  appointments: [],
  whatsappMessages: [],
  aiActions: [],
  integrations: [],
  integrationsReady: true,
};

export function useWorkspaceData(session) {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    setError('');
    const userId = session.user.id;
    const calls = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('agents').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('brands').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('pharmacies').select('*').neq('hubspot_sync_status', 'out_of_scope').order('name'),
      supabase.from('pharmacy_brand_relations').select('*, brands(name), pharmacies(name, city)').order('updated_at', { ascending: false }),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*, brands(name), orders(order_number, pharmacies(name))').order('created_at', { ascending: false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name), brands(name)').order('due_at', { ascending: true }),
      supabase.from('appointment_requests').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('ai_actions').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }).limit(20),
      supabase.from('integration_connections').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    ]);

    const integrationTableMissing = calls[12].error?.code === '42P01';
    const errors = calls
      .map((result, index) => (index === 12 && integrationTableMissing ? null : result.error))
      .filter(Boolean);
    setState({
      profile: calls[0].data,
      agent: calls[1].data,
      brands: calls[2].data || [],
      products: calls[3].data || [],
      pharmacies: calls[4].data || [],
      relations: calls[5].data || [],
      orders: calls[6].data || [],
      commissions: calls[7].data || [],
      followUps: calls[8].data || [],
      appointments: calls[9].data || [],
      whatsappMessages: calls[10].data || [],
      aiActions: calls[11].data || [],
      integrations: integrationTableMissing ? [] : calls[12].data || [],
      integrationsReady: !integrationTableMissing,
    });
    setError(errors.map((item) => item.message).join(' · '));
    setLastSyncedAt(new Date());
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const createTask = useCallback(async (task) => {
    if (!state.agent?.id) {
      return { error: 'Profil agent introuvable. La tâche ne peut pas être créée.' };
    }

    const { error: insertError } = await supabase.from('follow_up_tasks').insert({
      agent_id: state.agent.id,
      pharmacy_id: task.pharmacyId || null,
      brand_id: task.brandId || null,
      title: task.title,
      reason: task.reason || null,
      due_at: task.dueAt ? new Date(task.dueAt).toISOString() : null,
      priority: task.priority || 'medium',
      status: 'todo',
      created_by: state.profile?.id || null,
    });

    if (insertError) return { error: insertError.message };
    await load();
    return { error: null };
  }, [load, state.agent?.id, state.profile?.id]);

  const completeTask = useCallback(async (taskId) => {
    const { error: updateError } = await supabase.from('follow_up_tasks').update({ status: 'done' }).eq('id', taskId);
    if (updateError) return { error: updateError.message };
    await load();
    return { error: null };
  }, [load]);

  const updateRelation = useCallback(async (relationId, patch) => {
    const { error: updateError } = await supabase.from('pharmacy_brand_relations').update(patch).eq('id', relationId);
    if (updateError) return { error: updateError.message };
    await load();
    return { error: null };
  }, [load]);

  const addRelation = useCallback(async (pharmacyId, brandId) => {
    const { error: insertError } = await supabase.from('pharmacy_brand_relations').insert({
      pharmacy_id: pharmacyId,
      brand_id: brandId,
      agent_id: state.agent?.id || null,
      status: 'prospect',
      potential: 'medium',
      created_by: state.profile?.id || null,
    });
    if (insertError) return { error: insertError.message };
    await load();
    return { error: null };
  }, [load, state.agent?.id, state.profile?.id]);

  const createOrder = useCallback(async (order) => {
    if (!state.agent?.id) {
      return { error: 'Profil agent introuvable. La commande ne peut pas être créée.' };
    }
    if (!order.pharmacyId || !order.brandId) {
      return { error: 'Sélectionne une pharmacie et une marque.' };
    }

    const orderLines = (order.items || [])
      .map((item) => {
        const product = state.products.find((candidate) => candidate.id === item.productId);
        const quantity = Math.max(0, Number(item.quantity || 0));
        const unitPriceHt = Math.max(0, Number(item.unitPriceHt || product?.unit_price_ht || 0));
        const lineTotalHt = Number((quantity * unitPriceHt).toFixed(2));
        return {
          product,
          productId: item.productId || null,
          productName: product?.name || item.productName || 'Produit',
          reference: product?.reference || item.reference || null,
          quantity,
          unitPriceHt,
          lineTotalHt,
        };
      })
      .filter((item) => item.quantity > 0 && item.lineTotalHt >= 0);
    const totalHt = Number((orderLines.length
      ? orderLines.reduce((sum, item) => sum + item.lineTotalHt, 0)
      : Math.max(0, Number(order.totalHt || 0))).toFixed(2));
    const discountRate = Math.min(100, Math.max(0, Number(order.discountRate || 0)));
    const discountAmountHt = Number((totalHt * discountRate / 100).toFixed(2));
    const totalAfterDiscountHt = Number((totalHt - discountAmountHt).toFixed(2));
    const vatAmount = Number((totalAfterDiscountHt * 0.2).toFixed(2));
    const totalTtc = Number((totalAfterDiscountHt + vatAmount).toFixed(2));
    const orderDate = order.orderDate || new Date().toISOString().slice(0, 10);

    const { data: insertedOrder, error: insertError } = await supabase.from('orders').insert({
      order_number: order.orderNumber || `PB-${Date.now().toString().slice(-8)}`,
      pharmacy_id: order.pharmacyId,
      brand_id: order.brandId,
      agent_id: state.agent.id,
      status: order.status || 'draft',
      order_type: order.orderType || 'reassort',
      order_date: orderDate,
      total_ht: totalHt,
      discount_rate: discountRate,
      discount_amount_ht: discountAmountHt,
      total_after_discount_ht: totalAfterDiscountHt,
      vat_amount: vatAmount,
      total_ttc: totalTtc,
      brand_order_reference: order.brandOrderReference || null,
      notes: order.notes || null,
      created_by: state.profile?.id || null,
    }).select('id').single();

    if (insertError) return { error: insertError.message };

    if (insertedOrder?.id && orderLines.length > 0) {
      const { error: itemsError } = await supabase.from('order_items').insert(orderLines.map((item) => ({
        order_id: insertedOrder.id,
        product_id: item.productId,
        product_name_snapshot: item.productName,
        reference_snapshot: item.reference,
        quantity: item.quantity,
        pcb: item.product?.pcb || null,
        unit_price_ht: item.unitPriceHt,
        discount_rate: discountRate,
        line_total_ht: Number((item.lineTotalHt * (1 - discountRate / 100)).toFixed(2)),
      })));
      if (itemsError) return { error: itemsError.message };
    }

    let syncResult = null;
    if (insertedOrder?.id) {
      const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-order-to-hubspot', {
        body: {
          orderId: insertedOrder.id,
        },
      });
      syncResult = syncError ? { error: syncError.message } : syncData;
    }

    await load();
    if (syncResult?.error) return { error: null, syncWarning: syncResult.error };
    return { error: null, sync: syncResult };
  }, [load, state.agent?.id, state.products, state.profile?.id]);

  const getOrderCustomerContext = useCallback(async ({ pharmacyId, brandId }) => {
    if (!pharmacyId || !brandId) return { error: null, skipped: true };
    const { data, error: contextError } = await supabase.functions.invoke('hubspot-customer-context', {
      body: { pharmacyId, brandId },
    });
    if (contextError) return { error: contextError.message };
    return data || { error: null };
  }, []);

  return {
    state,
    loading,
    error,
    lastSyncedAt,
    clearError: () => setError(''),
    reload: load,
    createTask,
    completeTask,
    updateRelation,
    addRelation,
    createOrder,
    getOrderCustomerContext,
  };
}

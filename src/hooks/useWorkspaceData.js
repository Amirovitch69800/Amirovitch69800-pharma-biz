import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const emptyState = {
  profile: null,
  agent: null,
  brands: [],
  pharmacies: [],
  relations: [],
  orders: [],
  commissions: [],
  followUps: [],
  appointments: [],
  whatsappMessages: [],
  aiActions: [],
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
      supabase.from('pharmacies').select('*').order('name'),
      supabase.from('pharmacy_brand_relations').select('*, brands(name), pharmacies(name, city)').order('updated_at', { ascending: false }),
      supabase.from('v_orders_summary').select('*').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*, brands(name), orders(order_number), pharmacies(name)').order('created_at', { ascending: false }),
      supabase.from('follow_up_tasks').select('*, pharmacies(name), brands(name)').order('due_at', { ascending: true }),
      supabase.from('appointment_requests').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }),
      supabase.from('whatsapp_messages').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('ai_actions').select('*, pharmacies(name), brands(name)').order('created_at', { ascending: false }).limit(20),
    ]);

    const errors = calls.map((result) => result.error).filter(Boolean);
    setState({
      profile: calls[0].data,
      agent: calls[1].data,
      brands: calls[2].data || [],
      pharmacies: calls[3].data || [],
      relations: calls[4].data || [],
      orders: calls[5].data || [],
      commissions: calls[6].data || [],
      followUps: calls[7].data || [],
      appointments: calls[8].data || [],
      whatsappMessages: calls[9].data || [],
      aiActions: calls[10].data || [],
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
  };
}

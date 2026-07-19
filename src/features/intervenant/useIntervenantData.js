import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const emptyState = {
  profile: null,
  animator: null,
  missions: [],
  reports: [],
  assignments: [],
};

export function useIntervenantData(session) {
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError('');

    const userId = session.user.id;

    const [profileRes, animatorRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('field_animators').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const profile = profileRes.data || null;
    const animator = animatorRes.data || null;

    if (!animator) {
      setState({ ...emptyState, profile });
      setLoading(false);
      setLastSyncedAt(new Date());
      return;
    }

    const [missionsRes, reportsRes, assignmentsRes] = await Promise.all([
      supabase
        .from('field_missions')
        .select('*, pharmacies(name, city, address_line1, postal_code), brands(name, logo_url)')
        .eq('animator_id', animator.id)
        .order('starts_at', { ascending: true }),
      supabase
        .from('mission_reports')
        .select('*')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('mission_assignments')
        .select('*')
        .eq('animator_id', animator.id)
        .order('created_at', { ascending: false }),
    ]);

    const errors = [missionsRes.error, reportsRes.error, assignmentsRes.error].filter(Boolean);

    setState({
      profile,
      animator,
      missions: missionsRes.data || [],
      reports: reportsRes.data || [],
      assignments: assignmentsRes.data || [],
    });
    setError(errors.map((e) => e.message).join(' · '));
    setLastSyncedAt(new Date());
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => { load(); }, [load]);

  const acceptMission = useCallback(async (missionId) => {
    const { error: err } = await supabase
      .from('field_missions')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', missionId);
    if (err) return { error: err.message };
    await load();
    return { error: null };
  }, [load]);

  const refuseMission = useCallback(async (missionId) => {
    const { error: err } = await supabase
      .from('field_missions')
      .update({ status: 'refused', updated_at: new Date().toISOString() })
      .eq('id', missionId);
    if (err) return { error: err.message };
    await load();
    return { error: null };
  }, [load]);

  const submitReport = useCallback(async ({ missionId, unitsSold, revenueHt, comment }) => {
    const userId = session?.user?.id;
    if (!userId) return { error: 'Session manquante.' };

    const { error: reportErr } = await supabase.from('mission_reports').insert({
      mission_id: missionId,
      report_type: 'field',
      payload: { units_sold: unitsSold || 0, revenue_ht: revenueHt || 0 },
      comment: comment || null,
      status: 'submitted',
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
    });
    if (reportErr) return { error: reportErr.message };

    const { error: missionErr } = await supabase
      .from('field_missions')
      .update({ status: 'report_submitted', units_sold: unitsSold || 0, revenue_ht: revenueHt || 0, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', missionId);
    if (missionErr) return { error: missionErr.message };

    await load();
    return { error: null };
  }, [load, session?.user?.id]);

  return {
    acceptMission,
    error,
    lastSyncedAt,
    loading,
    refuseMission,
    reload: load,
    state,
    submitReport,
  };
}

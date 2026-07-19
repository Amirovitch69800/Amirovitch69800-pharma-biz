import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import AgentV3Root from '../agent/AgentV3Root.jsx';
import { useAgentWorkspaceData } from '../agent/useAgentWorkspaceData.js';
import IntervenantRoot from '../intervenant/IntervenantRoot.jsx';

function LoadingWorkspace() {
  return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de ton espace…</strong><span>Détection du profil en cours.</span></main>;
}

function AgentWorkspace({ session }) {
  const { clearError, createFieldActivity, createFollowUp, createMission, createOrderDraft, error, lastSyncedAt, loading, reload, state } = useAgentWorkspaceData(session);
  if (loading && !lastSyncedAt) return <LoadingWorkspace />;
  return (
    <AgentV3Root
      error={error}
      lastSyncedAt={lastSyncedAt}
      onClearError={clearError}
      onCreateActivity={createFieldActivity}
      onCreateFollowUp={createFollowUp}
      onCreateMission={createMission}
      onCreateOrderDraft={createOrderDraft}
      onReload={reload}
      onSignOut={() => supabase.auth.signOut()}
      session={session}
      state={state}
    />
  );
}

export default function Workspace({ preferredRole = null, session }) {
  const [role, setRole] = useState(null);

  useEffect(() => {
    async function detectRole() {
      const userId = session?.user?.id;
      if (preferredRole === 'intervenant') { setRole('intervenant'); return; }
      if (!userId) { setRole('agent'); return; }
      const { data } = await supabase.from('field_animators').select('id').eq('user_id', userId).maybeSingle();
      setRole(data ? 'intervenant' : 'agent');
    }
    detectRole();
  }, [preferredRole, session?.user?.id]);

  if (!role) return <LoadingWorkspace />;
  if (role === 'intervenant') return <IntervenantRoot session={session} />;
  return <AgentWorkspace session={session} />;
}

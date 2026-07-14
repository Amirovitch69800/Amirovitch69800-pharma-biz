import React from 'react';
import { supabase } from '../../lib/supabase.js';
import AgentV3Root from '../agent/AgentV3Root.jsx';
import { useAgentWorkspaceData } from '../agent/useAgentWorkspaceData.js';

function LoadingWorkspace() {
  return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de ton espace terrain…</strong><span>Synchronisation du portefeuille pharmacie.</span></main>;
}

export default function Workspace({ session }) {
  const { clearError, createFieldActivity, createFollowUp, createOrderDraft, error, lastSyncedAt, loading, reload, state } = useAgentWorkspaceData(session);

  if (loading && !lastSyncedAt) return <LoadingWorkspace />;

  return (
    <AgentV3Root
      error={error}
      lastSyncedAt={lastSyncedAt}
      onClearError={clearError}
      onCreateActivity={createFieldActivity}
      onCreateFollowUp={createFollowUp}
      onCreateOrderDraft={createOrderDraft}
      onReload={reload}
      onSignOut={() => supabase.auth.signOut()}
      session={session}
      state={state}
    />
  );
}

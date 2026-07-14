import React from 'react';
import BrandPortal from '../../BrandPortal.jsx';
import { useWorkspaceData } from '../../hooks/useWorkspaceData.js';
import { supabase } from '../../lib/supabase.js';

function LoadingWorkspace() {
  return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de l’espace marque…</strong><span>Chargement des demandes et performances.</span></main>;
}

export default function BrandWorkspace({ session }) {
  const { createBrandRequest, lastSyncedAt, loading, state } = useWorkspaceData(session);

  if (loading && !lastSyncedAt) return <LoadingWorkspace />;

  return (
    <main className="pb-role-workspace">
      <header className="pb-role-topbar">
        <button className="pb-brand" type="button"><span className="pb-brand-mark">PB</span><span><strong>PharmaBiz</strong><small>Espace marque</small></span></button>
        <button className="pb-button pb-button-secondary" onClick={() => supabase.auth.signOut()} type="button">Se déconnecter</button>
      </header>
      <BrandPortal onCreateRequest={createBrandRequest} state={state} />
    </main>
  );
}

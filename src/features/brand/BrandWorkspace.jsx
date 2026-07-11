import React from 'react';
import BrandPortal from '../../BrandPortal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { useWorkspaceData } from '../../hooks/useWorkspaceData.js';
import { supabase } from '../../lib/supabase.js';

export default function BrandWorkspace({ session }) {
  const { error, lastSyncedAt, loading, reload, state } = useWorkspaceData(session);

  if (loading && !lastSyncedAt) {
    return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de votre espace marque…</strong><span>Synchronisation de votre activité.</span></main>;
  }

  return (
    <main className="bp-workspace">
      <header className="bp-workspace-topbar">
        <div className="bp-workspace-brand"><span className="pb-brand-mark">PB</span><span><strong>PharmaBiz</strong><small>Espace marque</small></span></div>
        <div className="bp-workspace-actions">
          <button aria-label="Actualiser" className="pb-icon-button" onClick={reload} type="button"><Icon name="refresh" size={18} /></button>
          <span>{session.user.email}</span>
          <button className="pb-button pb-button-secondary" onClick={() => supabase.auth.signOut()} type="button">Se déconnecter</button>
        </div>
      </header>
      <div className="bp-workspace-content">
        {error && <div className="pb-alert" role="alert"><span>{error}</span></div>}
        <BrandPortal session={session} state={state} />
      </div>
    </main>
  );
}

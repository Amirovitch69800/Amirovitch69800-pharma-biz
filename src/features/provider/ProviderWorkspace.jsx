import React, { useState } from 'react';
import CrmShell from '../../components/layout/CrmShell.jsx';
import FieldMissions from '../../FieldMissions.jsx';
import { useWorkspaceData } from '../../hooks/useWorkspaceData.js';
import { supabase } from '../../lib/supabase.js';

const providerNavigation = [
  { label: 'Terrain', items: [['missions', 'Mes missions', 'check'], ['agenda', 'Agenda', 'calendar'], ['reports', 'Comptes rendus', 'board']] },
  { label: 'Profil', items: [['payments', 'Rémunérations', 'chart'], ['documents', 'Documents', 'database'], ['profile', 'Mon profil', 'user']] },
];

function Placeholder({ title, text }) {
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Espace prestataire</span><h1>{title}</h1><p>{text}</p></div></div><div className="pb-card"><div className="pb-empty-state"><strong>Module en préparation</strong><span>Cette vue sera alimentée par les missions, preuves, indisponibilités et paiements liés au profil.</span></div></div></section>;
}

export default function ProviderWorkspace({ session }) {
  const { clearError, error, lastSyncedAt, loading, reload, state } = useWorkspaceData(session);
  const [activeTab, setActiveTab] = useState('missions');

  if (loading && !lastSyncedAt) return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de ton espace mission…</strong><span>Chargement des briefs et rémunérations.</span></main>;

  const content = activeTab === 'missions'
    ? <FieldMissions canManage={false} state={state} title="Mes missions" />
    : <Placeholder title={providerNavigation.flatMap((group) => group.items).find(([key]) => key === activeTab)?.[1] || 'Mon espace'} text="Les vues agenda, disponibilités, comptes rendus, rémunérations et documents sont séparées de l’espace agent." />;

  return <CrmShell activeTab={activeTab} error={error} lastSyncedAt={lastSyncedAt} navigation={providerNavigation} onClearError={clearError} onCreateActivity={() => setActiveTab('agenda')} onOpenAccount={() => {}} onReload={reload} onSignOut={() => supabase.auth.signOut()} onTabChange={setActiveTab} profile={state.profile} search="" searchResults={[]} session={session} setSearch={() => {}} workspaceLabel="Espace mission">{content}</CrmShell>;
}

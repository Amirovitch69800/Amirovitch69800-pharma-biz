import React, { useMemo, useState } from 'react';
import CrmShell from '../../components/layout/CrmShell.jsx';
import { useWorkspaceData } from '../../hooks/useWorkspaceData.js';
import { supabase } from '../../lib/supabase.js';
import AccountsView from '../accounts/AccountsView.jsx';
import ActivitiesView from '../activities/ActivitiesView.jsx';
import Dashboard from '../dashboard/Dashboard.jsx';
import IntegrationsView from '../integrations/IntegrationsView.jsx';
import PipelineView from '../pipeline/PipelineView.jsx';
import FieldMissions from '../../FieldMissions.jsx';
import {
  AttentionCenterView,
  BrandsView,
  CommissionsView,
  OrdersView,
  SettingsView,
} from './BusinessViews.jsx';

function LoadingWorkspace() {
  return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation de ton espace terrain…</strong><span>Synchronisation du portefeuille pharmacie.</span></main>;
}

export default function Workspace({ session }) {
  const { addRelation, clearError, completeTask, createOrder, createTask, error, getOrderCustomerContext, lastSyncedAt, loading, reload, state, updateRelation } = useWorkspaceData(session);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [composerKey, setComposerKey] = useState(0);

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return state.pharmacies.filter((pharmacy) => [pharmacy.name, pharmacy.city, pharmacy.postal_code, pharmacy.groupement].filter(Boolean).join(' ').toLowerCase().includes(query)).slice(0, 6);
  }, [search, state.pharmacies]);

  function openAccount(pharmacyId) { setSelectedAccountId(pharmacyId); setActiveTab('accounts'); }
  function createActivity() { setActiveTab('activities'); setComposerKey((key) => key + 1); }
  function selectAccount(pharmacyId) { setSelectedAccountId(pharmacyId); }

  if (loading && !lastSyncedAt) return <LoadingWorkspace />;

  let content;
  if (activeTab === 'dashboard') content = <Dashboard onCompleteTask={completeTask} onNavigate={setActiveTab} onOpenAccount={openAccount} state={state} />;
  else if (activeTab === 'accounts') content = <AccountsView onAddRelation={addRelation} onCreateTask={createTask} onSelectAccount={selectAccount} onUpdateRelation={updateRelation} selectedAccountId={selectedAccountId} state={state} />;
  else if (activeTab === 'pipeline') content = <PipelineView onOpenAccount={openAccount} state={state} />;
  else if (activeTab === 'activities') content = <ActivitiesView composerKey={composerKey} onCompleteTask={completeTask} onCreateTask={createTask} state={state} />;
  else if (activeTab === 'orders') content = <OrdersView onCreateOrder={createOrder} onGetCustomerContext={getOrderCustomerContext} state={state} />;
  else if (activeTab === 'commissions') content = <CommissionsView state={state} />;
  else if (activeTab === 'brands') content = <BrandsView state={state} />;
  else if (activeTab === 'field-network') content = <FieldMissions state={state} />;
  else if (activeTab === 'assistant') content = <AttentionCenterView state={state} />;
  else if (activeTab === 'integrations') content = <IntegrationsView state={state} />;
  else content = <SettingsView lastSyncedAt={lastSyncedAt} profile={state.profile} session={session} state={state} />;

  return <CrmShell activeTab={activeTab} error={error} lastSyncedAt={lastSyncedAt} onClearError={clearError} onCreateActivity={createActivity} onOpenAccount={openAccount} onReload={reload} onSignOut={() => supabase.auth.signOut()} onTabChange={setActiveTab} profile={state.profile} search={search} searchResults={searchResults} session={session} setSearch={setSearch}>{content}</CrmShell>;
}

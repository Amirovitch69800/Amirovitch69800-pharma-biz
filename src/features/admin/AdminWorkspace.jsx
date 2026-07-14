import React, { useMemo, useState } from 'react';
import CrmShell from '../../components/layout/CrmShell.jsx';
import FieldMissions from '../../FieldMissions.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { formatMoney, formatDate } from '../../lib/formatters.js';
import { useWorkspaceData } from '../../hooks/useWorkspaceData.js';
import { supabase } from '../../lib/supabase.js';

const adminNavigation = [
  { label: 'Ops', items: [['dashboard', 'Centre opérationnel', 'home'], ['requests', 'Demandes marques', 'sparkles'], ['campaigns', 'Campagnes', 'board'], ['matching', 'Matching', 'filter']] },
  { label: 'Contrôle', items: [['missions', 'Missions', 'check'], ['network', 'Réseau', 'user'], ['orders', 'Commandes', 'bag'], ['payments', 'Paiements', 'chart']] },
  { label: 'Pilotage', items: [['incidents', 'Incidents', 'phone'], ['reporting', 'Reporting', 'database'], ['admin', 'Administration', 'settings']] },
];

function LoadingWorkspace() {
  return <main className="pb-boot"><div className="pb-boot-mark">PB</div><strong>Préparation du centre opérationnel…</strong><span>Lecture des demandes, missions et validations.</span></main>;
}

export default function AdminWorkspace({ session }) {
  const { clearError, error, lastSyncedAt, loading, reload, state } = useWorkspaceData(session);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notice, setNotice] = useState('');

  const ops = useMemo(() => {
    const requests = state.brandRequests || [];
    const campaigns = state.campaigns || [];
    const missions = state.missions || [];
    return {
      toQualify: requests.filter((item) => ['submitted', 'qualifying', 'waiting_for_information'].includes(item.status)).length,
      blocked: requests.filter((item) => item.status === 'waiting_for_information').length,
      campaignsToPrepare: campaigns.filter((item) => ['draft', 'approved', 'staffing'].includes(item.status)).length,
      unassigned: missions.filter((item) => ['draft', 'approved', 'published'].includes(item.status) && !item.animator_id).length,
      reports: missions.filter((item) => item.status === 'completed').length,
      payments: missions.filter((item) => item.status === 'validated' || item.payment_status === 'approved').length,
    };
  }, [state.brandRequests, state.campaigns, state.missions]);

  async function updateRequestStatus(id, status) {
    setNotice('');
    const { error: updateError } = await supabase.from('brand_requests').update({ status }).eq('id', id);
    if (updateError) return setNotice(updateError.message);
    await reload();
  }

  async function createCampaignFromRequest(request) {
    setNotice('');
    const { error: insertError } = await supabase.from('campaigns').insert({
      brand_id: request.brand_id,
      brand_request_id: request.id,
      name: request.objective || `Campagne ${request.request_type}`,
      objective: request.objective,
      zones: request.zone ? [request.zone] : [],
      budget_ht: request.budget_ht || null,
      products: request.products || [],
      status: 'draft',
      created_by: state.profile?.id || null,
    });
    if (insertError) return setNotice(insertError.message);
    await updateRequestStatus(request.id, 'campaign_preparation');
  }

  if (loading && !lastSyncedAt) return <LoadingWorkspace />;

  let content;
  if (activeTab === 'dashboard') content = <AdminDashboard ops={ops} />;
  else if (activeTab === 'requests') content = <RequestsView onCreateCampaign={createCampaignFromRequest} onStatus={updateRequestStatus} requests={state.brandRequests || []} />;
  else if (activeTab === 'campaigns') content = <CampaignsView campaigns={state.campaigns || []} missions={state.missions || []} />;
  else if (activeTab === 'missions') content = <FieldMissions canManage state={state} title="Missions" />;
  else if (activeTab === 'matching') content = <MatchingView />;
  else content = <Placeholder title={adminNavigation.flatMap((group) => group.items).find(([key]) => key === activeTab)?.[1] || 'Administration'} />;

  return <CrmShell activeTab={activeTab} error={[error, notice].filter(Boolean).join(' · ')} lastSyncedAt={lastSyncedAt} navigation={adminNavigation} onClearError={() => { clearError(); setNotice(''); }} onCreateActivity={() => setActiveTab('requests')} onOpenAccount={() => {}} onReload={reload} onSignOut={() => supabase.auth.signOut()} onTabChange={setActiveTab} profile={state.profile} search="" searchResults={[]} session={session} setSearch={() => {}} workspaceLabel="Ops">{content}</CrmShell>;
}

function AdminDashboard({ ops }) {
  const cards = [
    ['Demandes à qualifier', ops.toQualify, 'À traiter par PharmaBiz'],
    ['Demandes bloquées', ops.blocked, 'Information manquante'],
    ['Campagnes à préparer', ops.campaignsToPrepare, 'Staffing ou découpage'],
    ['Missions non affectées', ops.unassigned, 'Matching nécessaire'],
    ['Comptes rendus en attente', ops.reports, 'Contrôle des preuves'],
    ['Paiements à valider', ops.payments, 'Rémunération payable'],
  ];
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Centre opérationnel</span><h1>Ce qui nécessite une action PharmaBiz aujourd’hui</h1><p>Demandes, campagnes, missions, preuves et paiements sont regroupés par priorité opérationnelle.</p></div></div><div className="pb-metric-grid">{cards.map(([label, value, note]) => <article className="pb-metric-card" key={label}><div className="pb-metric-icon"><Icon name="check" size={18} /></div><span className="pb-metric-label">{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div></section>;
}

function RequestsView({ onCreateCampaign, onStatus, requests }) {
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Qualification</span><h1>Demandes marques</h1><p>Chaque demande est qualifiée avant de devenir une campagne et plusieurs missions.</p></div></div><div className="pb-table-card"><div className="pb-card-head"><div><span className="pb-eyebrow">File admin</span><h2>Demandes à instruire</h2></div><span className="pb-table-count">{requests.length}</span></div><div className="pb-table-scroll"><table className="pb-table"><thead><tr><th>Marque</th><th>Besoin</th><th>Objectif</th><th>Zone</th><th>Budget</th><th>Statut</th><th>Actions</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><strong>{request.brands?.name || 'Marque'}</strong></td><td>{request.request_type}</td><td>{request.objective || '—'}</td><td>{request.zone || '—'}</td><td>{formatMoney(request.budget_ht)}</td><td><span className="pb-status">{request.status}</span></td><td><div className="pb-table-actions"><button className="pb-row-action" onClick={() => onStatus(request.id, 'qualifying')} type="button">Qualifier</button><button className="pb-row-action" onClick={() => onCreateCampaign(request)} type="button">Créer campagne</button></div></td></tr>)}</tbody></table>{!requests.length && <div className="pb-empty-state"><strong>Aucune demande marque.</strong><span>Les demandes créées depuis l’espace marque arriveront ici.</span></div>}</div></div></section>;
}

function CampaignsView({ campaigns, missions }) {
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Orchestration</span><h1>Campagnes</h1><p>Une campagne regroupe la demande d’origine, les zones, les pharmacies, les missions et les résultats.</p></div></div><div className="pb-table-card"><div className="pb-card-head"><div><span className="pb-eyebrow">Plans terrain</span><h2>Campagnes actives</h2></div><span className="pb-table-count">{campaigns.length}</span></div><div className="pb-table-scroll"><table className="pb-table"><thead><tr><th>Campagne</th><th>Marque</th><th>Objectif</th><th>Missions</th><th>Budget</th><th>Statut</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.id}><td><strong>{campaign.name}</strong></td><td>{campaign.brands?.name || '—'}</td><td>{campaign.objective || '—'}</td><td>{missions.filter((mission) => mission.campaign_id === campaign.id).length}</td><td>{formatMoney(campaign.budget_ht)}</td><td><span className="pb-status">{campaign.status}</span></td></tr>)}</tbody></table>{!campaigns.length && <div className="pb-empty-state"><strong>Aucune campagne.</strong><span>Crée une campagne depuis une demande qualifiée.</span></div>}</div></div></section>;
}

function MatchingView() {
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Matching</span><h1>Profils proposés</h1><p>Le scoring expliquera rôle, zone, disponibilité, expérience, conflits de marques, tarif et qualité des comptes rendus.</p></div></div><div className="pb-card"><div className="pb-empty-state"><Icon name="filter" size={24} /><strong>Matching explicable à brancher</strong><span>La vue est isolée côté admin pour recevoir ensuite le scoring par critères et les propositions aux marques.</span></div></div></section>;
}

function Placeholder({ title }) {
  return <section className="pb-page"><div className="pb-page-heading"><div><span className="pb-eyebrow">Admin PharmaBiz</span><h1>{title}</h1><p>Cette section est séparée de l’espace agent et prête à recevoir ses permissions propres.</p></div></div><div className="pb-card"><div className="pb-empty-state"><strong>Module réservé admin</strong><span>Les workflows détaillés seront branchés progressivement sans exposer ces actions aux agents.</span></div></div></section>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './operations-flow.css';

const FLOW = [
  ['submitted', 'À qualifier'],
  ['qualifying', 'Qualification'],
  ['approved', 'Validée'],
  ['sourcing', 'Recherche profils'],
  ['profiles_proposed', 'Profils proposés'],
  ['assigned', 'Attribuée'],
  ['in_progress', 'En cours'],
  ['to_validate', 'À valider'],
  ['completed', 'Terminée'],
];

const TYPE_LABELS = {
  animation: 'Animation', formation: 'Formation', recruitment: 'Recrutement agent', reinforcement: 'Renfort secteur', implantation: 'Campagne d’implantation',
};

const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : 'À définir';

export default function OperationsFlow({ state }) {
  const [requests, setRequests] = useState([]);
  const [missions, setMissions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [notes, setNotes] = useState('');

  async function load() {
    setLoading(true);
    setNotice('');
    const [requestResult, missionResult] = await Promise.all([
      supabase.from('brand_requests').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('field_missions').select('*, brands(name), pharmacies(name,city), field_animators(full_name)').order('created_at', { ascending: false }),
    ]);
    if (requestResult.error) setNotice('Applique la migration brand_requests_workflow pour activer ce cockpit. ' + requestResult.error.message);
    setRequests(requestResult.data || []);
    setMissions(missionResult.data || []);
    setSelectedId((current) => current || requestResult.data?.[0]?.id || null);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const selected = requests.find((item) => item.id === selectedId) || null;
  useEffect(() => { setNotes(selected?.admin_notes || ''); }, [selectedId]);

  const visible = useMemo(() => requests.filter((item) => filter === 'all' || item.status === filter), [requests, filter]);
  const stats = useMemo(() => ({
    incoming: requests.filter((item) => ['submitted', 'qualifying'].includes(item.status)).length,
    sourcing: requests.filter((item) => ['approved', 'sourcing', 'profiles_proposed'].includes(item.status)).length,
    execution: requests.filter((item) => ['assigned', 'in_progress', 'to_validate'].includes(item.status)).length,
    completed: requests.filter((item) => item.status === 'completed').length,
  }), [requests]);

  async function updateStatus(status) {
    if (!selected) return;
    const { error } = await supabase.from('brand_requests').update({ status, admin_notes: notes, updated_at: new Date().toISOString() }).eq('id', selected.id);
    if (error) return setNotice(error.message);
    await load();
    setSelectedId(selected.id);
  }

  async function createMissionFromRequest() {
    if (!selected) return;
    const payload = {
      title: selected.objective,
      mission_type: selected.request_type === 'formation' ? 'formation' : 'animation',
      brand_id: selected.brand_id || null,
      brand_request_id: selected.id,
      starts_at: selected.desired_date ? new Date(`${selected.desired_date}T09:00:00`).toISOString() : null,
      fee_ht: Number(selected.budget_ht || 0),
      objective: selected.objective,
      brief: selected.brief,
      status: 'draft',
      created_by: state.profile?.id || null,
    };
    const { error } = await supabase.from('field_missions').insert(payload);
    if (error) return setNotice(error.message);
    await supabase.from('brand_requests').update({ status: 'sourcing', updated_at: new Date().toISOString() }).eq('id', selected.id);
    setNotice('Mission créée. Elle est maintenant disponible dans Réseau terrain pour l’affectation.');
    load();
  }

  return (
    <div className="of-page">
      <header className="of-head">
        <div><span className="of-eyebrow">Centre de commandement</span><h1>Flux opérationnel</h1><p>Transforme chaque besoin marque en mission terrain suivie jusqu’à la validation.</p></div>
        <button className="of-button of-button-secondary" onClick={load} type="button">Actualiser</button>
      </header>

      {notice && <div className="of-notice">{notice}</div>}

      <section className="of-kpis">
        <Kpi label="À qualifier" value={stats.incoming} note="nouvelles demandes" />
        <Kpi label="À staffer" value={stats.sourcing} note="profils à mobiliser" />
        <Kpi label="En exécution" value={stats.execution} note="missions actives" />
        <Kpi label="Terminées" value={stats.completed} note={`${missions.length} missions créées`} />
      </section>

      <section className="of-flow-strip">
        {FLOW.map(([key, label], index) => <div key={key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong></div>)}
      </section>

      <div className="of-layout">
        <section className="of-list-panel">
          <div className="of-panel-head"><div><span className="of-eyebrow">Demandes marques</span><h2>File de traitement</h2></div><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">Tous les statuts</option>{FLOW.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          {loading ? <div className="of-empty">Chargement…</div> : visible.length ? <div className="of-request-list">{visible.map((request) => <button className={selectedId === request.id ? 'is-active' : ''} key={request.id} onClick={() => setSelectedId(request.id)} type="button"><span className={`of-dot of-dot-${request.status}`} /><div><strong>{request.objective}</strong><small>{request.brands?.name || 'Marque'} · {TYPE_LABELS[request.request_type] || request.request_type} · {request.zone || 'Zone à définir'}</small></div><em>{FLOW.find(([key]) => key === request.status)?.[1] || request.status}</em></button>)}</div> : <div className="of-empty"><strong>Aucune demande</strong><p>Les besoins transmis depuis l’espace marque apparaîtront ici.</p></div>}
        </section>

        <section className="of-detail-panel">
          {selected ? <>
            <div className="of-detail-head"><div><span className="of-eyebrow">Dossier {selected.id.slice(0, 8)}</span><h2>{selected.objective}</h2><p>{selected.brands?.name || 'Marque non liée'} · {TYPE_LABELS[selected.request_type] || selected.request_type}</p></div><span className={`of-status of-status-${selected.status}`}>{FLOW.find(([key]) => key === selected.status)?.[1] || selected.status}</span></div>
            <div className="of-detail-grid"><Info label="Zone" value={selected.zone || 'À préciser'} /><Info label="Échéance" value={date(selected.desired_date)} /><Info label="Cible" value={selected.target_pharmacies ? `${selected.target_pharmacies} pharmacies` : 'À préciser'} /><Info label="Budget indicatif" value={money(selected.budget_ht)} /></div>
            <div className="of-brief"><span>Brief</span><p>{selected.brief || 'Aucun brief détaillé.'}</p></div>
            <label className="of-notes"><span>Notes de qualification PharmaBiz</span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Contraintes, livrables, critères profils, prochaine action…" rows="5" value={notes} /></label>
            <div className="of-actions">
              <button className="of-button of-button-secondary" onClick={() => updateStatus('qualifying')} type="button">Passer en qualification</button>
              <button className="of-button of-button-secondary" onClick={() => updateStatus('approved')} type="button">Valider le besoin</button>
              <button className="of-button of-button-primary" onClick={createMissionFromRequest} type="button">Créer la mission</button>
            </div>
          </> : <div className="of-empty"><strong>Sélectionne une demande</strong><p>Tu verras ici son brief, son budget et les actions de qualification.</p></div>}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, note }) { return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Info({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

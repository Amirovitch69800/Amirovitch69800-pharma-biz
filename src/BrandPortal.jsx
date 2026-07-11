import React, { useEffect, useMemo, useState } from 'react';
import Icon from './components/ui/Icon.jsx';
import { supabase } from './lib/supabase.js';
import './brand-portal.css';

const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const REQUEST_STATUS = {
  draft: 'Brouillon', submitted: 'À qualifier', qualifying: 'En qualification', approved: 'Validée', sourcing: 'Recherche de profils', profiles_proposed: 'Profils proposés', assigned: 'Attribuée', in_progress: 'En cours', to_validate: 'À valider', completed: 'Terminée', rejected: 'Refusée',
};
const initialForm = { request_type: 'animation', zone: '', objective: '', target_pharmacies: '', desired_date: '', budget_ht: '', brief: '' };

export default function BrandPortal({ session, state }) {
  const [section, setSection] = useState('overview');
  const [composerOpen, setComposerOpen] = useState(false);
  const [brandId, setBrandId] = useState(state.brands[0]?.id || '');
  const [requests, setRequests] = useState([]);
  const [missions, setMissions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState('');
  const [loadingFlow, setLoadingFlow] = useState(true);
  const brand = state.brands.find((item) => item.id === brandId) || state.brands[0] || null;

  async function loadFlow() {
    setLoadingFlow(true);
    setNotice('');
    const requestsResult = await supabase.from('brand_requests').select('*').order('created_at', { ascending: false });
    if (requestsResult.error) setNotice('Le workflow marque nécessite la migration brand_requests_workflow. ' + requestsResult.error.message);
    const nextRequests = requestsResult.data || [];
    setRequests(nextRequests);

    const requestIds = nextRequests.map((item) => item.id);
    if (requestIds.length) {
      const missionsResult = await supabase.from('field_missions').select('*, pharmacies(name,city), field_animators(full_name)').in('brand_request_id', requestIds).order('created_at', { ascending: false });
      if (!missionsResult.error) setMissions(missionsResult.data || []);
    } else {
      setMissions([]);
    }
    setLoadingFlow(false);
  }

  useEffect(() => { loadFlow(); }, []);

  async function submitRequest(event) {
    event.preventDefault();
    setNotice('');
    const payload = {
      brand_id: brand?.id || null,
      created_by: session.user.id,
      request_type: form.request_type,
      zone: form.zone.trim(),
      objective: form.objective.trim(),
      target_pharmacies: Number(form.target_pharmacies || 0),
      desired_date: form.desired_date || null,
      budget_ht: Number(form.budget_ht || 0),
      brief: form.brief.trim(),
      status: 'submitted',
    };
    const { error } = await supabase.from('brand_requests').insert(payload);
    if (error) return setNotice(error.message);
    setForm(initialForm);
    setComposerOpen(false);
    setSection('requests');
    setNotice('Demande transmise à PharmaBiz. Elle est maintenant en attente de qualification.');
    loadFlow();
  }

  const orders = useMemo(() => state.orders.filter((order) => !brand?.id || order.brand_id === brand.id), [brand?.id, state.orders]);
  const relations = useMemo(() => state.relations.filter((relation) => !brand?.id || relation.brand_id === brand.id), [brand?.id, state.relations]);
  const commissions = useMemo(() => state.commissions.filter((commission) => !brand?.id || commission.brand_id === brand.id), [brand?.id, state.commissions]);
  const brandRequests = useMemo(() => requests.filter((item) => !brand?.id || item.brand_id === brand.id), [brand?.id, requests]);
  const requestIds = useMemo(() => new Set(brandRequests.map((item) => item.id)), [brandRequests]);
  const brandMissions = useMemo(() => missions.filter((item) => requestIds.has(item.brand_request_id)), [missions, requestIds]);
  const sellIn = orders.reduce((sum, order) => sum + Number(order.total_after_discount_ht || order.total_ht || 0), 0);
  const active = relations.filter((relation) => ['active', 'premium', 'ambassador', 'ambassadrice'].includes(relation.status)).length;
  const pipeline = relations.filter((relation) => ['prospect', 'contacted', 'interested'].includes(relation.status)).length;
  const due = commissions.filter((commission) => commission.status !== 'paid').reduce((sum, commission) => sum + Number(commission.amount_ht || 0), 0);
  const openRequests = brandRequests.filter((item) => !['completed', 'rejected'].includes(item.status)).length;
  const pendingValidation = brandRequests.filter((item) => item.status === 'to_validate').length;

  const tabs = [
    ['overview', 'Vue d’ensemble'], ['requests', 'Demandes'], ['missions', 'Missions'], ['pharmacies', 'Pharmacies'], ['orders', 'Commandes'], ['performance', 'Performances'], ['finance', 'Finance'],
  ];

  return (
    <div className="bp-page">
      <section className="bp-hero">
        <div><span className="pb-eyebrow">Espace marque</span><h1>{brand?.name || 'Votre marque'}</h1><p>Exprimez vos besoins. PharmaBiz qualifie, mobilise le réseau et pilote l’exécution jusqu’au résultat.</p></div>
        <div className="bp-hero-actions">
          {state.brands.length > 1 && <select className="bp-brand-select" onChange={(event) => setBrandId(event.target.value)} value={brand?.id || ''}>{state.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <button className="pb-button pb-button-primary" onClick={() => setComposerOpen(true)} type="button"><Icon name="plus" size={16} />Nouvelle demande</button>
        </div>
      </section>

      {notice && <div className="pb-alert"><span>{notice}</span></div>}
      <nav className="bp-tabs">{tabs.map(([key, text]) => <button className={section === key ? 'is-active' : ''} key={key} onClick={() => setSection(key)} type="button">{text}</button>)}</nav>

      {section === 'overview' && <>
        <section className="bp-metrics">
          <Metric label="Sell-in suivi" value={money(sellIn)} note={`${orders.length} commandes`} />
          <Metric label="Pharmacies actives" value={active} note={`${pipeline} opportunités`} />
          <Metric label="Demandes ouvertes" value={openRequests} note={`${pendingValidation} à valider`} />
          <Metric label="Missions terrain" value={brandMissions.length} note="issues de vos demandes" />
        </section>
        <div className="bp-grid">
          <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Priorités</span><h2>À traiter</h2></div></div>{pendingValidation ? <div className="bp-feed">{brandRequests.filter((item) => item.status === 'to_validate').map((item) => <div key={item.id}><span /><p><strong>{item.objective}</strong><small>Compte rendu à valider · {item.zone || 'Zone à préciser'}</small></p></div>)}</div> : <Empty title="Rien n’attend votre validation." text="Les profils proposés, commandes et comptes rendus à traiter apparaîtront ici." />}</section>
          <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Exécution</span><h2>Activité récente</h2></div></div><div className="bp-feed">{brandRequests.slice(0, 3).map((item) => <div key={item.id}><span /><p><strong>{item.objective}</strong><small>{REQUEST_STATUS[item.status] || label(item.status)} · {date(item.updated_at)}</small></p></div>)}{orders.slice(0, 2).map((order) => <div key={order.id || order.order_number}><span /><p><strong>{order.pharmacy_name || 'Pharmacie'}</strong><small>{label(order.order_type)} · {money(order.total_after_discount_ht || order.total_ht)} · {date(order.created_at || order.order_date)}</small></p></div>)}{!brandRequests.length && !orders.length && <Empty title="Aucune activité récente." text="Vos demandes, commandes et missions seront synthétisées ici." />}</div></section>
        </div>
      </>}

      {section === 'requests' && <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Besoins terrain</span><h2>Demandes soumises à PharmaBiz</h2></div><button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(true)} type="button"><Icon name="plus" size={15} />Nouvelle demande</button></div>{loadingFlow ? <Empty title="Chargement…" text="Synchronisation de vos demandes." /> : brandRequests.length ? <div className="bp-request-list">{brandRequests.map((item) => <article className="bp-request-row" key={item.id}><div><span className="pb-eyebrow">{label(item.request_type)}</span><h3>{item.objective}</h3><p>{item.zone || 'Zone à préciser'} · {item.target_pharmacies || 0} pharmacies · {date(item.desired_date)}</p></div><div><span className={`bp-request-status is-${item.status}`}>{REQUEST_STATUS[item.status] || label(item.status)}</span><small>{money(item.budget_ht)} indicatif</small></div></article>)}</div> : <Empty title="Aucune demande transmise." text="Créez un besoin d’animation, de formation, de recrutement ou de renfort sectoriel. PharmaBiz le qualifiera avant publication." />}</section>}

      {section === 'missions' && <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Exécution terrain</span><h2>Missions</h2></div><b>{brandMissions.length}</b></div>{brandMissions.length ? <div className="bp-request-list">{brandMissions.map((mission) => <article className="bp-request-row" key={mission.id}><div><span className="pb-eyebrow">{label(mission.mission_type)}</span><h3>{mission.title}</h3><p>{mission.pharmacies?.name || 'Pharmacie à affecter'} · {mission.pharmacies?.city || 'Zone en préparation'} · {date(mission.starts_at)}</p></div><div><span className={`bp-request-status is-${mission.status}`}>{label(mission.status)}</span><small>{mission.field_animators?.full_name || 'Profil en sélection'}</small></div></article>)}</div> : <Empty title="Aucune mission créée." text="Une mission apparaîtra ici après qualification de votre demande par PharmaBiz." />}</section>}
      {section === 'pharmacies' && <TableCard eyebrow="Réseau officinal" title="Pharmacies de la marque" headers={['Pharmacie', 'Ville', 'Statut', 'Potentiel', 'Dernière évolution']} rows={relations.map((relation) => [relation.pharmacies?.name || '—', relation.pharmacies?.city || '—', label(relation.status), label(relation.potential), date(relation.updated_at)])} empty="Aucune pharmacie liée à cette marque." />}
      {section === 'orders' && <TableCard eyebrow="Validation commerciale" title="Commandes" headers={['Commande', 'Pharmacie', 'Type', 'Montant HT', 'Statut', 'Date']} rows={orders.map((order) => [order.order_number || '—', order.pharmacy_name || '—', label(order.order_type), money(order.total_after_discount_ht || order.total_ht), label(order.status), date(order.created_at || order.order_date)])} empty="Aucune commande à afficher." />}
      {section === 'performance' && <section className="bp-metrics"><Metric label="Sell-in total" value={money(sellIn)} note="activité enregistrée" /><Metric label="Taux d’activation" value={relations.length ? `${Math.round(active / relations.length * 100)}%` : '0%'} note={`${active}/${relations.length} comptes`} /><Metric label="Panier moyen" value={money(orders.length ? sellIn / orders.length : 0)} note="par commande" /><Metric label="Missions terminées" value={brandMissions.filter((item) => ['completed', 'validated'].includes(item.status)).length} note="exécution validée" /></section>}
      {section === 'finance' && <TableCard eyebrow="Pilotage financier" title="Commissions et paiements" headers={['Commande', 'Pharmacie', 'Montant', 'Statut']} rows={commissions.map((commission) => [commission.orders?.order_number || '—', commission.orders?.pharmacies?.name || '—', money(commission.amount_ht), label(commission.status)])} empty="Aucun mouvement financier." />}

      {composerOpen && <div className="bp-backdrop" onMouseDown={() => setComposerOpen(false)}><aside className="bp-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="bp-drawer-head"><div><span className="pb-eyebrow">Demande marque</span><h2>Exprimer un besoin terrain</h2><p>PharmaBiz qualifiera et validera la demande avant toute publication au réseau.</p></div><button className="pb-icon-button" onClick={() => setComposerOpen(false)} type="button"><Icon name="close" size={17} /></button></div><form className="bp-form" onSubmit={submitRequest}><label className="pb-field"><span>Type de besoin</span><select onChange={(event) => setForm({ ...form, request_type: event.target.value })} value={form.request_type}><option value="animation">Animation</option><option value="formation">Formation</option><option value="recruitment">Recrutement agent</option><option value="reinforcement">Renfort secteur</option><option value="implantation">Campagne d’implantation</option></select></label><label className="pb-field"><span>Zone</span><input onChange={(event) => setForm({ ...form, zone: event.target.value })} placeholder="13, 84, Marseille" required value={form.zone} /></label><label className="pb-field bp-wide"><span>Objectif</span><input onChange={(event) => setForm({ ...form, objective: event.target.value })} placeholder="Ex. Activer 20 pharmacies prioritaires" required value={form.objective} /></label><label className="pb-field"><span>Nombre de pharmacies ciblées</span><input min="0" onChange={(event) => setForm({ ...form, target_pharmacies: event.target.value })} type="number" value={form.target_pharmacies} /></label><label className="pb-field"><span>Date souhaitée</span><input onChange={(event) => setForm({ ...form, desired_date: event.target.value })} type="date" value={form.desired_date} /></label><label className="pb-field"><span>Budget indicatif HT</span><input min="0" onChange={(event) => setForm({ ...form, budget_ht: event.target.value })} type="number" value={form.budget_ht} /></label><label className="pb-field bp-wide"><span>Brief</span><textarea onChange={(event) => setForm({ ...form, brief: event.target.value })} placeholder="Contexte, produits, attentes, contraintes…" rows="6" value={form.brief} /></label><div className="bp-actions bp-wide"><button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(false)} type="button">Annuler</button><button className="pb-button pb-button-primary" type="submit">Soumettre à PharmaBiz</button></div></form></aside></div>}
    </div>
  );
}

function Metric({ label: title, value, note }) { return <article className="bp-metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Empty({ title, text }) { return <div className="bp-empty"><span><Icon name="sparkles" size={18} /></span><strong>{title}</strong><p>{text}</p></div>; }
function TableCard({ eyebrow, title, headers, rows, empty }) { return <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">{eyebrow}</span><h2>{title}</h2></div><b>{rows.length}</b></div><div className="bp-table-wrap"><table className="bp-table"><thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty title={empty} text="Les données apparaîtront ici dès qu’elles seront disponibles." />}</div></section>; }

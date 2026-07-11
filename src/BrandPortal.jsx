import React, { useMemo, useState } from 'react';
import Icon from './components/ui/Icon.jsx';
import './brand-portal.css';

const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function BrandPortal({ state }) {
  const [section, setSection] = useState('overview');
  const [composerOpen, setComposerOpen] = useState(false);
  const [brandId, setBrandId] = useState(state.brands[0]?.id || '');
  const brand = state.brands.find((item) => item.id === brandId) || state.brands[0] || null;

  const orders = useMemo(() => state.orders.filter((order) => !brand?.id || order.brand_id === brand.id), [brand?.id, state.orders]);
  const relations = useMemo(() => state.relations.filter((relation) => !brand?.id || relation.brand_id === brand.id), [brand?.id, state.relations]);
  const commissions = useMemo(() => state.commissions.filter((commission) => !brand?.id || commission.brand_id === brand.id), [brand?.id, state.commissions]);
  const sellIn = orders.reduce((sum, order) => sum + Number(order.total_after_discount_ht || order.total_ht || 0), 0);
  const active = relations.filter((relation) => ['active', 'premium', 'ambassador', 'ambassadrice'].includes(relation.status)).length;
  const pipeline = relations.filter((relation) => ['prospect', 'contacted', 'interested'].includes(relation.status)).length;
  const due = commissions.filter((commission) => commission.status !== 'paid').reduce((sum, commission) => sum + Number(commission.amount_ht || 0), 0);

  const tabs = [
    ['overview', 'Vue d’ensemble'],
    ['requests', 'Demandes'],
    ['missions', 'Missions'],
    ['pharmacies', 'Pharmacies'],
    ['orders', 'Commandes'],
    ['performance', 'Performances'],
    ['finance', 'Finance'],
  ];

  return (
    <div className="bp-page">
      <section className="bp-hero">
        <div>
          <span className="pb-eyebrow">Espace marque</span>
          <h1>{brand?.name || 'Votre marque'}</h1>
          <p>Exprimez vos besoins. PharmaBiz qualifie, mobilise le réseau et pilote l’exécution jusqu’au résultat.</p>
        </div>
        <div className="bp-hero-actions">
          {state.brands.length > 1 && <select className="bp-brand-select" onChange={(event) => setBrandId(event.target.value)} value={brand?.id || ''}>{state.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <button className="pb-button pb-button-primary" onClick={() => setComposerOpen(true)} type="button"><Icon name="plus" size={16} />Nouvelle demande</button>
        </div>
      </section>

      <nav className="bp-tabs">{tabs.map(([key, text]) => <button className={section === key ? 'is-active' : ''} key={key} onClick={() => setSection(key)} type="button">{text}</button>)}</nav>

      {section === 'overview' && <>
        <section className="bp-metrics">
          <Metric label="Sell-in suivi" value={money(sellIn)} note={`${orders.length} commandes`} />
          <Metric label="Pharmacies actives" value={active} note={`${pipeline} opportunités`} />
          <Metric label="Demandes ouvertes" value="0" note="pilotées par PharmaBiz" />
          <Metric label="À payer" value={money(due)} note="commissions en attente" />
        </section>
        <div className="bp-grid">
          <section className="bp-card">
            <div className="bp-card-head"><div><span className="pb-eyebrow">Priorités</span><h2>À traiter</h2></div></div>
            <Empty title="Rien n’attend votre validation." text="Les demandes qualifiées, profils proposés, commandes et comptes rendus à traiter apparaîtront ici." />
          </section>
          <section className="bp-card">
            <div className="bp-card-head"><div><span className="pb-eyebrow">Exécution</span><h2>Activité récente</h2></div></div>
            <div className="bp-feed">{orders.slice(0, 5).map((order) => <div key={order.id || order.order_number}><span /><p><strong>{order.pharmacy_name || 'Pharmacie'}</strong><small>{label(order.order_type)} · {money(order.total_after_discount_ht || order.total_ht)} · {date(order.created_at || order.order_date)}</small></p></div>)}{!orders.length && <Empty title="Aucune activité récente." text="Les commandes et missions de la marque seront synthétisées ici." />}</div>
          </section>
        </div>
      </>}

      {section === 'requests' && <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Besoins terrain</span><h2>Demandes soumises à PharmaBiz</h2></div><button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(true)} type="button"><Icon name="plus" size={15} />Nouvelle demande</button></div><Empty title="Aucune demande transmise." text="Créez un besoin d’animation, de formation, de recrutement ou de renfort sectoriel. PharmaBiz le qualifiera avant publication." /></section>}
      {section === 'missions' && <Panel eyebrow="Exécution terrain" title="Missions" text="Les missions validées par PharmaBiz, les profils proposés et les comptes rendus à approuver seront regroupés ici." />}
      {section === 'pharmacies' && <TableCard eyebrow="Réseau officinal" title="Pharmacies de la marque" headers={['Pharmacie', 'Ville', 'Statut', 'Potentiel', 'Dernière évolution']} rows={relations.map((relation) => [relation.pharmacies?.name || '—', relation.pharmacies?.city || '—', label(relation.status), label(relation.potential), date(relation.updated_at)])} empty="Aucune pharmacie liée à cette marque." />}
      {section === 'orders' && <TableCard eyebrow="Validation commerciale" title="Commandes" headers={['Commande', 'Pharmacie', 'Type', 'Montant HT', 'Statut', 'Date']} rows={orders.map((order) => [order.order_number || '—', order.pharmacy_name || '—', label(order.order_type), money(order.total_after_discount_ht || order.total_ht), label(order.status), date(order.created_at || order.order_date)])} empty="Aucune commande à afficher." />}
      {section === 'performance' && <section className="bp-metrics"><Metric label="Sell-in total" value={money(sellIn)} note="activité enregistrée" /><Metric label="Taux d’activation" value={relations.length ? `${Math.round(active / relations.length * 100)}%` : '0%'} note={`${active}/${relations.length} comptes`} /><Metric label="Panier moyen" value={money(orders.length ? sellIn / orders.length : 0)} note="par commande" /><Metric label="Pipeline" value={pipeline} note="pharmacies à convertir" /></section>}
      {section === 'finance' && <TableCard eyebrow="Pilotage financier" title="Commissions et paiements" headers={['Commande', 'Pharmacie', 'Montant', 'Statut']} rows={commissions.map((commission) => [commission.orders?.order_number || '—', commission.orders?.pharmacies?.name || '—', money(commission.amount_ht), label(commission.status)])} empty="Aucun mouvement financier." />}

      {composerOpen && <div className="bp-backdrop" onMouseDown={() => setComposerOpen(false)}><aside className="bp-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="bp-drawer-head"><div><span className="pb-eyebrow">Demande marque</span><h2>Exprimer un besoin terrain</h2><p>PharmaBiz qualifiera et validera la demande avant toute publication au réseau.</p></div><button className="pb-icon-button" onClick={() => setComposerOpen(false)} type="button"><Icon name="close" size={17} /></button></div><form className="bp-form" onSubmit={(event) => { event.preventDefault(); setComposerOpen(false); }}><label className="pb-field"><span>Type de besoin</span><select><option>Animation</option><option>Formation</option><option>Recrutement agent</option><option>Renfort secteur</option><option>Campagne d’implantation</option></select></label><label className="pb-field"><span>Zone</span><input placeholder="13, 84, Marseille" /></label><label className="pb-field bp-wide"><span>Objectif</span><input placeholder="Ex. Activer 20 pharmacies prioritaires" /></label><label className="pb-field"><span>Date souhaitée</span><input type="date" /></label><label className="pb-field"><span>Budget indicatif HT</span><input min="0" type="number" /></label><label className="pb-field bp-wide"><span>Brief</span><textarea placeholder="Contexte, produits, attentes, contraintes…" rows="6" /></label><div className="bp-actions bp-wide"><button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(false)} type="button">Annuler</button><button className="pb-button pb-button-primary" type="submit">Soumettre à PharmaBiz</button></div></form></aside></div>}
    </div>
  );
}

function Metric({ label: title, value, note }) { return <article className="bp-metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Empty({ title, text }) { return <div className="bp-empty"><span><Icon name="sparkles" size={18} /></span><strong>{title}</strong><p>{text}</p></div>; }
function Panel({ eyebrow, title, text }) { return <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">{eyebrow}</span><h2>{title}</h2></div></div><Empty title="Module en préparation fonctionnelle." text={text} /></section>; }
function TableCard({ eyebrow, title, headers, rows, empty }) { return <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">{eyebrow}</span><h2>{title}</h2></div><b>{rows.length}</b></div><div className="bp-table-wrap"><table className="bp-table"><thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty title={empty} text="Les données apparaîtront ici dès qu’elles seront disponibles." />}</div></section>; }

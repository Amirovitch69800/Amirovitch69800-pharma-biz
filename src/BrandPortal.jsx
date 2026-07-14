import React, { useMemo, useState } from 'react';
import Icon from './components/ui/Icon.jsx';
import './brand-portal.css';

const money = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = (value) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value)) : '—';
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const NAALI_CATALOGUE_REFERENCE_TOTAL = 21;

function readArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(';').map((item) => item.trim()).filter(Boolean);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const maximumFractionDigits = number > 0 && number < 10 ? 1 : 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(number)}%`;
}

function formatShortNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: number % 1 ? 1 : 0 }).format(number);
}

export default function BrandPortal({ onCreateRequest, state }) {
  const [section, setSection] = useState('overview');
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState('');
  const [notice, setNotice] = useState('');
  const [requestForm, setRequestForm] = useState({
    requestType: 'animation',
    objective: '',
    zone: '',
    desiredDate: '',
    budgetHt: '',
    brief: '',
  });
  const [brandId, setBrandId] = useState(state.brands[0]?.id || '');
  const brand = state.brands.find((item) => item.id === brandId) || state.brands[0] || null;

  const orders = useMemo(() => state.orders.filter((order) => !brand?.id || order.brand_id === brand.id), [brand?.id, state.orders]);
  const relations = useMemo(() => state.relations.filter((relation) => !brand?.id || relation.brand_id === brand.id), [brand?.id, state.relations]);
  const pharmacyById = useMemo(() => new Map((state.pharmacies || []).map((pharmacy) => [pharmacy.id, pharmacy])), [state.pharmacies]);
  const commissions = useMemo(() => state.commissions.filter((commission) => !brand?.id || commission.brand_id === brand.id), [brand?.id, state.commissions]);
  const requests = useMemo(() => (state.brandRequests || []).filter((request) => !brand?.id || request.brand_id === brand.id), [brand?.id, state.brandRequests]);
  const orderItems = useMemo(() => (state.orderItems || []).filter((item) => !brand?.id || item.brand_id === brand.id || item.orders?.brand_id === brand.id), [brand?.id, state.orderItems]);
  const hubspotIntegration = useMemo(() => (state.brandIntegrations || []).find((integration) => integration.brand_id === brand?.id && integration.provider === 'hubspot'), [brand?.id, state.brandIntegrations]);
  const sellIn = orders.reduce((sum, order) => sum + Number(order.total_after_discount_ht || order.total_ht || 0), 0);
  const active = relations.filter((relation) => ['active', 'premium', 'ambassador', 'ambassadrice'].includes(relation.status)).length;
  const pipeline = relations.filter((relation) => ['prospect', 'contacted', 'interested'].includes(relation.status)).length;
  const activationRate = relations.length && orders.length ? `${Math.round(active / relations.length * 100)}%` : '—';
  const openRequests = requests.filter((request) => !['completed', 'rejected', 'cancelled'].includes(request.status)).length;
  const enrichedRelations = useMemo(() => relations.map((relation) => ({
    ...relation,
    pharmacy: { ...(pharmacyById.get(relation.pharmacy_id) || {}), ...(relation.pharmacies || {}) },
  })), [pharmacyById, relations]);
  const hubspotSellIn = enrichedRelations.reduce((sum, relation) => sum + Number(relation.pharmacy?.hubspot_total_revenue || 0), 0);
  const trackedSellIn = hubspotSellIn || sellIn;
  const customerStats = useMemo(() => buildCustomerStats(orders, orderItems), [orders, orderItems]);
  const topProducts = useMemo(() => buildTopProducts(orderItems), [orderItems]);
  const productDistribution = useMemo(() => buildProductDistribution(orderItems, enrichedRelations), [enrichedRelations, orderItems]);
  const territoryAccounts = useMemo(() => buildTerritoryAccounts(enrichedRelations, customerStats), [customerStats, enrichedRelations]);
  const selectedTerritoryAccount = territoryAccounts.find((account) => account.id === selectedTerritoryId) || territoryAccounts[0] || null;
  const accountsWithHistory = territoryAccounts.filter((account) => account.orders > 0 || account.revenue > 0).length;
  const dataSourceLabel = hubspotIntegration?.status === 'active' ? 'HubSpot Naali connecté' : 'HubSpot non connecté';
  const customerInsightNote = accountsWithHistory ? `${accountsWithHistory} comptes HubSpot enrichis` : orders.length === 1 ? '1 commande synchronisée' : 'historique HubSpot à importer';

  const tabs = [
    ['overview', 'Vue d’ensemble'],
    ['requests', 'Demandes'],
    ['missions', 'Missions'],
    ['territory', 'Territoire'],
    ['pharmacies', 'Pharmacies'],
    ['orders', 'Commandes'],
    ['performance', 'Performances'],
    ['finance', 'Finance'],
  ];

  async function submitRequest(event) {
    event.preventDefault();
    setNotice('');
    const result = await onCreateRequest?.({ ...requestForm, brandId: brand?.id });
    if (result?.error) {
      setNotice(result.error);
      return;
    }
    setRequestForm({ requestType: 'animation', objective: '', zone: '', desiredDate: '', budgetHt: '', brief: '' });
    setComposerOpen(false);
    setSection('requests');
  }

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

      {notice && <div className="pb-alert" role="alert">{notice}</div>}

      <nav className="bp-tabs">{tabs.map(([key, text]) => <button className={section === key ? 'is-active' : ''} key={key} onClick={() => setSection(key)} type="button">{text}</button>)}</nav>

      {section === 'overview' && <>
        <section className="bp-metrics">
          <Metric label="Sell-in suivi" value={money(trackedSellIn)} note={customerInsightNote} />
          <Metric label="Pharmacies actives" value={active} note={`${pipeline} opportunités`} />
          <Metric label="DN produit" value={productDistribution.rateLabel} note={productDistribution.note} />
          <Metric label="Demandes ouvertes" value={openRequests} note="pilotées par PharmaBiz" />
        </section>
        <div className="bp-grid">
          <section className="bp-card">
            <div className="bp-card-head"><div><span className="pb-eyebrow">Priorités</span><h2>À traiter</h2></div></div>
            <ActionEmpty title="Rien n’attend votre validation." text="Les demandes qualifiées, profils proposés, commandes et comptes rendus à traiter apparaîtront ici." actions={['Créer une demande terrain', 'Prioriser une zone', 'Préparer une animation']} />
          </section>
          <CustomerContextPanel accountsWithHistory={accountsWithHistory} dataSourceLabel={dataSourceLabel} hubspotIntegration={hubspotIntegration} orders={orders} productDistribution={productDistribution} topProducts={topProducts} />
          <section className="bp-card">
            <div className="bp-card-head"><div><span className="pb-eyebrow">Exécution</span><h2>Activité récente</h2></div></div>
            <div className="bp-feed">{orders.slice(0, 5).map((order) => <div key={order.id || order.order_number}><span /><p><strong>{order.pharmacy_name || 'Pharmacie'}</strong><small>{label(order.order_type)} · {money(order.total_after_discount_ht || order.total_ht)} · {date(order.created_at || order.order_date)}</small></p></div>)}{!orders.length && <ActionEmpty title="Aucune activité récente." text="Les commandes et missions de la marque seront synthétisées ici." actions={['Connecter les commandes', 'Planifier une mission', 'Suivre les pharmacies actives']} />}</div>
          </section>
        </div>
      </>}

      {section === 'requests' && <TableCard eyebrow="Besoins terrain" title="Demandes soumises à PharmaBiz" headers={['Besoin', 'Objectif', 'Zone', 'Budget', 'Statut']} rows={requests.map((request) => [label(request.request_type), request.objective || '—', request.zone || '—', money(request.budget_ht), label(request.status)])} empty="Aucune demande transmise." action={<button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(true)} type="button"><Icon name="plus" size={15} />Nouvelle demande</button>} />}
      {section === 'missions' && <MissionPanel openRequests={openRequests} activeAccounts={active} />}
      {section === 'territory' && <TerritoryPanel accounts={territoryAccounts} selectedAccount={selectedTerritoryAccount} setSelectedAccount={setSelectedTerritoryId} />}
      {section === 'pharmacies' && <TableCard eyebrow="Réseau officinal" title="Pharmacies de la marque" headers={['Pharmacie', 'Ville', 'CA HT', 'Commandes', 'Dernière commande', 'Produits commandés']} rows={enrichedRelations.map((relation) => {
        const stats = customerStats.get(relation.pharmacy_id);
        const hubspotRevenue = Number(relation.pharmacy?.hubspot_total_revenue || 0);
        return [
          relation.pharmacy?.name || `Pharmacie ${String(relation.pharmacy_id || '').slice(0, 8)}`,
          relation.pharmacy?.city || 'Ville à compléter',
          stats?.revenue || hubspotRevenue ? money(stats?.revenue || hubspotRevenue) : '—',
          stats?.orders || '—',
          date(stats?.lastOrderAt),
          stats?.products?.slice(0, 2).join(', ') || '—',
        ];
      })} empty="Aucune pharmacie liée à cette marque." />}
      {section === 'orders' && <TableCard eyebrow="Validation commerciale" title="Commandes" headers={['Commande', 'Pharmacie', 'Type', 'Montant HT', 'Statut', 'Date']} rows={orders.map((order) => [order.order_number || '—', order.pharmacy_name || '—', label(order.order_type), money(order.total_after_discount_ht || order.total_ht), label(order.status), date(order.created_at || order.order_date)])} empty="Aucune commande à afficher." />}
      {section === 'performance' && <>
        <section className="bp-metrics"><Metric label="Sell-in total" value={money(trackedSellIn)} note={accountsWithHistory ? dataSourceLabel : 'données à synchroniser'} /><Metric label="DN produit" value={productDistribution.rateLabel} note={productDistribution.note} /><Metric label="Panier moyen" value={accountsWithHistory ? money(trackedSellIn / accountsWithHistory) : '—'} note={accountsWithHistory ? 'par compte enrichi' : 'donnée indisponible'} /><Metric label="Pipeline" value={pipeline} note="pharmacies à convertir" /></section>
        <CustomerContextPanel accountsWithHistory={accountsWithHistory} dataSourceLabel={dataSourceLabel} hubspotIntegration={hubspotIntegration} orders={orders} productDistribution={productDistribution} topProducts={topProducts} />
      </>}
      {section === 'finance' && <TableCard eyebrow="Pilotage financier" title="Commissions et paiements" headers={['Commande', 'Pharmacie', 'Montant', 'Statut']} rows={commissions.map((commission) => [commission.orders?.order_number || '—', commission.orders?.pharmacies?.name || '—', money(commission.amount_ht), label(commission.status)])} empty="Aucun mouvement financier." />}

      {composerOpen && <div className="bp-backdrop" onMouseDown={() => setComposerOpen(false)}><aside className="bp-drawer" onMouseDown={(event) => event.stopPropagation()}><div className="bp-drawer-head"><div><span className="pb-eyebrow">Demande marque</span><h2>Exprimer un besoin terrain</h2><p>PharmaBiz qualifiera et validera la demande avant toute publication au réseau.</p></div><button className="pb-icon-button" onClick={() => setComposerOpen(false)} type="button"><Icon name="close" size={17} /></button></div><form className="bp-form" onSubmit={submitRequest}><label className="pb-field"><span>Type de besoin</span><select value={requestForm.requestType} onChange={(event) => setRequestForm({ ...requestForm, requestType: event.target.value })}><option value="animation">Animation</option><option value="formation">Formation</option><option value="agent_sourcing">Recrutement agent</option><option value="field_support">Renfort secteur</option><option value="implantation">Campagne d’implantation</option></select></label><label className="pb-field"><span>Zone</span><input placeholder="13, 84, Marseille" value={requestForm.zone} onChange={(event) => setRequestForm({ ...requestForm, zone: event.target.value })} /></label><label className="pb-field bp-wide"><span>Objectif</span><input placeholder="Ex. Activer 20 pharmacies prioritaires" required value={requestForm.objective} onChange={(event) => setRequestForm({ ...requestForm, objective: event.target.value })} /></label><label className="pb-field"><span>Date souhaitée</span><input type="date" value={requestForm.desiredDate} onChange={(event) => setRequestForm({ ...requestForm, desiredDate: event.target.value })} /></label><label className="pb-field"><span>Budget indicatif HT</span><input min="0" type="number" value={requestForm.budgetHt} onChange={(event) => setRequestForm({ ...requestForm, budgetHt: event.target.value })} /></label><label className="pb-field bp-wide"><span>Brief</span><textarea placeholder="Contexte, produits, attentes, contraintes…" rows="6" value={requestForm.brief} onChange={(event) => setRequestForm({ ...requestForm, brief: event.target.value })} /></label><div className="bp-actions bp-wide"><button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(false)} type="button">Annuler</button><button className="pb-button pb-button-primary" type="submit">Soumettre à PharmaBiz</button></div></form></aside></div>}
    </div>
  );
}

function Metric({ label: title, value, note }) { return <article className="bp-metric"><span>{title}</span><strong>{value}</strong><small>{note}</small></article>; }
function Empty({ title, text }) { return <div className="bp-empty"><span><Icon name="sparkles" size={18} /></span><strong>{title}</strong><p>{text}</p></div>; }
function ActionEmpty({ actions, title, text }) { return <div className="bp-empty bp-empty-action"><span><Icon name="sparkles" size={18} /></span><strong>{title}</strong><p>{text}</p><div>{actions.map((item) => <em key={item}>{item}</em>)}</div></div>; }
function MissionPanel({ activeAccounts, openRequests }) { return <section className="bp-card bp-mission-panel"><div className="bp-card-head"><div><span className="pb-eyebrow">Exécution terrain</span><h2>Missions</h2></div><b>{openRequests}</b></div><div className="bp-mission-steps"><article><strong>1. Qualification</strong><p>PharmaBiz transforme vos besoins en brief opérationnel : zone, objectif, profils et budget.</p></article><article><strong>2. Matching terrain</strong><p>Les animateurs et agents pertinents sont proposés selon disponibilité, zone et expérience officinale.</p></article><article><strong>3. Compte rendu</strong><p>Les preuves, retours terrain et prochaines actions seront centralisés ici pour Naali.</p></article></div><div className="bp-mission-summary"><span>{activeAccounts} pharmacies actives</span><span>{openRequests} demandes ouvertes</span><span>Validation marque à venir</span></div></section>; }
function TableCard({ action, eyebrow, title, headers, rows, empty }) { return <section className="bp-card"><div className="bp-card-head"><div><span className="pb-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action || <b>{rows.length}</b>}</div><div className="bp-table-wrap"><table className="bp-table"><thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table>{!rows.length && <Empty title={empty} text="Les données apparaîtront ici dès qu’elles seront disponibles." />}</div></section>; }

function CustomerContextPanel({ accountsWithHistory, dataSourceLabel, hubspotIntegration, orders, productDistribution, topProducts }) {
  const hasCommercialData = accountsWithHistory > 0 || orders.length > 0;
  const dnByName = new Map((productDistribution?.products || []).map((product) => [product.name, product]));
  return <section className="bp-card bp-context-card"><div className="bp-card-head"><div><span className="pb-eyebrow">Contexte commercial</span><h2>Signaux client Naali</h2></div><span className={hubspotIntegration?.status === 'active' ? 'bp-status is-active' : 'bp-status'}>{dataSourceLabel}</span></div><div className="bp-context-body"><div className="bp-context-copy"><strong>{hasCommercialData ? 'Données HubSpot réelles disponibles dans PharmaBiz.' : 'Connexion prête, historique à importer.'}</strong><p>{hasCommercialData ? `DN produit ${productDistribution?.rateLabel || '—'} : ${productDistribution?.note || 'historique produits en cours de consolidation'}.` : 'HubSpot est connecté pour Naali, mais la base locale ne contient pas encore l’historique complet des deals/commandes clients.'}</p></div><div className="bp-product-stack">{topProducts.length ? topProducts.slice(0, 5).map((product) => { const distribution = dnByName.get(product.name); return <article key={product.name}><span>{product.name}</span><strong>{distribution?.rateLabel || product.quantity}</strong><small>{distribution ? `${distribution.pharmacyCount} pharmacies · ${money(product.revenue)}` : money(product.revenue)}</small></article>; }) : ['DN produit', 'Produits commandés', 'Nombre de commandes', 'Remises historiques'].map((item) => <article key={item}><span>{item}</span><strong>{item === 'DN produit' ? productDistribution?.rateLabel || '—' : '—'}</strong><small>{item === 'DN produit' ? productDistribution?.note || 'à synchroniser' : 'à synchroniser'}</small></article>)}</div></div></section>;
}

function TerritoryPanel({ accounts, selectedAccount, setSelectedAccount }) {
  const [filter, setFilter] = useState('all');
  const filteredAccounts = accounts.filter((account) => filter === 'all' || (filter === 'history' && account.orders) || (filter === 'priority' && account.priorityScore >= 45) || (filter === 'activate' && !account.orders));
  const priorityAccounts = filteredAccounts.filter((account) => account.priorityScore >= 35 || !account.orders).slice(0, 8);
  const zones = buildTerritoryZones(filteredAccounts);
  const totalRevenue = accounts.reduce((sum, account) => sum + account.revenue, 0);
  return <section className="bp-card bp-territory-panel"><div className="bp-card-head"><div><span className="pb-eyebrow">Territoire Naali</span><h2>Carte terrain & priorités</h2></div><b>{filteredAccounts.length}</b></div><div className="bp-territory-filters">{[['all', 'Toutes'], ['priority', 'Fort potentiel'], ['history', 'Avec historique'], ['activate', 'À activer']].map(([key, text]) => <button className={filter === key ? 'is-active' : ''} key={key} onClick={() => setFilter(key)} type="button">{text}</button>)}</div><div className="bp-territory-grid"><div className="bp-territory-map" aria-label="Carte territoire des pharmacies"><div className="bp-map-summary"><span>Sell-in suivi</span><strong>{money(totalRevenue)}</strong><small>{accounts.length} pharmacies liées</small></div>{zones.map((zone) => <button className={`bp-zone-card ${zone.accounts.some((account) => account.id === selectedAccount?.id) ? 'is-selected' : ''}`} key={zone.key} onClick={() => setSelectedAccount(zone.accounts[0]?.id)} style={{ '--x': `${zone.x}%`, '--y': `${zone.y}%`, '--weight': zone.weight }} type="button"><strong>{zone.key}</strong><span>{zone.accounts.length} pharmacies</span><small>{money(zone.revenue)}</small></button>)}</div><aside className="bp-territory-detail"><span className="pb-eyebrow">Compte sélectionné</span><h3>{selectedAccount?.name || 'Aucune pharmacie'}</h3><p>{selectedAccount?.city || 'Sélectionnez une zone pour lire le contexte commercial.'}</p><div className="bp-territory-stats"><Metric label="CA HT" value={money(selectedAccount?.revenue)} note={`${selectedAccount?.orders || 0} commandes`} /><Metric label="Priorité" value={selectedAccount?.priorityScore || '—'} note={label(selectedAccount?.status)} /></div><div className="bp-territory-tags">{(selectedAccount?.products?.length ? selectedAccount.products.slice(0, 4) : ['Potentiel à qualifier', 'Historique HubSpot', 'Relance terrain']).map((item) => <em key={item}>{item}</em>)}</div><div className="bp-priority-list"><strong>Top priorités terrain</strong>{priorityAccounts.map((account) => <button className={selectedAccount?.id === account.id ? 'is-selected' : ''} key={account.id} onClick={() => setSelectedAccount(account.id)} type="button"><span>{account.name}</span><small>{account.city} · {account.orders ? `${account.orders} commande(s)` : 'à activer'} · {money(account.revenue)}</small></button>)}</div></aside></div></section>;
}

function buildCustomerStats(orders, orderItems) {
  const stats = new Map();
  orders.forEach((order) => {
    const pharmacyId = order.pharmacy_id;
    if (!pharmacyId) return;
    const current = stats.get(pharmacyId) || { revenue: 0, orders: 0, lastOrderAt: null, products: [] };
    const orderDate = order.order_date || order.created_at;
    current.revenue += Number(order.total_after_discount_ht || order.total_ht || 0);
    current.orders += 1;
    if (!current.lastOrderAt || new Date(orderDate) > new Date(current.lastOrderAt)) current.lastOrderAt = orderDate;
    stats.set(pharmacyId, current);
  });
  orderItems.forEach((item) => {
    const pharmacyId = item.pharmacy_id || item.orders?.pharmacy_id;
    const name = item.product_name_snapshot || item.products?.name;
    if (!pharmacyId || !name) return;
    const current = stats.get(pharmacyId) || { revenue: 0, orders: 0, lastOrderAt: null, products: [] };
    if (!current.products.includes(name)) current.products.push(name);
    stats.set(pharmacyId, current);
  });
  return stats;
}

function buildTopProducts(orderItems) {
  const products = new Map();
  orderItems.forEach((item) => {
    const name = item.product_name_snapshot || item.products?.name;
    if (!name) return;
    const current = products.get(name) || { name, quantity: 0, revenue: 0 };
    current.quantity += Number(item.quantity || 0);
    current.revenue += Number(item.line_total_ht || 0);
    products.set(name, current);
  });
  return Array.from(products.values()).sort((a, b) => b.revenue - a.revenue);
}

function buildProductDistribution(orderItems, relations) {
  const relationPharmacyIds = new Set((relations || []).map((relation) => relation.pharmacy_id).filter(Boolean));
  const productStats = new Map();
  const byPharmacy = new Map();

  (relations || []).forEach((relation) => {
    if (!relation.pharmacy_id) return;
    const references = readArray(relation.pharmacy?.hubspot_catalogue_naali_reference || relation.pharmacy?.hubspot_catalogue_naali_reference_raw);
    const pharmacy = new Set();
    references.forEach((name) => {
      const current = productStats.get(name) || { name, pharmacies: new Set(), quantity: 0, revenue: 0 };
      current.pharmacies.add(relation.pharmacy_id);
      productStats.set(name, current);
      pharmacy.add(name);
    });
    byPharmacy.set(relation.pharmacy_id, pharmacy);
  });

  const totalPharmacies = relationPharmacyIds.size;
  const denominator = Math.max(1, totalPharmacies);
  const products = Array.from(productStats.values()).map((product) => {
    const pharmacyCount = product.pharmacies.size;
    const rate = (pharmacyCount / denominator) * 100;
    return {
      name: product.name,
      pharmacyCount,
      quantity: product.quantity,
      rate,
      rateLabel: formatPercent(rate),
      revenue: product.revenue,
    };
  }).sort((a, b) => b.rate - a.rate || b.revenue - a.revenue);

  const totalRate = Array.from(relationPharmacyIds).reduce((sum, pharmacyId) => {
    const distinctProducts = byPharmacy.get(pharmacyId)?.size || 0;
    return sum + ((distinctProducts / NAALI_CATALOGUE_REFERENCE_TOTAL) * 100);
  }, 0);
  const totalDistinctProducts = Array.from(byPharmacy.values()).reduce((sum, items) => sum + items.size, 0);
  const averageDistinctProducts = totalPharmacies ? Math.round((totalDistinctProducts / totalPharmacies) * 10) / 10 : 0;
  const rate = totalPharmacies ? totalRate / totalPharmacies : 0;
  return {
    averageDistinctProducts,
    catalogSize: NAALI_CATALOGUE_REFERENCE_TOTAL,
    denominator: totalPharmacies,
    distributedCount: totalDistinctProducts,
    note: totalPharmacies ? `Moy. ${formatShortNumber(averageDistinctProducts)}/${NAALI_CATALOGUE_REFERENCE_TOTAL} références cochées` : 'champ catalogue Naali à synchroniser',
    products,
    rate,
    rateLabel: totalPharmacies ? formatPercent(rate) : '—',
  };
}

function buildTerritoryAccounts(relations, customerStats) {
  return relations.map((relation, index) => {
    const pharmacy = relation.pharmacy || {};
    const stats = customerStats.get(relation.pharmacy_id) || { revenue: 0, orders: 0, lastOrderAt: null, products: [] };
    const hubspotRevenue = Number(pharmacy.hubspot_total_revenue || 0);
    const postalSeed = Number(String(pharmacy.postal_code || pharmacy.city || relation.pharmacy_id || index).replace(/\D/g, '').slice(-4)) || index * 137;
    const statusBoost = ['active', 'premium', 'ambassador', 'ambassadrice'].includes(relation.status) ? 30 : 0;
    const potentialBoost = relation.potential === 'priority' ? 26 : relation.potential === 'high' ? 18 : relation.potential === 'medium' ? 9 : 3;
    const revenueBoost = Math.min(34, Math.round(stats.revenue / 120));
    return {
      id: relation.pharmacy_id || relation.id,
      name: pharmacy.name || `Pharmacie ${String(relation.pharmacy_id || '').slice(0, 8)}`,
      city: pharmacy.city || 'Ville à compléter',
      status: relation.status,
      postalCode: pharmacy.postal_code || '',
      revenue: stats.revenue || hubspotRevenue,
      orders: stats.orders,
      products: stats.products,
      priorityScore: Math.min(99, statusBoost + potentialBoost + revenueBoost + (stats.orders ? 12 : 0)),
      x: 12 + ((postalSeed * 17 + index * 11) % 76),
      y: 14 + ((postalSeed * 29 + index * 7) % 70),
    };
  }).sort((first, second) => second.priorityScore - first.priorityScore);
}

function buildTerritoryZones(accounts) {
  const fallbackZones = ['13', '84', '30', '06', '83', '34', '69', '75'];
  const zones = new Map();
  accounts.forEach((account, index) => {
    const zoneKey = String(account.postalCode || '').slice(0, 2) || fallbackZones[index % fallbackZones.length];
    const zone = zones.get(zoneKey) || { key: zoneKey, accounts: [], revenue: 0, weight: 0 };
    zone.accounts.push(account);
    zone.revenue += account.revenue;
    zone.weight += account.priorityScore;
    zones.set(zoneKey, zone);
  });
  return Array.from(zones.values()).map((zone, index) => ({
    ...zone,
    weight: Math.max(1, Math.min(10, Math.round(zone.weight / Math.max(1, zone.accounts.length) / 10))),
    x: 16 + ((Number(zone.key) || index * 19) * 13 + index * 11) % 68,
    y: 18 + ((Number(zone.key) || index * 23) * 7 + index * 17) % 58,
  })).sort((first, second) => second.revenue - first.revenue || second.accounts.length - first.accounts.length);
}

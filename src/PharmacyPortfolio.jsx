import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './pharmacy-portfolio.css';
import './pharmacy-multibrand.css';

const RELATION_STATUSES = [
  ['not_referenced', 'Non référencée'],
  ['prospect', 'Prospect'],
  ['interested', 'Intéressée'],
  ['testing', 'En test'],
  ['client', 'Cliente'],
  ['active', 'Cliente active'],
  ['reassort_needed', 'Réassort à prévoir'],
  ['inactive', 'Inactive'],
  ['lost', 'Perdue'],
];

const SEGMENT_LABELS = {
  priority: 'Prioritaire',
  secondary: 'Secondaire',
  non_priority: 'Non prioritaire',
  ambassador: 'Ambassadeur',
  premium: 'Premium',
  standard: 'Standard',
  to_develop: 'À développer',
  to_reactivate: 'À réactiver',
};

function formatDate(value) {
  if (!value) return 'Non planifiée';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function relationStatusLabel(status) {
  return RELATION_STATUSES.find(([value]) => value === status)?.[1] || status || 'Non renseigné';
}

function relationClass(status) {
  if (['client', 'active'].includes(status)) return 'brand-status active';
  if (['interested', 'testing', 'reassort_needed'].includes(status)) return 'brand-status warm';
  if (['inactive', 'lost'].includes(status)) return 'brand-status inactive';
  return 'brand-status neutral';
}

function segmentLabel(value) {
  return SEGMENT_LABELS[value] || value || 'Non segmentée';
}

function blankForm() {
  return { name: '', address_line1: '', postal_code: '', city: '', department: '', groupement: '', email: '', phone: '', contact_name: '', notes: '' };
}

export default function PharmacyPortfolio({ state, reload }) {
  const [relations, setRelations] = useState([]);
  const [relationsLoading, setRelationsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [newBrandId, setNewBrandId] = useState('');

  const pharmacies = state.pharmacies || [];
  const brands = state.brands || [];

  async function loadRelations() {
    setRelationsLoading(true);
    const { data, error } = await supabase
      .from('pharmacy_brand_relations')
      .select('*, brands(id,name)')
      .order('updated_at', { ascending: false });
    if (error) setNotice(error.message);
    setRelations(data || []);
    setRelationsLoading(false);
  }

  useEffect(() => { loadRelations(); }, []);

  const relationsByPharmacy = useMemo(() => {
    const map = new Map();
    relations.forEach((relation) => {
      const list = map.get(relation.pharmacy_id) || [];
      list.push(relation);
      map.set(relation.pharmacy_id, list);
    });
    return map;
  }, [relations]);

  const departments = useMemo(() => [...new Set(pharmacies.map((p) => p.department).filter(Boolean))].sort(), [pharmacies]);

  const countsByBrand = useMemo(() => {
    const counts = {};
    brands.forEach((brand) => { counts[brand.id] = new Set(); });
    relations.forEach((relation) => counts[relation.brand_id]?.add(relation.pharmacy_id));
    return Object.fromEntries(Object.entries(counts).map(([id, set]) => [id, set.size]));
  }, [brands, relations]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return pharmacies
      .filter((pharmacy) => {
        const pharmacyRelations = relationsByPharmacy.get(pharmacy.id) || [];
        const haystack = [pharmacy.name, pharmacy.city, pharmacy.postal_code, pharmacy.department, pharmacy.groupement, pharmacy.contact_name, pharmacy.email, pharmacy.phone]
          .filter(Boolean).join(' ').toLocaleLowerCase('fr');
        return (!query || haystack.includes(query))
          && (departmentFilter === 'all' || pharmacy.department === departmentFilter)
          && (brandFilter === 'all' || pharmacyRelations.some((relation) => relation.brand_id === brandFilter));
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [pharmacies, relationsByPharmacy, search, departmentFilter, brandFilter]);

  const selected = pharmacies.find((p) => p.id === selectedId) || null;
  const selectedRelations = selected ? relationsByPharmacy.get(selected.id) || [] : [];
  const selectedTasks = selected ? (state.followUps || []).filter((task) => task.pharmacy_id === selected.id && task.status === 'todo') : [];
  const availableBrands = brands.filter((brand) => !selectedRelations.some((relation) => relation.brand_id === brand.id));

  async function createPharmacy(event) {
    event.preventDefault();
    if (!state.agent?.id) return setNotice('Compte agent introuvable.');
    setSaving(true); setNotice('');
    const { data: pharmacy, error } = await supabase.from('pharmacies').insert({
      ...form,
      country: 'France',
      potential: 'medium',
      status: 'prospect',
      assigned_agent_id: state.agent.id,
      created_by: state.profile?.id || null,
      email: form.email || null,
      phone: form.phone || null,
    }).select('*').single();
    if (!error && pharmacy && brands[0]) {
      await supabase.from('pharmacy_brand_relations').insert({
        pharmacy_id: pharmacy.id,
        brand_id: brands[0].id,
        agent_id: state.agent.id,
        status: 'prospect',
        potential: 'medium',
        created_by: state.profile?.id || null,
      });
    }
    setSaving(false);
    if (error) return setNotice(error.message);
    setForm(blankForm()); setShowCreate(false); setNotice('Pharmacie ajoutée.');
    await reload(); await loadRelations();
  }

  async function addBrandRelation() {
    if (!selected || !newBrandId || !state.agent?.id) return;
    setSaving(true); setNotice('');
    const { error } = await supabase.from('pharmacy_brand_relations').insert({
      pharmacy_id: selected.id,
      brand_id: newBrandId,
      agent_id: state.agent.id,
      status: 'prospect',
      potential: selected.potential || 'medium',
      created_by: state.profile?.id || null,
    });
    setSaving(false);
    if (error) return setNotice(error.message);
    setNewBrandId(''); setNotice('Marque ajoutée au compte pharmacie.');
    await loadRelations();
  }

  async function updateRelation(relation, patch) {
    setSaving(true); setNotice('');
    const { error } = await supabase.from('pharmacy_brand_relations').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', relation.id);
    setSaving(false);
    if (error) return setNotice(error.message);
    await loadRelations();
  }

  async function createFollowUp(pharmacy, relation) {
    if (!state.agent?.id) return setNotice('Compte agent introuvable.');
    const brandName = relation?.brands?.name || 'la marque';
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString();
    setSaving(true); setNotice('');
    const { error } = await supabase.from('follow_up_tasks').insert({
      agent_id: state.agent.id,
      pharmacy_id: pharmacy.id,
      brand_id: relation?.brand_id || null,
      title: `Relance ${brandName} — ${pharmacy.name}`,
      reason: `Relance commerciale ${brandName} créée depuis le compte pharmacie.`,
      due_at: dueAt,
      priority: relation?.segment === 'priority' ? 'high' : 'medium',
      status: 'todo',
      created_by: state.profile?.id || null,
    });
    if (!error && relation) await updateRelation(relation, { next_action_at: dueAt });
    setSaving(false);
    if (error) return setNotice(error.message);
    setNotice(`Relance ${brandName} créée.`);
    await reload();
  }

  return (
    <div className="pharmacy-portfolio multibrand-portfolio">
      <header className="account-header">
        <div>
          <p className="eyebrow">Portefeuille officinal multimarques</p>
          <h2>{pharmacies.length} comptes pharmacies</h2>
          <p>Une pharmacie, plusieurs marques, des statuts et actions distincts.</p>
        </div>
        <button className="primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Fermer' : '+ Ajouter une pharmacie'}</button>
      </header>

      {notice && <div className="portfolio-notice">{notice}</div>}

      <section className="brand-switcher">
        <button className={brandFilter === 'all' ? 'brand-tab active' : 'brand-tab'} onClick={() => setBrandFilter('all')}><strong>Toutes</strong><span>{pharmacies.length}</span></button>
        {brands.map((brand) => <button key={brand.id} className={brandFilter === brand.id ? 'brand-tab active' : 'brand-tab'} onClick={() => setBrandFilter(brand.id)}><strong>{brand.name}</strong><span>{countsByBrand[brand.id] || 0}</span></button>)}
      </section>

      {showCreate && <section className="portfolio-create"><h3>Nouvelle pharmacie</h3><form onSubmit={createPharmacy} className="portfolio-form">
        <label><span>Nom *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span>Ville</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label><span>Adresse</span><input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></label>
        <label><span>Code postal</span><input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
        <label><span>Département</span><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
        <label><span>Groupement</span><input value={form.groupement} onChange={(e) => setForm({ ...form, groupement: e.target.value })} /></label>
        <label><span>Contact</span><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></label>
        <label><span>Téléphone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="portfolio-form-wide"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button className="primary portfolio-form-wide" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer la pharmacie'}</button>
      </form></section>}

      <section className="portfolio-toolbar compact-toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une pharmacie, une ville ou un contact" />
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}><option value="all">Tous les départements</option>{departments.map((department) => <option key={department} value={department}>Département {department}</option>)}</select>
      </section>

      <div className={selected ? 'portfolio-layout with-detail' : 'portfolio-layout'}>
        <section className="portfolio-list-panel">
          <div className="portfolio-list-head"><div><strong>{filtered.length}</strong><span> comptes affichés</span></div></div>
          {relationsLoading ? <div className="portfolio-empty">Chargement des relations marques…</div> : <div className="portfolio-table-wrap"><table className="portfolio-table multibrand-table">
            <thead><tr><th>Pharmacie</th><th>Marques</th><th>Contact</th><th>Prochaine action</th><th></th></tr></thead>
            <tbody>{filtered.map((pharmacy) => {
              const pharmacyRelations = relationsByPharmacy.get(pharmacy.id) || [];
              const nextAction = pharmacyRelations.map((r) => r.next_action_at).filter(Boolean).sort()[0];
              return <tr key={pharmacy.id} className={selectedId === pharmacy.id ? 'selected' : ''} onClick={() => setSelectedId(pharmacy.id)}>
                <td><strong>{pharmacy.name}</strong><span>{[pharmacy.postal_code, pharmacy.city].filter(Boolean).join(' ') || 'Localisation non renseignée'}</span></td>
                <td><div className="brand-cell">{pharmacyRelations.length ? pharmacyRelations.map((relation) => <span key={relation.id} className={relationClass(relation.status)}><b>{relation.brands?.name}</b> · {relationStatusLabel(relation.status)}</span>) : <span className="brand-status neutral">Aucune marque</span>}</div></td>
                <td><strong className="contact-name">{pharmacy.contact_name || pharmacy.titular_name || 'Non renseigné'}</strong><span>{pharmacy.phone || pharmacy.email || 'Aucune coordonnée'}</span></td>
                <td>{formatDate(nextAction)}</td>
                <td><button className="row-open">›</button></td>
              </tr>;
            })}</tbody>
          </table></div>}
        </section>

        {selected && <aside className="pharmacy-detail account-detail">
          <button className="detail-close" onClick={() => setSelectedId(null)}>×</button>
          <div className="detail-title"><p className="eyebrow">Compte pharmacie</p><h3>{selected.name}</h3><p>{[selected.address_line1, selected.postal_code, selected.city].filter(Boolean).join(' · ') || 'Adresse non renseignée'}</p></div>
          <div className="detail-grid"><div><span>Contact</span><strong>{selected.contact_name || selected.titular_name || '—'}</strong></div><div><span>Groupement</span><strong>{selected.groupement || '—'}</strong></div><div><span>Téléphone</span><strong>{selected.phone || '—'}</strong></div><div><span>Email</span><strong>{selected.email || '—'}</strong></div></div>

          <div className="account-brands-head"><div><span>Gestion multimarques</span><strong>{selectedRelations.length} marque{selectedRelations.length > 1 ? 's' : ''}</strong></div>{availableBrands.length > 0 && <div className="add-brand-row"><select value={newBrandId} onChange={(e) => setNewBrandId(e.target.value)}><option value="">Ajouter une marque…</option>{availableBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select><button disabled={!newBrandId || saving} onClick={addBrandRelation}>Ajouter</button></div>}</div>

          <div className="account-brand-list">{selectedRelations.length ? selectedRelations.map((relation) => <section className="account-brand-card" key={relation.id}>
            <header><div><strong>{relation.brands?.name}</strong><span>{segmentLabel(relation.segment)}</span></div><select value={relation.status} onChange={(e) => updateRelation(relation, { status: e.target.value })}>{RELATION_STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></header>
            <div className="brand-metrics"><div><span>CA 12 mois</span><strong>{Number(relation.annual_revenue_ht || 0).toLocaleString('fr-FR')} €</strong></div><div><span>Dernière commande</span><strong>{formatDate(relation.last_order_at)}</strong></div><div><span>Prochaine action</span><strong>{formatDate(relation.next_action_at)}</strong></div></div>
            <button className="primary" disabled={saving} onClick={() => createFollowUp(selected, relation)}>Créer une relance {relation.brands?.name}</button>
          </section>) : <p className="muted">Aucune marque rattachée à cette pharmacie.</p>}</div>

          <div className="detail-block"><span>Actions ouvertes</span>{selectedTasks.length ? selectedTasks.slice(0, 6).map((task) => <div className="detail-task" key={task.id}><strong>{task.title}</strong><small>{formatDate(task.due_at)}</small></div>) : <p>Aucune relance ouverte.</p>}</div>
          <div className="detail-block"><span>Notes générales</span><p>{selected.notes || 'Aucune note enregistrée.'}</p></div>
        </aside>}
      </div>
    </div>
  );
}

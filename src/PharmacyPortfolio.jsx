import React, { useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './pharmacy-portfolio.css';

const SEGMENTS = ['Prioritaires', 'Secondaires', 'Non Prioritaires'];
const STATUSES = ['prospect', 'contacted', 'interested', 'implanted', 'reassort_needed', 'inactive', 'lost'];

function formatDate(value) {
  if (!value) return 'Non planifiée';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function segmentOf(pharmacy) {
  if (pharmacy.naali_segment) return pharmacy.naali_segment;
  if (pharmacy.potential === 'priority') return 'Prioritaires';
  if (pharmacy.potential === 'medium') return 'Secondaires';
  return 'Non Prioritaires';
}

function potentialFor(segment) {
  if (segment === 'Prioritaires') return 'priority';
  if (segment === 'Secondaires') return 'medium';
  return 'low';
}

function statusLabel(status) {
  const labels = {
    prospect: 'Prospect',
    contacted: 'Contactée',
    interested: 'Intéressée',
    implanted: 'Implantée',
    reassort_needed: 'Réassort à prévoir',
    inactive: 'Inactive',
    lost: 'Perdue',
  };
  return labels[status] || status || 'Non renseigné';
}

function segmentClass(segment) {
  if (segment === 'Prioritaires') return 'segment segment-priority';
  if (segment === 'Secondaires') return 'segment segment-secondary';
  return 'segment segment-standard';
}

function dueState(value) {
  if (!value) return 'none';
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  if (due < today) return 'late';
  if (due.getTime() === today.getTime()) return 'today';
  return 'future';
}

function blankForm() {
  return {
    name: '',
    address_line1: '',
    postal_code: '',
    city: '',
    department: '',
    groupement: '',
    naali_segment: 'Secondaires',
    status: 'implanted',
    email: '',
    phone: '',
    contact_name: '',
    notes: '',
  };
}

export default function PharmacyPortfolio({ state, reload }) {
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('Toutes');
  const [departmentFilter, setDepartmentFilter] = useState('Tous');
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [sortBy, setSortBy] = useState('segment');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const pharmacies = state.pharmacies || [];
  const counts = useMemo(() => ({
    total: pharmacies.length,
    priority: pharmacies.filter((p) => segmentOf(p) === 'Prioritaires').length,
    secondary: pharmacies.filter((p) => segmentOf(p) === 'Secondaires').length,
    standard: pharmacies.filter((p) => segmentOf(p) === 'Non Prioritaires').length,
  }), [pharmacies]);

  const departments = useMemo(() => [...new Set(pharmacies.map((p) => p.department).filter(Boolean))].sort(), [pharmacies]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    const rank = { Prioritaires: 0, Secondaires: 1, 'Non Prioritaires': 2 };
    const rows = pharmacies.filter((p) => {
      const haystack = [p.name, p.city, p.postal_code, p.department, p.groupement, p.contact_name, p.email, p.phone]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr');
      return (!query || haystack.includes(query))
        && (segmentFilter === 'Toutes' || segmentOf(p) === segmentFilter)
        && (departmentFilter === 'Tous' || p.department === departmentFilter)
        && (statusFilter === 'Tous' || p.status === statusFilter);
    });

    return rows.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'fr');
      if (sortBy === 'city') return (a.city || '').localeCompare(b.city || '', 'fr') || a.name.localeCompare(b.name, 'fr');
      if (sortBy === 'follow_up') {
        const ad = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd || a.name.localeCompare(b.name, 'fr');
      }
      return rank[segmentOf(a)] - rank[segmentOf(b)] || a.name.localeCompare(b.name, 'fr');
    });
  }, [pharmacies, search, segmentFilter, departmentFilter, statusFilter, sortBy]);

  const selected = pharmacies.find((p) => p.id === selectedId) || null;
  const naaliBrand = state.brands?.find((b) => /naali/i.test(b.name));
  const selectedTasks = selected ? (state.followUps || []).filter((task) => task.pharmacy_id === selected.id && task.status === 'todo') : [];

  async function createPharmacy(event) {
    event.preventDefault();
    if (!state.agent?.id) return setNotice('Compte agent introuvable.');
    setSaving(true);
    setNotice('');
    const payload = {
      ...form,
      assigned_agent_id: state.agent.id,
      created_by: state.profile?.id || null,
      country: 'France',
      potential: potentialFor(form.naali_segment),
      email: form.email || null,
      phone: form.phone || null,
    };
    const { error } = await supabase.from('pharmacies').insert(payload);
    setSaving(false);
    if (error) return setNotice(error.message);
    setForm(blankForm());
    setShowCreate(false);
    setNotice('Pharmacie ajoutée au portefeuille.');
    await reload();
  }

  async function createFollowUp(pharmacy) {
    if (!state.agent?.id) return setNotice('Compte agent introuvable.');
    setSaving(true);
    setNotice('');
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const segment = segmentOf(pharmacy);
    const { error } = await supabase.from('follow_up_tasks').insert({
      agent_id: state.agent.id,
      pharmacy_id: pharmacy.id,
      brand_id: naaliBrand?.id || null,
      title: `Relance Naali — ${pharmacy.name}`,
      reason: 'Relance commerciale créée depuis le portefeuille pharmacies.',
      due_at: dueAt,
      priority: segment === 'Prioritaires' ? 'high' : 'medium',
      status: 'todo',
      created_by: state.profile?.id || null,
    });
    if (!error) {
      await supabase.from('pharmacies').update({ next_follow_up_at: dueAt }).eq('id', pharmacy.id);
    }
    setSaving(false);
    if (error) return setNotice(error.message);
    setNotice(`Relance créée pour ${pharmacy.name}.`);
    await reload();
  }

  return (
    <div className="pharmacy-portfolio">
      <section className="portfolio-heading">
        <div>
          <p className="eyebrow">Portefeuille actif Naali</p>
          <h2>{counts.total} pharmacies à piloter</h2>
          <p>Segmentation commerciale, contacts et prochaines actions dans une seule vue.</p>
        </div>
        <button className="primary" onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? 'Fermer' : '+ Ajouter une pharmacie'}
        </button>
      </section>

      {notice && <div className="portfolio-notice">{notice}</div>}

      <section className="portfolio-kpis">
        <button className={segmentFilter === 'Toutes' ? 'portfolio-kpi active' : 'portfolio-kpi'} onClick={() => setSegmentFilter('Toutes')}>
          <span>Portefeuille total</span><strong>{counts.total}</strong><small>pharmacies actives</small>
        </button>
        <button className={segmentFilter === 'Prioritaires' ? 'portfolio-kpi active priority' : 'portfolio-kpi priority'} onClick={() => setSegmentFilter('Prioritaires')}>
          <span>Prioritaires</span><strong>{counts.priority}</strong><small>à suivre en premier</small>
        </button>
        <button className={segmentFilter === 'Secondaires' ? 'portfolio-kpi active secondary' : 'portfolio-kpi secondary'} onClick={() => setSegmentFilter('Secondaires')}>
          <span>Secondaires</span><strong>{counts.secondary}</strong><small>potentiel à développer</small>
        </button>
        <button className={segmentFilter === 'Non Prioritaires' ? 'portfolio-kpi active standard' : 'portfolio-kpi standard'} onClick={() => setSegmentFilter('Non Prioritaires')}>
          <span>Non prioritaires</span><strong>{counts.standard}</strong><small>suivi opportuniste</small>
        </button>
      </section>

      {showCreate && (
        <section className="portfolio-create">
          <div className="section-title"><div><span>Nouvelle fiche</span><h3>Ajouter une pharmacie</h3></div></div>
          <form onSubmit={createPharmacy} className="portfolio-form">
            <label><span>Nom *</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label><span>Ville</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label><span>Adresse</span><input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></label>
            <label><span>Code postal</span><input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></label>
            <label><span>Département</span><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></label>
            <label><span>Segmentation Naali</span><select value={form.naali_segment} onChange={(e) => setForm({ ...form, naali_segment: e.target.value })}>{SEGMENTS.map((segment) => <option key={segment}>{segment}</option>)}</select></label>
            <label><span>Contact</span><input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></label>
            <label><span>Téléphone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span>Groupement</span><input value={form.groupement} onChange={(e) => setForm({ ...form, groupement: e.target.value })} /></label>
            <label className="portfolio-form-wide"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <button className="primary portfolio-form-wide" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer la pharmacie'}</button>
          </form>
        </section>
      )}

      <section className="portfolio-toolbar">
        <div className="portfolio-search">
          <span>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une pharmacie, une ville, un contact…" />
        </div>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
          <option value="Tous">Tous les départements</option>
          {departments.map((department) => <option key={department} value={department}>Département {department}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="Tous">Tous les statuts</option>
          {STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="segment">Trier par segmentation</option>
          <option value="name">Trier par nom</option>
          <option value="city">Trier par ville</option>
          <option value="follow_up">Trier par prochaine relance</option>
        </select>
      </section>

      <div className={selected ? 'portfolio-layout with-detail' : 'portfolio-layout'}>
        <section className="portfolio-list-panel">
          <div className="portfolio-list-head">
            <div><strong>{filtered.length}</strong><span> résultat{filtered.length > 1 ? 's' : ''}</span></div>
            {(search || segmentFilter !== 'Toutes' || departmentFilter !== 'Tous' || statusFilter !== 'Tous') && <button onClick={() => { setSearch(''); setSegmentFilter('Toutes'); setDepartmentFilter('Tous'); setStatusFilter('Tous'); }}>Réinitialiser</button>}
          </div>

          {filtered.length ? (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead><tr><th>Pharmacie</th><th>Segmentation</th><th>Statut</th><th>Contact</th><th>Prochaine action</th><th></th></tr></thead>
                <tbody>
                  {filtered.map((pharmacy) => {
                    const segment = segmentOf(pharmacy);
                    const due = dueState(pharmacy.next_follow_up_at);
                    return (
                      <tr key={pharmacy.id} className={selectedId === pharmacy.id ? 'selected' : ''} onClick={() => setSelectedId(pharmacy.id)}>
                        <td><strong>{pharmacy.name}</strong><span>{[pharmacy.postal_code, pharmacy.city].filter(Boolean).join(' ') || 'Localisation non renseignée'}</span></td>
                        <td><span className={segmentClass(segment)}>{segment}</span></td>
                        <td><span className={`portfolio-status status-${pharmacy.status || 'unknown'}`}>{statusLabel(pharmacy.status)}</span></td>
                        <td><strong className="contact-name">{pharmacy.contact_name || pharmacy.titular_name || 'Non renseigné'}</strong><span>{pharmacy.phone || pharmacy.email || 'Aucune coordonnée'}</span></td>
                        <td><span className={`follow-up follow-up-${due}`}>{formatDate(pharmacy.next_follow_up_at)}</span></td>
                        <td><button className="row-open" aria-label={`Ouvrir ${pharmacy.name}`}>›</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="portfolio-empty"><strong>Aucune pharmacie trouvée</strong><span>Modifie les filtres ou la recherche.</span></div>}
        </section>

        {selected && (
          <aside className="pharmacy-detail">
            <button className="detail-close" onClick={() => setSelectedId(null)}>×</button>
            <div className="detail-title">
              <span className={segmentClass(segmentOf(selected))}>{segmentOf(selected)}</span>
              <h3>{selected.name}</h3>
              <p>{[selected.address_line1, selected.postal_code, selected.city].filter(Boolean).join(' · ') || 'Adresse non renseignée'}</p>
            </div>

            <div className="detail-actions">
              <button className="primary" disabled={saving} onClick={() => createFollowUp(selected)}>Créer une relance</button>
              {selected.phone && <a href={`tel:${selected.phone}`}>Appeler</a>}
              {selected.email && <a href={`mailto:${selected.email}`}>Écrire</a>}
            </div>

            <div className="detail-block">
              <span>Contact officine</span>
              <strong>{selected.contact_name || selected.titular_name || 'Non renseigné'}</strong>
              <p>{selected.phone || 'Téléphone non renseigné'}</p>
              <p>{selected.email || 'Email non renseigné'}</p>
            </div>

            <div className="detail-grid">
              <div><span>Statut</span><strong>{statusLabel(selected.status)}</strong></div>
              <div><span>Département</span><strong>{selected.department || '—'}</strong></div>
              <div><span>Groupement</span><strong>{selected.groupement || '—'}</strong></div>
              <div><span>Prochaine relance</span><strong>{formatDate(selected.next_follow_up_at)}</strong></div>
            </div>

            <div className="detail-block">
              <span>Actions ouvertes</span>
              {selectedTasks.length ? selectedTasks.slice(0, 4).map((task) => <div className="detail-task" key={task.id}><strong>{task.title}</strong><small>{formatDate(task.due_at)}</small></div>) : <p>Aucune relance ouverte.</p>}
            </div>

            <div className="detail-block">
              <span>Notes terrain</span>
              <p>{selected.notes || 'Aucune note enregistrée.'}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import './field-missions.css';

const STATUS = {
  draft: 'Brouillon',
  proposed: 'Proposée',
  assigned: 'Affectée',
  accepted: 'Acceptée',
  completed: 'Réalisée',
  validated: 'Validée',
  cancelled: 'Annulée',
};

const TABS = [
  ['missions', 'Missions'],
  ['animators', 'Animateurs'],
  ['planning', 'Planning'],
  ['performance', 'Performance'],
];

const money = (value) => new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(value || 0));

const fmt = (value) => value
  ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const initialAnimatorForm = { full_name: '', email: '', phone: '', zones: '', daily_rate_ht: '' };
const initialMissionForm = {
  title: '',
  mission_type: 'animation',
  pharmacy_id: '',
  brand_id: '',
  animator_id: '',
  starts_at: '',
  ends_at: '',
  fee_ht: '',
  objective: '',
  brief: '',
};

export default function FieldMissions({ state }) {
  const [animators, setAnimators] = useState([]);
  const [missions, setMissions] = useState([]);
  const [tab, setTab] = useState('missions');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [missionDrawerOpen, setMissionDrawerOpen] = useState(false);
  const [animatorDrawerOpen, setAnimatorDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [animatorForm, setAnimatorForm] = useState(initialAnimatorForm);
  const [missionForm, setMissionForm] = useState(initialMissionForm);

  async function load() {
    setLoading(true);
    setNotice('');
    const [animatorsResponse, missionsResponse] = await Promise.all([
      supabase.from('field_animators').select('*').order('full_name'),
      supabase
        .from('field_missions')
        .select('*, field_animators(full_name), pharmacies(name,city), brands(name)')
        .order('starts_at', { ascending: false }),
    ]);

    const errors = [animatorsResponse.error, missionsResponse.error].filter(Boolean);
    if (errors.length) {
      setNotice(`Le module nécessite la migration Supabase field_missions_v1.sql. ${errors.map((error) => error.message).join(' | ')}`);
    }

    setAnimators(animatorsResponse.data || []);
    setMissions(missionsResponse.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createAnimator(event) {
    event.preventDefault();
    const payload = {
      ...animatorForm,
      daily_rate_ht: Number(animatorForm.daily_rate_ht || 0),
      zones: animatorForm.zones.split(',').map((zone) => zone.trim()).filter(Boolean),
      status: 'active',
      created_by: state.profile?.id || null,
    };

    const { error } = await supabase.from('field_animators').insert(payload);
    if (error) return setNotice(error.message);

    setAnimatorForm(initialAnimatorForm);
    setAnimatorDrawerOpen(false);
    load();
  }

  async function createMission(event) {
    event.preventDefault();
    const payload = {
      ...missionForm,
      pharmacy_id: missionForm.pharmacy_id || null,
      brand_id: missionForm.brand_id || null,
      animator_id: missionForm.animator_id || null,
      fee_ht: Number(missionForm.fee_ht || 0),
      starts_at: missionForm.starts_at ? new Date(missionForm.starts_at).toISOString() : null,
      ends_at: missionForm.ends_at ? new Date(missionForm.ends_at).toISOString() : null,
      status: missionForm.animator_id ? 'assigned' : 'draft',
      created_by: state.profile?.id || null,
    };

    const { error } = await supabase.from('field_missions').insert(payload);
    if (error) return setNotice(error.message);

    setMissionForm(initialMissionForm);
    setMissionDrawerOpen(false);
    load();
  }

  async function setStatus(id, status) {
    const patch = { status };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    if (status === 'validated') patch.validated_at = new Date().toISOString();

    const { error } = await supabase.from('field_missions').update(patch).eq('id', id);
    if (error) setNotice(error.message);
    else load();
  }

  async function saveReport(id, unitsSold, revenueHt, report) {
    const { error } = await supabase
      .from('field_missions')
      .update({
        units_sold: Number(unitsSold || 0),
        revenue_ht: Number(revenueHt || 0),
        report,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) setNotice(error.message);
    else load();
  }

  const stats = useMemo(() => ({
    activeAnimators: animators.filter((animator) => animator.status === 'active').length,
    upcoming: missions.filter((mission) => ['assigned', 'accepted'].includes(mission.status)).length,
    completed: missions.filter((mission) => ['completed', 'validated'].includes(mission.status)).length,
    fees: missions.filter((mission) => mission.status === 'validated').reduce((sum, mission) => sum + Number(mission.fee_ht || 0), 0),
    revenue: missions.reduce((sum, mission) => sum + Number(mission.revenue_ht || 0), 0),
    units: missions.reduce((sum, mission) => sum + Number(mission.units_sold || 0), 0),
  }), [animators, missions]);

  const filteredMissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return missions.filter((mission) => {
      const matchesStatus = statusFilter === 'all' || mission.status === statusFilter;
      const haystack = [
        mission.title,
        mission.mission_type,
        mission.pharmacies?.name,
        mission.pharmacies?.city,
        mission.brands?.name,
        mission.field_animators?.full_name,
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }, [missions, search, statusFilter]);

  const upcomingPlanning = useMemo(() => missions
    .filter((mission) => mission.starts_at && !['cancelled', 'validated'].includes(mission.status))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)), [missions]);

  const actionLabel = tab === 'animators' ? 'Ajouter un animateur' : 'Nouvelle mission';
  const onPrimaryAction = tab === 'animators'
    ? () => setAnimatorDrawerOpen(true)
    : () => setMissionDrawerOpen(true);

  return (
    <div className="fm-page">
      <header className="fm-page-head">
        <div>
          <span className="fm-eyebrow">Opérations terrain</span>
          <h1>Réseau terrain</h1>
          <p>Pilote les animateurs, missions, résultats et coûts depuis un seul espace.</p>
        </div>
        <div className="fm-head-actions">
          <button className="fm-button fm-button-secondary" onClick={load} type="button">Actualiser</button>
          <button className="fm-button fm-button-primary" onClick={onPrimaryAction} type="button">+ {actionLabel}</button>
        </div>
      </header>

      {notice && <div className="fm-alert">{notice}</div>}

      <section className="fm-stats" aria-label="Indicateurs réseau terrain">
        <StatCard label="Animateurs actifs" value={stats.activeAnimators} meta="réseau disponible" />
        <StatCard label="Missions planifiées" value={stats.upcoming} meta="affectées ou acceptées" />
        <StatCard label="Missions réalisées" value={stats.completed} meta={`${stats.units} ventes déclarées`} />
        <StatCard label="CA sell-out" value={money(stats.revenue)} meta={`${money(stats.fees)} à payer`} />
      </section>

      <div className="fm-tabs" role="tablist" aria-label="Vues réseau terrain">
        {TABS.map(([key, label]) => (
          <button
            className={tab === key ? 'is-active' : ''}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="fm-loading">Chargement du réseau terrain…</div>
      ) : (
        <>
          {tab === 'missions' && (
            <section className="fm-section">
              <div className="fm-toolbar">
                <div className="fm-search-wrap">
                  <span>⌕</span>
                  <input
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher une mission, une pharmacie, une marque…"
                    value={search}
                  />
                </div>
                <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option value="all">Tous les statuts</option>
                  {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>

              {filteredMissions.length ? (
                <div className="fm-mission-list">
                  {filteredMissions.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} onReport={saveReport} onStatus={setStatus} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucune mission à afficher"
                  text="Crée une mission d’animation, de formation ou de merchandising et affecte-la à ton réseau."
                  action="Créer une mission"
                  onAction={() => setMissionDrawerOpen(true)}
                />
              )}
            </section>
          )}

          {tab === 'animators' && (
            <section className="fm-section">
              {animators.length ? (
                <div className="fm-animator-grid">
                  {animators.map((animator) => (
                    <article className="fm-animator-card" key={animator.id}>
                      <div className="fm-animator-top">
                        <div className="fm-animator-avatar">{initials(animator.full_name)}</div>
                        <div>
                          <h3>{animator.full_name}</h3>
                          <p>{animator.email || animator.phone || 'Coordonnées à compléter'}</p>
                        </div>
                        <span className={`fm-status ${animator.status === 'active' ? 'fm-status-active' : ''}`}>{animator.status}</span>
                      </div>
                      <div className="fm-animator-meta">
                        <span><small>Zones</small><strong>{(animator.zones || []).join(' · ') || 'Non renseignées'}</strong></span>
                        <span><small>Tarif jour</small><strong>{money(animator.daily_rate_ht)}</strong></span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucun animateur dans le réseau"
                  text="Ajoute tes premiers animateurs indépendants pour pouvoir affecter et suivre les missions."
                  action="Ajouter un animateur"
                  onAction={() => setAnimatorDrawerOpen(true)}
                />
              )}
            </section>
          )}

          {tab === 'planning' && (
            <section className="fm-section">
              {upcomingPlanning.length ? (
                <div className="fm-planning-list">
                  {upcomingPlanning.map((mission) => (
                    <article className="fm-planning-row" key={mission.id}>
                      <div className="fm-date-box">
                        <strong>{new Date(mission.starts_at).getDate()}</strong>
                        <span>{new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(mission.starts_at))}</span>
                      </div>
                      <div className="fm-planning-copy">
                        <span>{mission.brands?.name || 'Sans marque'} · {mission.mission_type}</span>
                        <h3>{mission.title}</h3>
                        <p>{mission.pharmacies?.name || 'Pharmacie'} · {mission.pharmacies?.city || 'Ville à compléter'}</p>
                      </div>
                      <div className="fm-planning-side">
                        <strong>{mission.field_animators?.full_name || 'Non affecté'}</strong>
                        <span className={`fm-status fm-status-${mission.status}`}>{STATUS[mission.status] || mission.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Planning vide" text="Les prochaines missions apparaîtront ici dès leur planification." />
              )}
            </section>
          )}

          {tab === 'performance' && (
            <section className="fm-performance-grid">
              <article className="fm-performance-card">
                <span>Sell-out déclaré</span>
                <strong>{money(stats.revenue)}</strong>
                <p>{stats.units} unités vendues sur l’ensemble des missions.</p>
              </article>
              <article className="fm-performance-card">
                <span>Coût des missions validées</span>
                <strong>{money(stats.fees)}</strong>
                <p>Montant total à facturer ou à payer aux animateurs.</p>
              </article>
              <article className="fm-performance-card">
                <span>Ratio sell-out / coût</span>
                <strong>{stats.fees ? `${(stats.revenue / stats.fees).toFixed(1)}×` : '—'}</strong>
                <p>Lecture simple du rendement économique du dispositif terrain.</p>
              </article>
            </section>
          )}
        </>
      )}

      {missionDrawerOpen && (
        <Drawer title="Créer une mission" onClose={() => setMissionDrawerOpen(false)}>
          <form className="fm-drawer-form" onSubmit={createMission}>
            <Field label="Titre de la mission"><input required value={missionForm.title} onChange={(event) => setMissionForm({ ...missionForm, title: event.target.value })} /></Field>
            <Field label="Type de mission"><select value={missionForm.mission_type} onChange={(event) => setMissionForm({ ...missionForm, mission_type: event.target.value })}><option value="animation">Animation</option><option value="formation">Formation</option><option value="merchandising">Merchandising</option><option value="audit">Audit rayon</option></select></Field>
            <Field label="Pharmacie"><select required value={missionForm.pharmacy_id} onChange={(event) => setMissionForm({ ...missionForm, pharmacy_id: event.target.value })}><option value="">Sélectionner une pharmacie</option>{state.pharmacies.map((pharmacy) => <option key={pharmacy.id} value={pharmacy.id}>{pharmacy.name} — {pharmacy.city}</option>)}</select></Field>
            <Field label="Marque"><select required value={missionForm.brand_id} onChange={(event) => setMissionForm({ ...missionForm, brand_id: event.target.value })}><option value="">Sélectionner une marque</option>{state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
            <Field label="Animateur"><select value={missionForm.animator_id} onChange={(event) => setMissionForm({ ...missionForm, animator_id: event.target.value })}><option value="">À affecter plus tard</option>{animators.filter((animator) => animator.status === 'active').map((animator) => <option key={animator.id} value={animator.id}>{animator.full_name}</option>)}</select></Field>
            <div className="fm-two-columns">
              <Field label="Début"><input type="datetime-local" required value={missionForm.starts_at} onChange={(event) => setMissionForm({ ...missionForm, starts_at: event.target.value })} /></Field>
              <Field label="Fin"><input type="datetime-local" value={missionForm.ends_at} onChange={(event) => setMissionForm({ ...missionForm, ends_at: event.target.value })} /></Field>
            </div>
            <Field label="Rémunération HT"><input min="0" step="0.01" type="number" value={missionForm.fee_ht} onChange={(event) => setMissionForm({ ...missionForm, fee_ht: event.target.value })} /></Field>
            <Field label="Objectif"><input placeholder="Ex. 25 ventes" value={missionForm.objective} onChange={(event) => setMissionForm({ ...missionForm, objective: event.target.value })} /></Field>
            <Field label="Brief de mission"><textarea rows="5" value={missionForm.brief} onChange={(event) => setMissionForm({ ...missionForm, brief: event.target.value })} /></Field>
            <div className="fm-drawer-footer"><button className="fm-button fm-button-secondary" onClick={() => setMissionDrawerOpen(false)} type="button">Annuler</button><button className="fm-button fm-button-primary" type="submit">Créer la mission</button></div>
          </form>
        </Drawer>
      )}

      {animatorDrawerOpen && (
        <Drawer title="Ajouter un animateur" onClose={() => setAnimatorDrawerOpen(false)}>
          <form className="fm-drawer-form" onSubmit={createAnimator}>
            <Field label="Nom complet"><input required value={animatorForm.full_name} onChange={(event) => setAnimatorForm({ ...animatorForm, full_name: event.target.value })} /></Field>
            <Field label="E-mail"><input type="email" value={animatorForm.email} onChange={(event) => setAnimatorForm({ ...animatorForm, email: event.target.value })} /></Field>
            <Field label="Téléphone"><input value={animatorForm.phone} onChange={(event) => setAnimatorForm({ ...animatorForm, phone: event.target.value })} /></Field>
            <Field label="Zones couvertes"><input placeholder="13, 84, Marseille" value={animatorForm.zones} onChange={(event) => setAnimatorForm({ ...animatorForm, zones: event.target.value })} /></Field>
            <Field label="Tarif jour HT"><input min="0" step="0.01" type="number" value={animatorForm.daily_rate_ht} onChange={(event) => setAnimatorForm({ ...animatorForm, daily_rate_ht: event.target.value })} /></Field>
            <div className="fm-drawer-footer"><button className="fm-button fm-button-secondary" onClick={() => setAnimatorDrawerOpen(false)} type="button">Annuler</button><button className="fm-button fm-button-primary" type="submit">Ajouter au réseau</button></div>
          </form>
        </Drawer>
      )}
    </div>
  );
}

function StatCard({ label, value, meta }) {
  return <article className="fm-stat-card"><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>;
}

function EmptyState({ title, text, action, onAction }) {
  return <div className="fm-empty"><div className="fm-empty-icon">◇</div><h3>{title}</h3><p>{text}</p>{action && <button className="fm-button fm-button-primary" onClick={onAction} type="button">{action}</button>}</div>;
}

function Drawer({ title, children, onClose }) {
  return <div className="fm-drawer-layer"><button aria-label="Fermer" className="fm-drawer-backdrop" onClick={onClose} type="button" /><aside className="fm-drawer"><header><div><span className="fm-eyebrow">Réseau terrain</span><h2>{title}</h2></div><button className="fm-close" onClick={onClose} type="button">×</button></header>{children}</aside></div>;
}

function Field({ label, children }) {
  return <label className="fm-field"><span>{label}</span>{children}</label>;
}

function MissionCard({ mission, onStatus, onReport }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    units_sold: mission.units_sold || '',
    revenue_ht: mission.revenue_ht || '',
    report: mission.report || '',
  });

  return (
    <article className="fm-mission-card">
      <header>
        <div>
          <span className="fm-mission-kicker">{mission.brands?.name || 'Sans marque'} · {mission.mission_type}</span>
          <h3>{mission.title}</h3>
          <p>{mission.pharmacies?.name || 'Pharmacie'} · {mission.pharmacies?.city || 'Ville à compléter'}</p>
        </div>
        <span className={`fm-status fm-status-${mission.status}`}>{STATUS[mission.status] || mission.status}</span>
      </header>
      <div className="fm-mission-meta">
        <span><small>Date</small><strong>{fmt(mission.starts_at)}</strong></span>
        <span><small>Animateur</small><strong>{mission.field_animators?.full_name || 'Non affecté'}</strong></span>
        <span><small>Rémunération</small><strong>{money(mission.fee_ht)}</strong></span>
        <span><small>Résultat</small><strong>{mission.units_sold || 0} ventes · {money(mission.revenue_ht)}</strong></span>
      </div>
      {mission.objective && <div className="fm-objective"><small>Objectif</small><strong>{mission.objective}</strong></div>}
      {editing ? (
        <div className="fm-report-form">
          <input type="number" placeholder="Unités vendues" value={form.units_sold} onChange={(event) => setForm({ ...form, units_sold: event.target.value })} />
          <input step="0.01" type="number" placeholder="CA réalisé HT" value={form.revenue_ht} onChange={(event) => setForm({ ...form, revenue_ht: event.target.value })} />
          <textarea placeholder="Compte rendu" value={form.report} onChange={(event) => setForm({ ...form, report: event.target.value })} />
          <button className="fm-button fm-button-primary" onClick={() => { onReport(mission.id, form.units_sold, form.revenue_ht, form.report); setEditing(false); }} type="button">Enregistrer le compte rendu</button>
        </div>
      ) : mission.report ? <p className="fm-report-text">{mission.report}</p> : null}
      <footer>
        {['assigned', 'accepted'].includes(mission.status) && <button className="fm-button fm-button-secondary" onClick={() => setEditing(true)} type="button">Saisir les résultats</button>}
        {mission.status === 'assigned' && <button className="fm-button fm-button-secondary" onClick={() => onStatus(mission.id, 'accepted')} type="button">Marquer acceptée</button>}
        {mission.status === 'completed' && <button className="fm-button fm-button-primary" onClick={() => onStatus(mission.id, 'validated')} type="button">Valider la mission</button>}
      </footer>
    </article>
  );
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AN';
}

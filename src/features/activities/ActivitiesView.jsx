import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatLabel, isOverdue } from '../../lib/formatters.js';

function defaultDueAt() {
  const value = new Date();
  value.setHours(value.getHours() + 2);
  value.setMinutes(0, 0, 0);
  return value.toISOString().slice(0, 16);
}

export default function ActivitiesView({ composerKey, onCompleteTask, onCreateTask, state }) {
  const [filter, setFilter] = useState('open');
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pharmacyId: '',
    brandId: '',
    title: '',
    reason: '',
    dueAt: defaultDueAt(),
    priority: 'medium',
  });

  useEffect(() => {
    if (composerKey) setComposerOpen(true);
  }, [composerKey]);

  const rows = useMemo(() => state.followUps.filter((task) => {
    if (filter === 'all') return true;
    if (filter === 'late') return task.status === 'todo' && isOverdue(task.due_at);
    if (filter === 'done') return task.status === 'done';
    return task.status === 'todo';
  }), [filter, state.followUps]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const result = await onCreateTask(form);
    setSaving(false);
    if (result.error) {
      setNotice(result.error);
      return;
    }
    setForm({
      pharmacyId: '',
      brandId: '',
      title: '',
      reason: '',
      dueAt: defaultDueAt(),
      priority: 'medium',
    });
    setComposerOpen(false);
    setNotice('Activité ajoutée au plan terrain.');
  }

  async function completeTask(taskId) {
    setSaving(true);
    const result = await onCompleteTask(taskId);
    setSaving(false);
    setNotice(result.error || 'Activité terminée.');
  }

  return (
    <div className="pb-page pb-activities-page">
      <section className="pb-page-heading">
        <div>
          <span className="pb-eyebrow">Exécution terrain</span>
          <h1>Activités</h1>
          <p>Planifie chaque relance, rendez-vous ou action nécessaire pour faire avancer un compte.</p>
        </div>
        <button className="pb-button pb-button-primary" onClick={() => setComposerOpen((open) => !open)} type="button">
          <Icon name="plus" size={17} />Nouvelle activité
        </button>
      </section>

      {notice && <div className="pb-inline-notice"><span>{notice}</span><button onClick={() => setNotice('')} type="button"><Icon name="close" size={15} /></button></div>}

      {composerOpen && (
        <form className="pb-activity-composer" onSubmit={submit}>
          <div className="pb-composer-head">
            <div><span className="pb-eyebrow">Planifier</span><h2>Nouvelle activité</h2></div>
            <button aria-label="Fermer" className="pb-icon-button" onClick={() => setComposerOpen(false)} type="button"><Icon name="close" size={17} /></button>
          </div>
          <div className="pb-composer-grid">
            <label className="pb-field pb-composer-title">
              <span>Action à réaliser</span>
              <input autoFocus onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Appeler pour le réassort de juillet" required value={form.title} />
            </label>
            <label className="pb-field">
              <span>Compte</span>
              <select onChange={(event) => setForm({ ...form, pharmacyId: event.target.value })} value={form.pharmacyId}>
                <option value="">Sans compte</option>
                {state.pharmacies.map((pharmacy) => <option key={pharmacy.id} value={pharmacy.id}>{pharmacy.name}</option>)}
              </select>
            </label>
            <label className="pb-field">
              <span>Marque</span>
              <select onChange={(event) => setForm({ ...form, brandId: event.target.value })} value={form.brandId}>
                <option value="">Sans marque</option>
                {state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label className="pb-field">
              <span>Échéance</span>
              <input onChange={(event) => setForm({ ...form, dueAt: event.target.value })} type="datetime-local" value={form.dueAt} />
            </label>
            <label className="pb-field">
              <span>Priorité</span>
              <select onChange={(event) => setForm({ ...form, priority: event.target.value })} value={form.priority}>
                <option value="high">Haute</option>
                <option value="medium">Normale</option>
                <option value="low">Basse</option>
              </select>
            </label>
          </div>
          <label className="pb-field">
            <span>Contexte</span>
            <textarea onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ajoute une information utile pour ton prochain passage…" rows="2" value={form.reason} />
          </label>
          <div className="pb-composer-actions">
            <button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(false)} type="button">Annuler</button>
            <button className="pb-button pb-button-primary" disabled={saving} type="submit">{saving ? 'Création…' : 'Ajouter au plan'}</button>
          </div>
        </form>
      )}

      <section className="pb-card pb-activity-list-card">
        <div className="pb-card-head pb-activity-list-head">
          <div>
            <span className="pb-eyebrow">Plan d’action</span>
            <h2>{filter === 'late' ? 'Activités en retard' : filter === 'done' ? 'Activités terminées' : 'Activités à exécuter'}</h2>
          </div>
          <div className="pb-segmented-control">
            {[['open', 'À faire'], ['late', 'En retard'], ['done', 'Terminées'], ['all', 'Toutes']].map(([key, label]) => (
              <button className={filter === key ? 'is-active' : ''} key={key} onClick={() => setFilter(key)} type="button">{label}</button>
            ))}
          </div>
        </div>
        <div className="pb-activity-rows">
          {rows.map((task) => (
            <article className={task.status === 'done' ? 'pb-activity-row is-done' : 'pb-activity-row'} key={task.id}>
              {task.status === 'todo' ? (
                <button aria-label={'Terminer : ' + task.title} className="pb-task-check" disabled={saving} onClick={() => completeTask(task.id)} type="button"><Icon name="check" size={14} /></button>
              ) : <span className="pb-done-check"><Icon name="check" size={14} /></span>}
              <div className="pb-activity-copy">
                <strong>{task.title}</strong>
                {task.reason && <p>{task.reason}</p>}
                <div><span><Icon name="building" size={13} />{task.pharmacies?.name || 'Compte à préciser'}</span><span><Icon name="sparkles" size={13} />{task.brands?.name || 'Sans marque'}</span></div>
              </div>
              <span className={'pb-status pb-priority-' + (task.priority || 'medium')}>{formatLabel(task.priority)}</span>
              <span className={isOverdue(task.due_at) && task.status === 'todo' ? 'pb-activity-date is-overdue' : 'pb-activity-date'}><Icon name="calendar" size={14} />{formatDate(task.due_at)}</span>
            </article>
          ))}
          {!rows.length && <div className="pb-empty-state"><Icon name="check" size={24} /><strong>Rien à afficher dans cette vue.</strong><span>Planifie une activité utile ou change de filtre.</span></div>}
        </div>
      </section>
    </div>
  );
}

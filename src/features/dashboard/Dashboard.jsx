import React, { useMemo } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatLabel, formatMoney, isOverdue, isToday } from '../../lib/formatters.js';

function TaskRow({ onComplete, task }) {
  const overdue = isOverdue(task.due_at);

  return (
    <div className="pb-task-row">
      <button aria-label={'Terminer : ' + task.title} className="pb-task-check" onClick={() => onComplete(task.id)} type="button">
        <Icon name="check" size={14} />
      </button>
      <div className="pb-task-copy">
        <strong>{task.title}</strong>
        <span>{task.pharmacies?.name || 'Compte à préciser'} · {task.brands?.name || 'Sans marque'}</span>
      </div>
      <span className={overdue ? 'pb-date pb-date-overdue' : 'pb-date'}>
        <Icon name="calendar" size={14} />
        {formatDate(task.due_at)}
      </span>
    </div>
  );
}

export default function Dashboard({ onCompleteTask, onNavigate, onOpenAccount, state }) {
  const summary = useMemo(() => {
    const openTasks = state.followUps.filter((task) => task.status === 'todo');
    const overdueTasks = openTasks.filter((task) => isOverdue(task.due_at));
    const todayTasks = openTasks.filter((task) => isToday(task.due_at));
    const revenue = state.orders.reduce((total, order) => total + Number(order.total_after_discount_ht || 0), 0);
    const commissions = state.commissions
      .filter((commission) => ['approved', 'to_invoice', 'estimated'].includes(commission.status))
      .reduce((total, commission) => total + Number(commission.amount_ht || 0), 0);

    return { commissions, openTasks, overdueTasks, revenue, todayTasks };
  }, [state]);

  const priorityTasks = [...summary.openTasks].sort((left, right) => {
    const leftOverdue = isOverdue(left.due_at) ? 0 : 1;
    const rightOverdue = isOverdue(right.due_at) ? 0 : 1;
    return leftOverdue - rightOverdue || new Date(left.due_at || 8640000000000000) - new Date(right.due_at || 8640000000000000);
  }).slice(0, 6);

  const opportunities = state.relations
    .filter((relation) => !['active', 'inactive', 'lost'].includes(relation.status))
    .map((relation) => ({
      ...relation,
      pharmacy: state.pharmacies.find((pharmacy) => pharmacy.id === relation.pharmacy_id),
      brand: state.brands.find((brand) => brand.id === relation.brand_id),
    }))
    .sort((left, right) => Number(isOverdue(right.next_action_at)) - Number(isOverdue(left.next_action_at)))
    .slice(0, 5);

  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="pb-page pb-dashboard">
      <section className="pb-hero">
        <div>
          <span className="pb-eyebrow">{today}</span>
          <h1>Ta journée commerciale, claire et actionnable.</h1>
          <p>Concentre-toi sur les comptes qui font avancer ton portefeuille aujourd’hui.</p>
        </div>
        <button className="pb-button pb-button-primary" onClick={() => onNavigate('activities')} type="button">
          <Icon name="plus" size={17} />
          Planifier une activité
        </button>
      </section>

      <section className="pb-metric-grid">
        <article className="pb-metric-card">
          <span className="pb-metric-icon pb-tint-amber"><Icon name="check" size={18} /></span>
          <span className="pb-metric-label">À traiter</span>
          <strong>{summary.openTasks.length}</strong>
          <small>{summary.todayTasks.length} prévues aujourd’hui</small>
        </article>
        <article className="pb-metric-card">
          <span className="pb-metric-icon pb-tint-red"><Icon name="calendar" size={18} /></span>
          <span className="pb-metric-label">En retard</span>
          <strong>{summary.overdueTasks.length}</strong>
          <small>à reprendre en priorité</small>
        </article>
        <article className="pb-metric-card">
          <span className="pb-metric-icon pb-tint-blue"><Icon name="bag" size={18} /></span>
          <span className="pb-metric-label">CA suivi</span>
          <strong>{formatMoney(summary.revenue)}</strong>
          <small>{state.orders.length} commandes enregistrées</small>
        </article>
        <article className="pb-metric-card">
          <span className="pb-metric-icon pb-tint-green"><Icon name="chart" size={18} /></span>
          <span className="pb-metric-label">Commissions attendues</span>
          <strong>{formatMoney(summary.commissions)}</strong>
          <small>estimées ou à facturer</small>
        </article>
      </section>

      <section className="pb-dashboard-grid">
        <article className="pb-card pb-priorities-card">
          <div className="pb-card-head">
            <div>
              <span className="pb-eyebrow">Focus terrain</span>
              <h2>Les prochaines actions</h2>
            </div>
            <button className="pb-text-button" onClick={() => onNavigate('activities')} type="button">Voir tout <Icon name="arrow" size={15} /></button>
          </div>
          {priorityTasks.length ? (
            <div className="pb-task-list">
              {priorityTasks.map((task) => <TaskRow key={task.id} onComplete={onCompleteTask} task={task} />)}
            </div>
          ) : (
            <div className="pb-empty-inline">
              <Icon name="check" size={20} />
              <span>Le terrain est à jour. Planifie la prochaine relance utile.</span>
            </div>
          )}
        </article>

        <article className="pb-card pb-pipeline-glance">
          <div className="pb-card-head">
            <div>
              <span className="pb-eyebrow">Portefeuille</span>
              <h2>Pipeline commercial</h2>
            </div>
            <button className="pb-icon-button" onClick={() => onNavigate('pipeline')} type="button" aria-label="Ouvrir le pipeline"><Icon name="arrow" size={17} /></button>
          </div>
          <div className="pb-stage-summary">
            {[
              ['prospect', 'Prospects', 'pb-stage-prospect'],
              ['contacted', 'Contactées', 'pb-stage-contacted'],
              ['interested', 'Intéressées', 'pb-stage-interested'],
              ['active', 'Clientes', 'pb-stage-active'],
            ].map(([status, label, className]) => (
              <button className="pb-stage-line" key={status} onClick={() => onNavigate('pipeline')} type="button">
                <span className={'pb-stage-dot ' + className} />
                <span>{label}</span>
                <strong>{state.relations.filter((relation) => relation.status === status).length}</strong>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="pb-card pb-opportunities-card">
        <div className="pb-card-head">
          <div>
            <span className="pb-eyebrow">À développer</span>
            <h2>Opportunités à faire avancer</h2>
          </div>
          <button className="pb-text-button" onClick={() => onNavigate('accounts')} type="button">Ouvrir les comptes <Icon name="arrow" size={15} /></button>
        </div>
        {opportunities.length ? (
          <div className="pb-opportunity-list">
            {opportunities.map((relation) => (
              <button className="pb-opportunity-row" key={relation.id} onClick={() => onOpenAccount(relation.pharmacy_id)} type="button">
                <span className="pb-account-monogram">{relation.pharmacy?.name?.slice(0, 1) || 'P'}</span>
                <span className="pb-opportunity-main">
                  <strong>{relation.pharmacy?.name || 'Pharmacie'}</strong>
                  <small>{relation.brand?.name || 'Marque à préciser'} · {relation.pharmacy?.city || 'Ville à préciser'}</small>
                </span>
                <span className={'pb-status pb-status-' + relation.status}>{formatLabel(relation.status)}</span>
                <span className={isOverdue(relation.next_action_at) ? 'pb-next-action is-overdue' : 'pb-next-action'}>
                  {relation.next_action_at ? 'Action ' + formatDate(relation.next_action_at) : 'Action à planifier'}
                </span>
                <Icon name="chevron" size={16} />
              </button>
            ))}
          </div>
        ) : <div className="pb-empty-inline"><Icon name="board" size={20} /><span>Aucune opportunité non qualifiée à afficher.</span></div>}
      </section>
    </div>
  );
}

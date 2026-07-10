import React, { useMemo, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatLabel, isOverdue } from '../../lib/formatters.js';

const stages = [
  ['prospect', 'Prospects', 'À qualifier'],
  ['contacted', 'Contactées', 'Premier échange engagé'],
  ['interested', 'Intéressées', 'Opportunité active'],
  ['active', 'Clientes', 'Relation implantée'],
];

export default function PipelineView({ onOpenAccount, state }) {
  const [brandFilter, setBrandFilter] = useState('all');

  const relations = useMemo(() => state.relations
    .filter((relation) => brandFilter === 'all' || relation.brand_id === brandFilter)
    .map((relation) => ({
      ...relation,
      brand: state.brands.find((brand) => brand.id === relation.brand_id),
      pharmacy: state.pharmacies.find((pharmacy) => pharmacy.id === relation.pharmacy_id),
    })), [brandFilter, state]);

  return (
    <div className="pb-page pb-pipeline-page">
      <section className="pb-page-heading">
        <div>
          <span className="pb-eyebrow">Vue opportunités</span>
          <h1>Pipeline commercial</h1>
          <p>Visualise les relations marque par marque et garde les prochaines actions au centre.</p>
        </div>
        <label className="pb-select-wrap pb-pipeline-brand-filter">
          <span>Filtrer par marque</span>
          <select onChange={(event) => setBrandFilter(event.target.value)} value={brandFilter}>
            <option value="all">Toutes les marques</option>
            {state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
      </section>

      <div className="pb-pipeline-board">
        {stages.map(([status, title, description]) => {
          const cards = relations.filter((relation) => relation.status === status);
          return (
            <section className="pb-pipeline-column" key={status}>
              <header>
                <div>
                  <span className={'pb-stage-dot pb-stage-' + status} />
                  <h2>{title}</h2>
                </div>
                <strong>{cards.length}</strong>
                <p>{description}</p>
              </header>
              <div className="pb-pipeline-cards">
                {cards.map((relation) => (
                  <button className="pb-pipeline-card" key={relation.id} onClick={() => onOpenAccount(relation.pharmacy_id)} type="button">
                    <div className="pb-pipeline-card-head">
                      <span className="pb-account-monogram">{relation.pharmacy?.name?.slice(0, 1) || 'P'}</span>
                      <span className="pb-card-more"><Icon name="more" size={17} /></span>
                    </div>
                    <strong>{relation.pharmacy?.name || 'Pharmacie'}</strong>
                    <small>{relation.pharmacy?.city || 'Ville à préciser'} · {relation.brand?.name || 'Marque'}</small>
                    <div className="pb-pipeline-card-foot">
                      <span className={'pb-potential pb-potential-' + (relation.potential || 'medium')}>{relation.potential === 'priority' ? 'Prioritaire' : formatLabel(relation.potential || 'medium')}</span>
                      <span className={isOverdue(relation.next_action_at) ? 'pb-next-action is-overdue' : 'pb-next-action'}>
                        <Icon name="calendar" size={13} />
                        {relation.next_action_at ? formatDate(relation.next_action_at) : 'À planifier'}
                      </span>
                    </div>
                  </button>
                ))}
                {!cards.length && <div className="pb-pipeline-empty">Aucune relation dans cette étape.</div>}
              </div>
            </section>
          );
        })}
      </div>
      {relations.some((relation) => ['inactive', 'lost'].includes(relation.status)) && (
        <div className="pb-pipeline-footer">
          <Icon name="filter" size={16} />
          Les relations inactives ou perdues sont conservées dans les fiches comptes, sans encombrer ce pipeline.
        </div>
      )}
    </div>
  );
}

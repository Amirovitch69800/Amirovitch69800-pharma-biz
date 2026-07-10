import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatLabel, formatMoney, initials, isOverdue } from '../../lib/formatters.js';

const relationshipStatuses = ['prospect', 'contacted', 'interested', 'active', 'inactive', 'lost'];
const potentialOptions = [
  ['priority', 'Prioritaire'],
  ['high', 'Fort potentiel'],
  ['medium', 'Potentiel moyen'],
  ['low', 'Potentiel faible'],
];

function relationFor(relations, pharmacyId, brandId) {
  return relations.find((relation) => relation.pharmacy_id === pharmacyId && relation.brand_id === brandId);
}

export default function AccountsView({
  onAddRelation,
  onCreateTask,
  onSelectAccount,
  onUpdateRelation,
  selectedAccountId,
  state,
}) {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = state.pharmacies.find((pharmacy) => pharmacy.id === selectedAccountId) || null;
  const selectedRelations = selected
    ? state.relations.filter((relation) => relation.pharmacy_id === selected.id)
    : [];

  useEffect(() => {
    if (!selectedRelations.length) {
      setSelectedBrandId('');
      return;
    }
    if (!selectedRelations.some((relation) => relation.brand_id === selectedBrandId)) {
      setSelectedBrandId(selectedRelations[0].brand_id);
    }
  }, [selectedAccountId, selectedBrandId, selectedRelations]);

  const activeRelation = selectedRelations.find((relation) => relation.brand_id === selectedBrandId) || null;
  const activeBrand = state.brands.find((brand) => brand.id === activeRelation?.brand_id) || null;
  const openTasks = state.followUps.filter((task) => (
    task.status === 'todo'
      && task.pharmacy_id === selected?.id
      && (!activeRelation || task.brand_id === activeRelation.brand_id)
  ));

  const filteredPharmacies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.pharmacies.filter((pharmacy) => {
      const relations = state.relations.filter((relation) => relation.pharmacy_id === pharmacy.id);
      const searchable = [
        pharmacy.name,
        pharmacy.city,
        pharmacy.postal_code,
        pharmacy.groupement,
        pharmacy.contact_name,
        pharmacy.titular_name,
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesBrand = brandFilter === 'all' || relations.some((relation) => relation.brand_id === brandFilter);
      const matchesStatus = statusFilter === 'all' || relations.some((relation) => relation.status === statusFilter);
      return matchesSearch && matchesBrand && matchesStatus;
    }).sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  }, [brandFilter, search, state.pharmacies, state.relations, statusFilter]);

  async function updateRelation(relationId, patch) {
    setSaving(true);
    const result = await onUpdateRelation(relationId, patch);
    setSaving(false);
    setNotice(result.error || 'Relation mise à jour.');
  }

  async function addBrand(brandId) {
    if (!selected || !brandId) return;
    const existing = relationFor(selectedRelations, selected.id, brandId);
    if (existing) {
      setSelectedBrandId(brandId);
      return;
    }
    setSaving(true);
    const result = await onAddRelation(selected.id, brandId);
    setSaving(false);
    if (result.error) {
      setNotice(result.error);
      return;
    }
    setSelectedBrandId(brandId);
    setNotice('Marque ajoutée au compte.');
  }

  async function createFollowUp() {
    if (!selected || !activeRelation) return;
    setSaving(true);
    const dueAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const taskResult = await onCreateTask({
      pharmacyId: selected.id,
      brandId: activeRelation.brand_id,
      title: 'Relancer ' + selected.name + ' pour ' + (activeBrand?.name || 'la marque'),
      reason: 'Relance créée depuis la fiche compte.',
      dueAt,
      priority: activeRelation.potential === 'priority' || activeRelation.potential === 'high' ? 'high' : 'medium',
    });
    if (!taskResult.error) await onUpdateRelation(activeRelation.id, { next_action_at: dueAt });
    setSaving(false);
    setNotice(taskResult.error || 'Relance planifiée dans trois jours.');
  }

  function selectAccount(pharmacyId) {
    setNotice('');
    onSelectAccount(pharmacyId);
  }

  const clientCount = state.relations.filter((relation) => relation.status === 'active').length;
  const priorityCount = state.relations.filter((relation) => ['priority', 'high'].includes(relation.potential)).length;

  return (
    <div className="pb-page pb-accounts-page">
      <section className="pb-page-heading">
        <div>
          <span className="pb-eyebrow">Portefeuille commercial</span>
          <h1>Comptes pharmacies</h1>
          <p>Une fiche unique par officine, enrichie pour chaque marque et chaque opportunité.</p>
        </div>
        <div className="pb-heading-stats">
          <span><strong>{state.pharmacies.length}</strong> comptes</span>
          <span><strong>{clientCount}</strong> clientes</span>
          <span><strong>{priorityCount}</strong> prioritaires</span>
        </div>
      </section>

      {notice && <div className="pb-inline-notice"><span>{notice}</span><button onClick={() => setNotice('')} type="button"><Icon name="close" size={15} /></button></div>}

      <section className="pb-filter-bar">
        <label className="pb-input-wrap pb-filter-search">
          <Icon name="search" size={17} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Nom, ville, groupement ou titulaire…" value={search} />
        </label>
        <label className="pb-select-wrap">
          <span>Marque</span>
          <select onChange={(event) => setBrandFilter(event.target.value)} value={brandFilter}>
            <option value="all">Toutes les marques</option>
            {state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <label className="pb-select-wrap">
          <span>Statut</span>
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="all">Tous les statuts</option>
            {relationshipStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
          </select>
        </label>
        <span className="pb-result-count">{filteredPharmacies.length} résultat{filteredPharmacies.length > 1 ? 's' : ''}</span>
      </section>

      <section className={selected ? 'pb-accounts-layout has-detail' : 'pb-accounts-layout'}>
        <div className="pb-table-card pb-accounts-table-card">
          <div className="pb-table-scroll">
            <table className="pb-table">
              <thead>
                <tr>
                  <th>Compte</th>
                  <th>Ville</th>
                  <th>Marques & statut</th>
                  <th>Prochaine action</th>
                  <th>Potentiel</th>
                  <th aria-label="Ouvrir" />
                </tr>
              </thead>
              <tbody>
                {filteredPharmacies.map((pharmacy) => {
                  const relations = state.relations.filter((relation) => relation.pharmacy_id === pharmacy.id);
                  const nextAction = relations.map((relation) => relation.next_action_at).filter(Boolean).sort()[0];
                  const hasPriority = relations.some((relation) => ['priority', 'high'].includes(relation.potential));
                  return (
                    <tr className={selected?.id === pharmacy.id ? 'is-selected' : ''} key={pharmacy.id}>
                      <td>
                        <button className="pb-account-cell" onClick={() => selectAccount(pharmacy.id)} type="button">
                          <span className="pb-account-monogram">{initials(pharmacy.name)}</span>
                          <span><strong>{pharmacy.name}</strong><small>{pharmacy.groupement || 'Indépendante'}</small></span>
                        </button>
                      </td>
                      <td>{[pharmacy.postal_code, pharmacy.city].filter(Boolean).join(' ') || '—'}</td>
                      <td>
                        <div className="pb-table-statuses">
                          {relations.slice(0, 3).map((relation) => {
                            const brand = state.brands.find((item) => item.id === relation.brand_id);
                            return <span className={'pb-status pb-status-' + relation.status} key={relation.id}>{brand?.name || 'Marque'} · {formatLabel(relation.status)}</span>;
                          })}
                          {relations.length > 3 && <span className="pb-more-status">+{relations.length - 3}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={isOverdue(nextAction) ? 'pb-next-action is-overdue' : 'pb-next-action'}>{nextAction ? formatDate(nextAction) : 'À planifier'}</span>
                      </td>
                      <td>{hasPriority ? <span className="pb-priority-tag">Prioritaire</span> : '—'}</td>
                      <td><button aria-label={'Ouvrir ' + pharmacy.name} className="pb-row-action" onClick={() => selectAccount(pharmacy.id)} type="button"><Icon name="chevron" size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredPharmacies.length && <div className="pb-empty-state"><Icon name="search" size={24} /><strong>Aucun compte ne correspond aux filtres.</strong><span>Modifie ta recherche ou réinitialise les filtres.</span></div>}
          </div>
        </div>

        {selected && (
          <aside className="pb-account-detail">
            <div className="pb-detail-header">
              <div>
                <span className="pb-account-monogram pb-account-monogram-large">{initials(selected.name)}</span>
                <div>
                  <span className="pb-eyebrow">Compte pharmacie</span>
                  <h2>{selected.name}</h2>
                </div>
              </div>
              <button aria-label="Fermer la fiche compte" className="pb-icon-button" onClick={() => onSelectAccount(null)} type="button"><Icon name="close" size={17} /></button>
            </div>

            <div className="pb-detail-address">
              <span>{[selected.address_line1, selected.postal_code, selected.city].filter(Boolean).join(' · ') || 'Adresse à compléter'}</span>
              <span>{selected.contact_name || selected.titular_name || 'Titulaire à compléter'} · {selected.phone || selected.email || 'Coordonnée à compléter'}</span>
            </div>

            <div className="pb-relation-tabs" role="tablist" aria-label="Relations marques">
              {selectedRelations.map((relation) => {
                const brand = state.brands.find((item) => item.id === relation.brand_id);
                return <button className={activeRelation?.id === relation.id ? 'is-active' : ''} key={relation.id} onClick={() => setSelectedBrandId(relation.brand_id)} role="tab" type="button">{brand?.name || 'Marque'}</button>;
              })}
              <label className="pb-add-brand">
                <Icon name="plus" size={15} />
                <select aria-label="Ajouter une marque au compte" disabled={saving} onChange={(event) => { addBrand(event.target.value); event.target.value = ''; }} value="">
                  <option value="">Ajouter</option>
                  {state.brands.filter((brand) => !relationFor(selectedRelations, selected.id, brand.id)).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
              </label>
            </div>

            {activeRelation ? (
              <div className="pb-relation-detail">
                <div className="pb-relation-heading">
                  <div>
                    <span className="pb-eyebrow">Relation commerciale</span>
                    <h3>{activeBrand?.name || 'Marque'}</h3>
                  </div>
                  <button className="pb-button pb-button-secondary" disabled={saving} onClick={createFollowUp} type="button"><Icon name="calendar" size={15} />Relancer</button>
                </div>

                <div className="pb-field-grid">
                  <label className="pb-field">
                    <span>Statut</span>
                    <select disabled={saving} onChange={(event) => updateRelation(activeRelation.id, { status: event.target.value })} value={activeRelation.status || 'prospect'}>
                      {relationshipStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                    </select>
                  </label>
                  <label className="pb-field">
                    <span>Potentiel</span>
                    <select disabled={saving} onChange={(event) => updateRelation(activeRelation.id, { potential: event.target.value })} value={activeRelation.potential || 'medium'}>
                      {potentialOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>

                <label className="pb-field">
                  <span>Segment</span>
                  <input defaultValue={activeRelation.segment || ''} disabled={saving} onBlur={(event) => updateRelation(activeRelation.id, { segment: event.target.value || null })} placeholder="Ex. A développer, ambassadeur…" />
                </label>

                <div className="pb-account-metrics">
                  <div><span>CA annuel</span><strong>{formatMoney(activeRelation.annual_revenue_ht)}</strong></div>
                  <div><span>Dernière commande</span><strong>{formatDate(activeRelation.last_order_at)}</strong></div>
                  <div><span>Prochaine action</span><strong className={isOverdue(activeRelation.next_action_at) ? 'is-overdue' : ''}>{formatDate(activeRelation.next_action_at)}</strong></div>
                </div>

                <label className="pb-field">
                  <span>Note de compte</span>
                  <textarea defaultValue={activeRelation.notes || ''} disabled={saving} onBlur={(event) => updateRelation(activeRelation.id, { notes: event.target.value || null })} placeholder={'Contexte et prochain levier pour ' + (activeBrand?.name || 'cette marque') + '…'} rows="4" />
                </label>

                <div className="pb-open-actions">
                  <div className="pb-section-mini-head"><span>Actions ouvertes</span><strong>{openTasks.length}</strong></div>
                  {openTasks.length ? openTasks.map((task) => (
                    <div className="pb-open-action" key={task.id}>
                      <span className={isOverdue(task.due_at) ? 'pb-action-dot is-overdue' : 'pb-action-dot'} />
                      <span><strong>{task.title}</strong><small>{formatDate(task.due_at)}</small></span>
                    </div>
                  )) : <p>Aucune action ouverte pour cette relation.</p>}
                </div>
              </div>
            ) : (
              <div className="pb-empty-state"><Icon name="sparkles" size={24} /><strong>Aucune marque rattachée.</strong><span>Ajoute une marque pour qualifier cette officine.</span></div>
            )}
          </aside>
        )}
      </section>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatDateTime, formatLabel, formatMoney } from '../../lib/formatters.js';

function EmptyState({ icon, message, title }) {
  return <div className="pb-empty-state"><Icon name={icon} size={24} /><strong>{title}</strong><span>{message}</span></div>;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function emptyOrderLine() {
  return {
    productId: '',
    quantity: '1',
    unitPriceHt: '',
    productQuery: '',
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function scoreProduct(product, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return 1;
  const name = normalizeSearch(product.name);
  const reference = normalizeSearch(product.reference);
  const category = normalizeSearch(product.category);
  const haystack = `${name} ${reference} ${category}`;
  if (name === normalizedQuery || reference === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery) || reference.startsWith(normalizedQuery)) return 80;
  if (haystack.includes(normalizedQuery)) return 50;
  return 0;
}

function ProductCombobox({ disabled, onSelect, products, selectedProduct, value }) {
  const [open, setOpen] = useState(false);
  const query = value ?? selectedProduct?.name ?? '';
  const matches = useMemo(() => products
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score || first.product.name.localeCompare(second.product.name))
    .slice(0, 12), [products, query]);

  function selectProduct(product) {
    onSelect(product);
    setOpen(false);
  }

  return (
    <div className="pb-product-combobox">
      <div className="pb-product-search">
        <Icon name="search" size={15} />
        <input
          disabled={disabled}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onChange={(event) => {
            onSelect(null, event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]?.product) {
              event.preventDefault();
              selectProduct(matches[0].product);
            }
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder={disabled ? 'Sélectionne une marque' : 'Rechercher nom, SKU, catégorie…'}
          value={query}
        />
      </div>
      {selectedProduct && (
        <div className="pb-product-selected">
          <span>{selectedProduct.category || 'Produit'}</span>
          <strong>{selectedProduct.reference || 'Sans SKU'}</strong>
          <em>{formatMoney(selectedProduct.unit_price_ht || 0)} HT</em>
        </div>
      )}
      {open && !disabled && (
        <div className="pb-product-menu">
          {matches.map(({ product }) => (
            <button key={product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(product)} type="button">
              <span className="pb-product-menu-main">
                <strong>{product.name}</strong>
                <small>{[product.reference, product.category].filter(Boolean).join(' · ') || 'Produit Naali'}</small>
              </span>
              <span className="pb-product-menu-price">{formatMoney(product.unit_price_ht || 0)}</span>
            </button>
          ))}
          {!matches.length && <div className="pb-product-empty">Aucun produit trouvé.</div>}
        </div>
      )}
    </div>
  );
}

export function OrdersView({ onCreateOrder, onGetCustomerContext, state }) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [customerContext, setCustomerContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [form, setForm] = useState({
    pharmacyId: '',
    brandId: '',
    orderType: 'reassort',
    status: 'draft',
    orderDate: todayInputValue(),
    totalHt: '',
    discountRate: '0',
    brandOrderReference: '',
    notes: '',
    items: [emptyOrderLine()],
  });
  const revenue = state.orders.reduce((total, order) => total + Number(order.total_after_discount_ht || 0), 0);
  const lastOrder = state.orders[0];
  const selectedPharmacy = state.pharmacies.find((pharmacy) => pharmacy.id === form.pharmacyId);
  const selectedBrand = state.brands.find((brand) => brand.id === form.brandId);
  const availableProducts = useMemo(() => state.products.filter((product) => product.brand_id === form.brandId), [form.brandId, state.products]);
  const linePreviews = useMemo(() => form.items.map((item) => {
    const product = state.products.find((candidate) => candidate.id === item.productId);
    const unitPriceHt = Math.max(0, Number(item.unitPriceHt || product?.unit_price_ht || 0));
    const quantity = Math.max(0, Number(item.quantity || 0));
    return {
      ...item,
      product,
      unitPriceHt,
      quantity,
      lineTotalHt: unitPriceHt * quantity,
    };
  }), [form.items, state.products]);
  const preview = useMemo(() => {
    const lineTotalHt = linePreviews.reduce((total, item) => total + item.lineTotalHt, 0);
    const totalHt = lineTotalHt > 0 ? lineTotalHt : Math.max(0, Number(form.totalHt || 0));
    const discountRate = Math.min(100, Math.max(0, Number(form.discountRate || 0)));
    const discountAmount = totalHt * discountRate / 100;
    const netHt = totalHt - discountAmount;
    return {
      totalHt,
      discountAmount,
      netHt,
      totalTtc: netHt * 1.2,
    };
  }, [form.discountRate, form.totalHt, linePreviews]);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomerContext() {
      if (!composerOpen || !form.pharmacyId || !form.brandId || !onGetCustomerContext) {
        setCustomerContext(null);
        return;
      }
      setContextLoading(true);
      const context = await onGetCustomerContext({ pharmacyId: form.pharmacyId, brandId: form.brandId });
      if (cancelled) return;
      setContextLoading(false);
      setCustomerContext(context);
      if (!context?.error && context?.lastDiscountRate !== null && context?.lastDiscountRate !== undefined) {
        setForm((currentForm) => {
          if (Number(currentForm.discountRate || 0) > 0) return currentForm;
          return { ...currentForm, discountRate: String(context.lastDiscountRate) };
        });
      }
    }
    loadCustomerContext();
    return () => { cancelled = true; };
  }, [composerOpen, form.brandId, form.pharmacyId, onGetCustomerContext]);

  function updateLine(index, patch) {
    setForm((currentForm) => ({
      ...currentForm,
      items: currentForm.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextItem = { ...item, ...patch };
        if (patch.productId) {
          const product = state.products.find((candidate) => candidate.id === patch.productId);
          nextItem.unitPriceHt = product?.unit_price_ht ? String(product.unit_price_ht) : '';
          nextItem.productQuery = product?.name || '';
        }
        return nextItem;
      }),
    }));
  }

  function addLine() {
    setForm((currentForm) => ({ ...currentForm, items: [...currentForm.items, emptyOrderLine()] }));
  }

  function removeLine(index) {
    setForm((currentForm) => ({
      ...currentForm,
      items: currentForm.items.length === 1 ? [emptyOrderLine()] : currentForm.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    const result = await onCreateOrder(form);
    setSaving(false);
    if (result.error) {
      setNotice(result.error);
      return;
    }
    setForm({
      pharmacyId: '',
      brandId: '',
      orderType: 'reassort',
      status: 'draft',
      orderDate: todayInputValue(),
      totalHt: '',
      discountRate: '0',
      brandOrderReference: '',
      notes: '',
      items: [emptyOrderLine()],
    });
    setCustomerContext(null);
    setComposerOpen(false);
    if (result.sync?.externalObjectId) {
      setNotice('Commande créée dans PharmaBiz et deal HubSpot Naali créé.');
    } else if (result.sync?.skipped) {
      setNotice('Commande créée dans PharmaBiz. Aucun connecteur externe actif pour cette marque.');
    } else if (result.syncWarning) {
      setNotice(`Commande créée dans PharmaBiz. Sync externe à vérifier : ${result.syncWarning}`);
    } else {
      setNotice('Commande créée dans PharmaBiz.');
    }
  }

  return (
    <div className="pb-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Suivi commercial</span><h1>Commandes</h1><p>Retrouve les commandes suivies, leurs statuts et leur contribution au portefeuille.</p></div>
        <button className="pb-button pb-button-primary" onClick={() => setComposerOpen((open) => !open)} type="button">
          <Icon name="plus" size={17} />Nouvelle commande
        </button>
      </section>

      {notice && <div className="pb-inline-notice"><span>{notice}</span><button onClick={() => setNotice('')} type="button"><Icon name="close" size={15} /></button></div>}

      {composerOpen && (
        <form className="pb-activity-composer" onSubmit={submit}>
          <div className="pb-composer-head">
            <div><span className="pb-eyebrow">Saisie rapide</span><h2>Nouvelle commande</h2></div>
            <button aria-label="Fermer" className="pb-icon-button" onClick={() => setComposerOpen(false)} type="button"><Icon name="close" size={17} /></button>
          </div>
          <div className="pb-order-composer-grid">
            <label className="pb-field">
              <span>Pharmacie</span>
              <select autoFocus onChange={(event) => setForm({ ...form, pharmacyId: event.target.value })} required value={form.pharmacyId}>
                <option value="">Sélectionner</option>
                {state.pharmacies.map((pharmacy) => <option key={pharmacy.id} value={pharmacy.id}>{pharmacy.name}</option>)}
              </select>
            </label>
            <label className="pb-field">
              <span>Marque</span>
              <select onChange={(event) => setForm({ ...form, brandId: event.target.value })} required value={form.brandId}>
                <option value="">Sélectionner</option>
                {state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label className="pb-field">
              <span>Type</span>
              <select onChange={(event) => setForm({ ...form, orderType: event.target.value })} value={form.orderType}>
                <option value="reassort">Réassort</option>
                <option value="implantation">Implantation</option>
                <option value="sample">Échantillon</option>
                <option value="other">Autre</option>
              </select>
            </label>
            <label className="pb-field">
              <span>Statut</span>
              <select onChange={(event) => setForm({ ...form, status: event.target.value })} value={form.status}>
                <option value="draft">Brouillon</option>
                <option value="sent_to_brand">Envoyée marque</option>
                <option value="confirmed">Confirmée</option>
                <option value="delivered">Livrée</option>
              </select>
            </label>
            <label className="pb-field">
              <span>Date</span>
              <input onChange={(event) => setForm({ ...form, orderDate: event.target.value })} type="date" value={form.orderDate} />
            </label>
            <label className="pb-field">
              <span>Remise %</span>
              <input max="100" min="0" onChange={(event) => setForm({ ...form, discountRate: event.target.value })} step="0.01" type="number" value={form.discountRate} />
            </label>
            <label className="pb-field">
              <span>Réf. marque</span>
              <input onChange={(event) => setForm({ ...form, brandOrderReference: event.target.value })} placeholder="Optionnel" value={form.brandOrderReference} />
            </label>
          </div>
          <div className="pb-order-context">
            <Icon name="sparkles" size={17} />
            {contextLoading ? (
              <span>Recherche de l’historique client HubSpot…</span>
            ) : customerContext?.error ? (
              <span>Historique HubSpot indisponible : {customerContext.error}</span>
            ) : customerContext?.lastDiscountRate !== null && customerContext?.lastDiscountRate !== undefined ? (
              <span>Dernière remise appliquée : <strong>{customerContext.lastDiscountLabel || `${customerContext.lastDiscountRate}%`}</strong>{customerContext.lastDeal?.name ? ` · ${customerContext.lastDeal.name}` : ''}</span>
            ) : form.pharmacyId && form.brandId ? (
              <span>Aucune remise historique trouvée pour ce client.</span>
            ) : (
              <span>Sélectionne une pharmacie et Naali pour récupérer l’historique de remise.</span>
            )}
          </div>
          <div className="pb-order-lines">
            <div className="pb-order-lines-head">
              <div><span className="pb-eyebrow">Catalogue</span><h3>Produits commandés</h3></div>
              <button className="pb-button pb-button-secondary" onClick={addLine} type="button"><Icon name="plus" size={15} />Ajouter une ligne</button>
            </div>
            {form.items.map((item, index) => {
              const selectedProduct = state.products.find((product) => product.id === item.productId);
              const linePreview = linePreviews[index];
              return (
                <div className="pb-order-line" key={`${index}-${item.productId || 'empty'}`}>
                  <label className="pb-field pb-product-field">
                    <span>Produit</span>
                    <ProductCombobox
                      disabled={!availableProducts.length}
                      onSelect={(product, query) => {
                        if (product) updateLine(index, { productId: product.id, productQuery: product.name });
                        else updateLine(index, { productId: '', productQuery: query });
                      }}
                      products={availableProducts}
                      selectedProduct={selectedProduct}
                      value={item.productQuery}
                    />
                  </label>
                  <label className="pb-field">
                    <span>Qté</span>
                    <input min="0" onChange={(event) => updateLine(index, { quantity: event.target.value })} required step="1" type="number" value={item.quantity} />
                  </label>
                  <label className="pb-field">
                    <span>Prix HT</span>
                    <input min="0" onChange={(event) => updateLine(index, { unitPriceHt: event.target.value })} required step="0.01" type="number" value={item.unitPriceHt} />
                  </label>
                  <div className="pb-order-line-total">
                    <span>{selectedProduct?.category || 'Ligne'}</span>
                    <strong>{formatMoney(linePreview?.lineTotalHt || 0)}</strong>
                  </div>
                  <button aria-label="Retirer la ligne" className="pb-icon-button" onClick={() => removeLine(index)} type="button"><Icon name="close" size={15} /></button>
                </div>
              );
            })}
          </div>
          {!availableProducts.length && form.brandId && (
            <div className="pb-inline-notice">
              <span>Catalogue vide pour cette marque. Lance une synchronisation HubSpot pour charger les produits Naali.</span>
            </div>
          )}
          <label className="pb-field">
            <span>Notes</span>
            <textarea onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Conditions, livraison, détails utiles…" rows="2" value={form.notes} />
          </label>
          <div className="pb-order-preview">
            <span>{selectedPharmacy?.name || 'Pharmacie'} · {selectedBrand?.name || 'Marque'}</span>
            <strong>{formatMoney(preview.totalHt)} HT brut · -{formatMoney(preview.discountAmount)} · {formatMoney(preview.netHt)} HT net</strong>
          </div>
          <div className="pb-composer-actions">
            <button className="pb-button pb-button-secondary" onClick={() => setComposerOpen(false)} type="button">Annuler</button>
            <button className="pb-button pb-button-primary" disabled={saving} type="submit">{saving ? 'Création…' : 'Créer la commande'}</button>
          </div>
        </form>
      )}

      <section className="pb-inline-metrics">
        <div><span>CA suivi</span><strong>{formatMoney(revenue)}</strong></div>
        <div><span>Commandes</span><strong>{state.orders.length}</strong></div>
        <div><span>Dernière saisie</span><strong>{lastOrder ? formatDate(lastOrder.created_at || lastOrder.order_date) : '—'}</strong></div>
      </section>
      <section className="pb-table-card">
        <div className="pb-card-head"><div><span className="pb-eyebrow">Historique</span><h2>Toutes les commandes</h2></div><span className="pb-table-count">{state.orders.length} lignes</span></div>
        <div className="pb-table-scroll">
          <table className="pb-table">
            <thead><tr><th>N° de commande</th><th>Pharmacie</th><th>Marque</th><th>Type</th><th>Montant HT</th><th>Statut</th><th>Date</th></tr></thead>
            <tbody>{state.orders.map((order) => (
              <tr key={order.id || order.order_number}>
                <td><strong>{order.order_number || '—'}</strong></td>
                <td>{order.pharmacy_name || '—'}</td>
                <td>{order.brand_name || '—'}</td>
                <td>{formatLabel(order.order_type)}</td>
                <td><strong>{formatMoney(order.total_after_discount_ht)}</strong></td>
                <td><span className="pb-status pb-order-status">{formatLabel(order.status)}</span></td>
                <td>{formatDate(order.created_at || order.order_date)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!state.orders.length && <EmptyState icon="bag" message="Les commandes apparaîtront ici lorsqu’elles seront synchronisées." title="Aucune commande enregistrée." />}
        </div>
      </section>
    </div>
  );
}

export function CommissionsView({ state }) {
  const total = state.commissions.reduce((sum, commission) => sum + Number(commission.amount_ht || 0), 0);
  const paid = state.commissions.filter((commission) => commission.status === 'paid').reduce((sum, commission) => sum + Number(commission.amount_ht || 0), 0);

  return (
    <div className="pb-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Pilotage financier</span><h1>Commissions</h1><p>Une lecture nette des montants acquis, attendus et à facturer.</p></div>
      </section>
      <section className="pb-inline-metrics">
        <div><span>Total enregistré</span><strong>{formatMoney(total)}</strong></div>
        <div><span>Déjà payé</span><strong>{formatMoney(paid)}</strong></div>
        <div><span>À suivre</span><strong>{formatMoney(total - paid)}</strong></div>
        <div><span>Marques concernées</span><strong>{new Set(state.commissions.map((commission) => commission.brand_id)).size}</strong></div>
      </section>
      <section className="pb-table-card">
        <div className="pb-card-head"><div><span className="pb-eyebrow">Détail</span><h2>Commissions par commande</h2></div><span className="pb-table-count">{state.commissions.length} lignes</span></div>
        <div className="pb-table-scroll">
          <table className="pb-table">
            <thead><tr><th>Marque</th><th>Pharmacie</th><th>Commande</th><th>Montant HT</th><th>Statut</th></tr></thead>
            <tbody>{state.commissions.map((commission) => (
              <tr key={commission.id}>
                <td><strong>{commission.brands?.name || '—'}</strong></td>
                <td>{commission.orders?.pharmacies?.name || '—'}</td>
                <td>{commission.orders?.order_number || '—'}</td>
                <td><strong>{formatMoney(commission.amount_ht)}</strong></td>
                <td><span className={'pb-status pb-commission-' + commission.status}>{formatLabel(commission.status)}</span></td>
              </tr>
            ))}</tbody>
          </table>
          {!state.commissions.length && <EmptyState icon="chart" message="Les futures commissions calculées apparaîtront dans cette vue." title="Aucune commission enregistrée." />}
        </div>
      </section>
    </div>
  );
}

export function BrandsView({ state }) {
  return (
    <div className="pb-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Portefeuille multimarques</span><h1>Marques</h1><p>Lis la dynamique commerciale de chaque laboratoire sans perdre la vision globale.</p></div>
      </section>
      <section className="pb-brand-grid">
        {state.brands.map((brand) => {
          const relations = state.relations.filter((relation) => relation.brand_id === brand.id);
          const activeClients = relations.filter((relation) => relation.status === 'active').length;
          const opportunities = relations.filter((relation) => ['prospect', 'contacted', 'interested'].includes(relation.status)).length;
          const revenue = state.orders.filter((order) => order.brand_id === brand.id).reduce((sum, order) => sum + Number(order.total_after_discount_ht || 0), 0);
          return (
            <article className="pb-brand-card" key={brand.id}>
              <div className="pb-brand-card-top"><span className="pb-brand-symbol">{brand.name?.slice(0, 1) || 'M'}</span><button aria-label={'Plus d’options pour ' + brand.name} className="pb-icon-button" type="button"><Icon name="more" size={17} /></button></div>
              <h2>{brand.name}</h2>
              <p>{relations.length} comptes rattachés au portefeuille.</p>
              <div className="pb-brand-stat-grid">
                <div><span>Clientes</span><strong>{activeClients}</strong></div>
                <div><span>Opportunités</span><strong>{opportunities}</strong></div>
                <div><span>CA suivi</span><strong>{formatMoney(revenue)}</strong></div>
              </div>
              <div className="pb-brand-progress">
                <span style={{ width: relations.length ? Math.max(8, (activeClients / relations.length) * 100) + '%' : '0%' }} />
              </div>
              <small>{relations.length ? Math.round((activeClients / relations.length) * 100) : 0}% de comptes actifs</small>
            </article>
          );
        })}
        {!state.brands.length && <EmptyState icon="sparkles" message="Ajoute une marque pour démarrer le suivi du portefeuille." title="Aucune marque configurée." />}
      </section>
    </div>
  );
}

export function AttentionCenterView({ state }) {
  const signals = state.aiActions.slice(0, 8);
  const messages = state.whatsappMessages.slice(0, 8);
  const appointments = state.appointments.slice(0, 5);

  return (
    <div className="pb-page pb-attention-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Assistant commercial</span><h1>Centre d’attention</h1><p>Les signaux issus du terrain, les messages et les demandes à arbitrer au même endroit.</p></div>
      </section>
      <section className="pb-attention-grid">
        <article className="pb-card">
          <div className="pb-card-head"><div><span className="pb-eyebrow">Signaux détectés</span><h2>Actions suggérées</h2></div><span className="pb-count-badge">{signals.length}</span></div>
          <div className="pb-signal-list">
            {signals.map((action) => (
              <article className="pb-signal-row" key={action.id}>
                <span className="pb-signal-icon"><Icon name="sparkles" size={17} /></span>
                <div><strong>{action.output?.subject || formatLabel(action.action_type)}</strong><p>{action.pharmacies?.name || 'Compte à préciser'} · {action.brands?.name || 'Sans marque'}</p></div>
                <span className="pb-status pb-ai-status">{formatLabel(action.status)}</span>
              </article>
            ))}
            {!signals.length && <EmptyState icon="sparkles" message="Les suggestions générées depuis le terrain arriveront ici." title="Aucun signal à traiter." />}
          </div>
        </article>
        <article className="pb-card">
          <div className="pb-card-head"><div><span className="pb-eyebrow">Rendez-vous</span><h2>Demandes récentes</h2></div><span className="pb-count-badge">{appointments.length}</span></div>
          <div className="pb-signal-list">
            {appointments.map((appointment) => (
              <article className="pb-signal-row" key={appointment.id}>
                <span className="pb-signal-icon pb-tint-blue"><Icon name="calendar" size={17} /></span>
                <div><strong>{appointment.pharmacies?.name || 'Pharmacie'}</strong><p>{appointment.brands?.name || 'Marque à préciser'} · {formatDate(appointment.created_at)}</p></div>
                <Icon name="chevron" size={16} />
              </article>
            ))}
            {!appointments.length && <EmptyState icon="calendar" message="Les demandes de rendez-vous remonteront dans cette liste." title="Aucune demande récente." />}
          </div>
        </article>
      </section>
      <section className="pb-card">
        <div className="pb-card-head"><div><span className="pb-eyebrow">Canal terrain</span><h2>Derniers messages WhatsApp</h2></div><span className="pb-count-badge">{messages.length}</span></div>
        <div className="pb-message-list">
          {messages.map((message) => (
            <article className="pb-message-row" key={message.id}>
              <span className="pb-message-avatar"><Icon name="phone" size={16} /></span>
              <div><strong>{message.media_transcription || message.body || 'Message sans texte'}</strong><small>{formatDateTime(message.created_at)}</small></div>
              <span className="pb-status pb-ai-status">{formatLabel(message.ai_action_status)}</span>
            </article>
          ))}
          {!messages.length && <EmptyState icon="phone" message="Les nouveaux messages synchronisés seront visibles ici." title="Aucun message récent." />}
        </div>
      </section>
    </div>
  );
}

export function SettingsView({ lastSyncedAt, profile, session, state }) {
  const userName = profile?.full_name || session.user.email;
  return (
    <div className="pb-page pb-settings-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Espace de travail</span><h1>Paramètres</h1><p>Informations du profil et état des données de ton CRM terrain.</p></div>
      </section>
      <section className="pb-settings-grid">
        <article className="pb-card pb-settings-card">
          <div className="pb-card-head"><div><span className="pb-eyebrow">Profil</span><h2>Agent commercial</h2></div></div>
          <div className="pb-setting-profile"><span className="pb-avatar pb-avatar-large">{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><span>{state.agent?.display_name || 'Agent commercial'}</span><small>{session.user.email}</small></div></div>
        </article>
        <article className="pb-card pb-settings-card">
          <div className="pb-card-head"><div><span className="pb-eyebrow">Données</span><h2>Dernière synchronisation</h2></div></div>
          <div className="pb-sync-status"><span className="pb-live-dot" /><div><strong>{lastSyncedAt ? formatDateTime(lastSyncedAt) : 'En attente'}</strong><span>Les chiffres affichés proviennent de la dernière lecture des données.</span></div></div>
        </article>
      </section>
      <section className="pb-card pb-settings-card">
        <div className="pb-card-head"><div><span className="pb-eyebrow">Périmètre chargé</span><h2>Données du workspace</h2></div></div>
        <div className="pb-data-scope">
          {[['Comptes pharmacies', state.pharmacies.length], ['Relations marque', state.relations.length], ['Activités', state.followUps.length], ['Commandes', state.orders.length], ['Marques', state.brands.length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
        </div>
      </section>
    </div>
  );
}

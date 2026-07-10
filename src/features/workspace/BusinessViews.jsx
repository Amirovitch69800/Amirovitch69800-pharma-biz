import React from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDate, formatDateTime, formatLabel, formatMoney } from '../../lib/formatters.js';

function EmptyState({ icon, message, title }) {
  return <div className="pb-empty-state"><Icon name={icon} size={24} /><strong>{title}</strong><span>{message}</span></div>;
}

export function OrdersView({ state }) {
  const revenue = state.orders.reduce((total, order) => total + Number(order.total_after_discount_ht || 0), 0);
  const lastOrder = state.orders[0];

  return (
    <div className="pb-page">
      <section className="pb-page-heading">
        <div><span className="pb-eyebrow">Suivi commercial</span><h1>Commandes</h1><p>Retrouve les commandes suivies, leurs statuts et leur contribution au portefeuille.</p></div>
      </section>
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
                <td>{commission.pharmacies?.name || '—'}</td>
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

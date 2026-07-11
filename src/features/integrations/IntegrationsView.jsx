import React, { useMemo, useState } from 'react';
import Icon from '../../components/ui/Icon.jsx';
import { formatDateTime, formatLabel } from '../../lib/formatters.js';
import { connectIntegration, getConnectionForProvider, integrationCatalog } from '../../lib/integrations.js';

const syncMetrics = [
  ['Comptes CRM', 'companies', 'HubSpot companies vers pharmacies'],
  ['Contacts', 'contacts', 'Interlocuteurs et titulaires'],
  ['Deals', 'deals', 'Opportunités et pipeline'],
  ['Agenda', 'calendar', 'Rendez-vous terrain'],
];

function connectionHealth(connection) {
  if (!connection) return { label: 'Non connecté', tone: 'idle' };
  if (connection.status === 'connected') return { label: 'Connecté', tone: 'active' };
  if (connection.status === 'error') return { label: 'Erreur', tone: 'error' };
  return { label: formatLabel(connection.status || 'En attente'), tone: 'pending' };
}

export default function IntegrationsView({ state }) {
  const [connectingProvider, setConnectingProvider] = useState('');
  const [notice, setNotice] = useState('');
  const connections = state.integrations || [];

  const connectedCount = useMemo(() => connections.filter((connection) => connection.status === 'connected').length, [connections]);
  const lastSync = useMemo(() => connections
    .map((connection) => connection.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1), [connections]);

  async function connectProvider(provider) {
    setNotice('');
    setConnectingProvider(provider);
    const result = await connectIntegration(provider);
    if (result.error) {
      setNotice(result.error);
    } else if (provider === 'hubspot') {
      setNotice('HubSpot synchronisé : companies importées dans PharmaBiz.');
    }
    setConnectingProvider('');
  }

  return (
    <div className="pb-page pb-integrations-page">
      <section className="pb-page-heading">
        <div>
          <span className="pb-eyebrow">Connecteurs CRM</span>
          <h1>Intégrations</h1>
          <p>Connecte PharmaBiz aux outils déjà utilisés par ton équipe : HubSpot en app privée serveur, puis Outlook et Google en OAuth.</p>
        </div>
        <button className="pb-button pb-button-secondary" type="button">
          <Icon name="refresh" size={16} />
          <span>Synchroniser</span>
        </button>
      </section>

      {!state.integrationsReady && (
        <div className="pb-inline-notice" role="status">
          <span>La migration Supabase des intégrations n’est pas encore appliquée. Les cartes sont prêtes, les connexions seront persistées après migration.</span>
        </div>
      )}

      {notice && (
        <div className="pb-inline-notice" role="status">
          <span>{notice}</span>
        </div>
      )}

      <section className="pb-integration-metrics">
        <article>
          <span>Connecteurs actifs</span>
          <strong>{connectedCount}</strong>
          <small>{integrationCatalog.length} disponibles</small>
        </article>
        <article>
          <span>Dernière sync</span>
          <strong>{lastSync ? formatDateTime(lastSync) : 'En attente'}</strong>
          <small>HubSpot et Outlook priorisés</small>
        </article>
        <article>
          <span>Mode sécurité</span>
          <strong>Backend sécurisé</strong>
          <small>Aucun token dans le navigateur</small>
        </article>
      </section>

      <section className="pb-integration-grid">
        {integrationCatalog.map((integration) => {
          const connection = getConnectionForProvider(connections, integration.id);
          const health = connectionHealth(connection);
          return (
            <article className="pb-integration-card" key={integration.id}>
              <header>
                <span className={'pb-integration-icon pb-integration-' + integration.id}>
                  <Icon name={integration.icon} size={20} />
                </span>
                <div>
                  <span className="pb-eyebrow">{integration.category}</span>
                  <h2>{integration.name}</h2>
                </div>
                <span className={'pb-status pb-integration-status-' + health.tone}>{health.label}</span>
              </header>
              <p>{integration.description}</p>
              <div className="pb-integration-flow">
                <div>
                  <span>Entrant</span>
                  <strong>{integration.inbound.join(' · ')}</strong>
                </div>
                <Icon name="link" size={16} />
                <div>
                  <span>Sortant</span>
                  <strong>{integration.outbound.join(' · ')}</strong>
                </div>
              </div>
              <div className="pb-integration-foot">
                <span>{connection?.external_account_email || integration.cadence}</span>
                <button
                  className="pb-button pb-button-primary"
                  disabled={connectingProvider === integration.id}
                  onClick={() => connectProvider(integration.id)}
                  type="button"
                >
                  <Icon name="link" size={15} />
                  <span>{integration.id === 'hubspot' ? 'Synchroniser' : connection ? 'Reconnecter' : 'Connecter'}</span>
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="pb-card">
        <div className="pb-card-head">
          <div>
            <span className="pb-eyebrow">Plan de synchronisation</span>
            <h2>Données unifiées</h2>
          </div>
          <span className="pb-count-badge">4 flux</span>
        </div>
        <div className="pb-sync-map">
          {syncMetrics.map(([label, key, description]) => (
            <article key={key}>
              <span className="pb-sync-map-dot" />
              <div>
                <strong>{label}</strong>
                <small>{description}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

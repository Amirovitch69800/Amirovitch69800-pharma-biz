import React, { useEffect, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { formatDateTime, initials } from '../../lib/formatters.js';

const defaultNavigation = [
  {
    label: 'Terrain',
    items: [
      ['dashboard', 'Aujourd’hui', 'home'],
      ['accounts', 'Pharmacies', 'building'],
      ['pipeline', 'Pipeline', 'board'],
      ['activities', 'Agenda & actions', 'calendar'],
    ],
  },
  {
    label: 'Business',
    items: [
      ['orders', 'Commandes', 'bag'],
      ['field-network', 'Mes missions', 'check'],
      ['brands', 'Mes marques', 'sparkles'],
      ['commissions', 'Commissions', 'chart'],
    ],
  },
];

export default function CrmShell({
  activeTab,
  children,
  error,
  lastSyncedAt,
  navigation = defaultNavigation,
  onClearError,
  onCreateActivity,
  onOpenAccount,
  onReload,
  onSignOut,
  onTabChange,
  profile,
  search,
  searchResults,
  setSearch,
  session,
  workspaceLabel = 'Field CRM',
}) {
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('pb-global-search')?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const name = profile?.full_name || session.user.email;
  function selectAccount(account) { setSearch(''); onOpenAccount(account.id); }

  return (
    <main className="pb-shell">
      <aside className="pb-sidebar">
        <button className="pb-brand" onClick={() => onTabChange('dashboard')} type="button"><span className="pb-brand-mark">PB</span><span><strong>PharmaBiz</strong><small>{workspaceLabel}</small></span></button>
        <nav className="pb-navigation" aria-label="Navigation principale">
          {navigation.map((group) => <div className="pb-nav-group" key={group.label}><span className="pb-nav-label">{group.label}</span>{group.items.map(([key, label, icon]) => <button aria-current={activeTab === key ? 'page' : undefined} className={activeTab === key ? 'is-active' : ''} key={key} onClick={() => onTabChange(key)} type="button"><Icon name={icon} size={17} /><span>{label}</span></button>)}</div>)}
        </nav>
        <div className="pb-sidebar-bottom">
          <button className={activeTab === 'assistant' ? 'pb-assistant-link is-active' : 'pb-assistant-link'} onClick={() => onTabChange('assistant')} type="button"><Icon name="sparkles" size={17} /><span>Centre d’attention</span></button>
          <button className={activeTab === 'integrations' ? 'pb-assistant-link is-active' : 'pb-assistant-link'} onClick={() => onTabChange('integrations')} type="button"><Icon name="link" size={17} /><span>Intégrations</span></button>
          <button className={activeTab === 'settings' ? 'pb-settings-link is-active' : 'pb-settings-link'} onClick={() => onTabChange('settings')} type="button"><Icon name="settings" size={17} /><span>Paramètres</span></button>
          <div className="pb-profile"><span className="pb-avatar">{initials(name)}</span><span className="pb-profile-copy"><strong>{name}</strong><small>{lastSyncedAt ? 'Synchronisé ' + formatDateTime(lastSyncedAt) : 'Synchronisation…'}</small></span><button aria-label="Se déconnecter" className="pb-icon-button" onClick={onSignOut} type="button"><Icon name="arrow" size={16} /></button></div>
        </div>
      </aside>
      <section className="pb-main">
        <header className="pb-topbar">
          <div className="pb-global-search"><Icon name="search" size={18} /><input autoComplete="off" id="pb-global-search" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une pharmacie…" value={search} /><kbd>⌘ K</kbd>{search && <div className="pb-search-results">{searchResults.length ? searchResults.map((account) => <button key={account.id} onClick={() => selectAccount(account)} type="button"><span className="pb-result-avatar">{initials(account.name)}</span><span><strong>{account.name}</strong><small>{[account.postal_code, account.city].filter(Boolean).join(' ') || 'Localisation à compléter'}</small></span><Icon name="chevron" size={16} /></button>) : <div className="pb-no-result">Aucun compte trouvé.</div>}</div>}</div>
          <div className="pb-topbar-actions"><button aria-label="Rafraîchir les données" className="pb-icon-button" onClick={onReload} type="button"><Icon name="refresh" size={18} /></button><div className="pb-create-wrap"><button className="pb-button pb-button-primary" onClick={() => setQuickMenuOpen((open) => !open)} type="button"><Icon name="plus" size={17} /><span>Créer</span></button>{quickMenuOpen && <div className="pb-quick-menu"><button onClick={() => { setQuickMenuOpen(false); onCreateActivity(); }} type="button"><Icon name="check" size={16} /><span><strong>Nouvelle activité</strong><small>Planifier une action terrain</small></span></button><button onClick={() => { setQuickMenuOpen(false); onTabChange('accounts'); }} type="button"><Icon name="building" size={16} /><span><strong>Explorer les comptes</strong><small>Ouvrir le portefeuille pharmacie</small></span></button></div>}</div></div>
        </header>
        <div className="pb-content">{error && <div className="pb-alert" role="alert"><span>Une partie des données n’a pas pu être synchronisée : {error}</span><button onClick={onClearError} type="button"><Icon name="close" size={15} /></button></div>}{children}</div>
      </section>
    </main>
  );
}

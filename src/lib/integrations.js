import { supabase } from './supabase.js';

export const integrationCatalog = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'CRM',
    icon: 'database',
    statusLabel: 'App privée',
    description: 'Importe les sociétés assignées, le catalogue produits Naali et prépare la création de deals.',
    scopes: ['crm.objects.companies.read', 'crm.objects.products.read', 'crm.objects.deals.write'],
    inbound: ['Companies', 'Catalogue produits', 'Historique remises'],
    outbound: ['Deals', 'Line items', 'Journal de sync'],
    cadence: 'Sync manuelle sécurisée',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    category: 'Microsoft 365',
    icon: 'mail',
    statusLabel: 'Prêt OAuth',
    description: 'Connecte emails, calendrier et rendez-vous terrain via Microsoft Graph.',
    scopes: ['offline_access', 'User.Read', 'Mail.Read', 'Calendars.ReadWrite', 'Contacts.Read'],
    inbound: ['Emails', 'Calendrier', 'Contacts'],
    outbound: ['Rendez-vous', 'Tâches de relance'],
    cadence: 'Webhooks + sync horaire',
  },
  {
    id: 'google',
    name: 'Google Workspace',
    category: 'Email & agenda',
    icon: 'calendar',
    statusLabel: 'Extension',
    description: 'Prépare Gmail et Google Calendar pour les équipes hors Microsoft.',
    scopes: ['gmail.readonly', 'calendar.events', 'contacts.readonly'],
    inbound: ['Emails', 'Événements', 'Contacts'],
    outbound: ['Rendez-vous', 'Comptes associés'],
    cadence: 'Sur demande',
  },
];

export function getConnectionForProvider(connections, provider) {
  return connections.find((connection) => connection.provider === provider);
}

export async function startIntegrationOAuth(provider) {
  const { data, error } = await supabase.functions.invoke('integration-oauth-start', {
    body: {
      provider,
      redirectTo: window.location.origin,
    },
  });

  if (error) return { error: error.message };
  if (!data?.authorizationUrl) return { error: 'Connecteur OAuth non configuré côté backend.' };

  window.location.href = data.authorizationUrl;
  return { error: null };
}

export async function syncHubSpotPrivateApp() {
  const { data, error } = await supabase.functions.invoke('hubspot-sync', {
    body: {
      mode: 'private_app_token',
    },
  });

  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };

  const { data: catalogData, error: catalogError } = await supabase.functions.invoke('hubspot-catalog-sync', {
    body: {
      mode: 'private_app_token',
    },
  });

  if (catalogError) return { error: catalogError.message };
  if (catalogData?.error) return { error: catalogData.error };
  return { data: { ...data, catalog: catalogData }, error: null };
}

export async function connectIntegration(provider) {
  if (provider === 'hubspot') return syncHubSpotPrivateApp();
  return startIntegrationOAuth(provider);
}

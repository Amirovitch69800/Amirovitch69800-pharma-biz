import { supabase } from './supabase.js';

export const integrationCatalog = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'CRM',
    icon: 'database',
    statusLabel: 'App privée',
    description: 'Importe le portefeuille Naali, le catalogue, les deals historiques et les lignes produits.',
    scopes: ['crm.objects.companies.read', 'crm.objects.products.read', 'crm.objects.deals.read', 'crm.objects.line_items.read', 'crm.objects.deals.write'],
    inbound: ['Companies clientes', 'Catalogue produits', 'Deals historiques', 'Line items', 'Remises'],
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
    description: 'Connecte Google Calendar pour afficher les vrais rendez-vous terrain dans l’espace agent.',
    scopes: ['calendar.events'],
    inbound: ['Événements agenda'],
    outbound: ['Rendez-vous terrain'],
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

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };
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

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };

  return { data, error: null };
}

export async function syncHubSpotLineItems() {
  const { data, error } = await supabase.functions.invoke('hubspot-line-items-sync', {
    body: {
      limit: 50,
      force: false,
    },
  });

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };

  return { data, error: null };
}

export async function geocodeAgentPharmacies() {
  const { data, error } = await supabase.functions.invoke('geocode-pharmacies', {
    body: {
      limit: 55,
      force: false,
    },
  });

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };

  return { data, error: null };
}

export async function syncGoogleCalendar() {
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
    body: {
      daysAhead: 14,
    },
  });

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };

  return { data, error: null };
}

export async function createGoogleCalendarEvent({ activityId, durationMinutes }) {
  const { data, error } = await supabase.functions.invoke('google-calendar-create-event', {
    body: {
      activityId,
      durationMinutes,
    },
  });

  if (data?.error) return { error: data.error };
  if (error) return { error: await readFunctionError(error) };

  return { data, error: null };
}

async function readFunctionError(error) {
  try {
    const response = error?.context;
    if (response?.json) {
      const body = await response.clone().json();
      if (body?.error) return body.error;
    }
    if (response?.text) {
      const text = await response.clone().text();
      if (text) return text;
    }
  } catch {
    // Keep the original Supabase error when the response body cannot be read.
  }
  return error?.message || 'Erreur Edge Function.';
}

export async function connectIntegration(provider) {
  if (provider === 'hubspot') return syncHubSpotPrivateApp();
  return startIntegrationOAuth(provider);
}

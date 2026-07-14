const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
});

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const preciseMoneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const statusLabels = {
  prospect: 'Prospect',
  contacted: 'Contactée',
  interested: 'Intéressée',
  active: 'Client actif',
  inactive: 'Inactive',
  lost: 'Perdue',
  todo: 'À faire',
  done: 'Terminée',
  high: 'Priorité haute',
  medium: 'Priorité normale',
  low: 'Priorité basse',
  priority: 'Prioritaire',
  approved: 'Validée',
  to_invoice: 'À facturer',
  estimated: 'Estimée',
  paid: 'Payée',
};

export function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

export function formatPreciseMoney(value) {
  return preciseMoneyFormatter.format(Number(value || 0));
}

export function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : '—';
}

export function formatShortDate(value) {
  return value ? shortDateFormatter.format(new Date(value)) : '—';
}

export function formatDateTime(value) {
  return value ? dateTimeFormatter.format(new Date(value)) : '—';
}

export function formatLabel(value) {
  return statusLabels[value] || String(value || '—').replaceAll('_', ' ');
}

export function initials(value) {
  return String(value || 'PB')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function isOverdue(value) {
  return Boolean(value) && new Date(value) < new Date();
}

export function isToday(value) {
  return Boolean(value) && new Date(value).toDateString() === new Date().toDateString();
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDate, formatDateTime, formatLabel, formatMoney, isOverdue } from '../../lib/formatters.js';
import { connectIntegration, geocodeAgentPharmacies, syncGoogleCalendar, syncHubSpotLineItems, syncHubSpotPrivateApp } from '../../lib/integrations.js';
import { supabase } from '../../lib/supabase.js';
import { FRANCE_DEPARTMENTS } from './franceDepartments.js';

const NAV_ITEMS = [
  ['today', '🏠', 'Jour'],
  ['portfolio', '●', 'Portfolio'],
  ['results', '▣', 'Résultats'],
  ['settings', '⚙', 'Réglages'],
];

const DEPARTMENT_POSITIONS = {
  '01': [67, 43], '02': [58, 19], '03': [52, 45], '04': [69, 62], '05': [72, 58], '06': [82, 68],
  '07': [62, 57], '08': [62, 14], '09': [47, 78], 10: [58, 31], 11: [52, 80], 12: [49, 61],
  13: [64, 73], 14: [34, 24], 15: [50, 55], 16: [33, 55], 17: [28, 57], 18: [51, 40],
  19: [47, 57], 21: [61, 38], 22: [24, 35], 23: [45, 49], 24: [39, 59], 25: [72, 41],
  26: [64, 58], 27: [40, 25], 28: [45, 29], 29: [16, 36], 30: [58, 69], 31: [45, 76],
  32: [39, 72], 33: [32, 66], 34: [53, 72], 35: [28, 35], 36: [47, 43], 37: [40, 40],
  38: [69, 53], 39: [69, 44], 40: [32, 75], 41: [44, 37], 42: [59, 51], 43: [56, 55],
  44: [28, 43], 45: [48, 34], 46: [45, 64], 47: [39, 68], 48: [55, 64], 49: [35, 40],
  50: [28, 25], 51: [60, 25], 52: [64, 32], 53: [33, 35], 54: [69, 27], 55: [65, 25],
  56: [22, 41], 57: [73, 25], 58: [55, 43], 59: [55, 10], 60: [51, 22], 61: [38, 30],
  62: [51, 9], 63: [53, 51], 64: [36, 81], 65: [42, 82], 66: [52, 86], 67: [79, 27],
  68: [79, 35], 69: [62, 49], 70: [70, 36], 71: [60, 45], 72: [38, 35], 73: [75, 55],
  74: [78, 48], 75: [48, 26], 76: [39, 20], 77: [52, 28], 78: [46, 27], 79: [35, 49],
  80: [51, 16], 81: [48, 72], 82: [43, 70], 83: [72, 73], 84: [63, 66], 85: [28, 48],
  86: [38, 47], 87: [42, 52], 88: [72, 32], 89: [55, 35], 90: [75, 38], 91: [49, 28],
  92: [47, 26], 93: [49, 25], 94: [50, 26], 95: [47, 24], '2A': [80, 86], '2B': [82, 80],
};

const FRANCE_BOUNDS = {
  maxLat: 51.25,
  maxLon: 9.85,
  minLat: 41.1,
  minLon: -5.35,
};

const NAALI_CATALOGUE_REFERENCE_TOTAL = 21;

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

const PHARMACY_SKIP_WORDS = new Set([
  'pharmacie', 'parapharmacie', 'pharm', 'grande', 'grand', 'petite', 'petit',
  'vieux', 'vieille', 'nouveau', 'nouvelle', 'belle', 'beau',
  'visite', 'rdv', 'appel', 'relance', 'passage',
  'pour', 'dans', 'avec', 'par', 'sur', 'les', 'des', 'une', 'aux',
  'rue', 'avenue', 'place', 'du', 'de', 'la', 'le',
]);

function textSharesPharmacyName(text, pharmacyName) {
  const words = (s) => normalize(s)
    .replace(/[.,\\/()]/g, ' ')
    .split(/[\s\-]+/)
    .filter((w) => w.length >= 2 && !PHARMACY_SKIP_WORDS.has(w));
  const textSet = new Set(words(text));
  const nameWords = words(pharmacyName);
  if (!nameWords.length) return false;
  const shared = nameWords.filter((w) => textSet.has(w));
  return shared.some((w) => w.length >= 8) || shared.length >= 2;
}

function cleanTitle(value) {
  return String(value || '').replace(/(\s*[-–]\s*\d{5,})+$/g, '').replace(/^(visite|rdv|appel|relance)\s*[·•]\s*/i, '').trim();
}

function getPharmacyName(item) {
  return item?.pharmacies?.name || item?.name || 'Pharmacie';
}

function getPharmacyCity(item) {
  return item?.pharmacies?.city || item?.city || 'Ville à compléter';
}

function buildMapsUrl(row) {
  const query = [row?.name, row?.addressLine1, row?.postalCode, row?.city].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || row?.name || 'pharmacie')}`;
}

function stableHash(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0);
}

function projectGeoPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    x: ((lon - FRANCE_BOUNDS.minLon) / (FRANCE_BOUNDS.maxLon - FRANCE_BOUNDS.minLon)) * 100,
    y: ((FRANCE_BOUNDS.maxLat - lat) / (FRANCE_BOUNDS.maxLat - FRANCE_BOUNDS.minLat)) * 100,
  };
}

function getGeoDistanceKm(first, second) {
  const firstLat = Number(first?.latitude);
  const firstLon = Number(first?.longitude);
  const secondLat = Number(second?.latitude);
  const secondLon = Number(second?.longitude);
  if (![firstLat, firstLon, secondLat, secondLon].every(Number.isFinite)) return null;
  const earthRadiusKm = 6371;
  const toRadians = (value) => value * Math.PI / 180;
  const latDelta = toRadians(secondLat - firstLat);
  const lonDelta = toRadians(secondLon - firstLon);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readNumber(...values) {
  const value = values.find((item) => item !== null && item !== undefined && item !== '');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(';').map((item) => item.trim()).filter(Boolean);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const maximumFractionDigits = number > 0 && number < 10 ? 1 : 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits }).format(number)}%`;
}

function formatShortNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: number % 1 ? 1 : 0 }).format(number);
}

function getOrderTotal(order) {
  return Number(order?.total_after_discount_ht || order?.total_ht || 0);
}

function parseCalendarDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLocalDateKey(value) {
  const date = value instanceof Date ? value : parseCalendarDate(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readCalendarTime(value) {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function getCalendarEventStart(event) {
  const payload = event?.payload || {};
  return payload.start?.dateTime || payload.start?.date || payload.start_at || payload.starts_at || payload.start || null;
}

function getCalendarEventEnd(event) {
  const payload = event?.payload || {};
  return payload.end?.dateTime || payload.end?.date || payload.end_at || payload.ends_at || payload.end || null;
}

function buildCalendarItems(events, rows) {
  const todayKey = getLocalDateKey(new Date());
  return (events || [])
    .map((event) => {
      const payload = event.payload || {};
      const start = getCalendarEventStart(event);
      const startDate = parseCalendarDate(start);
      const pharmacyId = payload.pharmacy_id || payload.local_pharmacy_id || null;
      const eventText = payload.summary || payload.title || payload.location || '';
      const row = rows.find((candidate) => candidate.pharmacyId === pharmacyId)
        || rows.find((candidate) => textSharesPharmacyName(eventText, candidate.name))
        || null;
      return {
        id: event.id,
        kind: 'calendar',
        row,
        title: payload.summary || payload.title || row?.name || 'Rendez-vous agenda',
        meta: [row?.name, payload.location, payload.organizer?.email].filter(Boolean).join(' · ') || 'Événement Google Calendar',
        due: start,
        end: getCalendarEventEnd(event),
        time: readCalendarTime(start),
        startDate,
        tone: 'normal',
        type: 'Rendez-vous',
      };
    })
    .filter((item) => item.startDate && getLocalDateKey(item.startDate) === todayKey)
    .sort((first, second) => first.startDate - second.startDate);
}

function buildTelUrl(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

function buildCustomerMemory({ orders, orderItems, pharmacyId }) {
  const currentYear = new Date().getFullYear();
  const customerOrders = (orders || [])
    .filter((order) => order.pharmacy_id === pharmacyId)
    .sort((a, b) => new Date(b.order_date || b.created_at || 0) - new Date(a.order_date || a.created_at || 0));
  const customerItems = (orderItems || []).filter((item) => (item.pharmacy_id || item.orders?.pharmacy_id) === pharmacyId);
  const discountLines = customerItems.filter((item) => Number(item.discount_rate || 0) > 0);
  const averageDiscount = discountLines.length
    ? discountLines.reduce((sum, item) => sum + Number(item.discount_rate || 0), 0) / discountLines.length
    : 0;
  const productsByName = customerItems.reduce((acc, item) => {
    const name = item.product_name_snapshot || item.products?.name || 'Produit';
    acc.set(name, (acc.get(name) || 0) + Number(item.quantity || 0));
    return acc;
  }, new Map());
  const topProducts = Array.from(productsByName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, quantity]) => ({ name, quantity }));
  const ytdRevenue = customerOrders.reduce((total, order) => {
    const date = parseCalendarDate(order.order_date || order.created_at);
    return date?.getFullYear() === currentYear ? total + getOrderTotal(order) : total;
  }, 0);
  const previousYearRevenue = customerOrders.reduce((total, order) => {
    const date = parseCalendarDate(order.order_date || order.created_at);
    return date?.getFullYear() === currentYear - 1 ? total + getOrderTotal(order) : total;
  }, 0);
  const growthRate = previousYearRevenue > 0 ? ((ytdRevenue - previousYearRevenue) / previousYearRevenue) * 100 : null;

  return {
    averageDiscount,
    growthRate,
    lastOrderAt: customerOrders[0]?.order_date || customerOrders[0]?.created_at || null,
    lastOrderTotal: Number(customerOrders[0]?.total_after_discount_ht || customerOrders[0]?.total_ht || 0),
    orderCount: customerOrders.length,
    previousYearRevenue,
    topProducts,
    ytdRevenue,
  };
}

function buildActivityHistory({ activities, pharmacyId }) {
  return (activities || [])
    .filter((activity) => activity.pharmacy_id === pharmacyId)
    .sort((a, b) => new Date(b.activity_date || b.completed_at || b.created_at || 0) - new Date(a.activity_date || a.completed_at || a.created_at || 0))
    .slice(0, 4);
}

function buildTerrainSignal(row) {
  if (!row) return { action: 'Préparer', reason: 'Sélectionne une pharmacie pour calculer le signal terrain.', tone: 'neutral' };
  if (isOverdue(row.nextActionAt)) return { action: 'Relancer', reason: `Prochaine action dépassée depuis le ${formatDate(row.nextActionAt)}.`, tone: 'hot' };
  if (!row.memory?.orderCount) return { action: 'Qualifier', reason: 'Aucun historique commande chargé : vérifier potentiel et besoin réassort.', tone: 'warn' };
  if (!row.phone && !row.email) return { action: 'Compléter', reason: 'Contact direct manquant : téléphone/email à récupérer pendant la visite.', tone: 'warn' };
  if (row.revenue > 0 && row.memory?.lastOrderAt) return { action: 'Réassort', reason: `Dernière commande ${formatDate(row.memory.lastOrderAt)} · CA suivi ${formatMoney(row.revenue)}.`, tone: 'good' };
  return { action: 'Visiter', reason: 'Compte actif à maintenir avec une prochaine action terrain.', tone: 'neutral' };
}

function buildBusinessBriefing(row, productDistribution) {
  if (!row) return null;
  const distribution = productDistribution?.pharmacies?.get(row.pharmacyId) || null;
  const referencedProducts = distribution?.products?.map((product) => product.name) || readArray(row.catalogueNaaliReference);
  const referencedSet = new Set(referencedProducts.map((name) => normalize(name)));
  const globalProducts = productDistribution?.products || [];
  const missingProducts = globalProducts
    .filter((product) => !referencedSet.has(normalize(product.name)))
    .slice(0, 4)
    .map((product) => product.name);
  const topProducts = row.memory?.topProducts?.length
    ? row.memory.topProducts.map((product) => product.name).slice(0, 3)
    : referencedProducts.slice(0, 3);
  const distributionRate = distribution
    ? distribution.rateLabel
    : referencedProducts.length ? formatPercent((referencedProducts.length / NAALI_CATALOGUE_REFERENCE_TOTAL) * 100) : '—';
  const growthLabel = row.memory?.growthRate === null || row.memory?.growthRate === undefined
    ? 'N-1 indisponible'
    : `${row.memory.growthRate >= 0 ? '+' : ''}${formatPercent(row.memory.growthRate)}`;

  return {
    distributionRate,
    growthLabel,
    missingProducts,
    topProducts,
    ytdRevenue: row.memory?.ytdRevenue || 0,
  };
}

function buildPortfolioRows(state) {
  const relationByPharmacyId = new Map((state.relations || []).map((relation) => [relation.pharmacy_id, relation]));
  return (state.portfolio || []).map((portfolioItem) => {
    const pharmacy = portfolioItem.pharmacies || (state.pharmacies || []).find((item) => item.id === portfolioItem.pharmacy_id) || {};
    const relation = relationByPharmacyId.get(portfolioItem.pharmacy_id) || null;
    const brand = (state.brands || []).find((item) => item.id === relation?.brand_id) || null;
    const revenue = Number(relation?.annual_revenue_ht || pharmacy.hubspot_total_revenue || pharmacy.hubspot_annual_revenue || 0);
    const memory = buildCustomerMemory({
      orders: state.orders,
      orderItems: state.orderItems,
      pharmacyId: pharmacy.id || portfolioItem.pharmacy_id,
    });
    const activities = buildActivityHistory({
      activities: state.activities,
      pharmacyId: pharmacy.id || portfolioItem.pharmacy_id,
    });
    const row = {
      id: portfolioItem.id || pharmacy.id,
      pharmacyId: pharmacy.id || portfolioItem.pharmacy_id,
      name: cleanTitle(getPharmacyName(pharmacy)),
      city: getPharmacyCity(pharmacy),
      addressLine1: pharmacy.address_line1 || null,
      postalCode: pharmacy.postal_code || null,
      department: pharmacy.department || String(pharmacy.postal_code || '').slice(0, 2) || '—',
      latitude: readNumber(pharmacy.latitude, pharmacy.lat, pharmacy.geo_latitude, pharmacy.hubspot_latitude),
      longitude: readNumber(pharmacy.longitude, pharmacy.lng, pharmacy.lon, pharmacy.geo_longitude, pharmacy.hubspot_longitude),
      phone: pharmacy.phone || null,
      email: pharmacy.email || null,
      catalogueNaaliReference: readArray(pharmacy.hubspot_catalogue_naali_reference || pharmacy.hubspot_catalogue_naali_reference_raw),
      contactName: pharmacy.contact_name || pharmacy.titular_name || null,
      status: relation?.status || pharmacy.status || portfolioItem.status || 'active',
      priority: portfolioItem.priority || relation?.potential || pharmacy.potential || 'medium',
      nextActionAt: portfolioItem.next_action_at || relation?.next_action_at || pharmacy.next_follow_up_at || null,
      lastContactAt: portfolioItem.last_contact_at || pharmacy.last_contact_at || null,
      brandId: brand?.id || relation?.brand_id || null,
      brandName: brand?.name || relation?.brands?.name || 'Naali',
      relation,
      revenue,
      memory,
      activities,
      source: portfolioItem.source || 'terrain',
    };
    return {
      ...row,
      signal: buildTerrainSignal(row),
    };
  }).sort((a, b) => {
    const priorityRank = { priority: 0, high: 1, medium: 2, low: 3 };
    return (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4) || a.name.localeCompare(b.name);
  });
}

function buildActivityItems(rows, activities) {
  const todayKey = getLocalDateKey(new Date());
  return (activities || [])
    .map((activity) => {
      const activityDate = parseCalendarDate(activity.activity_date);
      const row = rows.find((candidate) => candidate.pharmacyId === activity.pharmacy_id) || null;
      return {
        id: `activity-${activity.id}`,
        kind: 'activity',
        row,
        type: activity.activity_type || 'visit',
        title: activity.title || row?.name || 'Action terrain',
        meta: [row?.city, activity.brands?.name].filter(Boolean).join(' · ') || activity.notes || 'Planifié dans PharmaBiz',
        due: activity.activity_date,
        time: readCalendarTime(activity.activity_date),
        startDate: activityDate,
        tone: activity.completed_at ? 'done' : 'normal',
        reason: activity.notes || 'Action planifiée dans PharmaBiz',
      };
    })
    .filter((item) => item.startDate && getLocalDateKey(item.startDate) === todayKey)
    .sort((first, second) => first.startDate - second.startDate);
}

function buildTodayItems(rows, followUps, activities) {
  const activityItems = buildActivityItems(rows, activities);
  const taskPharmacyIds = new Set((followUps || []).map((task) => task.pharmacy_id).filter(Boolean));
  const activityPharmacyIds = new Set(activityItems.map((item) => item.row?.pharmacyId).filter(Boolean));
  const tasks = (followUps || []).slice(0, 4).map((task) => ({
    id: `task-${task.id}`,
    kind: 'task',
    row: rows.find((row) => row.pharmacyId === task.pharmacy_id) || null,
    type: formatLabel(task.priority),
    title: task.title || task.pharmacies?.name || 'Action terrain',
    meta: [task.pharmacies?.name, task.brands?.name].filter(Boolean).join(' · ') || task.reason || 'À traiter',
    due: task.due_at,
    tone: isOverdue(task.due_at) ? 'hot' : 'normal',
    reason: task.reason || task.suggested_message || 'Relance planifiée',
  }));
  const suggested = rows
    .filter((row) => !taskPharmacyIds.has(row.pharmacyId) && !activityPharmacyIds.has(row.pharmacyId))
    .map((row) => {
      const score = (row.signal.tone === 'hot' ? 40 : 0)
        + (row.signal.tone === 'warn' ? 25 : 0)
        + (row.priority === 'priority' || row.priority === 'high' ? 20 : 0)
        + (!row.memory?.orderCount ? 12 : 0)
        + (row.revenue > 0 ? 8 : 0);
      return {
        id: `signal-${row.id}`,
        kind: 'suggestion',
        row,
        type: row.signal.action,
        title: row.name,
        meta: `${row.city} · ${row.brandName}`,
        due: row.nextActionAt,
        tone: row.signal.tone === 'hot' ? 'hot' : 'normal',
        reason: row.signal.reason,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return [...activityItems, ...tasks, ...suggested].slice(0, 6);
}

function getDaysSince(value) {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function buildAiRecommendations(rows, todayItems, productDistribution, calendarItems) {
  const plannedPharmacyIds = new Set((calendarItems || []).map((item) => item.row?.pharmacyId).filter(Boolean));
  const taskPharmacyIds = new Set((todayItems || []).map((item) => item.row?.pharmacyId).filter(Boolean));

  return (rows || [])
    .filter((row) => row?.pharmacyId && !plannedPharmacyIds.has(row.pharmacyId))
    .map((row) => {
      const distribution = productDistribution?.pharmacies?.get(row.pharmacyId) || null;
      const daysSinceOrder = getDaysSince(row.memory?.lastOrderAt);
      const hasGps = Boolean(projectGeoPoint(row.latitude, row.longitude));
      const isOverdueAction = isOverdue(row.nextActionAt);
      const lowDistribution = distribution && distribution.rate < 35;
      const signals = [
        isOverdueAction ? { score: 34, label: `action dépassée depuis le ${formatDate(row.nextActionAt)}` } : null,
        taskPharmacyIds.has(row.pharmacyId) ? { score: 20, label: 'relance déjà présente dans les tâches du jour' } : null,
        daysSinceOrder !== null && daysSinceOrder >= 45 ? { score: 26, label: `dernière commande il y a ${daysSinceOrder} jours` } : null,
        daysSinceOrder !== null && daysSinceOrder >= 30 && daysSinceOrder < 45 ? { score: 15, label: `commande à surveiller : ${daysSinceOrder} jours` } : null,
        !row.memory?.orderCount ? { score: 18, label: 'aucun historique commande disponible' } : null,
        lowDistribution ? { score: 18, label: `DN faible : ${distribution.rateLabel}` } : null,
        row.priority === 'priority' || row.priority === 'high' ? { score: 16, label: formatLabel(row.priority) } : null,
        row.revenue > 0 ? { score: 8, label: `CA suivi ${formatMoney(row.revenue)}` } : null,
        !row.phone && !row.email ? { score: 7, label: 'contact direct manquant' } : null,
        hasGps ? { score: 3, label: 'coordonnées GPS disponibles' } : null,
      ].filter(Boolean);
      const score = signals.reduce((sum, signal) => sum + signal.score, 0);
      const action = isOverdueAction
        ? 'Relancer'
        : !row.memory?.orderCount
          ? 'Qualifier'
          : daysSinceOrder !== null && daysSinceOrder >= 30
            ? 'Réassort'
            : lowDistribution
              ? 'Développer DN'
              : !row.phone && !row.email
                ? 'Compléter'
                : row.signal?.action || 'Visiter';
      const angle = !row.memory?.orderCount
        ? 'vérifier potentiel, besoin réassort et interlocuteur'
        : lowDistribution
          ? `élargir le référencement Naali (${distribution.distinctProducts}/${distribution.catalogSize} refs cochées)`
          : row.memory?.topProducts?.length
            ? `repartir des produits déjà commandés : ${row.memory.topProducts.map((product) => product.name).slice(0, 2).join(' · ')}`
            : row.signal?.reason || 'maintenir le compte actif';
      const nextStep = action === 'Relancer'
        ? 'appeler puis planifier une visite si besoin'
        : action === 'Réassort'
          ? 'préparer une proposition de commande'
          : action === 'Développer DN'
            ? 'préparer les références manquantes à pousser'
            : action === 'Qualifier'
              ? 'visite courte ou appel de qualification'
              : 'planifier une action terrain';
      const confidence = signals.length >= 4 ? 'forte' : signals.length >= 2 ? 'moyenne' : 'prudente';

      return {
        action,
        angle,
        confidence,
        evidence: signals.map((signal) => signal.label).slice(0, 3),
        id: `ai-${row.pharmacyId}`,
        nextStep,
        row,
        score,
      };
    })
    .filter((recommendation) => recommendation.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, 5);
}

function buildDayRoute(rows, plannedItems) {
  const geoRows = rows.filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));

  // Fixed stops from calendar/activities today
  const today = new Date().toDateString();
  const fixedStops = plannedItems
    .filter((item) => item.startDate && item.startDate.toDateString() === today && item.row)
    .map((item) => ({ ...item.row, time: item.time, fixedTime: item.startDate, fromCalendar: true }));
  const fixedIds = new Set(fixedStops.map((s) => s.pharmacyId));

  // Priority candidates with GPS
  const candidates = geoRows
    .filter((row) => !fixedIds.has(row.pharmacyId))
    .filter((row) => row.signal?.tone === 'hot' || row.signal?.tone === 'warn' || row.priority === 'priority' || row.priority === 'high')
    .map((row) => ({
      ...row,
      score: (row.signal?.tone === 'hot' ? 30 : row.signal?.tone === 'warn' ? 18 : 8)
        + (row.priority === 'priority' || row.priority === 'high' ? 20 : 0)
        + (isOverdue(row.nextActionAt) ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // Nearest-neighbor ordering of candidates
  const ordered = [...fixedStops];
  const remaining = [...candidates];
  let last = ordered[ordered.length - 1] || geoRows[0] || null;

  while (remaining.length > 0 && ordered.length < 6) {
    if (!last) { ordered.push(remaining.shift()); last = ordered[ordered.length - 1]; continue; }
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((row, idx) => {
      const d = getGeoDistanceKm(last, row);
      if (d !== null && d < bestDist) { bestDist = d; bestIdx = idx; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    last = next;
  }

  // Compute legs
  const stops = ordered.map((stop, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const distKm = prev ? getGeoDistanceKm(prev, stop) : null;
    return { ...stop, distKm, stopIndex: idx + 1 };
  });

  const totalKm = stops.reduce((sum, s) => sum + (s.distKm || 0), 0);

  // Nearby opportunities: rows close to any stop but not in route or already planned
  const routeIds = new Set(stops.map((s) => s.pharmacyId));
  const unmatchedEventTitles = plannedItems
    .filter((item) => !item.row)
    .map((item) => item.title || '');
  const opportunities = geoRows
    .filter((row) => {
      if (routeIds.has(row.pharmacyId)) return false;
      if (unmatchedEventTitles.some((title) => textSharesPharmacyName(title, row.name))) return false;
      return true;
    })
    .map((row) => {
      const minDist = Math.min(...stops.map((s) => getGeoDistanceKm(s, row) ?? Infinity));
      return { ...row, minDist };
    })
    .filter((row) => row.minDist < 12)
    .sort((a, b) => a.minDist - b.minDist)
    .slice(0, 3);

  return { stops, totalKm: Math.round(totalKm), opportunities, geoCount: geoRows.length };
}

function buildRouteSuggestion(rows, priority) {
  if (!priority) return null;
  const candidates = rows
    .filter((row) => row.pharmacyId !== priority.pharmacyId)
    .map((row) => {
      const distanceKm = getGeoDistanceKm(priority, row);
      if (distanceKm === null) return null;
      const sameDepartment = row.department && priority.department && row.department === priority.department;
      const score = Math.max(0, 55 - distanceKm)
        + (sameDepartment ? 12 : 0)
        + (row.signal?.tone === 'hot' ? 25 : row.signal?.tone === 'warn' ? 14 : 4)
        + (row.priority === 'priority' || row.priority === 'high' ? 18 : 0)
        + (!row.memory?.orderCount ? 8 : 0);
      return { distanceKm, row, sameDepartment, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function buildBrandStats(rows) {
  return rows.reduce((acc, row) => {
    const key = row.brandName || 'Marque';
    if (!acc.has(key)) acc.set(key, { brand: key, accounts: 0, revenue: 0 });
    const item = acc.get(key);
    item.accounts += 1;
    item.revenue += row.revenue;
    return acc;
  }, new Map());
}

function buildDepartments(rows) {
  const counts = rows.reduce((acc, row) => {
    const department = row.department || '—';
    acc.set(department, (acc.get(department) || 0) + 1);
    return acc;
  }, new Map());

  return Array.from(counts.entries())
    .map(([department, count]) => ({ count, department }))
    .sort((a, b) => String(a.department).localeCompare(String(b.department), 'fr', { numeric: true }));
}

function buildDepartmentClusters(rows) {
  const departmentShapes = new Map(FRANCE_DEPARTMENTS.map((department) => [department.code, department]));
  const clusters = rows.reduce((acc, row) => {
    const department = row.department || '—';
    const shape = departmentShapes.get(department);
    if (!acc.has(department)) {
      acc.set(department, {
        count: 0,
        department,
        hot: 0,
        name: shape?.name || `Département ${department}`,
        rows: [],
        revenue: 0,
        x: shape?.x || DEPARTMENT_POSITIONS[department]?.[0] || 50,
        y: shape?.y || DEPARTMENT_POSITIONS[department]?.[1] || 50,
      });
    }
    const cluster = acc.get(department);
    cluster.count += 1;
    cluster.hot += row.signal?.tone === 'hot' || row.priority === 'priority' ? 1 : 0;
    cluster.revenue += row.revenue || 0;
    cluster.rows.push(row);
    return acc;
  }, new Map());

  return Array.from(clusters.values())
    .map((cluster, index, list) => {
      if (DEPARTMENT_POSITIONS[cluster.department]) return cluster;
      const angle = (index / Math.max(1, list.length)) * Math.PI * 2;
      return {
        ...cluster,
        x: 50 + Math.cos(angle) * 24,
        y: 50 + Math.sin(angle) * 28,
      };
    })
    .sort((a, b) => b.count - a.count || String(a.department).localeCompare(String(b.department), 'fr', { numeric: true }));
}

function buildAgentProductDistribution(rows) {
  const rowPharmacyIds = new Set((rows || []).map((row) => row.pharmacyId).filter(Boolean));
  const productStats = new Map();
  const byPharmacy = new Map();

  (rows || []).forEach((row) => {
    if (!row.pharmacyId) return;
    const references = readArray(row.catalogueNaaliReference);
    const pharmacy = { pharmacyId: row.pharmacyId, products: new Map(), quantity: 0, revenue: 0 };

    references.forEach((name) => {
      const product = productStats.get(name) || { name, pharmacies: new Set(), quantity: 0, revenue: 0 };
      product.pharmacies.add(row.pharmacyId);
      productStats.set(name, product);
      pharmacy.products.set(name, { name, quantity: 0, revenue: 0 });
    });

    byPharmacy.set(row.pharmacyId, pharmacy);
  });

  const denominator = Math.max(1, rowPharmacyIds.size);
  const products = Array.from(productStats.values()).map((product) => {
    const pharmacyCount = product.pharmacies.size;
    const rate = (pharmacyCount / denominator) * 100;
    return {
      name: product.name,
      pharmacyCount,
      quantity: product.quantity,
      rate,
      rateLabel: formatPercent(rate),
      revenue: product.revenue,
    };
  }).sort((a, b) => b.rate - a.rate || b.revenue - a.revenue);

  let totalRate = 0;
  let totalDistinctProducts = 0;
  const pharmacyDistribution = new Map(Array.from(byPharmacy.entries()).map(([pharmacyId, value]) => {
    const productsList = Array.from(value.products.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
    const distinctProducts = productsList.length;
    const rate = (distinctProducts / NAALI_CATALOGUE_REFERENCE_TOTAL) * 100;
    totalRate += rate;
    totalDistinctProducts += distinctProducts;
    return [pharmacyId, {
      ...value,
      catalogSize: NAALI_CATALOGUE_REFERENCE_TOTAL,
      distinctProducts,
      products: productsList,
      rate,
      rateLabel: formatPercent(rate),
    }];
  }));
  const rate = rowPharmacyIds.size ? totalRate / rowPharmacyIds.size : 0;
  const averageDistinctProducts = rowPharmacyIds.size ? Math.round((totalDistinctProducts / rowPharmacyIds.size) * 10) / 10 : 0;

  return {
    averageDistinctProducts,
    catalogSize: NAALI_CATALOGUE_REFERENCE_TOTAL,
    denominator: rowPharmacyIds.size,
    distributedCount: totalDistinctProducts,
    note: rowPharmacyIds.size ? `Moy. ${formatShortNumber(averageDistinctProducts)}/${NAALI_CATALOGUE_REFERENCE_TOTAL} références cochées` : 'champ catalogue Naali à synchroniser',
    pharmacies: pharmacyDistribution,
    products,
    rate,
    rateLabel: rowPharmacyIds.size ? formatPercent(rate) : '—',
  };
}

const ORDER_COLORS = { hot: '#22c55e', warm: '#f97316', cold: '#ef4444', none: '#94a3b8' };

function pharmacyOrderStatus(row) {
  const lastOrder = row.memory?.lastOrderAt;
  if (!lastOrder) return 'none';
  const days = Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86400000);
  if (days <= 45) return 'hot';
  if (days <= 90) return 'warm';
  return 'cold';
}

function buildOrderMetrics(orders) {
  const safeOrders = orders || [];
  const total = safeOrders.reduce((sum, order) => sum + Number(order.total_after_discount_ht || order.total_ht || 0), 0);
  const draftCount = safeOrders.filter((order) => order.status === 'draft').length;
  const pendingCount = safeOrders.filter((order) => ['sent', 'confirmed', 'pending_validation'].includes(order.status)).length;
  return { draftCount, pendingCount, total };
}

export default function AgentV3Root({
  error,
  lastSyncedAt,
  onClearError,
  onCreateActivity,
  onCreateFollowUp,
  onCreateMission,
  onCreateOrderDraft,
  onReload,
  onSignOut,
  session,
  state,
}) {
  const [activeView, setActiveView] = useState('today');
  const [activeDepartment, setActiveDepartment] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [actionDraft, setActionDraft] = useState(null);
  const [hubspotSyncing, setHubspotSyncing] = useState(false);
  const [hubspotLineItemsSyncing, setHubspotLineItemsSyncing] = useState(false);
  const [hubspotNotice, setHubspotNotice] = useState('');
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleNotice, setGoogleNotice] = useState('');
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [googleSyncing, setGoogleSyncing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingNotice, setGeocodingNotice] = useState('');

  const name = state.profile?.full_name || session.user.email;
  const rows = useMemo(() => buildPortfolioRows(state), [state]);
  const departments = useMemo(() => buildDepartments(rows), [rows]);
  const filteredRows = useMemo(() => {
    const search = normalize(query);
    return rows.filter((row) => {
      const matchesDepartment = activeDepartment === 'all' || row.department === activeDepartment;
      if (!matchesDepartment) return false;
      if (!search) return true;
      return normalize([
      row.name,
      row.city,
      row.department,
      row.brandName,
      row.status,
      row.memory?.topProducts?.map((product) => product.name).join(' '),
      ].join(' ')).includes(search);
    });
  }, [activeDepartment, query, rows]);
  const selected = filteredRows.find((row) => row.pharmacyId === selectedPharmacyId) || filteredRows[0] || null;
  const todayItems = useMemo(() => buildTodayItems(rows, state.followUps, state.activities), [rows, state.activities, state.followUps]);
  const brandStats = useMemo(() => Array.from(buildBrandStats(rows).values()), [rows]);
  const productDistribution = useMemo(() => buildAgentProductDistribution(rows), [rows]);
  const selectedProductDistribution = selected ? productDistribution.pharmacies.get(selected.pharmacyId) || null : null;
  const urgentCount = rows.filter((row) => row.priority === 'priority' || isOverdue(row.nextActionAt)).length;
  const activeClients = rows.filter((row) => ['active', 'client', 'implanted'].includes(row.status)).length;
  const openOrders = (state.orders || []).filter((order) => !['cancelled', 'delivered', 'invoiced'].includes(order.status)).length;
  const orderMetrics = useMemo(() => buildOrderMetrics(state.orders || []), [state.orders]);
  const [annualTarget, setAnnualTarget] = useState(() => Number(localStorage.getItem('az_annual_target') || 0));

  const agentKpis = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const ytdOrders = (state.orders || []).filter((order) => {
      const d = parseCalendarDate(order.order_date || order.created_at);
      return d && d.getFullYear() === currentYear;
    });
    const paidStatuses = ['paid', 'approved', 'to_invoice', 'invoiced'];
    const paidYtdOrders = ytdOrders.filter((order) => paidStatuses.includes(order.status));
    const calcCommission = (orders) => orders.reduce((sum, order) => {
      const rate = order.order_type === 'implantation' ? 0.20 : 0.15;
      return sum + getOrderTotal(order) * rate;
    }, 0);
    const ytdRevenue = ytdOrders.reduce((sum, order) => sum + getOrderTotal(order), 0);
    return {
      ytdRevenue,
      roRatio: annualTarget > 0 ? ytdRevenue / annualTarget : null,
      commissionVersee: calcCommission(paidYtdOrders),
      commissionAttendue: calcCommission(ytdOrders),
    };
  }, [state.orders, annualTarget]);

  function openAction(type, row = selected) {
    if (!row) return;
    setSelectedPharmacyId(row.pharmacyId);
    setActionDraft({ type, row });
  }

  async function handleHubSpotSync() {
    if (hubspotSyncing) return;
    setHubspotSyncing(true);
    setHubspotNotice('');
    const result = await syncHubSpotPrivateApp();
    if (result.error) {
      setHubspotNotice(`HubSpot : ${result.error}`);
      setHubspotSyncing(false);
      return;
    }
    await onReload?.();
    const companies = result.data?.companies?.fetched;
    const deals = result.data?.deals?.fetched;
    setHubspotNotice(`HubSpot synchronisé : ${companies ?? 0} pharmacies · ${deals ?? 0} transactions.`);
    setHubspotSyncing(false);
  }

  async function handleHubSpotLineItemsSync() {
    if (hubspotLineItemsSyncing) return;
    setHubspotLineItemsSyncing(true);
    setHubspotNotice('');
    const result = await syncHubSpotLineItems();
    if (result.error) {
      setHubspotNotice(`HubSpot lignes : ${result.error}`);
      setHubspotLineItemsSyncing(false);
      return;
    }
    await onReload?.();
    setHubspotNotice(`Lignes HubSpot : ${result.data?.importedLineItems ?? 0} ligne(s) importée(s) sur ${result.data?.checkedOrders ?? 0} commande(s) vérifiée(s).`);
    setHubspotLineItemsSyncing(false);
  }

  async function handleConnectGoogle() {
    if (googleConnecting) return;
    setGoogleConnecting(true);
    setGoogleNotice('');
    setGoogleNeedsReconnect(false);
    const result = await connectIntegration('google');
    if (result.error) {
      setGoogleNotice(`Google Agenda : ${result.error}`);
      setGoogleConnecting(false);
    }
  }

  async function handleSyncGoogleCalendar() {
    if (googleSyncing) return;
    setGoogleSyncing(true);
    setGoogleNotice('');
    const result = await syncGoogleCalendar();
    if (result.error) {
      setGoogleNotice(`Google Agenda : ${result.error}`);
      if (String(result.error).toLowerCase().includes('refresh token absent')) {
        setGoogleNeedsReconnect(true);
      }
      setGoogleSyncing(false);
      return;
    }
    await onReload?.();
    setGoogleNotice(`Google Agenda synchronisé : ${result.data?.imported ?? 0} rendez-vous importé(s).`);
    setGoogleSyncing(false);
  }

  async function handleGeocodePharmacies() {
    if (geocoding) return;
    setGeocoding(true);
    setGeocodingNotice('');
    const result = await geocodeAgentPharmacies();
    if (result.error) {
      setGeocodingNotice(`Géocodage : ${result.error}`);
      setGeocoding(false);
      return;
    }
    await onReload?.();
    const data = result.data || {};
    setGeocodingNotice(`Géocodage terminé : ${data.geocoded || 0} précises · ${data.approximate || 0} approximatives · ${data.errors || 0} erreurs.`);
    setGeocoding(false);
  }

  return (
    <main className="agent-zero">
      <header className="agent-zero-brandbar">
        <div className="agent-zero-brand">
          <span>✚</span>
          <strong>PharmaBiz</strong>
          <em>Espace agent</em>
        </div>
        <button onClick={onSignOut} type="button">Se déconnecter</button>
      </header>

      <aside className="agent-zero-rail" aria-label="Navigation agent">
        <button className="agent-zero-mark" type="button" aria-label="PharmaBiz">✚</button>
        <nav>
          {NAV_ITEMS.map(([key, icon, label]) => (
            <button className={activeView === key ? 'is-active' : ''} key={key} onClick={() => setActiveView(key)} type="button">
              <span>{icon}</span><strong>{label}</strong>
            </button>
          ))}
        </nav>
        <div className="agent-zero-rail-footer">
          <div>{String(name || 'AO').slice(0, 2).toUpperCase()}</div>
        </div>
      </aside>

      <section className="agent-zero-shell">

        {hubspotNotice && (
          <div className="agent-zero-alert agent-zero-alert-info" role="status">
            <span>{hubspotNotice}</span>
            <button onClick={() => setHubspotNotice('')} type="button">×</button>
          </div>
        )}

        {googleNotice && (
          <div className="agent-zero-alert agent-zero-alert-info" role="status">
            <span>{googleNotice}</span>
            <button onClick={() => setGoogleNotice('')} type="button">×</button>
          </div>
        )}

        {geocodingNotice && (
          <div className="agent-zero-alert agent-zero-alert-info" role="status">
            <span>{geocodingNotice}</span>
            <button onClick={() => setGeocodingNotice('')} type="button">×</button>
          </div>
        )}

        {error && (
          <div className="agent-zero-alert" role="alert">
            <span>{error}</span>
            <button onClick={onClearError} type="button">×</button>
          </div>
        )}

        <section className={`agent-zero-workbench ${activeView === 'today' ? 'is-day' : ''}`}>
          {activeView === 'today' ? (
            <TodayView
              activeClients={activeClients}
              calendarEvents={state.calendarEvents || []}
              geocoding={geocoding}
              googleConnecting={googleConnecting}
              googleConnection={(state.integrationConnections || []).find((connection) => connection.provider === 'google')}
              googleNeedsReconnect={googleNeedsReconnect}
              googleSyncing={googleSyncing}
              implantation={productDistribution.rateLabel}
              items={todayItems}
              kpis={agentKpis}
              onAction={openAction}
              onConnectGoogle={handleConnectGoogle}
              onGeocode={handleGeocodePharmacies}
              onSyncGoogleCalendar={handleSyncGoogleCalendar}
              openOrders={openOrders}
              orderTotal={orderMetrics.total}
              productDistribution={productDistribution}
              rows={rows}
              selected={selected}
              urgentCount={urgentCount}
              userName={name}
            />
          ) : (
            <>
              <div className={`agent-zero-main-grid${activeView !== 'today' ? ' is-full' : ''}`}>
                <section className="agent-zero-panel agent-zero-panel-large">
              {activeView === 'portfolio' && <PortfolioView activeDepartment={activeDepartment} departments={departments} geocoding={geocoding} onAction={openAction} onGeocode={handleGeocodePharmacies} productDistribution={productDistribution} query={query} rows={filteredRows} selected={selected} setActiveDepartment={setActiveDepartment} setQuery={setQuery} setSelectedPharmacyId={setSelectedPharmacyId} totalRows={rows.length} />}

              {activeView === 'results' && <ResultsView kpis={agentKpis} missions={state.missions || []} onAction={openAction} onCreateMission={onCreateMission} orders={state.orders || []} products={state.products || []} rows={rows} selected={selected} />}
              {activeView === 'settings' && <SettingsView annualTarget={annualTarget} geocoding={geocoding} geocodingNotice={geocodingNotice} googleConnecting={googleConnecting} googleConnection={(state.integrationConnections || []).find((c) => c.provider === 'google')} googleNeedsReconnect={googleNeedsReconnect} googleNotice={googleNotice} googleSyncing={googleSyncing} hubspotLineItemsSyncing={hubspotLineItemsSyncing} hubspotNotice={hubspotNotice} hubspotSyncing={hubspotSyncing} lastSyncedAt={lastSyncedAt} onAnnualTargetChange={(v) => { setAnnualTarget(v); localStorage.setItem('az_annual_target', String(v)); }} onConnectGoogle={handleConnectGoogle} onGeocode={handleGeocodePharmacies} onHubSpotLineItemsSync={handleHubSpotLineItemsSync} onHubSpotSync={handleHubSpotSync} onReload={onReload} onSignOut={onSignOut} profile={state.profile} />}
                </section>

                {activeView === 'today' && (
                  <aside className="agent-zero-panel agent-zero-detail">
                    <PharmacyDetail onAction={openAction} productDistribution={productDistribution} selected={selected} selectedProductDistribution={selectedProductDistribution} />
                  </aside>
                )}
              </div>
            </>
          )}
        </section>
      </section>

      {selected && (
        <div className="agent-zero-mobile-quick" aria-label={`Actions rapides ${selected.name}`}>
          <div>
            <span>{selected.city} · Dpt {selected.department}</span>
            <strong>{selected.name}</strong>
          </div>
          {buildTelUrl(selected.phone) ? <a href={buildTelUrl(selected.phone)}>Tel</a> : <button onClick={() => openAction('call', selected)} type="button">Appel</button>}
          <button onClick={() => openAction('visit', selected)} type="button">Visite</button>
          <a href={buildMapsUrl(selected)} rel="noreferrer" target="_blank">Plan</a>
          <button onClick={() => openAction('order', selected)} type="button">Cmd</button>
        </div>
      )}

      {actionDraft && (
        <ActionDrawer
          action={actionDraft}
          googleConnected={(state.integrationConnections || []).some((connection) => connection.provider === 'google' && connection.status === 'connected')}
          onClose={() => setActionDraft(null)}
          onCreateActivity={onCreateActivity}
          onCreateFollowUp={onCreateFollowUp}
          onCreateOrderDraft={onCreateOrderDraft}
          products={state.products || []}
        />
      )}

      <AgentChat context={{
        agentName: name,
        date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        totalPharmacies: rows.length,
        totalRevenue: rows.reduce((sum, r) => sum + (r.revenue || 0), 0),
        dnRate: productDistribution?.rateLabel || 'N/A',
        urgentCount,
        pharmacies: rows.map((r) => ({
          name: r.name,
          city: r.city,
          dn: r.distributionRate || null,
          lastOrder: r.memory?.lastOrderAt || null,
          daysSinceOrder: r.memory?.lastOrderAt ? Math.floor((Date.now() - new Date(r.memory.lastOrderAt).getTime()) / 86400000) : null,
          priority: r.priority || null,
          revenue: r.revenue || null,
          action: r.signal?.action || 'A traiter',
        })),
      }} />
    </main>
  );
}

function AgentChat({ context }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const send = useCallback(async (text) => {
    const userMessage = text.trim();
    if (!userMessage || loading) return;
    const next = [...messages, { role: 'user', content: userMessage }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setTimeout(scrollToBottom, 50);

    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: { messages: next, context },
    });

    setLoading(false);
    if (error || !data?.reply) {
      setMessages((prev) => [...prev, { role: 'assistant', content: error?.message || 'Erreur de connexion au service IA.' }]);
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    }
    setTimeout(scrollToBottom, 50);
  }, [context, loading, messages, scrollToBottom]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }, [input, send]);

  return (
    <>
      <button
        aria-label="Assistant IA"
        className={`agent-chat-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <svg className="agent-chat-robot" fill="none" height="100" viewBox="0 0 56 92" width="64" xmlns="http://www.w3.org/2000/svg">
          {/* === ANTENNAS === */}
          <g className="agent-robot-antenna">
            <line stroke="#E86A2A" strokeLinecap="round" strokeWidth="2" x1="19" x2="19" y1="4" y2="12" />
            <circle cx="19" cy="3" fill="#FFD700" r="3" stroke="#C04E10" strokeWidth="1" />
          </g>
          <line stroke="#E86A2A" strokeLinecap="round" strokeWidth="2" x1="37" x2="37" y1="4" y2="12" />
          <circle cx="37" cy="3" fill="#FFD700" r="3" stroke="#C04E10" strokeWidth="1" />

          {/* === HEAD === */}
          {/* Head shadow facets */}
          <polygon fill="#C04E10" points="10,14 46,14 46,34 42,36 14,36 10,34" />
          {/* Head main */}
          <rect fill="#E86A2A" height="22" rx="5" width="36" x="10" y="12" />
          {/* Head top highlight */}
          <polygon fill="#F5892A" points="14,12 42,12 40,16 16,16" opacity="0.7" />
          {/* Ear left */}
          <circle cx="10" cy="23" fill="#C04E10" r="5" />
          <circle cx="10" cy="23" fill="#E86A2A" r="3.5" />
          {/* Ear right */}
          <circle cx="46" cy="23" fill="#C04E10" r="5" />
          <circle cx="46" cy="23" fill="#E86A2A" r="3.5" />
          {/* Eye left */}
          <circle className="agent-robot-eye" cx="21" cy="21" fill="#111" r="6" />
          <circle cx="21" cy="21" fill="#00FFCC" r="4.5" />
          <circle cx="21" cy="21" fill="#00cc99" r="2" />
          <circle cx="19.5" cy="19.5" fill="white" r="1.2" />
          {/* Eye right */}
          <circle className="agent-robot-eye" cx="35" cy="21" fill="#111" r="6" />
          <circle cx="35" cy="21" fill="#00FFCC" r="4.5" />
          <circle cx="35" cy="21" fill="#00cc99" r="2" />
          <circle cx="33.5" cy="19.5" fill="white" r="1.2" />
          {/* Mouth */}
          <rect fill="#C04E10" height="5" rx="1.5" width="24" x="16" y="29" />
          <rect fill="#1a0a00" height="3" rx="1" width="20" x="18" y="30" />
          <rect fill="#E86A2A" height="3" rx="0.5" width="4" x="19" y="30" />
          <rect fill="#E86A2A" height="3" rx="0.5" width="4" x="25" y="30" />
          <rect fill="#E86A2A" height="3" rx="0.5" width="4" x="31" y="30" />

          {/* === NECK === */}
          <rect fill="#C04E10" height="4" rx="2" width="10" x="23" y="34" />

          {/* === TORSO === */}
          {/* Torso shadow */}
          <polygon fill="#C04E10" points="8,38 48,38 50,62 6,62" />
          {/* Torso main */}
          <rect fill="#E86A2A" height="24" rx="3" width="38" x="9" y="38" />
          {/* Torso top highlight */}
          <polygon fill="#F5892A" opacity="0.5" points="12,38 44,38 43,42 13,42" />
          {/* Control panel */}
          <rect fill="#C04E10" height="12" rx="2" width="28" x="14" y="43" />
          <rect fill="#1a0a00" height="9" rx="1.5" width="24" x="16" y="44.5" />
          <circle cx="21" cy="49" fill="#E86A2A" r="3" />
          <circle cx="28" cy="49" fill="#E86A2A" r="3" />
          <circle cx="35" cy="49" fill="#E86A2A" r="3" />

          {/* === ARMS === */}
          {/* Left upper arm */}
          <rect fill="#C04E10" height="13" rx="3" width="9" x="0" y="38" />
          <rect fill="#E86A2A" height="13" rx="3" width="8" x="0.5" y="38" />
          {/* Left forearm */}
          <rect fill="#C04E10" height="11" rx="2" width="8" x="0.5" y="52" />
          <rect fill="#E86A2A" height="10" rx="2" width="7" x="1" y="52.5" />
          {/* Left hand */}
          <rect fill="#C04E10" height="6" rx="3" width="10" x="-0.5" y="62" />
          <rect fill="#E86A2A" height="5" rx="2.5" width="9" x="0" y="62.5" />

          {/* Right upper arm */}
          <rect fill="#C04E10" height="13" rx="3" width="9" x="47" y="38" />
          <rect fill="#E86A2A" height="13" rx="3" width="8" x="47.5" y="38" />
          {/* Right forearm */}
          <rect fill="#C04E10" height="11" rx="2" width="8" x="47.5" y="52" />
          <rect fill="#E86A2A" height="10" rx="2" width="7" x="48" y="52.5" />
          {/* Right hand */}
          <rect fill="#C04E10" height="6" rx="3" width="10" x="46.5" y="62" />
          <rect fill="#E86A2A" height="5" rx="2.5" width="9" x="47" y="62.5" />

          {/* === HIPS === */}
          <rect fill="#C04E10" height="5" rx="2" width="32" x="12" y="62" />
          <rect fill="#E86A2A" height="4" rx="2" width="30" x="13" y="62" />

          {/* === LEGS === */}
          {/* Left thigh */}
          <rect fill="#C04E10" height="12" rx="3" width="13" x="12" y="67" />
          <rect fill="#E86A2A" height="12" rx="3" width="12" x="12.5" y="67" />
          {/* Left knee */}
          <rect fill="#C04E10" height="4" rx="2" width="14" x="11.5" y="78" />
          <rect fill="#F5892A" height="3" rx="2" width="12" x="12.5" y="79" />
          {/* Left shin */}
          <rect fill="#C04E10" height="10" rx="2" width="12" x="12.5" y="81" />
          <rect fill="#E86A2A" height="10" rx="2" width="11" x="13" y="81" />

          {/* Right thigh */}
          <rect fill="#C04E10" height="12" rx="3" width="13" x="31" y="67" />
          <rect fill="#E86A2A" height="12" rx="3" width="12" x="31.5" y="67" />
          {/* Right knee */}
          <rect fill="#C04E10" height="4" rx="2" width="14" x="30.5" y="78" />
          <rect fill="#F5892A" height="3" rx="2" width="12" x="31.5" y="79" />
          {/* Right shin */}
          <rect fill="#C04E10" height="10" rx="2" width="12" x="31.5" y="81" />
          <rect fill="#E86A2A" height="10" rx="2" width="11" x="32" y="81" />

          {/* === FEET === */}
          <rect fill="#C04E10" height="6" rx="2" width="16" x="9" y="85" />
          <rect fill="#E86A2A" height="5" rx="1.5" width="15" x="9.5" y="85.5" />
          <rect fill="#C04E10" height="6" rx="2" width="16" x="31" y="85" />
          <rect fill="#E86A2A" height="5" rx="1.5" width="15" x="31.5" y="85.5" />
        </svg>
      </button>

      {open && (
        <div className="agent-chat-panel">
          <header className="agent-chat-header">
            <div>
              <strong>Assistant terrain</strong>
              <span>GPT-4o · {context.totalPharmacies} pharmacies chargées</span>
            </div>
            <button onClick={() => setOpen(false)} type="button">×</button>
          </header>

          <div className="agent-chat-messages">
            {messages.length === 0 && (
              <div className="agent-chat-welcome">
                <p>Bonjour {context.agentName?.split(' ')[0] || 'Agent'} — pose-moi n&apos;importe quelle question sur ton portefeuille.</p>
                <div className="agent-chat-suggestions">
                  {['Quelles pharmacies relancer en priorité ?', 'Analyse mon portefeuille DN', 'Top 3 opportunités réassort'].map((s) => (
                    <button key={s} onClick={() => send(s)} type="button">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div className={`agent-chat-msg ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`} key={i}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="agent-chat-msg is-assistant is-loading">
                <span /><span /><span />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="agent-chat-input">
            <textarea
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Pose ta question..."
              rows={1}
              value={input}
            />
            <button disabled={loading || !input.trim()} onClick={() => send(input)} type="button">→</button>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, note, tone, value }) {
  return <article className={`agent-zero-metric ${tone ? `is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function PriorityFeed({ decisions, onAction, suggestions }) {
  const scrollRef = useRef(null);
  const items = decisions.length ? decisions : suggestions;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length <= 2) return;
    const step = () => {
      if (!el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        el.scrollTop = 0;
      } else {
        el.scrollTop += 1;
      }
    };
    const interval = setInterval(step, 60);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items.length) {
    return <div className="agent-zero-empty-state"><p>Aucune tâche planifiée. Crée une relance ou une visite pour alimenter les priorités.</p></div>;
  }

  return (
    <div className="agent-zero-priority-feed" ref={scrollRef}>
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => item.row && onAction(item.kind === 'task' ? 'followup' : 'visit', item.row)}
          type="button"
        >
          <em>{isOverdue(item.due) ? 'En retard' : item.kind === 'suggestion' ? 'Suggestion' : index === 0 ? 'Priorité' : 'À traiter'}</em>
          <span><strong>{item.row?.name || cleanTitle(item.title)}</strong><small>{item.reason || item.meta}</small></span>
          <b>→</b>
        </button>
      ))}
    </div>
  );
}

function TodayView({ activeClients, calendarEvents, geocoding, googleConnecting, googleConnection, googleNeedsReconnect, googleSyncing, implantation, items, kpis, onAction, onConnectGoogle, onGeocode, onSyncGoogleCalendar, openOrders, orderTotal, productDistribution, rows, selected, urgentCount, userName }) {
  const calendarItems = useMemo(() => buildCalendarItems(calendarEvents, rows), [calendarEvents, rows]);
  const plannedItems = useMemo(() => {
    const calendarPharmacyIds = new Set(calendarItems.map((item) => item.row?.pharmacyId).filter(Boolean));
    const deduplicatedActivities = items.filter((item) => item.kind === 'activity' && !calendarPharmacyIds.has(item.row?.pharmacyId));
    return [...calendarItems, ...deduplicatedActivities]
      .filter((item) => item.startDate)
      .sort((first, second) => first.startDate - second.startDate);
  }, [calendarItems, items]);
  const nextAppointmentItem = plannedItems.find((item) => item.startDate >= new Date()) || plannedItems[0] || null;
  const priority = nextAppointmentItem?.row || selected || rows[0] || null;
  const todayLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());
  const hasScheduledAppointment = plannedItems.length > 0;
  const decisions = items.filter((item) => item.kind === 'task' || item.kind === 'activity').slice(0, 3);
  const suggestions = items.filter((item) => item.kind === 'suggestion').slice(0, 3);
  const agendaConnected = googleConnection?.status === 'connected' && !googleNeedsReconnect;
  const agendaRequiresReconnect = googleConnection?.status === 'connected' && googleNeedsReconnect;
  const routeSuggestion = buildRouteSuggestion(rows, priority);
  const routeDistance = routeSuggestion?.distanceKm;
  const geoReadyCount = rows.filter((row) => projectGeoPoint(row.latitude, row.longitude)).length;
  const briefing = buildBusinessBriefing(priority, productDistribution);
  const routeReason = routeSuggestion
    ? [
      routeSuggestion.sameDepartment ? `même département ${routeSuggestion.row.department}` : null,
      routeDistance !== null ? `${Math.round(routeDistance)} km estimés` : null,
      routeSuggestion.row.signal?.action ? `action : ${routeSuggestion.row.signal.action}` : null,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="agent-zero-day">
      <div className="agent-zero-day-heading">
        <div className="agent-zero-day-actions">
          <button disabled={!priority} onClick={() => onAction('followup', priority)} type="button">+ Relance</button>
          <button disabled={!priority} onClick={() => onAction('visit', priority)} type="button">+ Visite</button>
          <button disabled={!priority} onClick={() => onAction('order', priority)} type="button">+ Commande</button>
        </div>
      </div>

      <div className="agent-zero-day-kpis">
        <div>
          <span>CA YTD</span>
          <strong>{formatMoney(kpis?.ytdRevenue ?? 0)}</strong>
          <small>{new Date().getFullYear()}</small>
        </div>
        <div>
          <span>R/O</span>
          <strong>{kpis?.roRatio !== null && kpis?.roRatio !== undefined ? `${Math.round(kpis.roRatio * 100)} %` : '—'}</strong>
          <small>de l&apos;objectif</small>
        </div>
        <div>
          <span>Com. versées</span>
          <strong>{formatMoney(kpis?.commissionVersee ?? 0)}</strong>
          <small>payé · 20% impl. 15% réassort</small>
        </div>
        <div>
          <span>Com. attendues</span>
          <strong>{formatMoney(kpis?.commissionAttendue ?? 0)}</strong>
          <small>toutes commandes YTD</small>
        </div>
        <div>
          <span>Implantation</span>
          <strong>{implantation || '—'}</strong>
          <small>DN produit portefeuille</small>
        </div>
      </div>

      <div className="agent-zero-day-grid">
        <section className="agent-zero-next-card">
          <div>
            <span>{nextAppointmentItem ? 'Prochain rendez-vous' : 'Priorité terrain'}</span>
            <h2>{nextAppointmentItem?.row?.name || cleanTitle(nextAppointmentItem?.title) || priority?.name || 'Aucune pharmacie priorisée'}</h2>
            <p>{nextAppointmentItem ? nextAppointmentItem.meta : priority ? `${priority.city} · ${priority.signal.action}` : 'Charge ton portefeuille pour préparer la journée.'}</p>
          </div>
          <strong>{nextAppointmentItem?.time || (agendaConnected ? 'Agenda vide' : 'Sans agenda')}</strong>
          <div className="agent-zero-briefing">
            <b>✦</b>
            <div>
              <strong>Briefing recommandé</strong>
              {briefing ? (
                <div className="agent-zero-briefing-business">
                  <span><small>CA YTD</small><em>{formatMoney(briefing.ytdRevenue)}</em></span>
                  <span><small>Croissance</small><em>{briefing.growthLabel}</em></span>
                  <span><small>DN produit</small><em>{briefing.distributionRate}</em></span>
                  <p><strong>Top 3</strong>{briefing.topProducts.length ? briefing.topProducts.join(' · ') : 'Aucun produit commandé identifié'}</p>
                  <p><strong>Manquants</strong>{briefing.missingProducts.length ? briefing.missingProducts.join(' · ') : 'Aucun manque prioritaire détecté'}</p>
                </div>
              ) : <p>Sélectionne une pharmacie pour générer le briefing terrain.</p>}
            </div>
          </div>
          <div className="agent-zero-hero-actions">
            <button disabled={!priority} onClick={() => onAction('visit', priority)} type="button">Préparer la visite</button>
            <button disabled={!priority} onClick={() => onAction('call', priority)} type="button">Appeler</button>
            {priority && <a href={buildMapsUrl(priority)} rel="noreferrer" target="_blank">Itinéraire</a>}
            <button disabled={!priority} onClick={() => onAction('order', priority)} type="button">Préparer commande</button>
          </div>
        </section>

        <div className="agent-zero-day-sidebar">
        <section className="agent-zero-planning-card">
          <header>
            <div><span>Planning terrain</span><h2>Ma journée</h2></div>
            {agendaConnected
              ? <button disabled={googleSyncing} onClick={onSyncGoogleCalendar} type="button">{googleSyncing ? 'Sync…' : 'Sync agenda'}</button>
              : agendaRequiresReconnect
                ? <button disabled={googleConnecting} onClick={onConnectGoogle} type="button">{googleConnecting ? 'Connexion…' : 'Reconnecter'}</button>
              : <button disabled title="Connecte Google Agenda pour synchroniser les rendez-vous" type="button">Optimiser</button>}
          </header>
          {!hasScheduledAppointment && (
            <article className="agent-zero-calendar-state">
              <strong>Agenda</strong>
              <i className={agendaConnected ? 'is-blue' : 'is-orange'} />
              <div>
                <b>{agendaRequiresReconnect ? "Google Agenda à reconnecter" : agendaConnected ? "Aucun rendez-vous aujourd'hui" : "Google Agenda non connecté"}</b>
                <small>{agendaRequiresReconnect ? 'Google doit redonner une autorisation longue durée pour synchroniser automatiquement.' : agendaConnected ? 'Les prochains rendez-vous synchronisés apparaîtront ici.' : 'Connecte Google Calendar pour afficher uniquement de vrais rendez-vous.'}</small>
              </div>
              {agendaConnected
                ? <button className="agent-zero-calendar-connect" disabled={googleSyncing} onClick={onSyncGoogleCalendar} type="button">{googleSyncing ? 'Sync…' : 'Sync agenda'}</button>
                : agendaRequiresReconnect
                  ? <button className="agent-zero-calendar-connect" disabled={googleConnecting} onClick={onConnectGoogle} type="button">{googleConnecting ? 'Connexion…' : 'Reconnecter'}</button>
                : <button className="agent-zero-calendar-connect" disabled={googleConnecting} onClick={onConnectGoogle} type="button">{googleConnecting ? 'Connexion…' : 'Connecter'}</button>}
            </article>
          )}
          <div>
            {plannedItems.map((item, index) => (
              <article className={item.kind === 'activity' && item.type === 'visit' ? 'is-planned-visit' : ''} key={item.id}>
                <strong>{item.time || (item.due ? formatDate(item.due) : 'À planifier')}</strong>
                <i className={index === 1 ? 'is-orange' : index === 2 ? 'is-blue' : ''} />
                <div><b>{item.row?.name || cleanTitle(item.title)}</b><small>{item.meta}</small></div>
                {item.row && (
                  <div className="agent-zero-item-actions">
                    <button onClick={() => onAction('report', item.row)} type="button">CR</button>
                    <button onClick={() => onAction('order', item.row)} type="button">Cmd</button>
                    <button onClick={() => onAction('visit', item.row)} type="button">+RDV</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <aside className="agent-zero-decisions-card">
          <header><div><span>Décisions</span><h2>Priorités immédiates</h2></div><b>{decisions.length || suggestions.length || urgentCount}</b></header>
          <PriorityFeed decisions={decisions} onAction={onAction} suggestions={suggestions} />
        </aside>

        <aside className="agent-zero-route-card">
          <span>Sur ton trajet · GPS {geoReadyCount}/{rows.length}</span>
          <h2>{routeSuggestion?.row?.name || 'Aucune suggestion fiable'}</h2>
          <p>{routeSuggestion ? `${routeSuggestion.row.city} · ${routeReason}` : 'Ajoute des coordonnées ou une adresse fiable aux pharmacies pour proposer un détour pertinent.'}</p>
          {routeSuggestion?.row
            ? <div className="agent-zero-route-actions"><a href={buildMapsUrl(routeSuggestion.row)} rel="noreferrer" target="_blank">Itinéraire</a><button onClick={() => onAction('visit', routeSuggestion.row)} type="button">Ajouter à la tournée</button><button disabled={geocoding} onClick={onGeocode} type="button">{geocoding ? 'Géocodage…' : 'Affiner GPS'}</button></div>
            : <div className="agent-zero-route-actions"><button disabled type="button">Suggestion indisponible</button><button disabled={geocoding} onClick={onGeocode} type="button">{geocoding ? 'Géocodage…' : 'Géocoder portefeuille'}</button></div>}
        </aside>
        </div>

      </div>

    </div>
  );
}

const MISSION_TYPES = [
  ['animation', 'Animation'],
  ['formation', 'Formation'],
  ['implantation', 'Implantation'],
  ['merchandising', 'Merchandising'],
  ['sell_out', 'Sell-out'],
  ['other', 'Autre'],
];

const MISSION_STATUS_LABELS = {
  draft: 'Brouillon',
  requested: 'Demandée',
  qualified: 'Qualifiée',
  proposed: 'Proposée',
  accepted: 'Acceptée',
  assigned: 'Assignée',
  confirmed: 'Confirmée',
  scheduled: 'Planifiée',
  in_progress: 'En cours',
  report_submitted: 'CR soumis',
  under_review: 'En révision',
  completed: 'Terminée',
  validated: 'Validée',
  payable: 'Facturable',
  paid: 'Payée',
  refused: 'Refusée',
  cancelled: 'Annulée',
};

const MISSION_STATUS_COLORS = {
  draft: '#aaa',
  requested: '#f59e0b',
  qualified: '#3b82f6',
  proposed: '#f59e0b',
  accepted: '#3b82f6',
  assigned: '#3b82f6',
  confirmed: '#3b82f6',
  scheduled: '#3b82f6',
  in_progress: '#3b82f6',
  report_submitted: '#f97316',
  under_review: '#f97316',
  completed: '#10b981',
  validated: '#10b981',
  payable: '#f97316',
  paid: '#10b981',
  refused: '#ef4444',
  cancelled: '#6b7280',
};

function MissionsTab({ missions, onCreateMission, rows }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ pharmacyId: '', type: '', title: '', plannedDate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.pharmacyId || !form.type) {
      setFormError('Pharmacie et type sont obligatoires.');
      return;
    }
    setSaving(true);
    setFormError('');
    const typeLabel = MISSION_TYPES.find(([k]) => k === form.type)?.[1] || form.type;
    const result = await onCreateMission?.({
      pharmacyId: form.pharmacyId,
      type: form.type,
      title: form.title || typeLabel,
      plannedDate: form.plannedDate || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (result?.error) {
      setFormError(result.error);
      return;
    }
    setNotice('Mission créée avec statut Brouillon. La marque devra la valider.');
    setShowForm(false);
    setForm({ pharmacyId: '', type: '', title: '', plannedDate: '', notes: '' });
    setTimeout(() => setNotice(''), 4000);
  }

  return (
    <div>
      <div className="agent-zero-mission-header">
        <div>
          <strong>{missions.length} mission{missions.length !== 1 ? 's' : ''}</strong>
          <small>Animation · formation · implantation · audit</small>
        </div>
        <button className="agent-zero-mission-create-btn" onClick={() => { setShowForm((v) => !v); setFormError(''); }} type="button">
          {showForm ? 'Annuler' : '+ Créer une mission'}
        </button>
      </div>

      {notice && (
        <div className="agent-zero-alert agent-zero-alert-info" role="status" style={{ margin: '0 0 0 0' }}>
          <span>{notice}</span>
          <button onClick={() => setNotice('')} type="button">×</button>
        </div>
      )}

      {showForm && (
        <form className="agent-zero-mission-form" onSubmit={handleSubmit}>
          <div className="agent-zero-mission-form-grid">
            <label>
              <span>Pharmacie *</span>
              <select onChange={(e) => updateForm('pharmacyId', e.target.value)} value={form.pharmacyId}>
                <option value="">Sélectionner...</option>
                {rows.map((row) => (
                  <option key={row.pharmacyId} value={row.pharmacyId}>{row.name} — {row.city}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Type de mission *</span>
              <select onChange={(e) => updateForm('type', e.target.value)} value={form.type}>
                <option value="">Sélectionner...</option>
                {MISSION_TYPES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Titre (optionnel)</span>
              <input
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="Ex : Animation Xémose — Pharmacie Martin"
                type="text"
                value={form.title}
              />
            </label>
            <label>
              <span>Date prévue</span>
              <input
                onChange={(e) => updateForm('plannedDate', e.target.value)}
                type="date"
                value={form.plannedDate}
              />
            </label>
          </div>
          <label>
            <span>Notes</span>
            <textarea
              onChange={(e) => updateForm('notes', e.target.value)}
              placeholder="Contexte, objectifs, produits concernés, demande spécifique..."
              rows={3}
              value={form.notes}
            />
          </label>
          {formError && <p className="agent-zero-mission-form-error">{formError}</p>}
          <div className="agent-zero-mission-form-info">
            La mission sera créée en statut <strong>Brouillon</strong> et devra être validée par la marque avant attribution à un animateur.
          </div>
          <button className="agent-zero-mission-submit" disabled={saving} type="submit">
            {saving ? "Enregistrement..." : "Créer la mission"}
          </button>
        </form>
      )}

      <div className="agent-zero-mission-list">
        {missions.length === 0 && !showForm && (
          <p className="agent-zero-mission-empty">
            Aucune mission pour le moment. Crée une mission pour déclencher une animation ou une formation dans une de tes pharmacies.
          </p>
        )}
        {missions.map((mission) => (
          <div className="agent-zero-mission-row" key={mission.id}>
            <div className="agent-zero-mission-row-main">
              <strong>{mission.title || formatLabel(mission.type || '')}</strong>
              <small>
                {mission.pharmacies?.name || '—'}
                {mission.pharmacies?.city ? ` · ${mission.pharmacies.city}` : ''}
                {mission.planned_date ? ` · ${formatDate(mission.planned_date)}` : ' · Date à définir'}
              </small>
              {mission.notes && <p className="agent-zero-mission-notes">{mission.notes}</p>}
            </div>
            <div className="agent-zero-mission-row-meta">
              <em className="agent-zero-mission-type-badge">{MISSION_TYPES.find(([k]) => k === mission.type)?.[1] || mission.type || '—'}</em>
              <span
                className="agent-zero-mission-status-badge"
                style={{ background: MISSION_STATUS_COLORS[mission.status] || '#aaa' }}
              >
                {MISSION_STATUS_LABELS[mission.status] || mission.status || 'Brouillon'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsView({ kpis, missions, onAction, onCreateMission, orders, rows }) {
  const [tab, setTab] = useState('orders');
  const tabs = [
    ['orders', 'Commandes'],
    ['commissions', 'Commissions'],
    ['missions', 'Missions'],
  ];

  const paidStatuses = ['paid', 'approved', 'to_invoice', 'invoiced'];
  const commissionRows = orders.map((order) => {
    const rate = order.order_type === 'implantation' ? 0.20 : 0.15;
    const base = Number(order.total_ttc || order.total_ht || 0);
    return { ...order, commissionRate: rate, commissionAmount: base * rate };
  });
  const totalCommVersee = commissionRows.filter((o) => paidStatuses.includes(o.status)).reduce((s, o) => s + o.commissionAmount, 0);
  const totalCommAttendue = commissionRows.reduce((s, o) => s + o.commissionAmount, 0);

  return (
    <div className="agent-zero-view">
      <Header eyebrow="Résultats" title="Suivi commercial" text="Missions terrain, commandes et commissions dans un seul espace." />
      <div className="agent-zero-results-tabs">
        {tabs.map(([key, label]) => (
          <button className={tab === key ? 'is-active' : ''} key={key} onClick={() => setTab(key)} type="button">{label}</button>
        ))}
      </div>

      {tab === 'orders' && (
        <div>
          <div className="agent-zero-table-head">
            <span>{orders.length} commandes</span>
            <span>Pharmacie · marque · montant · statut</span>
          </div>
          <div className="agent-zero-account-list">
            {orders.length === 0 && <p style={{ padding: '16px', color: 'var(--az-muted)', fontSize: 12 }}>Aucune commande dans le portefeuille.</p>}
            {orders.map((order) => (
              <button key={order.id} onClick={() => onAction && onAction('order-detail', order)} type="button">
                <div>
                  <strong>{order.pharmacy_name || order.pharmacy_id}</strong>
                  <small>{order.brand_name || ''} · {order.order_date ? formatDate(order.order_date) : '—'} · {formatLabel(order.order_type || '')}</small>
                </div>
                <span>{formatMoney(order.total_ttc || order.total_ht || 0)}</span>
                <em>{formatLabel(order.status)}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'commissions' && (
        <div>
          <div className="agent-zero-results-comm-summary">
            <div>
              <span>Com. versées</span>
              <strong>{formatMoney(kpis?.commissionVersee ?? totalCommVersee)}</strong>
              <small>commandes payées · approuvées</small>
            </div>
            <div>
              <span>Com. attendues</span>
              <strong>{formatMoney(kpis?.commissionAttendue ?? totalCommAttendue)}</strong>
              <small>toutes commandes YTD</small>
            </div>
            <div>
              <span>Taux moyen</span>
              <strong>20% impl. · 15% réassort</strong>
              <small>selon type de commande</small>
            </div>
          </div>
          <div className="agent-zero-table-head">
            <span>{commissionRows.length} lignes</span>
            <span>Pharmacie · commande · taux · commission · statut</span>
          </div>
          <div className="agent-zero-account-list">
            {commissionRows.length === 0 && <p style={{ padding: '16px', color: 'var(--az-muted)', fontSize: 12 }}>Aucune commission calculable.</p>}
            {commissionRows.map((order) => (
              <button key={order.id} type="button">
                <div>
                  <strong>{order.pharmacy_name || order.pharmacy_id}</strong>
                  <small>{order.brand_name || ''} · {order.order_date ? formatDate(order.order_date) : '—'} · {formatLabel(order.order_type || '')}</small>
                </div>
                <span>{Math.round(order.commissionRate * 100)}% → {formatMoney(order.commissionAmount)}</span>
                <em>{formatLabel(order.status)}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'missions' && (
        <MissionsTab missions={missions} onCreateMission={onCreateMission} rows={rows} />
      )}
    </div>
  );
}

function SettingsView({ annualTarget, geocoding, geocodingNotice, googleConnecting, googleConnection, googleNeedsReconnect, googleNotice, googleSyncing, hubspotLineItemsSyncing, hubspotNotice, hubspotSyncing, lastSyncedAt, onAnnualTargetChange, onConnectGoogle, onGeocode, onHubSpotLineItemsSync, onHubSpotSync, onReload, onSignOut, profile }) {
  const googleConnected = googleConnection?.status === 'connected' && !googleNeedsReconnect;
  const googleRequiresReconnect = googleConnection?.status === 'connected' && googleNeedsReconnect;
  return (
    <div className="agent-zero-view">
      <Header eyebrow="Réglages" title="Synchronisations & compte" text="Gère les connexions, les syncs de données et les informations de ton compte." />
      <div className="agent-zero-settings-grid">

        <section className="agent-zero-settings-block">
          <h3>Objectif commercial</h3>
          <p>Objectif CA annuel utilisé pour calculer le ratio R/O dans l&apos;onglet Jour. Commissions : 20% implantation · 15% réassort.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Objectif CA annuel (€)</span>
            <input
              min="0"
              onChange={(e) => onAnnualTargetChange(Number(e.target.value))}
              placeholder="ex: 300000"
              style={{ border: '2px solid var(--az-line)', padding: '5px 8px', fontFamily: 'inherit', fontSize: 12, width: '100%' }}
              type="number"
              value={annualTarget || ''}
            />
          </label>
        </section>

        <section className="agent-zero-settings-block">
          <h3>Données PharmaBiz</h3>
          <p>Dernière synchronisation : {lastSyncedAt ? formatDateTime(lastSyncedAt) : 'jamais'}</p>
          <button disabled={false} onClick={onReload} type="button">Synchroniser maintenant</button>
        </section>

        <section className="agent-zero-settings-block">
          <h3>HubSpot</h3>
          <p>Importe les pharmacies, contacts et deals depuis HubSpot CRM.</p>
          {hubspotNotice && <div className="agent-zero-settings-notice">{hubspotNotice}</div>}
          <div className="agent-zero-settings-actions">
            <button disabled={hubspotSyncing} onClick={onHubSpotSync} type="button">{hubspotSyncing ? 'Sync en cours…' : 'Sync HubSpot'}</button>
            <button disabled={hubspotLineItemsSyncing} onClick={onHubSpotLineItemsSync} type="button">{hubspotLineItemsSyncing ? 'Import en cours…' : 'Importer lignes HubSpot'}</button>
          </div>
        </section>

        <section className="agent-zero-settings-block">
          <h3>Google Agenda</h3>
          <p>{googleConnected ? 'Agenda connecté — les rendez-vous sont synchronisés automatiquement.' : googleRequiresReconnect ? 'Reconnexion requise — l\'autorisation a expiré.' : 'Connecte Google Agenda pour afficher tes RDV dans l\'onglet Jour.'}</p>
          {googleNotice && <div className="agent-zero-settings-notice">{googleNotice}</div>}
          <div className="agent-zero-settings-actions">
            {googleConnected
              ? <button disabled={googleSyncing} onClick={() => {}} type="button">{googleSyncing ? 'Sync…' : 'Sync agenda'}</button>
              : <button disabled={googleConnecting} onClick={onConnectGoogle} type="button">{googleConnecting ? 'Connexion…' : googleRequiresReconnect ? 'Reconnecter Google' : 'Connecter Google Agenda'}</button>}
          </div>
        </section>

        <section className="agent-zero-settings-block">
          <h3>GPS & géocodage</h3>
          <p>Calcule les coordonnées GPS des pharmacies à partir de leur adresse pour les fonctions de tournée et de carte.</p>
          {geocodingNotice && <div className="agent-zero-settings-notice">{geocodingNotice}</div>}
          <button disabled={geocoding} onClick={onGeocode} type="button">{geocoding ? 'Géocodage en cours…' : 'Géocoder le portefeuille'}</button>
        </section>

        <section className="agent-zero-settings-block">
          <h3>Compte</h3>
          <p>{profile?.full_name || 'Agent'} · {profile?.email || ''}</p>
          <button className="is-danger" onClick={onSignOut} type="button">Se déconnecter</button>
        </section>

      </div>
    </div>
  );
}

function PortfolioView({ activeDepartment, departments, geocoding, onAction, onGeocode, productDistribution, query, rows, selected, setActiveDepartment, setQuery, setSelectedPharmacyId, totalRows }) {
  const geoReadyCount = rows.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).length;
  const geoMissing = rows.length - geoReadyCount;
  const [sortCol, setSortCol] = useState('daysSince');
  const [sortDir, setSortDir] = useState('desc');

  const enrichedRows = useMemo(() => rows.map((row) => {
    const dn = productDistribution?.pharmacies?.get(row.pharmacyId);
    const lastOrderDate = row.memory?.lastOrderAt ? new Date(row.memory.lastOrderAt) : null;
    const daysSince = lastOrderDate ? Math.floor((Date.now() - lastOrderDate.getTime()) / 86400000) : null;
    return { ...row, caYtd: row.memory?.ytdRevenue || 0, caN1: row.memory?.previousYearRevenue || 0, dnRate: dn?.rate ?? null, dnLabel: dn?.rateLabel ?? '—', lastOrderDate, daysSince };
  }), [rows, productDistribution]);

  const sortedRows = useMemo(() => [...enrichedRows].sort((a, b) => {
    if (sortCol === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const vals = { caYtd: [a.caYtd, b.caYtd], caN1: [a.caN1, b.caN1], dn: [a.dnRate ?? -1, b.dnRate ?? -1], daysSince: [a.daysSince ?? 9999, b.daysSince ?? 9999] };
    const [va, vb] = vals[sortCol] || [0, 0];
    return sortDir === 'asc' ? va - vb : vb - va;
  }), [enrichedRows, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function SortBtn({ col, children }) {
    const active = sortCol === col;
    return (
      <button className={`az-th-btn${active ? ' is-active' : ''}`} onClick={() => toggleSort(col)} type="button">
        {children}<span className="az-sort-arrow">{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}</span>
      </button>
    );
  }

  function daysBadge(days) {
    if (days === null) return <span className="az-days-badge is-none">—</span>;
    if (days <= 45) return <span className="az-days-badge is-green">{days}j</span>;
    if (days <= 90) return <span className="az-days-badge is-orange">{days}j</span>;
    return <span className="az-days-badge is-red">{days}j</span>;
  }

  return (
    <div className="agent-zero-view">
      <div className="agent-zero-portfolio-topbar">
        <label className="agent-zero-search">
          <span>⌕</span>
          <input onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une pharmacie, une ville…" value={query} />
        </label>
        <div className="agent-zero-department-strip" aria-label="Filtrer par département">
          <button className={activeDepartment === 'all' ? 'is-active' : ''} onClick={() => setActiveDepartment('all')} type="button"><strong>Tous</strong><span>{totalRows}</span></button>
          {departments.map((item) => <button className={activeDepartment === item.department ? 'is-active' : ''} key={item.department} onClick={() => setActiveDepartment(item.department)} type="button"><strong>{item.department}</strong><span>{item.count}</span></button>)}
        </div>
      </div>

      <div className="agent-zero-portfolio-map-full">
        <div className="agent-zero-map-head">
          <div>
            <span>Portfolio terrain</span>
            <strong>{rows.length} pharmacies · GPS {geoReadyCount}/{rows.length}</strong>
          </div>
          <div className="agent-zero-map-legend">
            <span><i className="order-hot" /> &lt; 45j</span>
            <span><i className="order-warm" /> 45–90j</span>
            <span><i className="order-cold" /> &gt; 90j</span>
            <span><i className="order-none" /> Aucune commande</span>
          </div>
          <button className="agent-zero-geocode-btn" disabled={geocoding} onClick={onGeocode} type="button">
            {geocoding ? 'Géocodage en cours…' : geoMissing > 0 ? `Géocoder ${geoMissing} adresse${geoMissing > 1 ? 's' : ''}` : 'Actualiser GPS'}
          </button>
        </div>
        <PortfolioMap
          onAction={onAction}
          onSelectPharmacy={(row) => setSelectedPharmacyId(row.pharmacyId)}
          rows={rows}
          selectedPharmacyId={selected?.pharmacyId}
        />
      </div>

      <div className="az-portfolio-table-wrap">
        <div className="az-pg-head">
          <SortBtn col="name">Pharmacie</SortBtn>
          <SortBtn col="caYtd">CA YTD</SortBtn>
          <SortBtn col="caN1">CA N-1</SortBtn>
          <SortBtn col="dn">DN %</SortBtn>
          <span>Dernière commande</span>
          <SortBtn col="daysSince">Jours écoulés</SortBtn>
          <span>Signal</span>
        </div>
        {sortedRows.map((row) => (
          <div
            className={`az-pg-row${selected?.pharmacyId === row.pharmacyId ? ' is-selected' : ''}`}
            key={row.id}
            onClick={() => setSelectedPharmacyId(row.pharmacyId)}
          >
            <div className="az-pt-name">
              <strong>{row.name}</strong>
              <small>{row.city} · Dpt {row.department}</small>
            </div>
            <div className="az-pt-num">{row.caYtd > 0 ? formatMoney(row.caYtd) : <span className="az-muted">—</span>}</div>
            <div className="az-pt-num">{row.caN1 > 0 ? formatMoney(row.caN1) : <span className="az-muted">—</span>}</div>
            <div className="az-pt-num">{row.dnLabel}</div>
            <div className="az-pt-date">{row.lastOrderDate ? formatDate(row.lastOrderDate) : <span className="az-muted">—</span>}</div>
            <div className="az-pt-days">{daysBadge(row.daysSince)}</div>
            <div className="az-pt-signal"><span className={`az-signal-chip is-${row.signal.tone}`}>{row.signal.action}</span></div>
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div className="az-pt-empty">Aucune pharmacie dans ce filtre.</div>
        )}
      </div>
    </div>
  );
}

function MapController({ rows, selectedPharmacyId }) {
  const map = useMap();
  const fittedKey = useRef(null);

  useEffect(() => {
    const pts = rows.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));
    if (!pts.length) return;
    const key = pts.map((r) => r.pharmacyId).join(',');
    if (fittedKey.current === key) return;
    fittedKey.current = key;
    map.fitBounds(pts.map((r) => [Number(r.latitude), Number(r.longitude)]), { padding: [40, 40], maxZoom: 13 });
  }, [map, rows]);

  useEffect(() => {
    if (!selectedPharmacyId) return;
    const row = rows.find((r) => r.pharmacyId === selectedPharmacyId);
    if (!row || !Number.isFinite(Number(row.latitude))) return;
    map.flyTo([Number(row.latitude), Number(row.longitude)], Math.max(map.getZoom(), 12), { duration: 0.6 });
  }, [selectedPharmacyId, map, rows]);

  return null;
}

function PortfolioMap({ onAction, onSelectPharmacy, rows, selectedPharmacyId }) {
  const maxRevenue = Math.max(...rows.map((r) => r.revenue || 0), 1);
  const geoRows = rows.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)));

  return (
    <MapContainer center={[46.5, 2.3]} scrollWheelZoom style={{ height: '100%', width: '100%' }} zoom={6}>
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController rows={geoRows} selectedPharmacyId={selectedPharmacyId} />
      {geoRows.map((row) => {
        const status = pharmacyOrderStatus(row);
        const radius = 5 + Math.sqrt((row.revenue || 0) / maxRevenue) * 10;
        return (
          <CircleMarker
            center={[Number(row.latitude), Number(row.longitude)]}
            color="white"
            eventHandlers={{ click: () => onSelectPharmacy(row) }}
            fillColor={ORDER_COLORS[status]}
            fillOpacity={0.88}
            key={row.pharmacyId}
            radius={radius}
            weight={selectedPharmacyId === row.pharmacyId ? 3 : 1.5}
          >
            <Popup>
              <div className="az-map-popup">
                <strong>{row.name}</strong>
                <em>{row.city} · Dpt {row.department}</em>
                {row.revenue > 0 && <span>CA {formatMoney(row.revenue)}</span>}
                {row.memory?.lastOrderAt && <span>Dernière commande {formatDate(row.memory.lastOrderAt)}</span>}
                <div className="az-map-popup-actions">
                  <button onClick={() => onAction('report', row)} type="button">CR</button>
                  <button onClick={() => onAction('order', row)} type="button">Cmd</button>
                  <button onClick={() => onAction('visit', row)} type="button">+RDV</button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function TourView({ calendarEvents, geocoding, onAction, onGeocode, rows, todayItems }) {
  const plannedItems = useMemo(() => buildCalendarItems(calendarEvents, rows)
    .concat(todayItems.filter((item) => item.kind === 'activity'))
    .filter((item) => item.startDate)
    .sort((a, b) => a.startDate - b.startDate), [calendarEvents, rows, todayItems]);

  const route = useMemo(() => buildDayRoute(rows, plannedItems), [rows, plannedItems]);

  const mapsMultiStopUrl = useMemo(() => {
    const geoStops = route.stops.filter((s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)));
    if (geoStops.length < 2) return null;
    const waypoints = geoStops.map((s) => `${s.latitude},${s.longitude}`).join('/');
    return `https://www.google.com/maps/dir/${waypoints}`;
  }, [route.stops]);

  const geoReadyCount = route.geoCount;
  const totalGps = rows.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).length;
  const routeStopIds = new Set(route.stops.map((s) => s.pharmacyId));
  const clusters = useMemo(() => buildDepartmentClusters(rows), [rows]);
  const [selectedStopId, setSelectedStopId] = useState(null);

  return (
    <div className="agent-zero-view">
      <Header
        eyebrow="Tournée terrain"
        title="Itinéraire du jour"
        text={`${geoReadyCount} pharmacies géolocalisées sur ${rows.length} · optimisation par proximité et priorité`}
      />

      <div className="agent-zero-tour-summary">
        <div><span>Stops planifiés</span><strong>{route.stops.length}</strong></div>
        <div><span>Distance estimée</span><strong>{route.totalKm > 0 ? `${route.totalKm} km` : '—'}</strong><small>vol d&apos;oiseau</small></div>
        <div><span>GPS disponibles</span><strong>{totalGps}/{rows.length}</strong></div>
        {mapsMultiStopUrl && (
          <div>
            <a className="agent-zero-tour-maps-btn" href={mapsMultiStopUrl} rel="noreferrer" target="_blank">
              Ouvrir dans Maps
            </a>
          </div>
        )}
      </div>

      <div className="agent-zero-tour-map-wrap">
        <PortfolioMap
          clusters={clusters}
          onSelectDepartment={() => {}}
          onSelectPharmacy={(row) => setSelectedStopId(row.pharmacyId)}
          selectedDepartment={null}
          selectedPharmacyId={selectedStopId}
        />
        {route.stops.length > 0 && (
          <div className="agent-zero-tour-map-legend">
            {route.stops.map((s) => (
              <button
                className={selectedStopId === s.pharmacyId ? 'is-active' : ''}
                key={s.pharmacyId}
                onClick={() => setSelectedStopId(s.pharmacyId)}
                type="button"
              >
                <b>{s.stopIndex}</b>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {route.stops.length === 0 && (
        <div className="agent-zero-empty-state">
          <p>Aucune pharmacie géolocalisée ou priorisée pour construire un itinéraire.</p>
          <button disabled={geocoding} onClick={onGeocode} style={{ marginTop: 12 }} type="button">
            {geocoding ? 'Géocodage…' : 'Géocoder le portefeuille'}
          </button>
        </div>
      )}

      <div className="agent-zero-tour-stops">
        {route.stops.map((stop, idx) => (
          <div className={`agent-zero-tour-stop ${stop.fromCalendar ? 'is-calendar' : ''}`} key={stop.pharmacyId || idx}>
            {idx > 0 && stop.distKm !== null && (
              <div className="agent-zero-tour-leg">
                <span>{Math.round(stop.distKm)} km</span>
              </div>
            )}
            <div className="agent-zero-tour-stop-card">
              <div className="agent-zero-tour-stop-index">{stop.stopIndex}</div>
              <div className="agent-zero-tour-stop-body">
                <strong>{stop.name}</strong>
                <small>{stop.city} · Dpt {stop.department} · {stop.signal?.action || 'À préparer'}</small>
              </div>
              {stop.time && <em className="agent-zero-tour-stop-time">{stop.time}</em>}
              <div className="agent-zero-tour-stop-actions">
                {Number.isFinite(Number(stop.latitude)) && (
                  <a href={buildMapsUrl(stop)} rel="noreferrer" target="_blank">Maps</a>
                )}
                <button onClick={() => onAction('visit', stop)} type="button">Préparer</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {route.opportunities.length > 0 && (
        <div className="agent-zero-tour-opps">
          <h3>Opportunités de passage</h3>
          <p>Pharmacies proches de ta tournée, non planifiées</p>
          <div>
            {route.opportunities.map((row) => (
              <button key={row.pharmacyId} onClick={() => onAction('visit', row)} type="button">
                <div>
                  <strong>{row.name}</strong>
                  <small>{row.city} · {Math.round(row.minDist)} km du trajet · {row.signal?.action}</small>
                </div>
                <b>+</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {totalGps < rows.length && (
        <div className="agent-zero-tour-geocode-notice">
          <span>{rows.length - totalGps} pharmacies sans coordonnées GPS</span>
          <button disabled={geocoding} onClick={onGeocode} type="button">
            {geocoding ? 'Géocodage…' : 'Compléter le géocodage'}
          </button>
        </div>
      )}
    </div>
  );
}

function VisitView({ onAction, selected }) {
  return <div className="agent-zero-view"><Header eyebrow="Préparation visite" title={selected?.name || 'Choisis une pharmacie'} text="Objectif : arriver avec le contexte, l'historique et la prochaine action claire." />
    <div className="agent-zero-visit-card"><span>Brief terrain</span><strong>{selected ? `${selected.brandName} · ${selected.city}` : 'Aucune pharmacie sélectionnée'}</strong><p>{selected ? `Statut ${formatLabel(selected.status)}. Dernier contact : ${formatDate(selected.lastContactAt)}. CA suivi : ${formatMoney(selected.revenue)}.` : 'Sélectionne un compte dans le portefeuille pour préparer une visite.'}</p></div>
    {selected && <TerrainSignal signal={selected.signal} />}
    {selected && <CustomerMemory memory={selected.memory} />}
    {selected && <ActivityTimeline activities={selected.activities} />}
    <div className="agent-zero-checklist"><label><input type="checkbox" readOnly /> Vérifier historique commande</label><label><input type="checkbox" readOnly /> Préparer objectif visite</label><label><input type="checkbox" readOnly /> Planifier prochaine action</label></div>
    <div className="agent-zero-inline-actions"><button onClick={() => onAction('note')} type="button">Compte rendu</button><button onClick={() => onAction('followup')} type="button">Planifier relance</button><button onClick={() => onAction('order')} type="button">Commande</button></div>
  </div>;
}

function OrdersView({ onAction, orders, products, selected }) {
  const selectedOrders = selected ? (orders || []).filter((order) => order.pharmacy_id === selected.pharmacyId) : orders || [];
  const metrics = buildOrderMetrics(selectedOrders);

  return <div className="agent-zero-view"><Header eyebrow="Commandes" title={selected ? `Commandes · ${selected.name}` : 'Commandes terrain'} text="Créer un brouillon depuis le catalogue, relire les dernières commandes et vérifier les montants avant envoi CRM." />
    <div className="agent-zero-order-command">
      <div><span>Client actif</span><strong>{selected?.name || 'Aucune pharmacie sélectionnée'}</strong><small>{selected ? `${selected.city} · ${selected.brandName}` : 'Sélectionne un compte dans le portefeuille.'}</small></div>
      <button disabled={!selected} onClick={() => onAction('order', selected)} type="button">Nouvelle commande</button>
    </div>
    <div className="agent-zero-order-metrics">
      <article><span>Total historique</span><strong>{formatMoney(metrics.total)}</strong></article>
      <article><span>Brouillons</span><strong>{metrics.draftCount}</strong></article>
      <article><span>En cours</span><strong>{metrics.pendingCount}</strong></article>
      <article><span>Catalogue</span><strong>{products.length}</strong></article>
    </div>
    <div className="agent-zero-orders">{selectedOrders.slice(0, 8).map((order) => <article key={order.id}><span>{order.order_number || 'Commande'}</span><strong>{formatMoney(order.total_after_discount_ht || order.total_ht)}</strong><small>{formatLabel(order.status)} · {formatDate(order.order_date || order.created_at)}</small></article>)}{!selectedOrders.length && <Empty title="Aucune commande pour ce client" text="Crée un brouillon depuis le catalogue Naali, les lignes produit seront rattachées à la pharmacie sélectionnée." />}</div>
    <div className="agent-zero-product-strip"><span>Catalogue chargé</span><strong>{products.length}</strong><small>produits actifs disponibles pour la marque assignée</small></div>
  </div>;
}

function PharmacyDetail({ onAction, productDistribution, selected, selectedProductDistribution }) {
  if (!selected) return <Empty title="Aucune pharmacie" text="Le portefeuille agent est vide ou pas encore chargé." />;
  return <div className="agent-zero-detail-inner"><span className="agent-zero-kicker">Fiche 360</span><h2>{selected.name}</h2><p>{selected.addressLine1 ? `${selected.addressLine1} · ` : ''}{selected.city} · Département {selected.department}</p><div className="agent-zero-detail-stats"><div><span>Marque</span><strong>{selected.brandName}</strong></div><div><span>Statut</span><strong>{formatLabel(selected.status)}</strong></div><div><span>CA suivi</span><strong>{formatMoney(selected.revenue)}</strong></div><div><span>Produits</span><strong>{selectedProductDistribution?.products?.length || 0}</strong></div></div><TerrainSignal compact signal={selected.signal} /><ProductDistributionCard distribution={productDistribution} selectedDistribution={selectedProductDistribution} /><ContactCard selected={selected} /><CustomerMemory compact memory={selected.memory} /><ActivityTimeline compact activities={selected.activities} /><div className="agent-zero-detail-actions"><button onClick={() => onAction('call', selected)} type="button">Journal appel</button>{buildTelUrl(selected.phone) && <a href={buildTelUrl(selected.phone)}>Téléphoner</a>}<a href={buildMapsUrl(selected)} rel="noreferrer" target="_blank">Itinéraire</a>{selected.email && <a href={`mailto:${selected.email}`}>Email</a>}<button onClick={() => onAction('visit', selected)} type="button">Visite</button><button onClick={() => onAction('order', selected)} type="button">Commande</button><button onClick={() => onAction('followup', selected)} type="button">Relance</button></div></div>;
}

function TerrainSignal({ compact = false, signal }) {
  return <div className={`agent-zero-terrain-signal is-${signal?.tone || 'neutral'} ${compact ? 'is-compact' : ''}`}><span>Signal terrain</span><strong>{signal?.action || 'Préparer'}</strong><small>{signal?.reason || 'Aucune recommandation disponible.'}</small></div>;
}

function ProductDistributionCard({ distribution, selectedDistribution }) {
  const clientProducts = selectedDistribution?.products || [];
  const topPortfolioProducts = distribution?.products?.slice(0, 3) || [];
  return (
    <div className="agent-zero-memory agent-zero-dn-card">
      <span>DN produit</span>
      <strong>{distribution?.rateLabel || '—'} portefeuille</strong>
      <small>{distribution?.note || 'Historique produits à synchroniser.'}</small>
      {clientProducts.length ? (
        <p>Références cochées : {clientProducts.slice(0, 3).map((product) => product.name).join(' · ')}</p>
      ) : (
        <p>Aucune référence cochée dans HubSpot : vérifier le référencement Naali de cette pharmacie.</p>
      )}
      {!!topPortfolioProducts.length && <p>Top DN : {topPortfolioProducts.map((product) => `${product.name} ${product.rateLabel}`).join(' · ')}</p>}
    </div>
  );
}

function ContactCard({ selected }) {
  return (
    <div className="agent-zero-contact-card">
      <span>Contact pharmacie</span>
      <strong>{selected.contactName || 'Contact à compléter'}</strong>
      <div>
        <small>Téléphone</small>
        {buildTelUrl(selected.phone) ? <a href={buildTelUrl(selected.phone)}>{selected.phone}</a> : <em>Non renseigné</em>}
      </div>
      <div>
        <small>Email</small>
        {selected.email ? <a href={`mailto:${selected.email}`}>{selected.email}</a> : <em>Non renseigné</em>}
      </div>
    </div>
  );
}

function ActivityTimeline({ activities, compact = false }) {
  if (!activities?.length) {
    return <div className={`agent-zero-timeline ${compact ? 'is-compact' : ''}`}><span>Historique terrain</span><strong>Aucune action récente</strong><small>Les appels, visites et comptes rendus apparaîtront ici.</small></div>;
  }

  return (
    <div className={`agent-zero-timeline ${compact ? 'is-compact' : ''}`}>
      <span>Historique terrain</span>
      {activities.map((activity) => (
        <article key={activity.id}>
          <i>{formatLabel(activity.activity_type)}</i>
          <div><strong>{activity.title || 'Action terrain'}</strong><small>{formatDate(activity.activity_date || activity.completed_at || activity.created_at)} · {activity.brands?.name || 'Marque'}</small></div>
        </article>
      ))}
    </div>
  );
}

function CustomerMemory({ compact = false, memory }) {
  if (!memory?.orderCount) {
    return <div className="agent-zero-memory"><span>Mémoire client</span><strong>Aucun historique commande</strong><small>À compléter après première commande PharmaBiz ou sync CRM.</small></div>;
  }

  return (
    <div className={`agent-zero-memory ${compact ? 'is-compact' : ''}`}>
      <span>Mémoire client</span>
      <div className="agent-zero-memory-grid">
        <div><small>Commandes</small><strong>{memory.orderCount}</strong></div>
        <div><small>Dernière</small><strong>{formatDate(memory.lastOrderAt)}</strong></div>
        <div><small>Montant</small><strong>{formatMoney(memory.lastOrderTotal)}</strong></div>
        <div><small>Remise moy.</small><strong>{memory.averageDiscount ? `${memory.averageDiscount.toFixed(1)}%` : '—'}</strong></div>
      </div>
      {!!memory.topProducts.length && <p>Top produits : {memory.topProducts.map((product) => `${product.name} ×${product.quantity}`).join(' · ')}</p>}
    </div>
  );
}

function getDefaultVisitSchedule() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function ActionDrawer({ action, googleConnected, onClose, onCreateActivity, onCreateFollowUp, onCreateOrderDraft, products }) {
  const [note, setNote] = useState('');
  const defaultVisitSchedule = useMemo(() => getDefaultVisitSchedule(), []);
  const [visitDate, setVisitDate] = useState(defaultVisitSchedule.date);
  const [visitTime, setVisitTime] = useState(defaultVisitSchedule.time);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [syncVisitCalendar, setSyncVisitCalendar] = useState(Boolean(googleConnected));
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [nextActionAt, setNextActionAt] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const labels = { call: 'Appel', visit: 'Visite', order: 'Commande', note: 'Compte rendu', followup: 'Relance', report: 'CR de visite' };
  const activityTypes = { call: 'call', visit: 'visit', note: 'note', report: 'visit' };
  const isFollowUp = action.type === 'followup';
  const isOrder = action.type === 'order';
  const isVisit = action.type === 'visit';
  const isCR = action.type === 'report';

  const CR_OUTCOMES = [
    { key: 'order', label: 'Commande prise', icon: '✓' },
    { key: 'rdv', label: 'RDV pris', icon: '📅' },
    { key: 'presented', label: 'Présentés sans suite', icon: '📝' },
    { key: 'absent', label: 'Absent / Indispo', icon: '📵' },
    { key: 'refused', label: 'Refus', icon: '✗' },
  ];
  const CR_NEXT_ACTIONS = [
    { key: '7', label: 'Relancer dans 7j' },
    { key: '14', label: 'Relancer dans 14j' },
    { key: '30', label: 'Relancer dans 30j' },
    { key: 'none', label: 'Rien pour l\'instant' },
  ];
  const [crOutcome, setCrOutcome] = useState('');
  const [crNextAction, setCrNextAction] = useState('14');
  const [crMentioned, setCrMentioned] = useState({});

  function toggleMentioned(productId) {
    setCrMentioned((prev) => ({ ...prev, [productId]: !prev[productId] }));
  }

  function buildCRNote() {
    const outcomeLabel = CR_OUTCOMES.find((o) => o.key === crOutcome)?.label || '';
    const mentionedNames = brandProducts.filter((p) => crMentioned[p.id]).map((p) => p.name).join(' · ') || 'Aucun';
    const nextLabel = CR_NEXT_ACTIONS.find((a) => a.key === crNextAction)?.label || '';
    return [
      `CR visite — ${action.row?.name} — ${new Date().toLocaleDateString('fr-FR')}`,
      `Résultat : ${outcomeLabel}`,
      `Produits évoqués : ${mentionedNames}`,
      `Prochaine action : ${nextLabel}`,
      note ? `Notes : ${note}` : '',
    ].filter(Boolean).join('\n');
  }

  function copyWhatsApp() {
    navigator.clipboard?.writeText(buildCRNote());
  }
  const brandId = action.row?.relation?.brand_id || null;
  const referencedNames = useMemo(() => {
    const refs = readArray(action.row?.catalogueNaaliReference);
    return refs.length ? new Set(refs.map((name) => normalize(name))) : null;
  }, [action.row?.catalogueNaaliReference]);

  const brandProducts = (products || []).filter((product) => {
    if (brandId && product.brand_id !== brandId) return false;
    if (!referencedNames) return false;
    return referencedNames.has(normalize(product.name));
  });
  const filteredProducts = brandProducts.filter((product) => normalize([
    product.name,
    product.reference,
    product.ean,
    product.category,
  ].join(' ')).includes(normalize(productQuery))).slice(0, 10);
  const selectedLines = Object.values(selectedProducts).filter((item) => item.quantity > 0);
  const selectedTotal = selectedLines.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const discountRate = Math.min(100, Math.max(0, Number(item.discountRate || 0)));
    return sum + Number(product?.unit_price_ht || 0) * Number(item.quantity || 0) * (1 - discountRate / 100);
  }, 0);
  const selectedGrossTotal = selectedLines.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return sum + Number(product?.unit_price_ht || 0) * Number(item.quantity || 0);
  }, 0);
  const selectedDiscountAmount = Math.max(0, selectedGrossTotal - selectedTotal);

  function toggleProduct(product) {
    setSelectedProducts((current) => {
      const next = { ...current };
      if (next[product.id]) delete next[product.id];
      else next[product.id] = { productId: product.id, quantity: 1 };
      return next;
    });
  }

  function updateQuantity(productId, quantity) {
    setSelectedProducts((current) => ({
      ...current,
      [productId]: { ...current[productId], productId, quantity: Math.max(0, Number(quantity || 0)) },
    }));
  }

  function bumpQuantity(productId, delta) {
    setSelectedProducts((current) => {
      const currentLine = current[productId] || { productId, quantity: 0 };
      return {
        ...current,
        [productId]: { ...currentLine, quantity: Math.max(1, Number(currentLine.quantity || 0) + delta) },
      };
    });
  }

  function updateDiscount(productId, discountRate) {
    setSelectedProducts((current) => ({
      ...current,
      [productId]: {
        ...current[productId],
        productId,
        discountRate: Math.min(100, Math.max(0, Number(discountRate || 0))),
        quantity: current[productId]?.quantity || 1,
      },
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    const common = {
      brandId: action.row?.relation?.brand_id || null,
      pharmacyId: action.row?.pharmacyId,
    };
    let result;
    if (isOrder) {
      result = await onCreateOrderDraft?.({
        ...common,
        items: selectedLines,
        notes: note || `Brouillon commande ${action.row?.brandName} créé depuis le cockpit agent.`,
      });
    } else if (isFollowUp) {
      result = await onCreateFollowUp?.({
        ...common,
        dueAt,
        priority: action.row?.priority === 'priority' ? 'high' : action.row?.priority || 'medium',
        reason: note || `Relance planifiée depuis la fiche ${action.row?.name}.`,
        title: `Relancer ${action.row?.name}`,
      });
    } else if (isCR) {
      const crNote = buildCRNote();
      result = await onCreateActivity?.({
        ...common,
        activityDate: new Date().toISOString(),
        notes: crNote,
        title: `CR visite · ${action.row?.name}`,
        type: 'visit',
      });
      if (!result?.error && crNextAction !== 'none') {
        const daysMap = { '7': 7, '14': 14, '30': 30 };
        const days = daysMap[crNextAction] || 14;
        const dueAt = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        await onCreateFollowUp?.({ ...common, dueAt, priority: 'medium', title: `Relancer ${action.row?.name}`, reason: `Suite CR visite du ${new Date().toLocaleDateString('fr-FR')}` });
      }
    } else {
      const plannedVisitAt = isVisit ? `${visitDate}T${visitTime}:00` : null;
      result = await onCreateActivity?.({
        ...common,
        activityDate: plannedVisitAt,
        durationMinutes: isVisit ? durationMinutes : null,
        notes: note || `${labels[action.type] || 'Action'} enregistrée depuis l'espace agent.`,
        syncGoogleCalendar: isVisit && googleConnected && syncVisitCalendar,
        title: `${labels[action.type] || 'Action'} · ${action.row?.name}`,
        type: activityTypes[action.type] || 'note',
      });
      if (!result?.error && nextActionAt) {
        const followUpResult = await onCreateFollowUp?.({
          ...common,
          dueAt: nextActionAt,
          priority: action.row?.priority === 'priority' ? 'high' : action.row?.priority || 'medium',
          reason: note || `Suite à ${labels[action.type] || 'action'} terrain.`,
          title: `Suite ${action.row?.name}`,
        });
        if (followUpResult?.error) result = followUpResult;
      }
    }

    setSaving(false);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    if (result?.calendarWarning) {
      setMessage(`Visite créée dans PharmaBiz, mais pas dans Google Agenda : ${result.calendarWarning}`);
      return;
    }
    setMessage(isOrder ? 'Brouillon commande créé.' : isFollowUp ? 'Relance planifiée.' : isVisit && result?.calendar?.created ? 'Visite planifiée et ajoutée à Google Agenda.' : isVisit ? 'Visite planifiée dans PharmaBiz.' : nextActionAt ? 'Action enregistrée et suite planifiée.' : 'Action enregistrée.');
    window.setTimeout(onClose, 650);
  }

  return (
    <div className="agent-zero-drawer-backdrop" onMouseDown={onClose}>
      <aside className="agent-zero-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="agent-zero-drawer-head">
          <div><span className="agent-zero-kicker">Action terrain</span><h2>{labels[action.type] || 'Action'} · {action.row?.name}</h2></div>
          <button onClick={onClose} type="button">×</button>
        </div>
        <p>{isOrder ? 'Crée un brouillon commande rattaché à la pharmacie et à ton portefeuille.' : isFollowUp ? 'Planifie une relance terrain rattachée à cette pharmacie.' : isVisit ? 'Planifie une visite terrain et ajoute-la à ton agenda si Google est connecté.' : isCR ? 'Compte rendu rapide — à remplir à chaud, en moins de 30 secondes.' : 'Enregistre immédiatement cette action dans l\'historique terrain.'}</p>
        <div className="agent-zero-drawer-grid">
          <div><span>Pharmacie</span><strong>{action.row?.name}</strong></div>
          <div><span>Marque</span><strong>{action.row?.brandName}</strong></div>
          <div><span>Ville</span><strong>{action.row?.city}</strong></div>
          <div><span>Priorité</span><strong>{formatLabel(action.row?.priority)}</strong></div>
        </div>
        <form className="agent-zero-action-form" onSubmit={submit}>
          {isCR && (
            <div className="agent-zero-cr-form">
              <div className="agent-zero-cr-section">
                <span>Résultat de la visite</span>
                <div className="agent-zero-cr-outcomes">
                  {CR_OUTCOMES.map((o) => (
                    <button
                      className={crOutcome === o.key ? 'is-active' : ''}
                      key={o.key}
                      onClick={() => setCrOutcome(o.key)}
                      type="button"
                    >
                      {o.icon} {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="agent-zero-cr-section">
                <span>Produits évoqués</span>
                <div className="agent-zero-cr-products">
                  {brandProducts.length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--az-muted)' }}>
                      {!referencedNames ? 'Champ "Catalogue Naali référencé" vide dans HubSpot pour cette pharmacie.' : 'Aucun produit référencé.'}
                    </span>
                  )}
                  {brandProducts.slice(0, 12).map((p) => (
                    <label className={crMentioned[p.id] ? 'is-checked' : ''} key={p.id}>
                      <input checked={!!crMentioned[p.id]} onChange={() => toggleMentioned(p.id)} type="checkbox" />
                      {p.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="agent-zero-cr-section">
                <span>Prochaine action</span>
                <div className="agent-zero-cr-next">
                  {CR_NEXT_ACTIONS.map((a) => (
                    <button
                      className={crNextAction === a.key ? 'is-active' : ''}
                      key={a.key}
                      onClick={() => setCrNextAction(a.key)}
                      type="button"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <label><span>Note libre (optionnel)</span><textarea onChange={(event) => setNote(event.target.value)} placeholder="Remarques, infos terrain, contexte…" rows="2" value={note} /></label>
              <button className="agent-zero-cr-whatsapp" onClick={copyWhatsApp} type="button">📋 Copier pour WhatsApp</button>
            </div>
          )}
          {isFollowUp && <label><span>Date de relance</span><input onChange={(event) => setDueAt(event.target.value)} type="date" value={dueAt} /></label>}
          {isVisit && (
            <div className="agent-zero-visit-scheduler">
              <label><span>Date visite</span><input required onChange={(event) => setVisitDate(event.target.value)} type="date" value={visitDate} /></label>
              <label><span>Heure</span><input required onChange={(event) => setVisitTime(event.target.value)} type="time" value={visitTime} /></label>
              <label><span>Durée</span><select onChange={(event) => setDurationMinutes(Number(event.target.value))} value={durationMinutes}><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 h</option><option value="90">1 h 30</option><option value="120">2 h</option></select></label>
              <label className="agent-zero-check-row"><input checked={syncVisitCalendar} disabled={!googleConnected} onChange={(event) => setSyncVisitCalendar(event.target.checked)} type="checkbox" /><span>{googleConnected ? 'Ajouter aussi dans Google Agenda' : 'Google Agenda non connecté'}</span></label>
            </div>
          )}
          {isOrder && (
            <div className="agent-zero-product-picker">
              <label><span>Recherche produit</span><input onChange={(event) => setProductQuery(event.target.value)} placeholder="Gommes, sommeil, EAN, référence…" value={productQuery} /></label>
              <div className="agent-zero-product-list">
                {filteredProducts.map((product) => {
                  const checked = Boolean(selectedProducts[product.id]);
                  return (
                    <article className={checked ? 'is-selected' : ''} key={product.id}>
                      <label>
                        <input checked={checked} onChange={() => toggleProduct(product)} type="checkbox" />
                        <span><strong>{product.name}</strong><small>{product.reference || product.category || 'Produit'} · {formatMoney(product.unit_price_ht)} HT</small></span>
                      </label>
                      {checked && (
                        <div className="agent-zero-line-controls">
                          <div className="agent-zero-qty-stepper">
                            <button onClick={() => bumpQuantity(product.id, -1)} type="button">−</button>
                            <input min="1" onChange={(event) => updateQuantity(product.id, event.target.value)} type="number" value={selectedProducts[product.id]?.quantity || 1} />
                            <button onClick={() => bumpQuantity(product.id, 1)} type="button">+</button>
                          </div>
                          <label><span>Remise %</span><input min="0" max="100" onChange={(event) => updateDiscount(product.id, event.target.value)} type="number" value={selectedProducts[product.id]?.discountRate || 0} /></label>
                        </div>
                      )}
                    </article>
                  );
                })}
                {!filteredProducts.length && <div className="agent-zero-empty"><strong>Aucun produit référencé</strong><span>{!referencedNames ? 'Le champ "Catalogue Naali référencé" est vide sur cette pharmacie dans HubSpot.' : 'Aucun produit correspond à ta recherche.'}</span></div>}
              </div>
              <div className="agent-zero-order-total"><span>{selectedLines.length} lignes · remise {formatMoney(selectedDiscountAmount)}</span><strong>{formatMoney(selectedTotal)} HT</strong></div>
            </div>
          )}
          <label><span>{isOrder ? 'Note commande' : isFollowUp ? 'Motif' : isVisit ? 'Objectif de visite' : 'Compte rendu rapide'}</span><textarea onChange={(event) => setNote(event.target.value)} placeholder={isVisit ? 'Ex. Réassort, implantation, formation équipe…' : 'Ajoute une note courte…'} rows="4" value={note} /></label>
          {!isOrder && !isFollowUp && !isVisit && <label><span>Prochaine action optionnelle</span><input onChange={(event) => setNextActionAt(event.target.value)} type="date" value={nextActionAt} /></label>}
          {message && <div className={message.includes('introuvable') || message.includes('Sélectionne') ? 'agent-zero-form-message is-error' : 'agent-zero-form-message'}>{message}</div>}
          <button className="agent-zero-confirm" disabled={saving} type="submit">{saving ? 'Enregistrement...' : isOrder ? 'Créer le brouillon' : isFollowUp ? 'Planifier la relance' : isVisit ? 'Planifier la visite' : isCR ? 'Enregistrer le CR' : "Enregistrer l'action"}</button>
        </form>
      </aside>
    </div>
  );
}

function Header({ eyebrow, text, title }) {
  return <div className="agent-zero-section-head"><span className="agent-zero-kicker">{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>;
}

function Empty({ text, title }) {
  return <div className="agent-zero-empty"><strong>{title}</strong><span>{text}</span></div>;
}

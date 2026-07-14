import React, { useMemo, useState } from 'react';
import { formatDate, formatDateTime, formatLabel, formatMoney, isOverdue } from '../../lib/formatters.js';
import { connectIntegration, geocodeAgentPharmacies, syncGoogleCalendar, syncHubSpotLineItems, syncHubSpotPrivateApp } from '../../lib/integrations.js';
import { FRANCE_DEPARTMENTS } from './franceDepartments.js';

const NAV_ITEMS = [
  ['today', '🏠', 'Jour'],
  ['portfolio', '●', 'Comptes'],
  ['visit', '↗', 'Tournée'],
  ['orders', '📦', 'Cmdes'],
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
      const row = rows.find((candidate) => candidate.pharmacyId === pharmacyId)
        || rows.find((candidate) => normalize(payload.summary || payload.title || payload.location).includes(normalize(candidate.name)))
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
      name: getPharmacyName(pharmacy),
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
        meta: [row?.name, row?.city, activity.brands?.name].filter(Boolean).join(' · ') || activity.notes || 'Planifié dans PharmaBiz',
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
        row.priority === 'priority' || row.priority === 'high' ? { score: 16, label: `priorité ${formatLabel(row.priority)}` } : null,
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

function buildMapViewBox(clusters) {
  if (!clusters.length) return '0 0 100 100';
  const xs = clusters.map((cluster) => cluster.x);
  const ys = clusters.map((cluster) => cluster.y);
  const minX = Math.max(0, Math.min(...xs) - 16);
  const maxX = Math.min(100, Math.max(...xs) + 16);
  const minY = Math.max(0, Math.min(...ys) - 16);
  const maxY = Math.min(100, Math.max(...ys) + 16);
  return `${minX} ${minY} ${Math.max(18, maxX - minX)} ${Math.max(18, maxY - minY)}`;
}

function buildPharmacyMapPoint(row, cluster, index) {
  const projected = projectGeoPoint(row.latitude, row.longitude);
  if (projected) return { ...projected, precise: true };
  const hash = stableHash(`${row.name}-${row.addressLine1}-${row.postalCode}-${row.city}`);
  const angle = ((Math.abs(hash) % 360) / 180) * Math.PI;
  const radius = 1.5 + (index % 5) * 0.65;
  return {
    precise: false,
    x: cluster.x + Math.cos(angle) * radius,
    y: cluster.y + Math.sin(angle) * radius,
  };
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
        <header className="agent-zero-topbar">
          <label className="agent-zero-search">
            <span>⌕</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une pharmacie, une ville, une action…" value={query} />
          </label>
          <div className="agent-zero-actions">
            <button className="agent-zero-sync" onClick={onReload} type="button">{lastSyncedAt ? `Sync ${formatDateTime(lastSyncedAt)}` : 'Synchroniser'}</button>
            <button className="agent-zero-sync agent-zero-hubspot-sync" disabled={hubspotSyncing} onClick={handleHubSpotSync} type="button">
              {hubspotSyncing ? 'HubSpot…' : 'Sync HubSpot'}
            </button>
            <button className="agent-zero-sync agent-zero-hubspot-sync" disabled={hubspotLineItemsSyncing} onClick={handleHubSpotLineItemsSync} type="button">
              {hubspotLineItemsSyncing ? 'Lignes…' : 'Lignes HubSpot'}
            </button>
            <button className="agent-zero-add" onClick={() => openAction('visit')} type="button">+ Ajouter</button>
          </div>
        </header>

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
              items={todayItems}
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
              <div className="agent-zero-hero-card">
                <div>
                  <span className="agent-zero-kicker">Aujourd’hui</span>
                  <h1>Le cockpit terrain qui te dit quoi faire maintenant.</h1>
                  <p>Décision, préparation, exécution et suite : l’espace agent repart sur la direction artistique du prototype, avec les vraies données PharmaBiz branchées derrière.</p>
                  <div className="agent-zero-hero-actions">
                    <button onClick={() => openAction('visit')} type="button">Préparer la prochaine visite</button>
                    <button onClick={() => setActiveView('portfolio')} type="button">Voir le portefeuille</button>
                  </div>
                </div>
                <div className="agent-zero-score">
                  <span>Portefeuille</span>
                  <strong>{rows.length}</strong>
                  <small>pharmacies couvertes</small>
                </div>
              </div>

              <div className="agent-zero-metrics">
                <Metric label="Clients actifs" value={activeClients} note="relations marque actives" />
                <Metric label="À prioriser" value={urgentCount} note="retards ou priorité forte" tone="orange" />
                <Metric label="Commandes ouvertes" value={openOrders} note="brouillons / envoyées" />
                <Metric label="DN produit" value={productDistribution.rateLabel} note={productDistribution.note} />
              </div>

              <div className="agent-zero-main-grid">
                <section className="agent-zero-panel agent-zero-panel-large">
              {activeView === 'portfolio' && <PortfolioView activeDepartment={activeDepartment} departments={departments} onAction={openAction} rows={filteredRows} selected={selected} setActiveDepartment={setActiveDepartment} setSelectedPharmacyId={setSelectedPharmacyId} totalRows={rows.length} />}
              {activeView === 'visit' && <VisitView onAction={openAction} selected={selected} />}
              {activeView === 'orders' && <OrdersView onAction={openAction} orders={state.orders || []} products={state.products || []} selected={selected} />}
                </section>

                <aside className="agent-zero-panel agent-zero-detail">
                  <PharmacyDetail onAction={openAction} productDistribution={productDistribution} selected={selected} selectedProductDistribution={selectedProductDistribution} />
                </aside>
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
    </main>
  );
}

function Metric({ label, note, tone, value }) {
  return <article className={`agent-zero-metric ${tone ? `is-${tone}` : ''}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function TodayView({ activeClients, calendarEvents, geocoding, googleConnecting, googleConnection, googleNeedsReconnect, googleSyncing, items, onAction, onConnectGoogle, onGeocode, onSyncGoogleCalendar, openOrders, orderTotal, productDistribution, rows, selected, urgentCount, userName }) {
  const [aiExpanded, setAiExpanded] = useState(true);
  const calendarItems = useMemo(() => buildCalendarItems(calendarEvents, rows), [calendarEvents, rows]);
  const aiRecommendations = useMemo(() => buildAiRecommendations(rows, items, productDistribution, calendarItems), [calendarItems, items, productDistribution, rows]);
  const appointmentItems = [...calendarItems, ...items.filter((item) => item.kind === 'activity')]
    .filter((item) => item.startDate)
    .sort((first, second) => first.startDate - second.startDate);
  const nextAppointmentItem = appointmentItems.find((item) => item.startDate >= new Date()) || appointmentItems[0] || null;
  const priority = nextAppointmentItem?.row || selected || items.find((item) => item.row)?.row || rows[0] || null;
  const todayLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date());
  const suggestedPlanning = items.length ? items.slice(0, 4) : rows.slice(0, 4).map((row) => ({
    id: row.id,
    kind: 'suggestion',
    row,
    title: row.name,
    meta: `${row.city} · ${row.signal.action}`,
    due: row.nextActionAt,
    tone: row.signal.tone === 'hot' ? 'hot' : 'normal',
    type: row.signal.action,
  }));
  const planning = [...calendarItems, ...suggestedPlanning].slice(0, 4);
  const hasScheduledAppointment = planning.some((item) => item.kind === 'calendar' || item.kind === 'activity');
  const decisions = items.slice(0, 3);
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
        <div>
          <span>{todayLabel} · {String(userName || 'Agent').split('@')[0]} · agent multimarques</span>
          <h1>Ta journée, sans bruit inutile.</h1>
          <p>Les décisions importantes sont priorisées à partir des vraies données disponibles.</p>
        </div>
        <div className="agent-zero-day-actions">
          <button disabled={!priority} onClick={() => onAction('followup', priority)} type="button">+ Relance</button>
          <button disabled={!priority} onClick={() => onAction('visit', priority)} type="button">+ Visite</button>
          <button disabled={!priority} onClick={() => onAction('order', priority)} type="button">+ Commande</button>
        </div>
      </div>

      <div className="agent-zero-day-grid">
        <section className="agent-zero-next-card">
          <div>
            <span>{nextAppointmentItem ? 'Prochain rendez-vous' : 'Priorité terrain'}</span>
            <h2>{nextAppointmentItem?.title || priority?.name || 'Aucune pharmacie priorisée'}</h2>
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

        <aside className="agent-zero-decisions-card">
          <header><div><span>Décisions</span><h2>Priorités immédiates</h2></div><b>{decisions.length || urgentCount}</b></header>
          <div>
            {(decisions.length ? decisions : planning.slice(0, 3)).map((item, index) => (
              <button key={item.id} onClick={() => item.row && onAction(index === 0 ? 'followup' : 'visit', item.row)} type="button">
                <em>{index === 0 ? 'Urgent' : 'Priorité'}</em>
                <span><strong>{item.title}</strong><small>{item.reason || item.meta}</small></span>
                <b>→</b>
              </button>
            ))}
          </div>
        </aside>

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
                <b>{agendaRequiresReconnect ? 'Google Agenda à reconnecter' : agendaConnected ? 'Aucun rendez-vous aujourd’hui' : 'Google Agenda non connecté'}</b>
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
            {planning.map((item, index) => (
              <article className={item.kind === 'activity' && item.type === 'visit' ? 'is-planned-visit' : ''} key={item.id}>
                <strong>{item.kind === 'calendar' || item.kind === 'activity' ? item.time : item.due ? formatDate(item.due) : 'À planifier'}</strong>
                <i className={index === 1 ? 'is-orange' : index === 2 ? 'is-blue' : ''} />
                <div><b>{item.title}</b><small>{item.meta}</small></div>
                <em>{item.kind === 'calendar' ? 'RDV Google' : item.kind === 'activity' ? formatLabel(item.type) : item.kind === 'task' ? (isOverdue(item.due) ? 'En retard' : 'Planifié') : 'Suggestion'}</em>
              </article>
            ))}
          </div>
        </section>

        <aside className="agent-zero-route-card">
          <span>Sur ton trajet · GPS {geoReadyCount}/{rows.length}</span>
          <h2>{routeSuggestion?.row?.name || 'Aucune suggestion fiable'}</h2>
          <p>{routeSuggestion ? `${routeSuggestion.row.city} · ${routeReason}` : 'Ajoute des coordonnées ou une adresse fiable aux pharmacies pour proposer un détour pertinent.'}</p>
          {routeSuggestion?.row
            ? <div className="agent-zero-route-actions"><a href={buildMapsUrl(routeSuggestion.row)} rel="noreferrer" target="_blank">Itinéraire</a><button onClick={() => onAction('visit', routeSuggestion.row)} type="button">Ajouter à la tournée</button><button disabled={geocoding} onClick={onGeocode} type="button">{geocoding ? 'Géocodage…' : 'Affiner GPS'}</button></div>
            : <div className="agent-zero-route-actions"><button disabled type="button">Suggestion indisponible</button><button disabled={geocoding} onClick={onGeocode} type="button">{geocoding ? 'Géocodage…' : 'Géocoder portefeuille'}</button></div>}
        </aside>

        <aside className="agent-zero-assistant-card">
          <header><div><span>Assistant terrain</span><h2>Demande directement</h2></div><b>IA</b></header>
          <div className="agent-zero-ai-command"><input readOnly value="Analyse terrain du jour" /><button onClick={() => setAiExpanded((current) => !current)} type="button">{aiExpanded ? 'Masquer' : 'Analyse IA'}</button></div>
          {aiExpanded && (
            <div className="agent-zero-ai-recommendations">
              {aiRecommendations.map((recommendation, index) => (
                <article key={recommendation.id}>
                  <header>
                    <em>#{index + 1} · {recommendation.action}</em>
                    <strong>{recommendation.row.name}</strong>
                  </header>
                  <p>{recommendation.angle}</p>
                  <small>{recommendation.evidence.join(' · ') || 'signaux limités, recommandation prudente'}</small>
                  <footer>
                    <span>Confiance {recommendation.confidence}</span>
                    <button onClick={() => onAction(recommendation.action === 'Réassort' ? 'order' : recommendation.action === 'Relancer' ? 'followup' : 'visit', recommendation.row)} type="button">{recommendation.nextStep}</button>
                  </footer>
                </article>
              ))}
              {!aiRecommendations.length && <Empty title="Pas assez de signaux" text="Charge les données HubSpot, l’agenda ou l’historique commandes pour obtenir des recommandations utiles." />}
            </div>
          )}
          <footer><button onClick={() => onAction('visit', aiRecommendations[0]?.row || priority)} type="button">Préparer top priorité</button><button onClick={() => onAction('followup', aiRecommendations[0]?.row || priority)} type="button">Créer relance</button><button onClick={() => onAction('order', aiRecommendations.find((item) => item.action === 'Réassort')?.row || priority)} type="button">Préparer commande</button></footer>
        </aside>
      </div>

      <div className="agent-zero-day-metrics">
        <Metric label="CA portefeuille" value={formatMoney(orderTotal)} note={`${activeClients} clients actifs`} />
        <Metric label="À réassortir" value={urgentCount} note="comptes à traiter" tone="orange" />
        <Metric label="DN produit" value={productDistribution.rateLabel} note={productDistribution.note} />
        <Metric label="Missions ouvertes" value={openOrders} note="commandes / actions" />
      </div>
    </div>
  );
}

function PortfolioView({ activeDepartment, departments, onAction, rows, selected, setActiveDepartment, setSelectedPharmacyId, totalRows }) {
  const clusters = buildDepartmentClusters(rows);
  const selectedCluster = clusters.find((cluster) => cluster.department === selected?.department) || clusters[0] || null;
  const geoReadyCount = rows.filter((row) => projectGeoPoint(row.latitude, row.longitude)).length;

  return <div className="agent-zero-view"><Header eyebrow="Portefeuille" title="Carte terrain clients" text="Seuls les départements avec au moins une pharmacie de ton portefeuille sont affichés." />
    <div className="agent-zero-department-strip" aria-label="Filtrer par département">
      <button className={activeDepartment === 'all' ? 'is-active' : ''} onClick={() => setActiveDepartment('all')} type="button"><strong>Tous</strong><span>{totalRows}</span></button>
      {departments.map((item) => <button className={activeDepartment === item.department ? 'is-active' : ''} key={item.department} onClick={() => setActiveDepartment(item.department)} type="button"><strong>{item.department}</strong><span>{item.count}</span></button>)}
    </div>
    <div className="agent-zero-portfolio-grid">
      <section className="agent-zero-map-panel">
        <div className="agent-zero-map-head">
          <div><span>Carte portefeuille</span><strong>{clusters.length} départements actifs · GPS {geoReadyCount}/{rows.length}</strong></div>
          <div className="agent-zero-map-tools"><button type="button">Clients</button><button type="button">Priorités</button></div>
        </div>
        <PortfolioMap clusters={clusters} onSelectDepartment={(department) => {
          setActiveDepartment(department);
          const first = clusters.find((cluster) => cluster.department === department)?.rows?.[0];
          if (first) setSelectedPharmacyId(first.pharmacyId);
        }} onSelectPharmacy={(row) => setSelectedPharmacyId(row.pharmacyId)} selectedDepartment={selected?.department || selectedCluster?.department} selectedPharmacyId={selected?.pharmacyId} />
      </section>

      <aside className="agent-zero-map-account">
        <span className="agent-zero-kicker">Zone active</span>
        <h3>{selectedCluster ? `Département ${selectedCluster.department}` : 'Aucune zone'}</h3>
        <p>{selectedCluster ? `${selectedCluster.count} pharmacie(s), ${formatMoney(selectedCluster.revenue)} de CA suivi, ${selectedCluster.hot} priorité(s).` : 'Le portefeuille ne contient pas encore de pharmacie visible.'}</p>
        <div className="agent-zero-map-stats">
          <div><span>Clients</span><strong>{selectedCluster?.count || 0}</strong></div>
          <div><span>CA suivi</span><strong>{formatMoney(selectedCluster?.revenue || 0)}</strong></div>
          <div><span>Priorités</span><strong>{selectedCluster?.hot || 0}</strong></div>
          <div><span>Sélection</span><strong>{selected?.name ? selected.name.split(' ').slice(0, 2).join(' ') : '—'}</strong></div>
        </div>
        <div className="agent-zero-priority-stack">
          {(selectedCluster?.rows || rows).slice(0, 4).map((row) => (
            <button className={selected?.pharmacyId === row.pharmacyId ? 'is-selected' : ''} key={row.id} onClick={() => setSelectedPharmacyId(row.pharmacyId)} type="button">
              <strong>{row.name}</strong>
              <small>{row.city} · {row.signal.action} · {row.nextActionAt ? formatDate(row.nextActionAt) : 'À planifier'}</small>
            </button>
          ))}
        </div>
      </aside>
    </div>
    <div className="agent-zero-table-head"><span>{rows.length} pharmacies</span><span>Client · ville · prochaine action</span></div>
    <div className="agent-zero-account-list">{rows.map((row) => <button className={selected?.pharmacyId === row.pharmacyId ? 'is-selected' : ''} key={row.id} onClick={() => setSelectedPharmacyId(row.pharmacyId)} type="button"><div><strong>{row.name}</strong><small>{row.city} · Dpt {row.department} · {row.brandName}</small></div><span>{row.signal.action}</span><em>{row.nextActionAt ? formatDate(row.nextActionAt) : 'À planifier'}</em></button>)}</div>
    <div className="agent-zero-inline-actions"><button onClick={() => onAction('call')} type="button">Appeler</button><button onClick={() => onAction('visit')} type="button">Préparer visite</button><button onClick={() => onAction('order')} type="button">Créer commande</button></div>
  </div>;
}

function PortfolioMap({ clusters, onSelectDepartment, onSelectPharmacy, selectedDepartment, selectedPharmacyId }) {
  const clusterByDepartment = new Map(clusters.map((cluster) => [cluster.department, cluster]));
  const activeDepartments = new Set(clusters.map((cluster) => cluster.department));
  const visibleDepartments = FRANCE_DEPARTMENTS.filter((department) => activeDepartments.has(department.code));
  const pharmacyPoints = clusters.flatMap((cluster) => cluster.rows.map((row, index) => ({
    ...buildPharmacyMapPoint(row, cluster, index),
    cluster,
    row,
  })));

  return (
    <div className="agent-zero-map-stage">
      <svg aria-label="Carte des départements clients de l’agent" className="agent-zero-france-shape" role="img" viewBox={buildMapViewBox(clusters)}>
        {visibleDepartments.map((department) => {
          const cluster = clusterByDepartment.get(department.code);
          return (
            <path
              className={`agent-zero-department-path has-clients ${cluster?.hot ? 'is-hot' : ''} ${selectedDepartment === department.code ? 'is-selected' : ''}`}
              d={department.path}
              key={department.code}
              onClick={() => onSelectDepartment(department.code)}
            >
              <title>{`${department.code} · ${department.name} · ${cluster.count} client(s)`}</title>
            </path>
          );
        })}
        {pharmacyPoints.map(({ precise, row, x, y }) => (
          <g
            className={`agent-zero-pharmacy-pin ${precise ? 'is-precise' : 'is-approximate'} ${selectedPharmacyId === row.pharmacyId ? 'is-selected' : ''}`}
            key={row.pharmacyId}
            onClick={() => onSelectPharmacy(row)}
            role="button"
            tabIndex="0"
            transform={`translate(${x} ${y})`}
          >
            <title>{[row.name, row.addressLine1, row.postalCode, row.city, precise ? 'GPS précis' : 'Position approximative département'].filter(Boolean).join(' · ')}</title>
            <circle r="0.82" />
            <text y="-1.35">{row.name.split(' ').slice(0, 2).join(' ')}</text>
          </g>
        ))}
      </svg>
      <div className="agent-zero-map-summary">
        <span>Départements clients</span>
        <strong>{clusters.reduce((sum, cluster) => sum + cluster.count, 0)}</strong>
        <small>pharmacies affichées</small>
      </div>
      {clusters.map((cluster) => (
        <button
          className={`agent-zero-map-zone ${selectedDepartment === cluster.department ? 'is-selected' : ''} ${cluster.hot ? 'is-hot' : ''}`}
          key={cluster.department}
          onClick={() => onSelectDepartment(cluster.department)}
          style={{ '--x': `${cluster.x}%`, '--y': `${cluster.y}%`, '--weight': Math.min(10, cluster.count) }}
          type="button"
        >
          <strong>{cluster.department}</strong>
          <span>{cluster.count} client{cluster.count > 1 ? 's' : ''}</span>
          <small>{formatMoney(cluster.revenue)}</small>
        </button>
      ))}
      <div className="agent-zero-map-legend">
        <span><i /> Département actif</span>
        <span><i className="is-hot" /> GPS précis</span>
        <span><i className="is-soft" /> Approx. département</span>
      </div>
    </div>
  );
}

function VisitView({ onAction, selected }) {
  return <div className="agent-zero-view"><Header eyebrow="Préparation visite" title={selected?.name || 'Choisis une pharmacie'} text="Objectif : arriver avec le contexte, l’historique et la prochaine action claire." />
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
  const labels = { call: 'Appel', visit: 'Visite', order: 'Commande', note: 'Compte rendu', followup: 'Relance' };
  const activityTypes = { call: 'call', visit: 'visit', note: 'note' };
  const isFollowUp = action.type === 'followup';
  const isOrder = action.type === 'order';
  const isVisit = action.type === 'visit';
  const brandId = action.row?.relation?.brand_id || null;
  const brandProducts = (products || []).filter((product) => !brandId || product.brand_id === brandId);
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
    } else {
      const plannedVisitAt = isVisit ? `${visitDate}T${visitTime}:00` : null;
      result = await onCreateActivity?.({
        ...common,
        activityDate: plannedVisitAt,
        durationMinutes: isVisit ? durationMinutes : null,
        notes: note || `${labels[action.type] || 'Action'} enregistrée depuis l’espace agent.`,
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
        <p>{isOrder ? 'Crée un brouillon commande rattaché à la pharmacie et à ton portefeuille.' : isFollowUp ? 'Planifie une relance terrain rattachée à cette pharmacie.' : isVisit ? 'Planifie une visite terrain et ajoute-la à ton agenda si Google est connecté.' : 'Enregistre immédiatement cette action dans l’historique terrain.'}</p>
        <div className="agent-zero-drawer-grid">
          <div><span>Pharmacie</span><strong>{action.row?.name}</strong></div>
          <div><span>Marque</span><strong>{action.row?.brandName}</strong></div>
          <div><span>Ville</span><strong>{action.row?.city}</strong></div>
          <div><span>Priorité</span><strong>{formatLabel(action.row?.priority)}</strong></div>
        </div>
        <form className="agent-zero-action-form" onSubmit={submit}>
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
                {!filteredProducts.length && <div className="agent-zero-empty"><strong>Aucun produit trouvé</strong><span>Vérifie le catalogue ou ajuste ta recherche.</span></div>}
              </div>
              <div className="agent-zero-order-total"><span>{selectedLines.length} lignes · remise {formatMoney(selectedDiscountAmount)}</span><strong>{formatMoney(selectedTotal)} HT</strong></div>
            </div>
          )}
          <label><span>{isOrder ? 'Note commande' : isFollowUp ? 'Motif' : isVisit ? 'Objectif de visite' : 'Compte rendu rapide'}</span><textarea onChange={(event) => setNote(event.target.value)} placeholder={isVisit ? 'Ex. Réassort, implantation, formation équipe…' : 'Ajoute une note courte…'} rows="4" value={note} /></label>
          {!isOrder && !isFollowUp && !isVisit && <label><span>Prochaine action optionnelle</span><input onChange={(event) => setNextActionAt(event.target.value)} type="date" value={nextActionAt} /></label>}
          {message && <div className={message.includes('introuvable') || message.includes('Sélectionne') ? 'agent-zero-form-message is-error' : 'agent-zero-form-message'}>{message}</div>}
          <button className="agent-zero-confirm" disabled={saving} type="submit">{saving ? 'Enregistrement…' : isOrder ? 'Créer le brouillon' : isFollowUp ? 'Planifier la relance' : isVisit ? 'Planifier la visite' : 'Enregistrer l’action'}</button>
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

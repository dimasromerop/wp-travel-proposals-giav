import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  TextControl,
  SelectControl,
  ToggleControl,
  TextareaControl,
} from '@wordpress/components';

import API from '../../api';
import CatalogSelect from '../CatalogSelect';
import SupplierSearchSelect from '../SupplierSearchSelect';

const DEFAULT_SUPPLIER_ID = '1734698';
const DEFAULT_SUPPLIER_NAME = 'Proveedores varios';
const TODAY_ISO = new Date().toISOString().slice(0, 10);


const SERVICE_TYPES = [
  { label: 'Hotel', value: 'hotel' },
  { label: 'Golf', value: 'golf' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Extra', value: 'extra' },
  { label: 'Paquete', value: 'package' },
];

const HOTEL_REGIMENS = [
  { label: 'Alojamiento y Desayuno', value: 'AD' },
  { label: 'Solo Alojamiento', value: 'SA' },
  { label: 'Media Pensión', value: 'MP' },
  { label: 'Pensión Completa', value: 'PC' },
  { label: 'Todo Incluido', value: 'TI' },
  { label: 'Según Programa', value: 'SP' },
];

function toNumber(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function toInt(v, fallback = 1) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function clampNumber(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function daysDiff(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  // Use UTC dates to avoid timezone shifting (e.g. local midnight -> previous day in ISO).
  const [sy, sm, sd] = String(startISO).split('-').map((x) => parseInt(x, 10));
  const [ey, em, ed] = String(endISO).split('-').map((x) => parseInt(x, 10));
  if (![sy, sm, sd, ey, em, ed].every((n) => Number.isFinite(n))) return 0;
  const s = Date.UTC(sy, sm - 1, sd);
  const e = Date.UTC(ey, em - 1, ed);
  const ms = e - s;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDaysISO(startISO, days) {
  if (!startISO) return '';
  const [y, m, d] = String(startISO).split('-').map((x) => parseInt(x, 10));
  if (![y, m, d].every((n) => Number.isFinite(n))) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

function buildNightlyRateRows(startISO, endISO, defaultNet = '', defaultMargin = 0) {
  const nights = daysDiff(startISO, endISO);
  if (nights <= 0) return [];
  const rows = [];
  for (let i = 0; i < nights; i++) {
    rows.push({
      date: addDaysISO(startISO, i),
      net_price: defaultNet,
      margin_pct: defaultMargin,
    });
  }
  return rows;
}

function normalizeNightlyRates(rates, startISO, endISO, fallbackNet = '', fallbackMargin = 0) {
  const expected = buildNightlyRateRows(startISO, endISO, fallbackNet, fallbackMargin);
  if (!expected.length) return [];
  const map = new Map();
  (Array.isArray(rates) ? rates : []).forEach((r) => {
    const d = r?.date;
    if (!d) return;
    if (!map.has(d)) {
      map.set(d, {
        date: d,
        net_price: r.net_price ?? r.net ?? r.net_price_per_night ?? fallbackNet,
        margin_pct: r.margin_pct ?? r.margin ?? fallbackMargin,
      });
    }
  });
  return expected.map((base) => {
    const existing = map.get(base.date);
    return existing ? { ...base, ...existing } : base;
  });
}

function computeNightlySums(rates = [], freeNights = 0, discountPct = 0) {
  const rows = (Array.isArray(rates) ? rates : []).map((r) => ({
    date: r?.date,
    net: Math.max(0, toNumber(r?.net_price ?? r?.net ?? 0)),
    margin: Math.max(0, toNumber(r?.margin_pct ?? r?.margin ?? 0)),
  }));
  const valid = rows.filter((r) => !!r.date);
  if (!valid.length) return { netSum: 0, pvpSum: 0 };

  // Remove free nights by taking the cheapest net nights (client-friendly and deterministic).
  const freebies = Math.max(0, toInt(freeNights, 0));
  const sortedIdx = valid
    .map((r, idx) => ({ idx, net: r.net }))
    .sort((a, b) => a.net - b.net)
    .slice(0, freebies)
    .map((x) => x.idx);
  const freeSet = new Set(sortedIdx);

  const discount = clampNumber(toNumber(discountPct), 0, 50) / 100;

  let netSum = 0;
  let pvpSum = 0;
  valid.forEach((r, idx) => {
    if (freeSet.has(idx)) return;
    const discountedNet = r.net * (1 - discount);
    netSum += discountedNet;
    pvpSum += discountedNet * (1 + r.margin / 100);
  });

  return { netSum: round2(netSum), pvpSum: round2(pvpSum) };
}

function computeNights(item, basics) {
  const start = item.start_date || basics?.start_date || '';
  const end = item.end_date || basics?.end_date || '';
  return daysDiff(start, end);
}

function getDefaultRoomPricing(defaultMarkupPct = 0) {
  return {
    double: {
      enabled: true,
      rooms: 1,
      pricing_basis: 'per_room',
      net_price_per_night: '',
      margin_pct: defaultMarkupPct,
      pvp_manual_enabled: false,
      pvp_price_per_night: '',
      nights_payable: 0,
      free_nights_applied: 0,
      discount_pct_applied: 0,
      total_net: 0,
      total_pvp: 0,
    },
    single: {
      enabled: false,
      rooms: 0,
      pricing_basis: 'per_room',
      net_price_per_night: '',
      margin_pct: defaultMarkupPct,
      pvp_manual_enabled: false,
      pvp_price_per_night: '',
      nights_payable: 0,
      free_nights_applied: 0,
      discount_pct_applied: 0,
      total_net: 0,
      total_pvp: 0,
    },
  };
}

function normalizeDiscounts(discounts = {}) {
  const discountPct = clampNumber(toNumber(discounts.discount_pct ?? 0), 0, 50);
  const freeEvery = Math.max(0, toInt(discounts.free_nights_every ?? 0, 0));
  const freeCount = Math.max(0, toInt(discounts.free_nights_count ?? 0, 0));

  return {
    discount_pct: discountPct,
    free_nights_every: freeEvery || '',
    free_nights_count: freeCount || '',
  };
}

function computeFreeNights(nights, freeEvery, freeCount) {
  const every = Math.max(0, toInt(freeEvery ?? 0, 0));
  const count = Math.max(0, toInt(freeCount ?? 0, 0));
  if (every <= 0 || count <= 0 || nights <= 0) {
    return { freeNights: 0, nightsPayable: Math.max(0, nights) };
  }
  const blocks = Math.floor(nights / every);
  const freeNights = Math.min(nights, blocks * count);
  return {
    freeNights,
    nightsPayable: Math.max(0, nights - freeNights),
  };
}

function buildDiscountSummary(discounts = {}) {
  const discountPct = Math.max(0, toNumber(discounts.discount_pct ?? 0));
  const freeEvery = Math.max(0, toInt(discounts.free_nights_every ?? 0, 0));
  const freeCount = Math.max(0, toInt(discounts.free_nights_count ?? 0, 0));
  const parts = [];
  if (discountPct > 0) {
    parts.push(`-${round2(discountPct)}%`);
  }
  if (freeEvery > 0 && freeCount > 0) {
    parts.push(`+${freeCount} gratis cada ${freeEvery}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'Sin descuentos';
}

function buildPackageDiscountSummary(discountPct = 0) {
  const pct = clampNumber(toNumber(discountPct), 0, 100);
  return pct > 0 ? `-${round2(pct)}%` : 'Sin descuentos';
}

function computeHotelPricing(item, basics, defaultMarkupPct) {
  const nights = computeNights(item, basics);
  const fallbackRooms = Math.max(0, toInt(item.hotel_rooms ?? 0, 0));

  const pricingMode = item.hotel_pricing_mode === 'per_night' ? 'per_night' : 'simple';
  const startISO = item.start_date || basics?.start_date || '';
  const endISO = item.end_date || basics?.end_date || '';

  const discounts = normalizeDiscounts(item.discounts);
  const { freeNights, nightsPayable } = computeFreeNights(
    nights,
    discounts.free_nights_every,
    discounts.free_nights_count
  );

  const baseMarkup = item.use_markup
    ? toNumber(item.markup_pct ?? defaultMarkupPct ?? 0)
    : 0;
  const currentPricing = item.room_pricing || getDefaultRoomPricing(defaultMarkupPct);

  const buildMode = (modeKey, fallback) => {
    const raw = currentPricing?.[modeKey] || {};
    const netFallback = fallback.net_price_per_night ?? 0;
    const pvpFallback = fallback.pvp_price_per_night ?? 0;

    const hasNet = raw.net_price_per_night !== undefined && raw.net_price_per_night !== '';
    const hasPvp = raw.pvp_price_per_night !== undefined && raw.pvp_price_per_night !== '';
    const hasMargin = raw.margin_pct !== undefined && raw.margin_pct !== '';
    const hasRooms = raw.rooms !== undefined && raw.rooms !== '';

    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
      rooms: hasRooms ? Math.max(0, toInt(raw.rooms ?? 0, 0)) : fallback.rooms,
      pricing_basis: raw.pricing_basis || fallback.pricing_basis,
      net_price_per_night: hasNet ? toNumber(raw.net_price_per_night) : netFallback,
      margin_pct: hasMargin ? toNumber(raw.margin_pct) : fallback.margin_pct,
      pvp_manual_enabled: typeof raw.pvp_manual_enabled === 'boolean'
        ? raw.pvp_manual_enabled
        : fallback.pvp_manual_enabled,
      pvp_price_per_night: hasPvp ? toNumber(raw.pvp_price_per_night) : pvpFallback,
      nights_payable: 0,
      free_nights_applied: 0,
      discount_pct_applied: discounts.discount_pct,
      total_net: 0,
      total_pvp: 0,
    };
  };

  const doubleFallback = {
    enabled: true,
    rooms: fallbackRooms > 0 ? fallbackRooms : 1,
    pricing_basis: 'per_room',
    net_price_per_night: item.unit_cost_net ?? 0,
    margin_pct: baseMarkup,
    pvp_manual_enabled: !!item.lock_sell_price,
    pvp_price_per_night: item.unit_sell_price ?? 0,
  };
  const singleFallback = {
    enabled: false,
    rooms: 0,
    pricing_basis: 'per_room',
    net_price_per_night: 0,
    margin_pct: baseMarkup,
    pvp_manual_enabled: false,
    pvp_price_per_night: 0,
  };

  const roomPricing = {
    double: buildMode('double', doubleFallback),
    single: buildMode('single', singleFallback),
  };

  // Per-night mode: normalize nightly rows to match the date range.
  // Defaults: try to reuse current double net per night, or fallback to unit_cost_net.
  const nightlyRates = pricingMode === 'per_night'
    ? normalizeNightlyRates(
        item.nightly_rates || item.hotel_nightly_rates || [],
        startISO,
        endISO,
        roomPricing.double?.net_price_per_night ?? item.unit_cost_net ?? '',
        item.markup_pct ?? defaultMarkupPct ?? 0
      )
    : [];
  const nightlySums = pricingMode === 'per_night'
    ? computeNightlySums(nightlyRates, freeNights, discounts.discount_pct)
    : null;

  const totalsByMode = ['double', 'single'].map((modeKey) => {
    const mode = roomPricing[modeKey];
    if (!mode.enabled) {
      return { totalNet: 0, totalPvp: 0 };
    }

    const rooms = Math.max(0, toInt(mode.rooms ?? 0, 0));
    const pricingBasis = modeKey === 'double' ? (mode.pricing_basis || 'per_room') : 'per_room';
    const units = pricingBasis === 'per_person' ? rooms * 2 : rooms;
    const netAfterDiscount = pricingMode === 'per_night'
      ? Math.max(0, nightlySums?.netSum ?? 0) * units
      : (Math.max(0, mode.net_price_per_night) * nightsPayable * units) * (1 - discounts.discount_pct / 100);

    const totalPvp = mode.pvp_manual_enabled
      ? Math.max(0, mode.pvp_price_per_night) * nightsPayable * units
      : pricingMode === 'per_night'
        ? Math.max(0, nightlySums?.pvpSum ?? 0) * units
        : netAfterDiscount * (1 + Math.max(0, mode.margin_pct) / 100);

    roomPricing[modeKey] = {
      ...mode,
      pricing_basis: pricingBasis,
      nights_payable: nightsPayable,
      free_nights_applied: freeNights,
      discount_pct_applied: discounts.discount_pct,
      total_net: round2(netAfterDiscount),
      total_pvp: round2(totalPvp),
    };

    return {
      totalNet: round2(netAfterDiscount),
      totalPvp: round2(totalPvp),
    };
  });

  const totalNet = totalsByMode.reduce((acc, it) => acc + it.totalNet, 0);
  const totalPvp = totalsByMode.reduce((acc, it) => acc + it.totalPvp, 0);

  const enabledModes = ['double', 'single'].filter((modeKey) => roomPricing[modeKey].enabled);
  const computedSource = enabledModes.length === 1 ? enabledModes[0] : 'custom';

  const giavPricing = {
    ...item.giav_pricing,
    giav_total_net: round2(totalNet),
    giav_total_pvp: item.giav_pricing?.giav_locked
      ? round2(toNumber(item.giav_pricing?.giav_total_pvp))
      : round2(totalPvp),
    giav_source: item.giav_pricing?.giav_locked ? 'custom' : computedSource,
    giav_locked: !!item.giav_pricing?.giav_locked,
  };

  return {
    discounts,
    roomPricing,
    nightlyRates: pricingMode === 'per_night' ? nightlyRates : null,
    pricingMode,
    giavPricing,
    totals: {
      nights,
      nightsPayable,
      freeNights,
      totalNet: round2(totalNet),
      totalPvp: round2(totalPvp),
    },
  };
}
export function computeGolfTotals(item = {}, players = 1) {
  const safePlayers = Math.max(1, toInt(players, 1));
  let greenFeesPerPerson = Math.max(0, toInt(item.green_fees_per_person ?? 0, 0));
  let totalGreenFees = Math.max(0, toInt(item.total_green_fees ?? 0, 0));
  const legacyQuantity = Math.max(0, toInt(item.quantity ?? 0, 0));

  if (greenFeesPerPerson > 0) {
    totalGreenFees = greenFeesPerPerson * safePlayers;
  } else if (totalGreenFees > 0) {
    greenFeesPerPerson = Math.max(1, Math.round(totalGreenFees / safePlayers));
    totalGreenFees = greenFeesPerPerson * safePlayers;
  } else if (legacyQuantity > 0) {
    totalGreenFees = legacyQuantity;
    greenFeesPerPerson = Math.max(1, Math.round(totalGreenFees / safePlayers));
    totalGreenFees = greenFeesPerPerson * safePlayers;
  } else {
    greenFeesPerPerson = 1;
    totalGreenFees = greenFeesPerPerson * safePlayers;
  }

  return {
    greenFeesPerPerson,
    totalGreenFees,
  };
}

function computeUnitSellFromMarkup(unitNet, markupPct) {
  const net = Math.max(0, toNumber(unitNet));
  const pct = Math.max(0, toNumber(markupPct));
  return round2(net * (1 + pct / 100));
}

function defaultItem(basics, defaultMarkupPct = 0) {
  const start_date = basics?.start_date || '';
  const end_date = basics?.end_date || '';
  const roomPricing = getDefaultRoomPricing(defaultMarkupPct);

  return {
    service_type: 'hotel',
    title: '',
    start_date,
    end_date,

    // Hotel-specific
    hotel_room_type: '',
    hotel_regimen: '',
    hotel_rooms: 0,
    hotel_rate_basis: null,
    hotel_regimen: '',
    hotel_pricing_mode: 'simple',
    nightly_rates: [],

    // Generic quantity for non-hotel
    quantity: 1,

    // Golf-specific
    green_fees_per_person: 1,
    number_of_players: basics?.players_count ?? basics?.pax_total ?? 1,
    total_green_fees: 0,

    // Pricing
    unit_cost_net: '',
    unit_sell_price: '',

    // Markup controls
    use_markup: true,
    markup_pct: defaultMarkupPct,
    lock_sell_price: false,

    notes_public: '',
    notes_internal: '',

    // Paquete: descripción de lo que incluye (solo texto, sin precios por línea)
    package_components_text: '',

    // Paquete: pricing (similar a hotel)
    package_pricing_basis: 'per_room', // 'per_room' | 'per_person'
    package_discount_percent: 0,
    package_quote_individual: false, // cotizar individual (informativo)
    package_individual_mode: 'absolute', // 'absolute' | 'supplement'
    package_individual_qty: 0,
    package_unit_cost_net_individual: '',
    package_unit_sell_price_individual: '',
    package_single_supplement_net: '',
    package_single_supplement_pvp: '',

    // Backward-compatible package fields (legacy)
    package_individual_count: 0, // per_person: nº personas en individual
    unit_cost_net_individual: '',
    unit_sell_price_individual: '',
    package_single_supplement_sell: '',

    package_quote_single_rooms: false, // per_room: cotizar hab. indiv. (informativo)
    package_single_rooms: 0,
    package_single_room_mode: 'absolute', // 'absolute' | 'supplement'
    unit_cost_net_single_room: '',
    unit_sell_price_single_room: '',
    package_single_room_supplement_net: '',
    package_single_room_supplement_sell: '',

    display_name: '',
    use_manual_entry: false,
    // --- WP refs (catalog) ---
    wp_object_type: null, // 'hotel' | 'course'
    wp_object_id: null,

    // --- GIAV mapping snapshot ---
    giav_entity_type: null,     // 'supplier' | 'service' | 'product'
    giav_entity_id: null,
    // Default supplier: generic bucket in GIAV (valid, but should be reviewed)
    giav_supplier_id: DEFAULT_SUPPLIER_ID,
    giav_supplier_name: DEFAULT_SUPPLIER_NAME,
    giav_mapping_status: 'needs_review', // 'active' | 'needs_review' | 'deprecated' | 'missing'
    show_supplier_picker: false,
    supplier_override: false,
    dates_inherited: true,

    // Hotel pricing
    room_pricing: roomPricing,
    discounts: {
      discount_pct: 0,
      free_nights_every: '',
      free_nights_count: '',
    },
    giav_pricing: {
      giav_total_pvp: 0,
      giav_total_net: 0,
      giav_source: 'double',
      giav_locked: false,
    },

  };
}

function computeLine(item, basics, globalMarkupPct) {
  const it = { ...item };

  if (!it.start_date) it.start_date = basics?.start_date || '';
  if (!it.end_date) it.end_date = basics?.end_date || '';

  it.quantity = Math.max(1, toInt(it.quantity, 1));
  if (it.hotel_rooms !== undefined) {
    it.hotel_rooms = Math.max(0, toInt(it.hotel_rooms, 0));
  }
  it.unit_cost_net = Math.max(0, toNumber(it.unit_cost_net));

  const effectiveMarkup = it.use_markup ? Math.max(0, toNumber(it.markup_pct ?? globalMarkupPct ?? 0)) : 0;
  it.markup_pct = effectiveMarkup;

  if (!it.lock_sell_price) {
    it.unit_sell_price = computeUnitSellFromMarkup(it.unit_cost_net, effectiveMarkup);
  } else {
    it.unit_sell_price = Math.max(0, toNumber(it.unit_sell_price));
  }

  if (it.service_type === 'hotel') {
    const nights = computeNights(it, basics);
    it.hotel_nights = nights;

    const pricing = computeHotelPricing(it, basics, effectiveMarkup);
    it.room_pricing = pricing.roomPricing;
    it.discounts = pricing.discounts;
    it.giav_pricing = pricing.giavPricing;

    // Per-night optional payload (kept even when toggled off, but only affects totals when pricing_mode=per_night).
    it.hotel_pricing_mode = pricing.pricingMode;
    if (pricing.pricingMode === 'per_night') {
      it.nightly_rates = Array.isArray(pricing.nightlyRates) ? pricing.nightlyRates : [];
    }

    it.line_cost_net = pricing.totals.totalNet;
    it.line_sell_price = pricing.giavPricing.giav_total_pvp;

    it.quantity = 1;
    it.unit_cost_net = pricing.totals.totalNet;
    it.unit_sell_price = pricing.giavPricing.giav_total_pvp;
  } else if (it.service_type === 'golf') {
    // Players count must come from proposal basics (single source of truth)
    const playersFromBasics = Math.max(0, toInt(basics?.players_count ?? 0, 0));
    const playersForCalc = playersFromBasics > 0 ? playersFromBasics : 1; // avoid divide by zero in calc
    const { greenFeesPerPerson, totalGreenFees } = computeGolfTotals(it, playersForCalc);

    // Persist the proposal-level players count onto the line (read-only), but ignore any per-line override
    it.number_of_players = playersFromBasics;
    it.green_fees_per_person = greenFeesPerPerson;
    it.total_green_fees = totalGreenFees;
    it.quantity = totalGreenFees;

    it.line_cost_net = round2(totalGreenFees * it.unit_cost_net);
    it.line_sell_price = round2(totalGreenFees * it.unit_sell_price);
  } else if (it.service_type === 'package') {
    const basis = it.package_pricing_basis === 'per_room' ? 'per_room' : 'per_person';
    const paxTotal = Math.max(1, toInt(basics?.pax_total ?? 1, 1));
    const discountPctRaw = clampNumber(toNumber(it.package_discount_percent ?? 0), 0, 100);
    const discountFactor = 1 - discountPctRaw / 100;
    it.package_discount_percent = discountPctRaw;

    // Quantity rules
    if (basis === 'per_person') {
      const fallbackQty = paxTotal > 0 ? paxTotal : 1;
      it.quantity = Math.max(1, toInt(it.quantity ?? fallbackQty, fallbackQty));
    } else {
      it.quantity = Math.max(1, toInt(it.quantity, 1));
    }

    // Base (double) net & sell (discount applied)
    const baseNetInput = Math.max(0, toNumber(it.unit_cost_net));
    const baseNet = round2(baseNetInput * discountFactor);
    it.unit_cost_net = baseNet;

    const computeSell = (netVal) => computeUnitSellFromMarkup(netVal, effectiveMarkup);

    // Double sell (per-person or per-room)
    let doubleSell;
    if (!it.lock_sell_price) {
      doubleSell = computeSell(baseNet);
    } else {
      const baseSellInput = Math.max(0, toNumber(it.unit_sell_price));
      doubleSell = round2(baseSellInput * discountFactor);
    }
    it.unit_sell_price = doubleSell;

    // Totals (only include the confirmed/base quote, NOT the informative individual option)
    it.line_cost_net = round2(it.quantity * it.unit_cost_net);
    it.line_sell_price = round2(it.quantity * it.unit_sell_price);

    // Persist derived pricing for snapshot/viewer (so client can see both prices)
    // Per-person
    it.package_pp_double = basis === 'per_person' ? doubleSell : it.package_pp_double;
    // Per-room
    it.package_room_double = basis === 'per_room' ? doubleSell : it.package_room_double;

    // Individual quote (informative / optional)
    const quoteIndividual =
      !!it.package_quote_individual || (basis === 'per_room' && !!it.package_quote_single_rooms);
    const modeSource =
      it.package_individual_mode ||
      (basis === 'per_room' ? it.package_single_room_mode : '') ||
      'absolute';
    const mode = modeSource === 'supplement' ? 'supplement' : 'absolute';

    // Counts (kept for UI and snapshot)
    const individualQtyRaw =
      basis === 'per_person'
        ? it.package_individual_qty ?? it.package_individual_count
        : it.package_individual_qty ?? it.package_single_rooms;
    const individualQty = Math.max(0, toInt(individualQtyRaw ?? 0, 0));
    it.package_individual_qty = individualQty;
    it.package_individual_count = basis === 'per_person' ? individualQty : it.package_individual_count;
    it.package_single_rooms = basis === 'per_room' ? individualQty : it.package_single_rooms;

    it.package_quote_individual = quoteIndividual;
    if (basis === 'per_room') {
      it.package_quote_single_rooms = quoteIndividual;
    }
    it.package_individual_mode = mode;
    if (basis === 'per_room') {
      it.package_single_room_mode = mode;
    }

    if (quoteIndividual) {
      const isPerRoom = basis === 'per_room';
      const suppNetInput = Math.max(
        0,
        toNumber(isPerRoom ? it.package_single_room_supplement_net ?? 0 : it.package_single_supplement_net ?? 0)
      );
      const suppSellInput = Math.max(
        0,
        toNumber(isPerRoom ? it.package_single_room_supplement_sell ?? 0 : it.package_single_supplement_sell ?? 0)
      );
      const indivNetInput = toNumber(
        isPerRoom ? it.unit_cost_net_single_room ?? '' : it.unit_cost_net_individual ?? ''
      );
      const indivSellInput = Math.max(
        0,
        toNumber(isPerRoom ? it.unit_sell_price_single_room ?? 0 : it.unit_sell_price_individual ?? 0)
      );

      if (mode === 'supplement') {
        const suppNet = round2(suppNetInput * discountFactor);
        const indivNet = round2(baseNet + suppNet);

        let indivSell;
        if (!it.lock_sell_price) {
          indivSell = computeSell(indivNet);
        } else if (suppSellInput > 0) {
          indivSell = round2(doubleSell + round2(suppSellInput * discountFactor));
        } else if (indivSellInput > 0) {
          indivSell = round2(indivSellInput * discountFactor);
        } else {
          indivSell = doubleSell;
        }

        it.package_single_supplement = round2(indivSell - doubleSell);
        it.package_single_supplement_net = suppNetInput;
        it.package_single_supplement_pvp = round2(Math.max(0, indivSell - doubleSell));
        if (isPerRoom) {
          it.package_room_single_supplement = round2(indivSell - doubleSell);
          it.package_room_single = indivSell;
        } else {
          it.package_pp_single = indivSell;
        }
      } else {
        const indivNetRaw =
          indivNetInput !== '' && !Number.isNaN(indivNetInput) ? Math.max(0, indivNetInput) : baseNetInput;
        const indivNet = round2(indivNetRaw * discountFactor);

        let indivSell;
        if (!it.lock_sell_price) {
          indivSell = computeSell(indivNet);
        } else if (indivSellInput > 0) {
          indivSell = round2(indivSellInput * discountFactor);
        } else {
          indivSell = doubleSell;
        }

        it.package_unit_cost_net_individual = indivNetRaw;
        it.package_unit_sell_price_individual = indivSell;
        if (isPerRoom) {
          it.unit_cost_net_single_room = indivNetRaw;
          it.package_room_single = indivSell;
          it.package_room_single_supplement = round2(Math.max(0, indivSell - doubleSell));
        } else {
          it.unit_cost_net_individual = indivNetRaw;
          it.package_pp_single = indivSell;
          it.package_single_supplement = round2(Math.max(0, indivSell - doubleSell));
        }
      }
    }
  } else {
    it.line_cost_net = round2(it.quantity * it.unit_cost_net);
    it.line_sell_price = round2(it.quantity * it.unit_sell_price);
  }

  return it;
}

function computeTotals(items) {
  const totals = items.reduce(
    (acc, it) => {
      acc.cost += it.line_cost_net || 0;
      acc.sell += it.line_sell_price || 0;
      return acc;
    },
    { cost: 0, sell: 0 }
  );

  const marginAbs = round2(totals.sell - totals.cost);
  const marginPct = totals.sell > 0 ? round2((marginAbs / totals.sell) * 100) : 0;

  return {
    totals_cost_net: round2(totals.cost),
    totals_sell_price: round2(totals.sell),
    totals_margin_abs: marginAbs,
    totals_margin_pct: marginPct,
  };
}

function HotelPricingPanel({ item, idx, updateItem, currency, pax, basics, globalMarkupPct }) {
  const roomPricing = item.room_pricing || getDefaultRoomPricing(globalMarkupPct);
  const defaultPricing = getDefaultRoomPricing(globalMarkupPct);
  const getMode = (modeKey) => roomPricing[modeKey] || defaultPricing[modeKey];
  const doubleRooms = Math.max(0, toInt(getMode('double').rooms ?? 0, 0));
  const singleRooms = Math.max(0, toInt(getMode('single').rooms ?? 0, 0));
  const allocatedPax =
    (getMode('double').enabled ? doubleRooms * 2 : 0) + (getMode('single').enabled ? singleRooms : 0);
  const allocationDiff = allocatedPax - pax;
  const informativeQuote = !!item.hotel_informative_quote;
  const allocationWarning =
    allocationDiff < 0
      ? `Faltan ${Math.abs(allocationDiff)} pax por asignar a habitaciones`
      : allocationDiff > 0
      ? `Sobran ${allocationDiff} pax asignados`
      : '';
  const nights = Math.max(0, toInt(item.hotel_nights ?? computeNights(item, basics), 0));
  const { nightsPayable } = computeFreeNights(
    nights,
    item.discounts?.free_nights_every,
    item.discounts?.free_nights_count
  );
  const discountSummary = buildDiscountSummary(item.discounts);
  const notesSummary = (item.notes_public || item.notes_internal) ? 'Ver notas' : 'Sin notas';

  const pricingMode = item.hotel_pricing_mode === 'per_night' ? 'per_night' : 'simple';
  const isPerNight = pricingMode === 'per_night';
  const startISO = item.start_date || basics?.start_date || '';
  const endISO = item.end_date || basics?.end_date || '';

  const ensureNightlyRates = (opts = {}) => {
    const first = Array.isArray(item.nightly_rates) && item.nightly_rates.length ? item.nightly_rates[0] : null;
    const fallbackNet =
      opts.fallbackNet ??
      first?.net_price ??
      getMode('double').net_price_per_night ??
      (item.unit_cost_net && nights > 0 ? round2(toNumber(item.unit_cost_net) / nights) : '') ??
      '';
    const fallbackMargin = opts.fallbackMargin ?? first?.margin_pct ?? (item.markup_pct ?? globalMarkupPct ?? 0);
    return normalizeNightlyRates(item.nightly_rates, startISO, endISO, fallbackNet, fallbackMargin);
  };

  const togglePerNight = () => {
    if (!isPerNight) {
      const nextRates = ensureNightlyRates();
      updateItem(idx, { hotel_pricing_mode: 'per_night', nightly_rates: nextRates });
      return;
    }
    updateItem(idx, { hotel_pricing_mode: 'simple' });
  };

  const patchNightRow = (rowIndex, patch) => {
    const current = ensureNightlyRates();
    const next = current.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r));
    updateItem(idx, { nightly_rates: next });
  };

  // Helper functions for updating state inside the map
  const applyRoomPatch = (modeKey, patch) => {
    const prevPricing = item.room_pricing || {};
    const prevMode = prevPricing[modeKey] || {};
    const newMode = { ...prevMode, ...patch };
    const newPricing = { ...prevPricing, [modeKey]: newMode };
    updateItem(idx, { room_pricing: newPricing });
  };

  const updateDiscountField = (key, val) => {
    const prev = item.discounts || {};
    updateItem(idx, { discounts: { ...prev, [key]: val } });
  };

  const toggleGiavLocked = () => {
    const prev = item.giav_pricing || {};
    updateItem(idx, { giav_pricing: { ...prev, giav_locked: !prev.giav_locked } });
  };

  const updateGiavTotal = (val) => {
    const prev = item.giav_pricing || {};
    updateItem(idx, { giav_pricing: { ...prev, giav_total_pvp: val } });
  };

  return (
    <div className="service-card__hotel-panel">
      <div className="service-card__subcard service-card__subcard--nightly">
        <div className="service-card__hotel-nightly-toggle">
          <ToggleControl
            label="Precio variable por noche"
            checked={isPerNight}
            onChange={togglePerNight}
          />
          {isPerNight && (
            <div className="service-card__hotel-nightly-hint">
              El neto y margen se definen por fecha. Los campos "Neto por noche" y "Margen" del modo de habitación se ignoran (salvo PVP manual).
            </div>
          )}
        </div>

        {isPerNight && (
          <details className="service-card__hotel-nightly" open>
            <summary className="service-card__section-summary">
              <span className="service-card__section-summary-title">Desglose por noche</span>
              <span className="service-card__section-summary-meta">
                {daysDiff(startISO, endISO)} noches
              </span>
            </summary>
            <div className="service-card__hotel-nightly-table">
              <div className="service-card__hotel-nightly-row service-card__hotel-nightly-row--head">
                <div>Fecha</div>
                <div>Neto</div>
                <div>Margen (%)</div>
              </div>
              {ensureNightlyRates().map((row, i) => (
                <div key={row.date || i} className="service-card__hotel-nightly-row">
                  <div className="service-card__hotel-nightly-date">{row.date}</div>
                  <TextControl
                    value={String(row.net_price ?? '')}
                    onChange={(v) => patchNightRow(i, { net_price: v })}
                    placeholder="120"
                  />
                  <TextControl
                    type="number"
                    min={0}
                    value={String(row.margin_pct ?? '')}
                    onChange={(v) => patchNightRow(i, { margin_pct: v })}
                    placeholder="20"
                  />
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="service-card__hotel-occupancy">
        {['double', 'single'].map((modeKey) => {
          const label = modeKey === 'double' ? 'Doble' : 'Individual';
          const mode = getMode(modeKey);
          return (
            <div key={modeKey} className="service-card__hotel-occupancy-card">
              <div className="service-card__hotel-occupancy-header">
                <ToggleControl
                  label={`Cotizar ${label.toLowerCase()}`}
                  checked={!!mode.enabled}
                  onChange={() => applyRoomPatch(modeKey, { enabled: !mode.enabled })}
                />
                <span className="service-card__hotel-occupancy-label">{label}</span>
              </div>

              {mode.enabled && (
                <div className="service-card__hotel-occupancy-body">
                  <TextControl
                    label={`Habitaciones ${label.toLowerCase()}`}
                    type="number"
                    min={1}
                    value={String(mode.rooms ?? '')}
                    onChange={(v) => applyRoomPatch(modeKey, { rooms: v })}
                  />

                  {modeKey === 'double' && (
                    <SelectControl
                      label="Precio"
                      value={mode.pricing_basis || 'per_room'}
                      options={[
                        { label: 'Por habitación', value: 'per_room' },
                        { label: 'Por persona', value: 'per_person' },
                      ]}
                      onChange={(v) => applyRoomPatch('double', { pricing_basis: v })}
                    />
                  )}

                  <TextControl
                    label={`Neto por noche (${label.toLowerCase()})`}
                    value={String(mode.net_price_per_night ?? '')}
                    onChange={(v) => applyRoomPatch(modeKey, { net_price_per_night: v })}
                    placeholder="120"
                    disabled={isPerNight}
                  />

                  <details className="service-card__hotel-mode-details">
                    <summary>Margen y PVP</summary>
                    <div className="service-card__hotel-mode-details-grid">
                      <ToggleControl
                        label="PVP manual"
                        checked={!!mode.pvp_manual_enabled}
                        onChange={() =>
                          applyRoomPatch(modeKey, {
                            pvp_manual_enabled: !mode.pvp_manual_enabled,
                          })
                        }
                      />
                      {mode.pvp_manual_enabled ? (
                        <TextControl
                          label={`PVP por noche (${label.toLowerCase()})`}
                          value={String(mode.pvp_price_per_night ?? '')}
                          onChange={(v) => applyRoomPatch(modeKey, { pvp_price_per_night: v })}
                          placeholder="165"
                        />
                      ) : (
                        <TextControl
                          label={isPerNight ? 'Margen (%) (se ignora)' : 'Margen (%)'}
                          type="number"
                          min={0}
                          value={String(mode.margin_pct ?? globalMarkupPct)}
                          onChange={(v) => applyRoomPatch(modeKey, { margin_pct: v })}
                          disabled={isPerNight}
                        />
                      )}
                    </div>
                  </details>

                  <div className="service-card__hotel-total">
                    Total hab. {label.toLowerCase()}: {currency} {round2(mode.total_pvp || 0).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="service-card__hotel-allocation">
        <div className="service-card__hotel-allocation-text">
          Personas asignadas: {allocatedPax} de {pax}
        </div>
        {allocationWarning && (
          <Notice status={informativeQuote && allocationDiff > 0 ? 'info' : 'warning'} isDismissible={false}>
            {allocationWarning}
          </Notice>
        )}
        <ToggleControl
          label="Cotización informativa (permitir habitaciones extra)"
          checked={informativeQuote}
          onChange={(v) => updateItem(idx, { hotel_informative_quote: !!v })}
          help="Actívalo si estás cotizando una habitación adicional solo a efectos informativos (no bloquea si sobran pax asignados)."
        />
      </div>

      <div className="service-card__subcard">
        <details className="service-card__hotel-discounts-collapse">
          <summary className="service-card__section-summary">
            <span className="service-card__section-summary-title">Descuentos</span>
            <span className="service-card__section-summary-meta">{discountSummary}</span>
          </summary>
          <div className="service-card__hotel-discounts">
            <div className="service-card__hotel-discounts-grid">
              <TextControl
                label="Descuento (%)"
                type="number"
                min={0}
                max={50}
                value={String(item.discounts?.discount_pct ?? 0)}
                onChange={(v) => updateDiscountField('discount_pct', v)}
              />
              <TextControl
                label="Noches gratis (cada)"
                type="number"
                min={0}
                value={String(item.discounts?.free_nights_every ?? '')}
                onChange={(v) => updateDiscountField('free_nights_every', v)}
              />
              <TextControl
                label="Noches gratis (cantidad)"
                type="number"
                min={0}
                value={String(item.discounts?.free_nights_count ?? '')}
                onChange={(v) => updateDiscountField('free_nights_count', v)}
              />
            </div>
            {nights > 0 && (
              <div className="service-card__hotel-discount-summary">
                Se cobran {nightsPayable} noches de {nights}
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="service-card__subcard service-card__subcard--giav">
        <div className="service-card__hotel-giav">
          <div className="service-card__hotel-subtitle">Total para GIAV</div>
          <div className="service-card__hotel-giav-grid">
            <div className="service-card__hotel-giav-total">
              <div className="service-card__hotel-giav-label">Total alojamiento (para GIAV)</div>
              <div className="service-card__hotel-giav-value">
                {currency} {round2(item.giav_pricing?.giav_total_pvp || 0).toFixed(2)}
              </div>
            </div>
            <ToggleControl
              label="Editar total para GIAV"
              checked={!!item.giav_pricing?.giav_locked}
              onChange={toggleGiavLocked}
            />
            <TextControl
              label="Total editable"
              value={String(item.giav_pricing?.giav_total_pvp ?? '')}
              onChange={(v) => updateGiavTotal(v)}
              disabled={!item.giav_pricing?.giav_locked}
            />
            {item.giav_pricing?.giav_locked && (
              <Notice status={informativeQuote && allocationDiff > 0 ? 'info' : 'warning'} isDismissible={false}>
                Este total se enviará a GIAV. No se recalculará automáticamente.
              </Notice>
            )}
          </div>
        </div>
      </div>

      <div className="service-card__subcard">
        <details className="service-card__hotel-notes">
          <summary className="service-card__section-summary">
            <span className="service-card__section-summary-title">Notas</span>
            <span className="service-card__section-summary-meta">{notesSummary}</span>
          </summary>
          <div className="service-card__hotel-notes-grid">
            <TextControl
              label="Notas para el cliente (itinerario)"
              value={item.notes_public || ''}
              onChange={(v) => updateItem(idx, { notes_public: v })}
              placeholder="Incluye desayuno. Check-in 15:00."
            />
            <TextControl
              label="Notas internas (solo uso interno)"
              value={item.notes_internal || ''}
              onChange={(v) => updateItem(idx, { notes_internal: v })}
              placeholder="Neto negociado, release 14D."
            />
          </div>
        </details>
      </div>
    </div>
  );
}

export function syncServiceDatesFromBasics(services = [], basics = {}) {
  if (!Array.isArray(services) || !services.length) return services;
  const start = basics?.start_date || '';
  const end = basics?.end_date || '';
  let changed = false;
  const synced = services.map((service) => {
    if (!service || !service.dates_inherited) return service;
    if (service.start_date === start && service.end_date === end) return service;
    changed = true;
    const next = {
      ...service,
      start_date: start,
      end_date: end,
      dates_inherited: true,
    };

    // If hotel is in per-night mode, keep nightly rows aligned with the new date range.
    if (next.service_type === 'hotel' && next.hotel_pricing_mode === 'per_night') {
      // Use first existing row (if any) as defaults.
      const first = Array.isArray(next.nightly_rates) && next.nightly_rates.length ? next.nightly_rates[0] : null;
      const fallbackNet = first?.net_price ?? '';
      const fallbackMargin = first?.margin_pct ?? (next.markup_pct ?? 0);
      next.nightly_rates = normalizeNightlyRates(next.nightly_rates, start, end, fallbackNet, fallbackMargin);
    }

    return next;
  });
  return changed ? synced : services;
}



function PackagePricingPanel({ item, idx, updateItem, currency, pax, globalMarkupPct }) {
  const basis = item.package_pricing_basis === 'per_person' ? 'per_person' : 'per_room';
  const discountPct = clampNumber(toNumber(item.package_discount_percent ?? 0), 0, 100);
  const discountSummary = buildPackageDiscountSummary(discountPct);

  const setBasis = (v) => {
    const nextBasis = v === 'per_person' ? 'per_person' : 'per_room';
    const patch = { package_pricing_basis: nextBasis };
    if (nextBasis === 'per_person') {
      patch.quantity = pax;
    }
    updateItem(idx, patch);
  };

  const isManualPvp = !!item.lock_sell_price;
  const individualEnabled = !!item.package_quote_individual || (basis === 'per_room' && !!item.package_quote_single_rooms);
  const individualMode =
    basis === 'per_room'
      ? (item.package_single_room_mode === 'supplement' ? 'supplement' : 'absolute')
      : (item.package_individual_mode === 'supplement' ? 'supplement' : 'absolute');
  const individualQty = basis === 'per_person'
    ? item.package_individual_qty ?? item.package_individual_count ?? 0
    : item.package_individual_qty ?? item.package_single_rooms ?? 0;

  const updateIndividualQty = (v) => {
    const patch = { package_individual_qty: v };
    if (basis === 'per_person') {
      patch.package_individual_count = v;
    } else {
      patch.package_single_rooms = v;
    }
    updateItem(idx, patch);
  };

  const updateIndividualMode = (v) => {
    const patch = { package_individual_mode: v };
    if (basis === 'per_room') {
      patch.package_single_room_mode = v;
    }
    updateItem(idx, patch);
  };

  const updateIndividualToggle = () => {
    const next = !individualEnabled;
    const patch = { package_quote_individual: next };
    if (basis === 'per_room') {
      patch.package_quote_single_rooms = next;
    }
    updateItem(idx, patch);
  };

  return (
    <div className="service-card__hotel-panel service-card__package-panel">
      <div className="service-card__hotel-occupancy">
        <div className="service-card__hotel-occupancy-card">
          <div className="service-card__hotel-occupancy-header">
            <span className="service-card__hotel-occupancy-label">Doble</span>
          </div>
          <div className="service-card__hotel-occupancy-body">
            <SelectControl
              label="Precio del paquete"
              value={basis}
              options={[
                { label: 'Por habitación/paquete', value: 'per_room' },
                { label: 'Por persona (en doble)', value: 'per_person' },
              ]}
              onChange={setBasis}
            />
            <TextControl
              label={basis === 'per_person' ? __('Personas en doble', 'wp-travel-giav') : 'Cantidad (habitaciones/paquetes)'}
              type="number"
              min={1}
              value={String(item.quantity ?? 1)}
              onChange={(v) => updateItem(idx, { quantity: v })}
              help={basis === 'per_person' ? `${__('Pax total:', 'wp-travel-giav')} ${pax}` : ''}
            />
            <TextControl
              label={basis === 'per_person' ? 'Coste neto (por persona en doble)' : 'Coste neto (hab./paquete doble)'}
              value={String(item.unit_cost_net ?? '')}
              onChange={(v) => updateItem(idx, { unit_cost_net: v })}
              placeholder="120"
            />
            <details className="service-card__hotel-mode-details">
              <summary>Margen y PVP</summary>
              <div className="service-card__hotel-mode-details-grid">
                <ToggleControl
                  label="Usar margen"
                  checked={!!item.use_markup}
                  onChange={() => updateItem(idx, { use_markup: !item.use_markup })}
                />
                {item.use_markup && (
                  <TextControl
                    label="Margen (%)"
                    type="number"
                    min={0}
                    value={String(item.markup_pct ?? globalMarkupPct)}
                    onChange={(v) => updateItem(idx, { markup_pct: v })}
                  />
                )}
                <ToggleControl
                  label="PVP manual"
                  checked={!!item.lock_sell_price}
                  onChange={() => updateItem(idx, { lock_sell_price: !item.lock_sell_price })}
                />
                <TextControl
                  label={basis === 'per_person' ? 'PVP (por persona en doble)' : 'PVP (hab./paquete doble)'}
                  value={String(item.unit_sell_price ?? '')}
                  onChange={(v) => updateItem(idx, { unit_sell_price: v })}
                  placeholder="165"
                  disabled={!item.lock_sell_price}
                  help={discountPct > 0 ? `Descuento aplicado: -${discountPct}%` : ''}
                />
              </div>
            </details>
          </div>
        </div>

        <div className="service-card__hotel-occupancy-card">
          <div className="service-card__hotel-occupancy-header">
            <ToggleControl
              label={__('Cotizar individual (informativo)', 'wp-travel-giav')}
              checked={individualEnabled}
              onChange={updateIndividualToggle}
            />
            <span className="service-card__hotel-occupancy-label">Individual</span>
          </div>

          {individualEnabled && (
            <div className="service-card__hotel-occupancy-body">
              <TextControl
                label={basis === 'per_person' ? 'Personas en individual' : 'Habitaciones individuales'}
                type="number"
                min={0}
                value={String(individualQty ?? 0)}
                onChange={updateIndividualQty}
              />
              <SelectControl
                label="Modo"
                value={individualMode}
                options={[
                  { label: 'Precio absoluto', value: 'absolute' },
                  { label: 'Suplemento sobre doble', value: 'supplement' },
                ]}
                onChange={updateIndividualMode}
              />

              {individualMode !== 'supplement' ? (
                <TextControl
                  label={basis === 'per_person' ? 'Coste neto (indiv. por persona)' : 'Coste neto (hab. indiv.)'}
                  value={String(
                    basis === 'per_person' ? item.unit_cost_net_individual ?? '' : item.unit_cost_net_single_room ?? ''
                  )}
                  onChange={(v) =>
                    updateItem(idx, {
                      ...(basis === 'per_person'
                        ? { unit_cost_net_individual: v }
                        : { unit_cost_net_single_room: v }),
                    })
                  }
                  placeholder="150"
                />
              ) : (
                <TextControl
                  label={basis === 'per_person' ? 'Suplemento neto (por persona)' : 'Suplemento neto (hab. indiv.)'}
                  value={String(
                    basis === 'per_person'
                      ? item.package_single_supplement_net ?? ''
                      : item.package_single_room_supplement_net ?? ''
                  )}
                  onChange={(v) =>
                    updateItem(idx, {
                      ...(basis === 'per_person'
                        ? { package_single_supplement_net: v }
                        : { package_single_room_supplement_net: v }),
                    })
                  }
                  placeholder="30"
                />
              )}

              <details className="service-card__hotel-mode-details">
                <summary>Margen y PVP</summary>
                <div className="service-card__hotel-mode-details-grid">
                  <ToggleControl
                    label="Usar margen"
                    checked={!!item.use_markup}
                    onChange={() => updateItem(idx, { use_markup: !item.use_markup })}
                  />
                  {item.use_markup && (
                    <TextControl
                      label="Margen (%)"
                      type="number"
                      min={0}
                      value={String(item.markup_pct ?? globalMarkupPct)}
                      onChange={(v) => updateItem(idx, { markup_pct: v })}
                    />
                  )}
                  <ToggleControl
                    label="PVP manual"
                    checked={!!item.lock_sell_price}
                    onChange={() => updateItem(idx, { lock_sell_price: !item.lock_sell_price })}
                  />
                  {individualMode !== 'supplement' ? (
                    <TextControl
                      label={basis === 'per_person' ? 'PVP (indiv. por persona)' : 'PVP (hab. indiv.)'}
                      value={String(
                        basis === 'per_person' ? item.unit_sell_price_individual ?? '' : item.unit_sell_price_single_room ?? ''
                      )}
                      onChange={(v) =>
                        updateItem(idx, {
                          ...(basis === 'per_person'
                            ? { unit_sell_price_individual: v }
                            : { unit_sell_price_single_room: v }),
                        })
                      }
                      placeholder="210"
                      disabled={!isManualPvp}
                    />
                  ) : (
                    <TextControl
                      label={basis === 'per_person' ? 'Suplemento PVP (por persona)' : 'Suplemento PVP (hab. indiv.)'}
                      value={String(
                        basis === 'per_person'
                          ? item.package_single_supplement_sell ?? ''
                          : item.package_single_room_supplement_sell ?? ''
                      )}
                      onChange={(v) =>
                        updateItem(idx, {
                          ...(basis === 'per_person'
                            ? { package_single_supplement_sell: v }
                            : { package_single_room_supplement_sell: v }),
                        })
                      }
                      placeholder="45"
                      disabled={!isManualPvp}
                    />
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="service-card__subcard">
        <details className="service-card__hotel-discounts-collapse">
          <summary className="service-card__section-summary">
            <span className="service-card__section-summary-title">Descuentos</span>
            <span className="service-card__section-summary-meta">{discountSummary}</span>
          </summary>
          <div className="service-card__hotel-discounts">
            <div className="service-card__hotel-discounts-grid">
              <TextControl
                label="Descuento (%)"
                type="number"
                min={0}
                max={100}
                value={String(item.package_discount_percent ?? 0)}
                onChange={(v) => updateItem(idx, { package_discount_percent: v })}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

export default function StepServices({ proposalId, basics, initialItems = [], onBack, onNext, onDraftChange, requestIntentions = null }) {
  const currency = basics?.currency || 'EUR';
  const pax = Math.max(1, toInt(basics?.pax_total ?? 1, 1));
  const playersCount = Math.max(0, toInt(basics?.players_count ?? 0, 0));

  const [globalMarkupPct, setGlobalMarkupPct] = useState(20);
  const [applyMarkupToNew, setApplyMarkupToNew] = useState(true);

  const [actionError, setActionError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [savingBasics, setSavingBasics] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [flashIndex, setFlashIndex] = useState(null);
  const [openIndex, setOpenIndex] = useState(0);
  const [lastCreatedIndex, setLastCreatedIndex] = useState(null);
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);
  const [errorSummary, setErrorSummary] = useState([]);
  const topRef = useRef(null);

  const [items, setItems] = useState(() => {
    const base = initialItems.length ? initialItems : [defaultItem(basics, 20)];
    return base.map((it) => {
      const next = { ...it };
      const hasInheritedFlag = typeof next.dates_inherited === 'boolean';
      const startFallback = next.start_date || basics?.start_date || '';
      const endFallback = next.end_date || basics?.end_date || '';
      if (!next.start_date) next.start_date = startFallback;
      if (!next.end_date) next.end_date = endFallback;
      next.dates_inherited = hasInheritedFlag
        ? next.dates_inherited
        : (startFallback === (basics?.start_date || '') && endFallback === (basics?.end_date || ''));
      return computeLine(next, basics, 20);
    });
  });

  const totals = useMemo(() => computeTotals(items), [items]);
  useEffect(() => {
  if (!onDraftChange) return;

  const t = window.setTimeout(() => {
    onDraftChange({ items, totals });
  }, 200);

  return () => window.clearTimeout(t);
}, [items, totals, onDraftChange]);

  const pricingSummary = useMemo(() => {
    const paxTotal = Math.max(0, toInt(basics?.pax_total ?? 0, 0));
    const rawPlayers = toInt(basics?.players_count ?? paxTotal ?? 0, 0);
    const playersCount = Math.min(Math.max(rawPlayers, 0), paxTotal);
    const nonPlayersCount = Math.max(0, paxTotal - playersCount);

    const summary = {
      paxTotal,
      playersCount,
      nonPlayersCount,
      golfTotal: 0,
      totalDouble: 0,
      totalSingle: 0,
      doubleRooms: 0,
      singleRooms: 0,
    };

    items.forEach((it) => {
      if (it.service_type === 'golf') {
        summary.golfTotal += toNumber(it.line_sell_price || 0);
      }
      if (it.service_type === 'hotel') {
        const pricing = it.room_pricing || {};
        if (pricing.double?.enabled) {
          summary.totalDouble += toNumber(pricing.double?.total_pvp || 0);
          summary.doubleRooms += Math.max(0, toInt(pricing.double?.rooms ?? 0, 0));
        }
        if (pricing.single?.enabled) {
          summary.totalSingle += toNumber(pricing.single?.total_pvp || 0);
          summary.singleRooms += Math.max(0, toInt(pricing.single?.rooms ?? 0, 0));
        }
      }
    });

    const totalTrip = toNumber(totals.totals_sell_price || 0);
    const baseTotal = totalTrip; // alias

    // Hotel per-person double price: total double hotel price divided by (doubleRooms * 2)
    const ppDouble = summary.doubleRooms > 0 ? summary.totalDouble / (summary.doubleRooms * 2) : 0;
    // Hotel per-person single price: total single hotel price divided by singleRooms
    const ppSingle = summary.singleRooms > 0 ? summary.totalSingle / summary.singleRooms : 0;

    // Common total = everything not in hotel (double+single) nor golf
    const hotelDouble = summary.totalDouble || 0;
    const hotelSingle = summary.totalSingle || 0;
    const golfTotal = summary.golfTotal || 0;

    const commonTotal = totalTrip - (hotelDouble + hotelSingle) - golfTotal;
    const commonPP = summary.paxTotal > 0 ? commonTotal / summary.paxTotal : 0;

    // Final per-person prices for double occupancy
    const priceNonPlayerDouble = ppDouble + commonPP;
    const pricePlayerDouble =
      summary.playersCount > 0 ? priceNonPlayerDouble + golfTotal / summary.playersCount : null;

    const hasSingleSupplement = summary.doubleRooms > 0 && summary.singleRooms > 0;
    let supplementSingle = null;
    if (hasSingleSupplement) {
      supplementSingle = Math.max(0, ppSingle - ppDouble);
    }

    return {
      ...summary,
      totalTrip,
      baseTotal,
      priceNonPlayerDouble,
      pricePlayerDouble,
      supplementSingle,
      hasSingleSupplement,
    };
  }, [basics?.pax_total, basics?.players_count, items, totals.totals_sell_price]);

  useEffect(() => {
    setItems((prev) => {
      const synced = syncServiceDatesFromBasics(prev, basics);
      if (synced === prev) return prev;
      return synced.map((item, idx) => (item === prev[idx] ? item : computeLine(item, basics, globalMarkupPct)));
    });
  }, [basics?.start_date, basics?.end_date, globalMarkupPct, basics]);

  useEffect(() => {
    setItems((prev) => prev.map((item) => computeLine(item, basics, globalMarkupPct)));
  }, [pax]);

  useEffect(() => {
    if (openIndex === null || openIndex === undefined) return;
    if (openIndex >= items.length) {
      setOpenIndex(items.length ? items.length - 1 : null);
    }
  }, [items.length, openIndex]);

  const focusServicePrimaryField = (card, item) => {
    if (!card) return;
    if (!item?.service_type) {
      const select = card.querySelector('select');
      if (select && typeof select.focus === 'function') {
        select.focus();
        return;
      }
    }
    const primaryInput = card.querySelector('.service-card__grid--context input');
    if (primaryInput && typeof primaryInput.focus === 'function') {
      primaryInput.focus();
      return;
    }
    focusFirstInput(card);
  };

  useEffect(() => {
    if (lastCreatedIndex === null || lastCreatedIndex === undefined) return;
    const card = document.querySelector(`[data-service-index="${lastCreatedIndex}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    focusServicePrimaryField(card, items[lastCreatedIndex]);
    setFlashIndex(lastCreatedIndex);
    const timer = window.setTimeout(() => setFlashIndex(null), 1200);
    setLastCreatedIndex(null);
    return () => window.clearTimeout(timer);
  }, [lastCreatedIndex, items]);

  const updateItem = (idx, patch) => {
    setItems((prev) => {
      const next = [...prev];
      const merged = { ...next[idx], ...patch };

      next[idx] = computeLine(merged, basics, globalMarkupPct);
      return next;
    });
  };

  const onChangeServiceStartDate = (idx, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      const startDate = value || '';
      const endDate = current.end_date && startDate && current.end_date < startDate ? startDate : current.end_date;
      next[idx] = computeLine(
        {
          ...current,
          start_date: startDate,
          end_date: endDate,
          dates_inherited: false,
        },
        basics,
        globalMarkupPct
      );
      return next;
    });

    window.setTimeout(() => {
      const el = document.getElementById(`wp-travel-end-date-${idx}`);
      if (!el) return;
      el.focus();
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker();
        } catch (e) {}
      }
    }, 0);
  };

  const buildServiceValidation = (it, idx) => {
    const issues = [];
    const fieldErrors = {};
    const name = (it.title || it.display_name || '').trim();

    if (!name) {
      issues.push('Falta título');
      fieldErrors.title = 'Completa el título.';
    }

    if ((it.service_type === 'hotel' || it.service_type === 'golf') && !it.giav_supplier_id) {
      issues.push('Falta proveedor');
      fieldErrors.supplier = 'Selecciona un proveedor.';
    }

    if (it.service_type === 'hotel') {
      const pricing = it.room_pricing || {};
      const isPerNight = it.hotel_pricing_mode === 'per_night';
      const doubleEnabled = !!pricing.double?.enabled;
      const singleEnabled = !!pricing.single?.enabled;
      if (!doubleEnabled && !singleEnabled) {
        issues.push('Activa doble/individual');
        fieldErrors.pricing = 'Activa doble y/o individual.';
      }

      const validateMode = (modeKey, label) => {
        const mode = pricing[modeKey] || {};
        if (!mode.enabled) return '';
        if (toInt(mode.rooms ?? 0, 0) < 1) {
          return `Habitaciones ${label} < 1`;
        }
        if (!isPerNight && toNumber(mode.net_price_per_night) <= 0) {
          return `Neto ${label} faltante`;
        }
        if (mode.pvp_manual_enabled && toNumber(mode.pvp_price_per_night) <= 0) {
          return `PVP manual ${label} faltante`;
        }
        return '';
      };

      if (isPerNight) {
        const startISO = it.start_date || basics?.start_date || '';
        const endISO = it.end_date || basics?.end_date || '';
        const expectedNights = daysDiff(startISO, endISO);
        const rates = normalizeNightlyRates(it.nightly_rates || [], startISO, endISO, '', it.markup_pct ?? globalMarkupPct ?? 0);
        if (expectedNights <= 0) {
          issues.push('Fechas hotel inválidas');
          fieldErrors.pricing = 'Revisa fechas de hotel.';
        } else if (!rates.length || rates.length !== expectedNights) {
          issues.push('Faltan noches');
          fieldErrors.pricing = 'Completa el desglose por noche.';
        } else {
          const hasZero = rates.some((r) => toNumber(r.net_price) <= 0);
          if (hasZero) {
            issues.push('Neto por noche faltante');
            fieldErrors.pricing = 'Completa neto en todas las noches.';
          }
        }
      }

      const doubleError = validateMode('double', 'doble');
      const singleError = validateMode('single', 'individual');
      if (doubleError || singleError) {
        issues.push(doubleError || singleError);
        fieldErrors.pricing = 'Revisa pricing de habitaciones.';
      }

      const doubleRooms = doubleEnabled ? Math.max(0, toInt(pricing.double?.rooms ?? 0, 0)) : 0;
      const singleRooms = singleEnabled ? Math.max(0, toInt(pricing.single?.rooms ?? 0, 0)) : 0;
      const allocatedPax = (doubleEnabled ? doubleRooms * 2 : 0) + (singleEnabled ? singleRooms : 0);
      const informativeQuote = !!it.hotel_informative_quote;
      if (allocatedPax < pax) {
        issues.push('Faltan pax');
        fieldErrors.pricing = 'Ajusta pax doble/individual.';
      } else if (allocatedPax > pax && !informativeQuote) {
        issues.push('Pax no cuadra');
        fieldErrors.pricing = 'Ajusta pax doble/individual.';
      }

      const giavTotal = toNumber(it.giav_pricing?.giav_total_pvp ?? 0);
      if (giavTotal <= 0) {
        issues.push('Total GIAV faltante');
        fieldErrors.pricing = 'Completa total GIAV.';
      }
    }

    if (it.service_type === 'golf') {
      if (toInt(it.green_fees_per_person, 1) < 1) {
        issues.push('Green-fees faltante');
        fieldErrors.greenFees = 'Define green-fees por jugador.';
      }
    }

    if (['transfer', 'extra', 'package'].includes(it.service_type)) {
      if (toInt(it.quantity, 1) < 1) {
        issues.push('Cantidad inválida');
        fieldErrors.quantity = 'Cantidad debe ser >= 1.';
      }
    }

    if (toNumber(it.unit_sell_price) <= 0) {
      issues.push('PVP unitario faltante');
      fieldErrors.unitSell = 'Define PVP unitario.';
    }

    const hasMappingWarning = it.service_type === 'hotel' || it.service_type === 'golf'
      ? ['needs_review', 'missing'].includes(it.giav_mapping_status)
      : false;

    const status = issues.length > 0 ? 'error' : (hasMappingWarning ? 'pending' : 'completed');

    return {
      issues,
      fieldErrors,
      status,
      hasMappingWarning,
    };
  };

  const validationMap = useMemo(() => items.map((it, idx) => buildServiceValidation(it, idx)), [items, pax]);

  const buildServiceSummary = (it) => {
    const start = it.start_date || basics?.start_date || '';
    const end = it.end_date || basics?.end_date || '';
    const dateLabel = start && end ? `${start} → ${end}` : 'Fechas por definir';
    const amountLabel = `${currency} ${round2(it.line_sell_price || 0).toFixed(2)}`;

    if (it.service_type === 'golf') {
      return `${dateLabel} · Jugadores: ${playersCount || pax} · ${amountLabel}`;
    }

    if (it.service_type === 'hotel') {
      return `${dateLabel} · Pax: ${pax} · ${amountLabel}`;
    }

    if (['transfer', 'extra', 'package'].includes(it.service_type)) {
      return `Cantidad: ${toInt(it.quantity ?? 1, 1)} · ${amountLabel}`;
    }

    return `${dateLabel} · ${amountLabel}`;
  };

  const scrollToService = (idx) => {
    setOpenIndex(idx);
    setHighlightIndex(idx);
    window.setTimeout(() => {
      const card = document.querySelector(`[data-service-index="${idx}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusFirstInput(card);
    }, 50);
  };

  const addItem = () => {
    const lastIndex = items.length - 1;
    const lastValidation = lastIndex >= 0 ? validationMap[lastIndex] : null;
    if (lastValidation?.status === 'error') {
      const confirmed = window.confirm('Tienes un servicio incompleto. ¿Crear otro igualmente?');
      if (!confirmed) return;
    }
    setItems((prev) => {
      const next = [...prev, defaultItem(basics, globalMarkupPct)];
      const nextIndex = next.length - 1;
      setOpenIndex(nextIndex);
      setLastCreatedIndex(nextIndex);
      return next;
    });
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setOpenIndex((current) => {
      if (current === null || current === undefined) return current;
      if (current === idx) return Math.max(0, idx - 1);
      if (current > idx) return current - 1;
      return current;
    });
  };
  
  const applyGlobalMarkupToAll = () => {
      setItems(prev => prev.map(it => computeLine({...it, markup_pct: globalMarkupPct}, basics, globalMarkupPct)));
  };

  const toggleSupplierPicker = (idx) => {
      updateItem(idx, { show_supplier_picker: !items[idx].show_supplier_picker });
  };
  
  const isSupplierPickerVisible = (it) => !!it.show_supplier_picker;
  
  const resetServiceDates = (idx) => {
     updateItem(idx, { 
         start_date: basics?.start_date||'', 
         end_date: basics?.end_date||'',
         dates_inherited: true 
     });
  };

  const onChangeServiceEndDate = (idx, v) => updateItem(idx, { end_date: v });
  const onChangeServiceNights = (idx, v) => {
      const start = items[idx].start_date || basics?.start_date;
      if(start) {
          const end = addDaysISO(start, toInt(v,1));
          updateItem(idx, { end_date: end });
      }
  };

  const validateAll = () => {
    const errors = [];
    const serviceErrors = [];

    validationMap.forEach((validation, idx) => {
      if (validation.issues.length > 0) {
        serviceErrors.push({
          index: idx,
          title: `Servicio ${idx + 1}`,
          details: validation.issues.slice(0, 2).join(' · '),
        });
      }
    });

    if (items.some((it) => it.service_type === 'golf') && playersCount <= 0) {
      errors.push('Define "Jugadores" en Datos básicos.');
    }

    if (totals.totals_sell_price <= 0) {
      errors.push('El PVP total debe ser > 0.');
    }

    return { errors, serviceErrors };
  };

  const scrollToTop = () => {
    if (!topRef.current) return;
    topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusFirstInput = (root) => {
    if (!root) return;
    const target = root.querySelector('input, select, textarea, button');
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  };

  const handleValidationError = (serviceErrors, globalErrors) => {
    if (serviceErrors.length > 0) {
      scrollToService(serviceErrors[0].index);
      return;
    }

    if (globalErrors.length > 0) {
      setHighlightIndex(null);
      const fallback = document.querySelector('.services-step');
      if (fallback) {
        fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
        focusFirstInput(fallback);
      }
    }
  };
  const saveBasicsOnly = async () => {
    if (!proposalId) return;
    setSaveMsg('');
    setSavingBasics(true);
    try {
      await API.updateProposal(proposalId, basics);
      setSaveMsg('Cambios guardados.');
    } catch (e) {
      setActionError(e?.message || 'Error guardando datos básicos.');
    } finally {
      setSavingBasics(false);
    }
  };

  const continueNext = () => {
    const { errors: globalErrors, serviceErrors } = validateAll();
    setHasAttemptedContinue(true);

    if (serviceErrors.length > 0 || globalErrors.length > 0) {
      const message = serviceErrors.length > 0
        ? `Faltan datos en ${serviceErrors.length} servicios. Te llevo al primero.`
        : globalErrors[0];
      setActionError(message);
      setErrorSummary(serviceErrors);
      handleValidationError(serviceErrors, globalErrors);
      return;
    }

    setActionError('');
    setErrorSummary([]);
    setHighlightIndex(null);
    onNext({ items, totals });
  };

  const validationSummary = useMemo(() => validateAll(), [validationMap, items, playersCount, totals.totals_sell_price]);
  const hasBlockingIssues = validationSummary.serviceErrors.length > 0 || validationSummary.errors.length > 0;
  const renderSummaryValue = (value, { missing, tooltip } = {}) => {
    if (missing) {
      return <span className="services-summary__value services-summary__value--missing" title={tooltip}>—</span>;
    }
    return <span className="services-summary__value">{value}</span>;
  };

  useEffect(() => {
    if (!hasAttemptedContinue) return;
    if (!hasBlockingIssues) {
      setActionError('');
      setErrorSummary([]);
    }
  }, [hasAttemptedContinue, hasBlockingIssues]);

  return (
    <Card className="services-step">
      <CardHeader>
        <div className="services-step__title">
          <strong>Servicios &amp; precios</strong>
          <span className="services-step__subtitle">Añade servicios con detalle, márgenes y proveedor.</span>
        </div>
      </CardHeader>

      <CardBody ref={topRef}>

        {saveMsg && (
          <Notice status="success" isDismissible onRemove={() => setSaveMsg('')}>
            {saveMsg}
          </Notice>
        )}


        {requestIntentions && (
          <div className="services-intention-banner">
            <strong>Intenciones detectadas</strong>
            {requestIntentions.golf?.requested && (
              <span>
                Solicitud indica {requestIntentions.golf.green_fees_per_player || '—'} green-fees por jugador.
              </span>
            )}
            {requestIntentions.flights?.requested && (
              <span>
                Requiere vuelos desde {requestIntentions.flights.departure_airport || '—'}.
              </span>
            )}
            {requestIntentions.package && <span>Paquete sugerido: {requestIntentions.package}</span>}
            {requestIntentions.more_info && (
              <span>Más info: {requestIntentions.more_info}</span>
            )}
          </div>
        )}

        {/* Global markup bar */}
        <div className="services-toolbar">
          <div className="services-toolbar__controls">
            <TextControl
              label="Margen por defecto (%)"
              type="number"
              min={0}
              value={String(globalMarkupPct)}
              onChange={(v) => setGlobalMarkupPct(toNumber(v))}
            />

            <ToggleControl
              label="Aplicar a nuevas líneas"
              checked={applyMarkupToNew}
              onChange={() => setApplyMarkupToNew((s) => !s)}
            />

            <Button variant="secondary" onClick={applyGlobalMarkupToAll}>
              Aplicar a todas
            </Button>
          </div>

          <div className="services-toolbar__summary">
            <div className="services-toolbar__label">PVP total</div>
            <div className="services-toolbar__value">
              {currency} {totals.totals_sell_price.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="services-items">
          {items.map((it, idx) => {
            const isOpen = openIndex === idx;
            const validation = validationMap[idx] || { issues: [], status: 'pending', hasMappingWarning: false, fieldErrors: {} };
            const status = validation.status;
            const summaryLine = buildServiceSummary(it);
            const pendingSummary = validation.hasMappingWarning ? 'Proveedor GIAV pendiente' : '';
            const missingDetails = validation.issues.slice(0, 2).join(' · ');
            const fieldErrors = validation.fieldErrors || {};
            return (
            <div
              key={idx}
              className={`service-card service-card--status-${status} ${isOpen ? 'is-open' : ''} ${highlightIndex === idx ? 'is-error' : ''} ${flashIndex === idx ? 'is-highlighted' : ''}`.trim()}
              data-service-index={idx}
            >
              <div className="service-card__header">
                <div className="service-card__title">
                  <div className="service-card__eyebrow">Servicio {idx + 1}</div>
                  <div className="service-card__name">
                    {SERVICE_TYPES.find((type) => type.value === it.service_type)?.label || 'Servicio'} ·{' '}
                    {it.title?.trim() || it.display_name?.trim() || 'Sin título'}
                  </div>
                  <div className="service-card__summary">{summaryLine}</div>
                  {status === 'pending' && pendingSummary && (
                    <div className="service-card__missing">{pendingSummary}</div>
                  )}
                  {status === 'error' && missingDetails && (
                    <div className="service-card__missing">{missingDetails}</div>
                  )}
                </div>

                <div className="service-card__meta">
                  <div className={`service-card__badge service-card__badge--${status}`}>
                    {status === 'completed' && '✓ OK'}
                    {status === 'pending' && 'Pendiente'}
                    {status === 'error' && `${validation.issues.length} errores`}
                  </div>

                  <Button
                    variant="tertiary"
                    className="service-card__toggle"
                    onClick={() => setOpenIndex(isOpen ? null : idx)}
                  >
                    {isOpen ? 'Ocultar' : 'Ver detalle'}
                  </Button>

                  <div className="service-card__total">
                    <span>Total línea</span>
                    <strong>
                      {currency} {round2(it.line_sell_price || 0).toFixed(2)}
                    </strong>
                  </div>

                  <Button variant="tertiary" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                    Eliminar
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="service-card__content">
                  <div className="service-card__section">
                <div className="service-card__section-title">Selección y contexto</div>
                <div className="service-card__grid service-card__grid--context">
                  <div className="service-card__field">
                    <SelectControl
                      label="Tipo de servicio"
                      value={it.service_type}
                      options={SERVICE_TYPES}
                      onChange={(v) => updateItem(idx, { service_type: v })}
                    />
                  </div>

                  {(it.service_type === 'hotel' || it.service_type === 'golf' || it.service_type === 'package') ? (
                    <>
                      {!it.use_manual_entry ? (
                        <div className={`service-card__field ${fieldErrors.title ? 'is-error' : ''}`}>
                          <CatalogSelect
                            label={it.service_type === 'hotel' ? 'Hotel' : (it.service_type === 'package' ? 'Hotel (paquete)' : 'Campo de golf')}
                            type={it.service_type === 'golf' ? 'golf' : 'hotel'}
                            valueTitle={it.title}
                            onPick={async (r) => {
                            const wpType = it.service_type === 'golf' ? 'course' : 'hotel';
                            updateItem(idx, {
                              title: r.title,
                              display_name: r.title,
                              wp_object_type: wpType,
                              wp_object_id: r.id,
                              supplier_override: false,
                            });

                            try {
                              const m = await API.getGiavMapping({
                                wp_object_type: wpType,
                                wp_object_id: r.id,
                              });

                              // Backend may return a generic fallback. Treat it as needs_review.
                              if (m?.status && m.status !== 'missing') {
                                updateItem(idx, {
                                  giav_mapping_status: m.status,
                                  giav_entity_type: m.giav_entity_type,
                                  giav_entity_id: m.giav_entity_id,
                                  giav_supplier_id: m.giav_supplier_id ?? DEFAULT_SUPPLIER_ID,
                                  giav_supplier_name: m.giav_supplier_name ?? DEFAULT_SUPPLIER_NAME,
                                });
                              } else {
                                updateItem(idx, {
                                  giav_mapping_status: 'needs_review',
                                  giav_entity_type: 'supplier',
                                  giav_entity_id: DEFAULT_SUPPLIER_ID,
                                  giav_supplier_id: DEFAULT_SUPPLIER_ID,
                                  giav_supplier_name: DEFAULT_SUPPLIER_NAME,
                                });
                              }
                            } catch {
                              updateItem(idx, {
                                giav_mapping_status: 'needs_review',
                                giav_entity_type: 'supplier',
                                giav_entity_id: DEFAULT_SUPPLIER_ID,
                                giav_supplier_id: DEFAULT_SUPPLIER_ID,
                                giav_supplier_name: DEFAULT_SUPPLIER_NAME,
                              });
                            }
                          }}
                          />
                          {fieldErrors.title && <div className="service-card__field-error">{fieldErrors.title}</div>}
                        </div>
                      ) : (
                        <div className={`service-card__field ${fieldErrors.title ? 'is-error' : ''}`}>
                          <TextControl
                            label={it.service_type === 'hotel' ? 'Hotel (manual) *' : 'Campo de golf (manual) *'}
                            value={it.display_name || ''}
                            onChange={(v) => updateItem(idx, { display_name: v, title: v })}
                            placeholder={it.service_type === 'hotel' ? 'Ej: Hotel X (fuera de catálogo)' : 'Ej: Campo Y (fuera de catálogo)'}
                          />
                          {fieldErrors.title && <div className="service-card__field-error">{fieldErrors.title}</div>}
                        </div>
                      )}

                      <div className="service-card__field service-card__field--toggle">
                        <ToggleControl
                          label="Entrada manual (fuera de catálogo)"
                          checked={!!it.use_manual_entry}
                          onChange={() => {
                            const next = !it.use_manual_entry;

                            if (next) {
                              const manualLabel = it.display_name || it.title || '';
                              updateItem(idx, {
                                use_manual_entry: true,
                                wp_object_type: 'manual',
                                wp_object_id: 0,
                                show_supplier_picker: true,
                                giav_entity_type: 'supplier',
                                giav_entity_id: it.giav_supplier_id || DEFAULT_SUPPLIER_ID,
                                giav_mapping_status: it.giav_supplier_id === DEFAULT_SUPPLIER_ID ? 'needs_review' : 'active',
                                giav_supplier_id: it.giav_supplier_id || DEFAULT_SUPPLIER_ID,
                                giav_supplier_name: it.giav_supplier_name || DEFAULT_SUPPLIER_NAME,
                                supplier_override: false,
                                display_name: manualLabel,
                                title: manualLabel,
                              });
                            } else {
                              updateItem(idx, {
                                use_manual_entry: false,
                                wp_object_type: null,
                                wp_object_id: null,
                                show_supplier_picker: false,
                                giav_mapping_status: 'missing',
                                supplier_override: false,
                                display_name: '',
                              });
                            }
                          }}
                        />
                      </div>

                      <div className="service-card__supplier">
                        {!isSupplierPickerVisible(it) && (
                          <div className="service-card__supplier-actions">
                            <Button
                              variant="tertiary"
                              onClick={() => toggleSupplierPicker(idx)}
                            >
                              Cambiar proveedor
                            </Button>
                          </div>
                        )}

                        {isSupplierPickerVisible(it) && (
                          <>
                            {!it.use_manual_entry && (
                              <div className="service-card__field service-card__field--toggle">
                                <ToggleControl
                                  label="Proveedor (opcional)"
                                  checked={!!it.show_supplier_picker}
                                  onChange={() => toggleSupplierPicker(idx)}
                                />
                              </div>
                            )}

                            <SupplierSearchSelect
                              selectedId={it.giav_supplier_id || DEFAULT_SUPPLIER_ID}
                              selectedLabel={it.giav_supplier_name || DEFAULT_SUPPLIER_NAME}
                              disabled={false}
                              onPick={(prov) => {
                                const id = String(prov?.id || '');
                                const label = String(prov?.label || '');
                                if (!id) return;
                                updateItem(idx, {
                                  giav_entity_type: 'supplier',
                                  giav_entity_id: id,
                                  giav_supplier_id: id,
                                  giav_supplier_name: label,
                                  giav_mapping_status: id === DEFAULT_SUPPLIER_ID ? 'needs_review' : 'active',
                                  supplier_override: !it.use_manual_entry,
                                });
                              }}
                            />
                            {fieldErrors.supplier && <div className="service-card__field-error">{fieldErrors.supplier}</div>}
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={`service-card__field ${fieldErrors.title ? 'is-error' : ''}`}>
                      <TextControl
                        label="T├¡tulo / descripci├│n *"
                        value={it.title}
                        onChange={(v) => updateItem(idx, { title: v })}
                      />
                      {fieldErrors.title && <div className="service-card__field-error">{fieldErrors.title}</div>}
                    </div>
                  )}

                  {it.service_type === 'hotel' && (
                    <div className="service-card__field">
                      <TextControl
                        label="Tipo de habitación"
                        value={it.hotel_room_type || ''}
                        onChange={(v) => updateItem(idx, { hotel_room_type: v })}
                        placeholder="Deluxe / Sea View..."
                      />
                    </div>
                  )}

                  {it.service_type === 'hotel' && (
                    <div className="service-card__field">
                      <SelectControl
                        label="Régimen"
                        value={it.hotel_regimen || ''}
                        options={[
                          { label: 'Seleccionar', value: '' },
                          ...HOTEL_REGIMENS,
                        ]}
                        onChange={(v) => updateItem(idx, { hotel_regimen: v })}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="service-card__section">
                <div className="service-card__section-title">Fechas y ocupación</div>
                <div className="service-card__date-status">
                  <span className={`service-card__date-label ${it.dates_inherited ? 'is-inherited' : 'is-custom'}`}>
                    {it.dates_inherited ? 'Fechas del viaje' : 'Fechas personalizadas'}
                  </span>
                  {!it.dates_inherited && (
                    <Button
                      variant="tertiary"
                      className="service-card__date-reset"
                      onClick={() => resetServiceDates(idx)}
                    >
                      Restablecer fechas del viaje
                    </Button>
                  )}
                </div>
                <div className="service-card__grid service-card__grid--dates">
                    <div className="service-card__field">
                      <TextControl
                        label="Fecha inicio"
                        type="date"
                        value={it.start_date}
                        onChange={(v) => onChangeServiceStartDate(idx, v)}
                        min={TODAY_ISO}
                        className="service-card__date-start"
                      />
                    </div>

                  <div className="service-card__field">
                    <TextControl
                      id={`wp-travel-end-date-${idx}`}
                      label="Fecha fin"
                      type="date"
                      value={it.end_date}
                      onChange={(v) => onChangeServiceEndDate(idx, v)}
                      min={it.start_date || undefined}
                    />
                  </div>

                  {it.service_type === 'hotel' ? (
                    <>
                      <div className="service-card__field">
                        <TextControl
                          label="Noches"
                          type="number"
                          min={0}
                          value={String(it.hotel_nights ?? computeNights(it, basics))}
                          onChange={(v) => onChangeServiceNights(idx, v)}
                        />
                      </div>
                    </>
                  ) : (
                    it.service_type === 'golf' ? (
                      <>
                        <div className="service-card__field">
                          <TextControl
                            label="Jugadores"
                            type="number"
                            min={1}
                            value={String(playersCount || pax)}
                            disabled
                            help="Definido en Datos basicos"
                          />
                        </div>
                        <div className={`service-card__field ${fieldErrors.greenFees ? 'is-error' : ''}`}>
                          <TextControl
                            label="Green-fees por jugador *"
                            type="number"
                            min={1}
                            value={String(it.green_fees_per_person ?? '')}
                            onChange={(v) => updateItem(idx, { green_fees_per_person: v })}
                          />
                          {fieldErrors.greenFees && <div className="service-card__field-error">{fieldErrors.greenFees}</div>}
                        </div>
                        <div className="service-card__golf-summary">
                          Total green-fees (interno): {toInt(playersCount || pax, 1)} x {toInt(it.green_fees_per_person, 0)} ={' '}
                          {toInt(it.total_green_fees, 0)}
                        </div>
                      </>
                    ) : (
                      <div className={`service-card__field ${fieldErrors.quantity ? 'is-error' : ''}`}>
                        <TextControl
                          label={
                            it.service_type === 'transfer'
                              ? 'Cantidad (servicios)'
                              : it.service_type === 'package'
                              ? 'Cantidad (paquetes)'
                              : 'Cantidad'
                          }
                          type="number"
                          min={1}
                          value={String(it.quantity)}
                          onChange={(v) => updateItem(idx, { quantity: v })}
                        />
                        {fieldErrors.quantity && <div className="service-card__field-error">{fieldErrors.quantity}</div>}
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="service-card__section service-card__section--pricing">
                <div className="service-card__section-title">Pricing</div>
                {fieldErrors.pricing && (
                  <div className="service-card__field-error service-card__field-error--inline">
                    {fieldErrors.pricing}
                  </div>
                )}
                {it.service_type === 'hotel' ? (
                  <HotelPricingPanel
                    item={it}
                    idx={idx}
                    updateItem={updateItem}
                    currency={currency}
                    pax={pax}
                    basics={basics}
                    globalMarkupPct={globalMarkupPct}
                  />
                ) : it.service_type === 'package' ? (
                  <PackagePricingPanel
                    item={it}
                    idx={idx}
                    updateItem={updateItem}
                    currency={currency}
                    pax={pax}
                    globalMarkupPct={globalMarkupPct}
                  />
                ) : (
                  <div className="service-card__pricing">
                    <div className="service-card__field">
                      <TextControl
                        label="Coste neto (unit.)"
                        value={String(it.unit_cost_net)}
                        onChange={(v) => updateItem(idx, { unit_cost_net: v })}
                        placeholder="120"
                      />
                    </div>

                    <div className="service-card__field">
                      <ToggleControl
                        label="Usar margen"
                        checked={!!it.use_markup}
                        onChange={() => updateItem(idx, { use_markup: !it.use_markup })}
                      />
                    </div>

                    {it.use_markup && (
                      <div className="service-card__field">
                        <TextControl
                          label="Margen (%)"
                          type="number"
                          min={0}
                          value={String(it.markup_pct ?? globalMarkupPct)}
                          onChange={(v) => updateItem(idx, { markup_pct: v })}
                        />
                      </div>
                    )}

                    <div className="service-card__field">
                      <ToggleControl
                        label="PVP manual"
                        checked={!!it.lock_sell_price}
                        onChange={() => updateItem(idx, { lock_sell_price: !it.lock_sell_price })}
                      />
                    </div>

                    <div className={`service-card__field ${fieldErrors.unitSell ? 'is-error' : ''}`}>
                      <TextControl
                        label="PVP (unit.)"
                        value={String(it.unit_sell_price)}
                        onChange={(v) => updateItem(idx, { unit_sell_price: v })}
                        placeholder="165"
                        disabled={!it.lock_sell_price}
                      />
                      {fieldErrors.unitSell && <div className="service-card__field-error">{fieldErrors.unitSell}</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Paquete: detalle de qué incluye */}
              {it.service_type === 'package' && (
                <div className="service-card__section service-card__section--package">
                  <div className="service-card__section-title">Detalle del paquete</div>
                  <div className="service-card__package">
                    <TextareaControl
                      label="Incluye (una línea por ítem)"
                      value={it.package_components_text || ''}
                      onChange={(v) => updateItem(idx, { package_components_text: v })}
                      rows={4}
                      placeholder={`3 noches
2 green-fees
Desayuno incluido`}
                    />
                    </div>
                </div>
              )}

              {it.service_type !== 'hotel' && (
                <div className="service-card__section service-card__section--notes">
                  <div className="service-card__section-title">Notas</div>
                  <details className="service-card__notes-details">
                    <summary>Mostrar notas</summary>
                    <div className="service-card__notes">
                      <TextControl
                        label="Notas para el cliente (itinerario)"
                        value={it.notes_public || ''}
                        onChange={(v) => updateItem(idx, { notes_public: v })}
                        placeholder="Incluye desayuno. Check-in 15:00."
                      />
                      <TextControl
                        label="Notas internas (solo uso interno)"
                        value={it.notes_internal || ''}
                        onChange={(v) => updateItem(idx, { notes_internal: v })}
                        placeholder="Neto negociado, release 14D."
                      />
                    </div>
                  </details>
                </div>
              )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        <div className="services-add">
          <Button variant="secondary" onClick={addItem}>
            + Añadir servicio
          </Button>
        </div>

        <div className="services-summary">
          <div>
            <div className="services-summary__label">Total viaje</div>
            {renderSummaryValue(
              `${currency} ${round2(pricingSummary.totalTrip).toFixed(2)}`,
              {
                missing: totals.totals_sell_price <= 0,
                tooltip: 'Completa servicios para calcular.',
              }
            )}
            <div className="services-summary__meta">
              Jugadores: {pricingSummary.playersCount} | No jugadores: {pricingSummary.nonPlayersCount}
            </div>
          </div>

          {pricingSummary.playersCount > 0 && (
            <div>
              <div className="services-summary__label">Precio jugador en doble</div>
              {renderSummaryValue(
                `${currency} ${round2(pricingSummary.pricePlayerDouble || 0).toFixed(2)}`,
                {
                  missing: pricingSummary.playersCount <= 0,
                  tooltip: 'Completa jugadores y servicios para calcular.',
                }
              )}
            </div>
          )}

          {pricingSummary.nonPlayersCount > 0 && (
            <div>
              <div className="services-summary__label">Precio no jugador en doble</div>
              {renderSummaryValue(
                `${currency} ${round2(pricingSummary.priceNonPlayerDouble || 0).toFixed(2)}`,
                {
                  missing: pricingSummary.nonPlayersCount <= 0,
                  tooltip: 'Completa no jugadores para calcular.',
                }
              )}
            </div>
          )}

          {pricingSummary.hasSingleSupplement && (
            <div>
              <div className="services-summary__label">Suplemento individual</div>
              {renderSummaryValue(
                `${currency} ${round2(pricingSummary.supplementSingle || 0).toFixed(2)}`,
                {
                  missing: !pricingSummary.hasSingleSupplement,
                  tooltip: 'Completa habitaciones para calcular.',
                }
              )}
            </div>
          )}
        </div>

        <div className="services-footer">
          {(actionError || (hasAttemptedContinue && errorSummary.length > 0)) && (
            <div className="services-footer__errors">
              <div className="services-footer__errors-header">
                <span>Error summary</span>
                <Button variant="link" onClick={scrollToTop}>
                  Ver arriba
                </Button>
              </div>
              {actionError && <div className="services-footer__errors-message">{actionError}</div>}
              <ul>
                {(errorSummary.length > 0 ? errorSummary : validationSummary.serviceErrors).slice(0, 3).map((err) => (
                  <li key={err.index}>
                    <button type="button" onClick={() => scrollToService(err.index)}>
                      {err.title}: {err.details}
                    </button>
                  </li>
                ))}
              </ul>
              {validationSummary.serviceErrors.length > 3 && (
                <div className="services-footer__errors-more">
                  +{validationSummary.serviceErrors.length - 3} más
                </div>
              )}
            </div>
          )}
          <div className="services-footer__bar">
            <div className="services-footer__left">
              <Button variant="secondary" onClick={onBack}>
                Volver
              </Button>
              {proposalId && (
                <Button variant="secondary" onClick={saveBasicsOnly} disabled={savingBasics}>
                  Guardar datos básicos
                </Button>
              )}
            </div>
            <div className="services-footer__summary">
              <span>Total viaje</span>
              <strong>{currency} {round2(pricingSummary.totalTrip).toFixed(2)}</strong>
            </div>
            <div className="services-footer__right">
              <Button
                variant="primary"
                onClick={continueNext}
                disabled={hasBlockingIssues && hasAttemptedContinue}
                title={hasBlockingIssues ? 'Completa los campos obligatorios para continuar.' : ''}
              >
                {actionError ? 'Revisa los campos marcados' : 'Continuar'}
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

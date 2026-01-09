import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  TextControl,
  SelectControl,
  ToggleControl,
} from '@wordpress/components';

import API from '../../api';
import CatalogSelect from '../CatalogSelect';
import SupplierSearchSelect from '../SupplierSearchSelect';

const DEFAULT_SUPPLIER_ID = '1734698';
const DEFAULT_SUPPLIER_NAME = 'Proveedores varios';


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
  const s = new Date(`${startISO}T00:00:00`);
  const e = new Date(`${endISO}T00:00:00`);
  const ms = e - s;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function addDaysISO(startISO, days) {
  if (!startISO) return '';
  const date = new Date(`${startISO}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return '';
  date.setDate(date.getDate() + Math.max(0, days));
  return date.toISOString().slice(0, 10);
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

function computeHotelPricing(item, basics, defaultMarkupPct) {
  const nights = computeNights(item, basics);
  const fallbackRooms = Math.max(0, toInt(item.hotel_rooms ?? 0, 0));

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

  const totalsByMode = ['double', 'single'].map((modeKey) => {
    const mode = roomPricing[modeKey];
    if (!mode.enabled) {
      return { totalNet: 0, totalPvp: 0 };
    }

    const rooms = Math.max(0, toInt(mode.rooms ?? 0, 0));
    const pricingBasis = modeKey === 'double' ? (mode.pricing_basis || 'per_room') : 'per_room';
    const units = pricingBasis === 'per_person' ? rooms * 2 : rooms;
    const netBase = Math.max(0, mode.net_price_per_night) * nightsPayable * units;
    const netAfterDiscount = netBase * (1 - discounts.discount_pct / 100);
    const totalPvp = mode.pvp_manual_enabled
      ? Math.max(0, mode.pvp_price_per_night) * nightsPayable * units
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

    // Generic quantity for non-hotel
    quantity: 1,

    // Golf-specific
    green_fees_per_person: 1,
    number_of_players: basics?.pax_total ?? 1,
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
                          label="Margen (%)"
                          type="number"
                          min={0}
                          value={String(mode.margin_pct ?? globalMarkupPct)}
                          onChange={(v) => applyRoomPatch(modeKey, { margin_pct: v })}
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
          <Notice status="warning" isDismissible={false}>
            {allocationWarning}
          </Notice>
        )}
      </div>

      <details className="service-card__hotel-discounts-collapse">
        <summary>
          <span>Descuentos</span>
          <span className="service-card__hotel-discounts-summary">{discountSummary}</span>
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

      <div className="service-card__hotel-giav">
        <div className="service-card__hotel-subtitle">Total para GIAV</div>
        <div className="service-card__hotel-giav-grid">
          <div className="service-card__hotel-giav-total">
            Total alojamiento (para GIAV): {currency} {round2(item.giav_pricing?.giav_total_pvp || 0).toFixed(2)}
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
            <Notice status="warning" isDismissible={false}>
              Este total se enviará a GIAV. No se recalculará automáticamente.
            </Notice>
          )}
        </div>
      </div>

      <details className="service-card__hotel-notes">
        <summary>
          <span>Notas</span>
          <span className="service-card__hotel-discounts-summary">{notesSummary}</span>
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
    return {
      ...service,
      start_date: start,
      end_date: end,
      dates_inherited: true,
    };
  });
  return changed ? synced : services;
}

export default function StepServices({ basics, initialItems = [], onBack, onNext, onDraftChange }) {
  const currency = basics?.currency || 'EUR';
  const pax = Math.max(1, toInt(basics?.pax_total ?? 1, 1));

  const [globalMarkupPct, setGlobalMarkupPct] = useState(20);
  const [applyMarkupToNew, setApplyMarkupToNew] = useState(true);

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
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
  
  const addItem = () => {
     setItems(prev => [...prev, defaultItem(basics, globalMarkupPct)]);
  };
  
  const removeItem = (idx) => {
      setItems(prev => prev.filter((_, i) => i !== idx));
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

  const validate = () => {
      for(let i=0; i<items.length; i++) {
        const it = items[i];
        if(!it.title && !it.display_name) return `Línea ${i+1}: falta título.`;
        
        if (it.service_type === 'hotel') {
        const pricing = it.room_pricing || {};
        
        const validateMode = (modeKey, label) => {
          const mode = pricing[modeKey];
          if (!mode.enabled) return '';
          if (toInt(mode.rooms ?? 0, 0) < 1) {
            return `Línea ${i + 1} (Hotel): habitaciones ${label} debe ser >= 1.`;
          }
          if (toNumber(mode.net_price_per_night) <= 0) {
            return `Línea ${i + 1} (Hotel): neto por noche (${label}) debe ser > 0.`;
          }
          if (mode.pvp_manual_enabled && toNumber(mode.pvp_price_per_night) <= 0) {
            return `Línea ${i + 1} (Hotel): PVP manual (${label}) debe ser > 0.`;
          }
          return '';
        };

        const doubleError = validateMode('double', 'doble');
        if (doubleError) return doubleError;
        const singleError = validateMode('single', 'individual');
        if (singleError) return singleError;

        const giavTotal = toNumber(it.giav_pricing?.giav_total_pvp ?? 0);
        if (giavTotal <= 0) return `Línea ${i + 1} (Hotel): total para GIAV debe ser > 0.`;
      } else if (it.service_type === 'golf') {
        if (toInt(it.green_fees_per_person, 1) < 1) {
          return `Línea ${i + 1} (Golf): green-fees por jugador debe ser >= 1.`;
        }
      } else {
        if (toInt(it.quantity, 1) < 1) return `Línea ${i + 1}: cantidad debe ser >= 1.`;
      }

      if (toNumber(it.unit_sell_price) <= 0) return `Línea ${i + 1}: PVP unitario debe ser > 0.`;
    }

    if (totals.totals_sell_price <= 0) return 'El PVP total debe ser > 0.';
    return '';
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

  const handleValidationError = (msg) => {
    window.setTimeout(() => {
      const match = msg.match(/Línea\s+(\d+)/i);
      if (match) {
        const index = Math.max(0, parseInt(match[1], 10) - 1);
        const card = document.querySelector(`[data-service-index="${index}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          focusFirstInput(card);
          return;
        }
      }
      const fallback = document.querySelector('.services-step');
      if (fallback) {
        fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
        focusFirstInput(fallback);
      }
    }, 50);
  };

  const continueNext = () => {
    const msg = validate();
    const hasGolf = items.some((it) => it.service_type === 'golf');
    const playersFromBasics = Math.max(0, toInt(basics?.players_count ?? 0, 0));
    if (hasGolf && playersFromBasics <= 0) {
      const err = 'Hay servicios de golf pero "Jugadores" en Datos básicos está vacío o a 0. Define el número de jugadores en Datos básicos.';
      setError(err);
      setActionError('No se puede continuar. Revisa 1 error.');
      handleValidationError(err);
      return;
    }
    if (msg) {
      setError(msg);
      setActionError('No se puede continuar. Revisa 1 error.');
      handleValidationError(msg);
      return;
    }
    setError('');
    setActionError('');
    onNext({ items, totals });
  };

  return (
    <Card className="services-step">
      <CardHeader>
        <div className="services-step__title">
          <strong>Servicios &amp; precios</strong>
          <span className="services-step__subtitle">Añade servicios con detalle, márgenes y proveedor.</span>
        </div>
      </CardHeader>

      <CardBody ref={topRef}>
        {error && (
          <Notice
            status="error"
            isDismissible
            onRemove={() => {
              setError('');
              setActionError('');
            }}
          >
            {error}
          </Notice>
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
            return (
            <div
              key={idx}
              className="service-card"
              data-service-index={idx}
            >
              <div className="service-card__header">
                <div className="service-card__title">
                  <div className="service-card__eyebrow">Servicio {idx + 1}</div>
                  <div className="service-card__name">
                    {SERVICE_TYPES.find((type) => type.value === it.service_type)?.label || 'Servicio'} ·{' '}
                    {it.title?.trim() || 'Sin título'}
                  </div>
                </div>

                <div className="service-card__meta">
                  {(it.service_type === 'hotel' || it.service_type === 'golf') && (
                      <div
                        className={`service-card__badge service-card__badge--${it.giav_mapping_status}`}
                      >
                        {it.giav_mapping_status === 'active'
                          ? (String(it.giav_supplier_id || '') === DEFAULT_SUPPLIER_ID
                            ? 'Proveedor genérico (GIAV)'
                            : 'OK')
                          : (it.giav_mapping_status === 'needs_review'
                            ? 'Pendiente de revisar'
                            : 'Sin mapeo GIAV')}
                      </div>
                  )}

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

              <div className="service-card__section">
                <div className="service-card__section-title">Selección y contexto</div>
                <div className="service-card__grid service-card__grid--context">
                  <SelectControl
                    label="Tipo de servicio"
                    value={it.service_type}
                    options={SERVICE_TYPES}
                    onChange={(v) => updateItem(idx, { service_type: v })}
                  />

                  {(it.service_type === 'hotel' || it.service_type === 'golf') ? (
                    <>
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

                      {!it.use_manual_entry ? (
                        <CatalogSelect
                          label={it.service_type === 'hotel' ? 'Hotel' : 'Campo de golf'}
                          type={it.service_type === 'hotel' ? 'hotel' : 'golf'}
                          valueTitle={it.title}
                          onPick={async (r) => {
                            const wpType = it.service_type === 'hotel' ? 'hotel' : 'course';
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
                      ) : (
                        <TextControl
                          label={it.service_type === 'hotel' ? 'Hotel (manual) *' : 'Campo de golf (manual) *'}
                          value={it.display_name || ''}
                          onChange={(v) => updateItem(idx, { display_name: v, title: v })}
                          placeholder={it.service_type === 'hotel' ? 'Ej: Hotel X (fuera de cat├ílogo)' : 'Ej: Campo Y (fuera de cat├ílogo)'}
                        />
                      )}

                      <div className="service-card__supplier">
                        {!isSupplierPickerVisible(it) && (
                          <Button
                            variant="tertiary"
                            onClick={() => toggleSupplierPicker(idx)}
                          >
                            Cambiar proveedor
                          </Button>
                        )}

                        {isSupplierPickerVisible(it) && (
                          <>
                            {!it.use_manual_entry && (
                              <ToggleControl
                                label="Proveedor (opcional)"
                                checked={!!it.show_supplier_picker}
                                onChange={() => toggleSupplierPicker(idx)}
                              />
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
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <TextControl
                      label="T├¡tulo / descripci├│n *"
                      value={it.title}
                      onChange={(v) => updateItem(idx, { title: v })}
                    />
                  )}

                  {it.service_type === 'hotel' && (
                    <TextControl
                      label="Tipo de habitación"
                      value={it.hotel_room_type || ''}
                      onChange={(v) => updateItem(idx, { hotel_room_type: v })}
                      placeholder="Deluxe / Sea View..."
                    />
                  )}

                  {it.service_type === 'hotel' && (
                    <SelectControl
                      label="Régimen"
                      value={it.hotel_regimen || ''}
                      options={[
                        { label: 'Seleccionar', value: '' },
                        ...HOTEL_REGIMENS,
                      ]}
                      onChange={(v) => updateItem(idx, { hotel_regimen: v })}
                    />
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
                  <TextControl
                    label="Fecha inicio"
                    type="date"
                    value={it.start_date}
                    onChange={(v) => onChangeServiceStartDate(idx, v)}
                  />

                  <TextControl
                    id={`wp-travel-end-date-${idx}`}
                    label="Fecha fin"
                    type="date"
                    value={it.end_date}
                    onChange={(v) => onChangeServiceEndDate(idx, v)}
                    min={it.start_date || undefined}
                  />

                  {it.service_type === 'hotel' ? (
                    <>
                      <TextControl
                        label="Noches"
                        type="number"
                        min={0}
                        value={String(it.hotel_nights ?? computeNights(it, basics))}
                        onChange={(v) => onChangeServiceNights(idx, v)}
                      />
                    </>
                  ) : (
                    it.service_type === 'golf' ? (
                      <>
                        <TextControl
                          label="Jugadores"
                          type="number"
                          min={1}
                          value={String(it.number_of_players ?? pax)}
                          onChange={(v) => updateItem(idx, { number_of_players: v })}
                        />
                        <TextControl
                          label="Green-fees por jugador *"
                          type="number"
                          min={1}
                          value={String(it.green_fees_per_person ?? '')}
                          onChange={(v) => updateItem(idx, { green_fees_per_person: v })}
                        />
                        <div className="service-card__golf-summary">
                          Total green-fees (interno): {toInt(it.number_of_players ?? pax, 1)} x {toInt(it.green_fees_per_person, 0)} ={' '}
                          {toInt(it.total_green_fees, 0)}
                        </div>
                        {toInt(it.green_fees_per_person, 0) < 1 && (
                          <Notice status="warning" isDismissible={false}>
                            Pendiente de revisar: completa los green-fees por jugador.
                          </Notice>
                        )}
                      </>
                    ) : (
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
                    )
                  )}
                </div>
              </div>

              <div className="service-card__section service-card__section--pricing">
                <div className="service-card__section-title">Pricing</div>
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
                ) : (
                  <div className="service-card__pricing">
                    <TextControl
                      label="Coste neto (unit.)"
                      value={String(it.unit_cost_net)}
                      onChange={(v) => updateItem(idx, { unit_cost_net: v })}
                      placeholder="120"
                    />

                    <ToggleControl
                      label="Usar margen"
                      checked={!!it.use_markup}
                      onChange={() => updateItem(idx, { use_markup: !it.use_markup })}
                    />

                    {it.use_markup && (
                      <TextControl
                        label="Margen (%)"
                        type="number"
                        min={0}
                        value={String(it.markup_pct ?? globalMarkupPct)}
                        onChange={(v) => updateItem(idx, { markup_pct: v })}
                      />
                    )}

                    <ToggleControl
                      label="PVP manual"
                      checked={!!it.lock_sell_price}
                      onChange={() => updateItem(idx, { lock_sell_price: !it.lock_sell_price })}
                    />

                    <TextControl
                      label="PVP (unit.)"
                      value={String(it.unit_sell_price)}
                      onChange={(v) => updateItem(idx, { unit_sell_price: v })}
                      placeholder="165"
                      disabled={!it.lock_sell_price}
                    />
                  </div>
                )}
              </div>

              {/* Paquete: detalle de qu├® incluye */}
              {it.service_type === 'package' && (
                <div className="service-card__package">
                  <TextControl
                    label="Incluye (una l├¡nea por item)"
                    value={it.package_components_text || ''}
                    onChange={(v) => updateItem(idx, { package_components_text: v })}
                    placeholder={`3 noches\n2 green-fees\nDesayuno incluido`}
                  />
                </div>
              )}

              <div className="service-card__section service-card__section--notes">
                <div className="service-card__section-title">Notas</div>
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
              </div>
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
            <div className="services-summary__value">
              {currency} {round2(pricingSummary.totalTrip).toFixed(2)}
            </div>
            <div className="services-summary__meta">
              Jugadores: {pricingSummary.playersCount} | No jugadores: {pricingSummary.nonPlayersCount}
            </div>
          </div>

          {pricingSummary.playersCount > 0 && (
            <div>
              <div className="services-summary__label">Precio jugador en doble</div>
              <div className="services-summary__value">
                {currency} {round2(pricingSummary.pricePlayerDouble || 0).toFixed(2)}
              </div>
            </div>
          )}

          <div>
            <div className="services-summary__label">Precio no jugador en doble</div>
            <div className="services-summary__value">
              {currency} {round2(pricingSummary.priceNonPlayerDouble || 0).toFixed(2)}
            </div>
          </div>

          {pricingSummary.hasSingleSupplement && (
            <div>
              <div className="services-summary__label">Suplemento individual</div>
              <div className="services-summary__value">
                {currency} {round2(pricingSummary.supplementSingle || 0).toFixed(2)}
              </div>
            </div>
          )}

          <div>
            <div className="services-summary__label">Coste total</div>
            <div className="services-summary__value">
              {currency} {totals.totals_cost_net.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="services-summary__label">Margen</div>
            <div className="services-summary__value">
              {currency} {totals.totals_margin_abs.toFixed(2)} ({totals.totals_margin_pct.toFixed(2)}%)
            </div>
          </div>
        </div>

        <div className="services-actions">
          {actionError && (
            <div className="services-actions__notice">
              <Notice status="error" isDismissible={false}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span>{actionError}</span>
                  <Button variant="link" onClick={scrollToTop}>
                    Ver errores
                  </Button>
                </div>
              </Notice>
            </div>
          )}
          <Button variant="secondary" onClick={onBack}>
            Volver
          </Button>
          <Button variant="primary" onClick={continueNext}>
            Continuar
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
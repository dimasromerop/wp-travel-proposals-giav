import { useEffect, useMemo, useState } from '@wordpress/element';
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

const HOTEL_RATE_BASIS = [
  { label: 'Por habitación / noche', value: 'per_room_per_night' },
  { label: 'Por persona / noche', value: 'per_person_per_night' },
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

  return {
    service_type: 'hotel',
    title: '',
    start_date,
    end_date,

    // Hotel-specific
    hotel_room_type: '',
    hotel_regimen: '',
    hotel_rooms: 1,
    hotel_rate_basis: 'per_room_per_night',
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

  };
}

function computeLine(item, basics, globalMarkupPct) {
  const it = { ...item };

  if (!it.start_date) it.start_date = basics?.start_date || '';
  if (!it.end_date) it.end_date = basics?.end_date || '';

  it.quantity = Math.max(1, toInt(it.quantity, 1));
  it.hotel_rooms = Math.max(1, toInt(it.hotel_rooms, 1));
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

    const pax = Math.max(1, toInt(basics?.pax_total ?? 1, 1));
    const basis = it.hotel_rate_basis || 'per_room_per_night';

    let mult = 0;
    if (basis === 'per_person_per_night') {
      mult = Math.max(0, nights) * pax;
    } else {
      mult = Math.max(0, nights) * it.hotel_rooms;
    }

    it.line_cost_net = round2(mult * it.unit_cost_net);
    it.line_sell_price = round2(mult * it.unit_sell_price);
  } else if (it.service_type === 'golf') {
    const players = Math.max(1, toInt(it.number_of_players ?? basics?.pax_total ?? 1, 1));
    const { greenFeesPerPerson, totalGreenFees } = computeGolfTotals(it, players);

    it.number_of_players = players;
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

  const perPerson = totals.totals_sell_price > 0 ? totals.totals_sell_price / pax : 0;

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

      if (merged.service_type === 'hotel') {
        if (!merged.hotel_rooms) merged.hotel_rooms = 1;
        if (!merged.hotel_rate_basis) merged.hotel_rate_basis = 'per_room_per_night';
      }

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

  const onChangeServiceEndDate = (idx, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      const endDate = value || '';
      const startDate = current.start_date || '';
      next[idx] = computeLine(
        {
          ...current,
          start_date: startDate,
          end_date: startDate && endDate && endDate < startDate ? startDate : endDate,
          dates_inherited: false,
        },
        basics,
        globalMarkupPct
      );
      return next;
    });
  };

  const onChangeServiceNights = (idx, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      const nights = Math.max(0, toInt(value, 0));
      const startDate = current.start_date || basics?.start_date || '';
      const endDate = startDate ? addDaysISO(startDate, nights) : current.end_date;
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
  };

  const resetServiceDates = (idx) => {
    const startDate = basics?.start_date || '';
    const endDate = basics?.end_date || '';
    updateItem(idx, {
      start_date: startDate,
      end_date: endDate,
      dates_inherited: true,
    });
  };

  const toggleSupplierPicker = (idx) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], show_supplier_picker: !next[idx].show_supplier_picker };
      return next;
    });
  };

  const isSupplierPickerVisible = (item) => item.use_manual_entry || item.show_supplier_picker;

  const addItem = () => {
    setItems((prev) => {
      const it = defaultItem(basics, applyMarkupToNew ? globalMarkupPct : 0);
      return [...prev, computeLine(it, basics, globalMarkupPct)];
    });
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const applyGlobalMarkupToAll = () => {
    setItems((prev) =>
      prev.map((it) => computeLine({ ...it, use_markup: true, markup_pct: globalMarkupPct }, basics, globalMarkupPct))
    );
  };

  const validate = () => {
    if (!items.length) return 'Añade al menos 1 servicio.';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.service_type) return `Línea ${i + 1}: tipo obligatorio.`;
      const effectiveTitle = it.use_manual_entry ? it.display_name : it.title;
      if (!effectiveTitle?.trim()) return `Línea ${i + 1}: título/descripcion obligatorio.`;

      if (it.end_date && it.start_date && it.end_date < it.start_date)
        return `Línea ${i + 1}: fecha fin anterior a fecha inicio.`;

      if (it.service_type === 'hotel') {
        const nights = computeNights(it, basics);
        if (nights <= 0) return `Línea ${i + 1} (Hotel): fechas inválidas, noches = 0.`;

        const basis = it.hotel_rate_basis || 'per_room_per_night';
        if (basis === 'per_room_per_night') {
          if (toInt(it.hotel_rooms, 1) < 1) return `Línea ${i + 1} (Hotel): habitaciones debe ser >= 1.`;
        }
      } else if (it.service_type === 'golf') {
        if (toInt(it.number_of_players, 1) < 1) return `Línea ${i + 1} (Golf): jugadores debe ser >= 1.`;
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

  const continueNext = () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
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

      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
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
            <div className="services-toolbar__hint">
              {currency} {round2(perPerson).toFixed(2)} / pax
            </div>
          </div>
        </div>

        <div className="services-items">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="service-card"
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

                      {(it.hotel_rate_basis || 'per_room_per_night') === 'per_room_per_night' ? (
                        <TextControl
                          label="Habitaciones"
                          type="number"
                          min={1}
                          value={String(it.hotel_rooms)}
                          onChange={(v) => updateItem(idx, { hotel_rooms: v })}
                        />
                      ) : (
                        <TextControl
                          label="Habitaciones"
                          value="—"
                          disabled
                        />
                      )}
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
                <div className="service-card__pricing">
                  <TextControl
                    label="Coste neto (unit.)"
                    value={String(it.unit_cost_net)}
                    onChange={(v) => updateItem(idx, { unit_cost_net: v })}
                    placeholder="120"
                  />

                  {it.service_type === 'hotel' && (
                    <SelectControl
                      label="Tarifa"
                      value={it.hotel_rate_basis || 'per_room_per_night'}
                      options={HOTEL_RATE_BASIS}
                      onChange={(v) => updateItem(idx, { hotel_rate_basis: v })}
                    />
                  )}

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
          ))}
        </div>

        <div className="services-add">
          <Button variant="secondary" onClick={addItem}>
            + Añadir servicio
          </Button>
        </div>

        <div className="services-summary">
          <div>
            <div className="services-summary__label">Coste total</div>
            <div className="services-summary__value">
              {currency} {totals.totals_cost_net.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="services-summary__label">PVP total</div>
            <div className="services-summary__value">
              {currency} {totals.totals_sell_price.toFixed(2)}
            </div>
          </div>

          <div>
            <div className="services-summary__label">Precio por persona</div>
            <div className="services-summary__value">
              {currency} {round2(perPerson).toFixed(2)}
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

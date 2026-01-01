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

console.log('components', {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  TextControl,
  SelectControl,
  ToggleControl,
});

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

function computeNights(item, basics) {
  const start = item.start_date || basics?.start_date || '';
  const end = item.end_date || basics?.end_date || '';
  return daysDiff(start, end);
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
    hotel_rooms: 1,
    hotel_rate_basis: 'per_room_per_night',

    // Generic quantity for non-hotel
    quantity: 1,

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

export default function StepServices({ basics, initialItems = [], onBack, onNext, onDraftChange }) {
  const currency = basics?.currency || 'EUR';
  const pax = Math.max(1, toInt(basics?.pax_total ?? 1, 1));

  const [globalMarkupPct, setGlobalMarkupPct] = useState(20);
  const [applyMarkupToNew, setApplyMarkupToNew] = useState(true);

  const [error, setError] = useState('');

  const [items, setItems] = useState(() => {
    const base = initialItems.length ? initialItems : [defaultItem(basics, 20)];
    return base.map((it) => computeLine(it, basics, 20));
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
      if (!it.title?.trim()) return `Línea ${i + 1}: título/descripcion obligatorio.`;

      if (it.end_date && it.start_date && it.end_date < it.start_date)
        return `Línea ${i + 1}: fecha fin anterior a fecha inicio.`;

      if (it.service_type === 'hotel') {
        const nights = computeNights(it, basics);
        if (nights <= 0) return `Línea ${i + 1} (Hotel): fechas inválidas, noches = 0.`;

        const basis = it.hotel_rate_basis || 'per_room_per_night';
        if (basis === 'per_room_per_night') {
          if (toInt(it.hotel_rooms, 1) < 1) return `Línea ${i + 1} (Hotel): habitaciones debe ser >= 1.`;
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
    <Card>
      <CardHeader>
        <strong>Servicios & precios</strong>
      </CardHeader>

      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
            {error}
          </Notice>
        )}

        {/* Global markup bar */}
        <div
          style={{
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            padding: 12,
            background: '#fafafa',
            marginBottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          <TextControl
            label="Margen por defecto (%)"
            type="number"
            min={0}
            value={String(globalMarkupPct)}
            onChange={(v) => setGlobalMarkupPct(toNumber(v))}
            style={{ width: 220 }}
          />

          <ToggleControl
            label="Aplicar a nuevas líneas"
            checked={applyMarkupToNew}
            onChange={() => setApplyMarkupToNew((s) => !s)}
          />

          <Button variant="secondary" onClick={applyGlobalMarkupToAll}>
            Aplicar a todas
          </Button>

          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>PVP total</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              {currency} {totals.totals_sell_price.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {currency} {round2(perPerson).toFixed(2)} / pax
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((it, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: 10,
                padding: 12,
                background: '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
                  <SelectControl
                    label="Tipo"
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
                            // Manual: detach from WP catalog reference
                            updateItem(idx, {
                              use_manual_entry: true,
                              wp_object_type: 'manual',
                              wp_object_id: 0,
                              giav_entity_type: 'supplier',
                              giav_entity_id: it.giav_supplier_id || DEFAULT_SUPPLIER_ID,
                              giav_mapping_status: it.giav_supplier_id === DEFAULT_SUPPLIER_ID ? 'needs_review' : 'active',
                            });
                          } else {
                            // Back to catalog mode: clear wp ref until user picks one
                            updateItem(idx, {
                              use_manual_entry: false,
                              wp_object_type: null,
                              wp_object_id: null,
                              giav_mapping_status: 'missing',
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
                              wp_object_type: wpType,
                              wp_object_id: r.id,
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
                          value={it.title}
                          onChange={(v) => updateItem(idx, { title: v })}
                          placeholder={it.service_type === 'hotel' ? 'Ej: Hotel X (fuera de catálogo)' : 'Ej: Campo Y (fuera de catálogo)'}
                        />
                      )}

                      <div style={{ minWidth: 280 }}>
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
                            });
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <TextControl
                      label="Título / descripción *"
                      value={it.title}
                      onChange={(v) => updateItem(idx, { title: v })}
                    />
                  )}


                  <TextControl
                    label="Inicio"
                    type="date"
                    value={it.start_date}
                    onChange={(v) => updateItem(idx, { start_date: v })}
                  />

                  <TextControl
                    label="Fin"
                    type="date"
                    value={it.end_date}
                    onChange={(v) => updateItem(idx, { end_date: v })}
                    min={it.start_date || undefined}
                  />

                  {it.service_type === 'hotel' ? (
                    <>
                      <SelectControl
                        label="Tarifa"
                        value={it.hotel_rate_basis || 'per_room_per_night'}
                        options={HOTEL_RATE_BASIS}
                        onChange={(v) => updateItem(idx, { hotel_rate_basis: v })}
                      />

                      <TextControl
                        label="Noches"
                        value={String(it.hotel_nights ?? computeNights(it, basics))}
                        disabled
                        style={{ width: 120 }}
                      />

                      {(it.hotel_rate_basis || 'per_room_per_night') === 'per_room_per_night' && (
                        <TextControl
                          label="Habitaciones"
                          type="number"
                          min={1}
                          value={String(it.hotel_rooms)}
                          onChange={(v) => updateItem(idx, { hotel_rooms: v })}
                          style={{ width: 150 }}
                        />
                      )}

                      <TextControl
                        label="Tipo habitación"
                        value={it.hotel_room_type || ''}
                        onChange={(v) => updateItem(idx, { hotel_room_type: v })}
                        placeholder="Deluxe / Sea View / BB, HB..."
                        style={{ minWidth: 240 }}
                      />
                    </>
                  ) : (
                    <TextControl
                      label={
                        it.service_type === 'golf'
                          ? 'Cantidad (green fees)'
                          : it.service_type === 'transfer'
                          ? 'Cantidad (servicios)'
                          : it.service_type === 'package'
                          ? 'Cantidad (paquetes)'
                          : 'Cantidad'
                      }
                      type="number"
                      min={1}
                      value={String(it.quantity)}
                      onChange={(v) => updateItem(idx, { quantity: v })}
                      style={{ width: 180 }}
                    />
                  )}

                  <TextControl
                    label="Coste neto (unit.)"
                    value={String(it.unit_cost_net)}
                    onChange={(v) => updateItem(idx, { unit_cost_net: v })}
                    placeholder="120"
                    style={{ width: 160 }}
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
                      style={{ width: 140 }}
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
                    style={{ width: 160 }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  {(it.service_type === 'hotel' || it.service_type === 'golf') && (
  <div
    style={{
      fontSize: 12,
      padding: '2px 8px',
      borderRadius: 999,
      background:
        it.giav_mapping_status === 'active'
          ? '#e7f7ed'
          : '#fff4e5',
      color:
        it.giav_mapping_status === 'active'
          ? '#0a6b2b'
          : '#7a4b00',
    }}
  >
    {it.giav_mapping_status === 'active'
      ? (String(it.giav_supplier_id || '') === DEFAULT_SUPPLIER_ID
          ? 'Proveedor genérico (GIAV)'
          : 'Mapeado GIAV')
      : (it.giav_mapping_status === 'needs_review'
          ? 'Pendiente de revisar'
          : 'Sin mapeo GIAV')}
  </div>
)}

                  <div style={{ fontSize: 12, opacity: 0.7 }}>Total línea</div>
                  <div style={{ fontWeight: 800 }}>
                    {currency} {round2(it.line_sell_price || 0).toFixed(2)}
                  </div>

                  <Button variant="tertiary" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                    Eliminar
                  </Button>
                </div>
              </div>

              {/* Paquete: detalle de qué incluye */}
              {it.service_type === 'package' && (
                <div style={{ marginTop: 12 }}>
                  <TextControl
                    label="Incluye (una línea por item)"
                    value={it.package_components_text || ''}
                    onChange={(v) => updateItem(idx, { package_components_text: v })}
                    placeholder={`3 noches\n2 green-fees\nDesayuno incluido`}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <TextControl
                  label="Notas públicas (itinerario)"
                  value={it.notes_public || ''}
                  onChange={(v) => updateItem(idx, { notes_public: v })}
                  placeholder="Incluye desayuno. Check-in 15:00."
                />
                <TextControl
                  label="Notas internas"
                  value={it.notes_internal || ''}
                  onChange={(v) => updateItem(idx, { notes_internal: v })}
                  placeholder="Neto negociado, release 14D."
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={addItem}>
            + Añadir servicio
          </Button>
        </div>

        <div
          style={{
            marginTop: 16,
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            padding: 12,
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Coste total</div>
            <div style={{ fontWeight: 800 }}>
              {currency} {totals.totals_cost_net.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>PVP total</div>
            <div style={{ fontWeight: 800 }}>
              {currency} {totals.totals_sell_price.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Precio por persona</div>
            <div style={{ fontWeight: 800 }}>
              {currency} {round2(perPerson).toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Margen</div>
            <div style={{ fontWeight: 800 }}>
              {currency} {totals.totals_margin_abs.toFixed(2)} ({totals.totals_margin_pct.toFixed(2)}%)
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
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




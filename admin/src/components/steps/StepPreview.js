import { useMemo, useState } from '@wordpress/element';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import API from '../../api';
import { buildCustomerFullName } from '../../utils/customer';
import { getStoredProposalId } from '../../utils/proposal';

function round2(n) {
  const x = parseFloat(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function toNumber(v) {
  const x = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
}

function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const ROOM_ALLOCATION_ORDER = [
  { key: 'double', capacity: 2 },
  { key: 'single', capacity: 1 },
];

function buildRoomAllocation(roomPricing = {}, paxTotal = 0) {
  let remaining = Math.max(0, paxTotal);
  const allocation = {
    types: {},
    hasExtra: false,
  };

  ROOM_ALLOCATION_ORDER.forEach(({ key, capacity }) => {
    const modeData = roomPricing[key] || {};
    const enabled = Boolean(modeData.enabled);
    const rooms = enabled ? Math.max(0, toInt(modeData.rooms ?? 0, 0)) : 0;
    const totalPvp = toNumber(modeData.total_pvp ?? 0);
    const perRoomPrice = rooms > 0 ? totalPvp / rooms : 0;
    let needed = 0;
    let extra = 0;

    for (let i = 0; i < rooms; i += 1) {
      if (remaining > 0) {
        needed += 1;
        remaining -= capacity;
      } else {
        extra += 1;
      }
    }

    if (extra > 0) {
      allocation.hasExtra = true;
    }

    allocation.types[key] = {
      rooms,
      needed,
      extra,
      capacity,
      perRoomPrice,
      totalPvp,
    };
  });

  return allocation;
}

function formatRoomLabel(type, count, extra = false) {
  const base = type === 'single' ? 'Habitaciones individuales' : 'Habitaciones dobles';
  const text = extra ? `${base} adicionales` : base;
  if (count > 0) {
    return `${text} (${count} hab.)`;
  }
  return text;
}

function formatPreviewPrice(value, currency) {
  const code = currency || 'EUR';
  return `${code} ${round2(value).toFixed(2)}`;
}

function buildInformativeExtraLine(hotelName, label, perRoomPrice, currency) {
  let line = label;
  if (perRoomPrice > 0) {
    line += ` — Precio estimado por habitación: ${formatPreviewPrice(perRoomPrice, currency)}`;
  }
  if (hotelName) {
    line = `${hotelName}: ${line}`;
  }
  return line;
}

export default function StepPreview({
  proposalId,
  basics,
  items,
  totals,
  onBack,
  onSent,
  onProposalCreated,
  mode = 'create',
  versionNumber = 1,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [basicsSaved, setBasicsSaved] = useState('');
  const [savingBasics, setSavingBasics] = useState(false);
  const sourceTag =
    typeof window !== 'undefined' && window.CASANOVA_GESTION_RESERVAS
      ? 'wp-travel-giav-portal'
      : 'wp-travel-giav-admin';

  // Snapshot completo (cabecera + items + totales + metadata)
  const snapshot = useMemo(() => {
    const header = {
      crm_customer_id: null,
      first_name: basics.first_name,
      last_name: basics.last_name,
      customer_name: buildCustomerFullName(
        basics.first_name,
        basics.last_name,
        basics.customer_name
      ),
      customer_email: basics.customer_email,
      customer_country: basics.customer_country,
      customer_language: basics.customer_language,
      proposal_title: basics.proposal_title,
      start_date: basics.start_date,
      end_date: basics.end_date,
      pax_total: basics.pax_total,
      players_count: basics.players_count,
      currency: basics.currency,
      status: 'sent',
    };

    const normalizedItems = (items || []).map((it, index) => ({
      day_index: it.day_index ?? null,
      service_type: it.service_type,

      wp_object_type: it.wp_object_type ?? null,
      wp_object_id: it.wp_object_id ?? null,

      giav_entity_type: it.giav_entity_type ?? null,
      giav_entity_id: it.giav_entity_id ?? null,
      giav_supplier_id: it.giav_supplier_id ?? null,
      giav_supplier_name: it.giav_supplier_name ?? null,
      supplier_source: it.supplier_source ?? null,
      supplier_resolution_chain: Array.isArray(it.supplier_resolution_chain) ? it.supplier_resolution_chain : [],
      preflight_ok: it.preflight_ok ?? null,
      warnings: Array.isArray(it.warnings) ? it.warnings : [],
      blocking: Array.isArray(it.blocking) ? it.blocking : [],
      supplier_override: !!it.supplier_override,

      title: it.title ?? `Item ${index + 1}`,
      display_name: it.display_name ?? null,

      start_date: it.start_date || null,
      end_date: it.end_date || null,

      quantity: it.quantity ?? 1,
      pax_quantity: it.pax_quantity ?? null,

      // Hotel-specific
      hotel_rate_basis: it.hotel_rate_basis ?? null,
      hotel_nights: it.hotel_nights ?? null,
      hotel_rooms: it.hotel_rooms ?? null,
      hotel_room_type: it.hotel_room_type ?? '',
      hotel_regimen: it.hotel_regimen ?? '',
      // When true, extra rooms (beyond pax) are treated as informative options and
      // must NOT be included in the default accommodation / totals for the client.
      hotel_informative_quote: !!it.hotel_informative_quote,
      // Per-night (optional, backward compatible)
      hotel_pricing_mode: it.hotel_pricing_mode ?? it.hotel_rate_mode ?? 'simple',
      nightly_rates: Array.isArray(it.nightly_rates)
        ? it.nightly_rates
        : Array.isArray(it.hotel_nightly_rates)
        ? it.hotel_nightly_rates
        : null,
      room_pricing: it.room_pricing ?? null,
      discounts: it.discounts ?? null,
      giav_pricing: it.giav_pricing ?? null,

      // Package (descriptivo)
      package_components: Array.isArray(it.package_components) ? it.package_components : [],
      package_components_text: it.package_components_text ?? '',
      package_pricing_basis: it.package_pricing_basis ?? null,
      package_discount_percent: round2(it.package_discount_percent ?? 0),
      package_quote_individual: !!it.package_quote_individual,
      package_individual_mode: it.package_individual_mode ?? null,
      package_individual_qty: toInt(it.package_individual_qty ?? 0, 0),
      package_unit_cost_net_individual: round2(it.package_unit_cost_net_individual ?? 0),
      package_unit_sell_price_individual: round2(it.package_unit_sell_price_individual ?? 0),
      package_single_supplement_net: round2(it.package_single_supplement_net ?? 0),
      package_single_supplement_pvp: round2(it.package_single_supplement_pvp ?? 0),
      package_pp_double: round2(it.package_pp_double ?? 0),
      package_room_double: round2(it.package_room_double ?? 0),
      package_pp_single: round2(it.package_pp_single ?? 0),
      package_room_single: round2(it.package_room_single ?? 0),
      package_single_supplement: round2(it.package_single_supplement ?? 0),
      package_room_single_supplement: round2(it.package_room_single_supplement ?? 0),

      // Golf-specific
      green_fees_per_person: it.green_fees_per_person ?? null,
      number_of_players: it.number_of_players ?? null,
      total_green_fees: it.total_green_fees ?? null,

      unit_cost_net: round2(it.unit_cost_net),
      unit_sell_price: round2(it.unit_sell_price),
      line_cost_net: round2(it.line_cost_net),
      line_sell_price: round2(it.line_sell_price),

      use_markup: !!it.use_markup,
      markup_pct: round2(it.markup_pct ?? 0),
      lock_sell_price: !!it.lock_sell_price,

      notes_public: it.notes_public ?? '',
      notes_internal: it.notes_internal ?? '',
    }));

    const t = totals || {
      totals_cost_net: 0,
      totals_sell_price: 0,
      totals_margin_abs: 0,
      totals_margin_pct: 0,
    };

    return {
      header,
      items: normalizedItems,
      totals: {
        totals_cost_net: round2(t.totals_cost_net),
        totals_sell_price: round2(t.totals_sell_price),
        totals_margin_abs: round2(t.totals_margin_abs),
        totals_margin_pct: round2(t.totals_margin_pct),
      },
      template_id: null,
      terms_version: null,
      metadata: {
        created_at: new Date().toISOString(),
        created_by: null,
        source: sourceTag,
        schema_version: 'v2',
      },
    };
  }, [basics, items, totals]);

  // Snapshot = fuente de verdad (sin recalcular ni consultar backends en este paso).
  const snapshotHeader = snapshot?.header || {};
  const snapshotCustomerName = buildCustomerFullName(
    snapshotHeader.first_name,
    snapshotHeader.last_name,
    snapshotHeader.customer_name
  );
  const snapshotTotals = snapshot?.totals || {};
  const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];

  const issueSummary = useMemo(() => {
    let warningCount = 0;
    let blockingCount = 0;

    snapshotItems.forEach((it) => {
      const warnings = Array.isArray(it?.warnings) ? it.warnings : [];
      const blocking = Array.isArray(it?.blocking) ? it.blocking : [];
      warningCount += warnings.length;
      blockingCount += blocking.length;
    });

    return { warningCount, blockingCount };
  }, [snapshotItems]);

  const statusType =
    issueSummary.blockingCount > 0
      ? 'error'
      : issueSummary.warningCount > 0
      ? 'warning'
      : 'success';

  const statusLabel =
    issueSummary.blockingCount > 0
      ? `Hay ${issueSummary.blockingCount} servicios con errores`
      : issueSummary.warningCount > 0
      ? `Hay ${issueSummary.warningCount} avisos en servicios`
      : 'Servicios listos para enviar';

  const pricingSummary = useMemo(() => {
    const paxTotal = Math.max(0, toInt(snapshotHeader?.pax_total ?? 0, 0));
    const rawPlayers = toInt(snapshotHeader?.players_count ?? paxTotal ?? 0, 0);
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

    snapshotItems.forEach((item) => {
      if (item.service_type === 'golf') {
        summary.golfTotal += toNumber(item.line_sell_price || 0);
      }
      if (item.service_type === 'hotel') {
        const roomPricing = item.room_pricing || {};
        if (roomPricing.double?.enabled) {
          summary.totalDouble += toNumber(roomPricing.double?.total_pvp || 0);
          summary.doubleRooms += Math.max(0, toInt(roomPricing.double?.rooms ?? 0, 0));
        }
        if (roomPricing.single?.enabled) {
          summary.totalSingle += toNumber(roomPricing.single?.total_pvp || 0);
          summary.singleRooms += Math.max(0, toInt(roomPricing.single?.rooms ?? 0, 0));
        }
      }
    });

    const totalTrip = toNumber(snapshotTotals?.totals_sell_price || 0);
    const baseTotal = totalTrip;

    const ppDouble = summary.doubleRooms > 0 ? summary.totalDouble / (summary.doubleRooms * 2) : 0;
    const ppSingle = summary.singleRooms > 0 ? summary.totalSingle / summary.singleRooms : 0;

    const commonTotal = totalTrip - (summary.totalDouble + summary.totalSingle) - summary.golfTotal;
    const commonPP = summary.paxTotal > 0 ? commonTotal / summary.paxTotal : 0;
    const baseRoomType = summary.doubleRooms > 0 ? 'double' : summary.singleRooms > 0 ? 'single' : 'double';
    const baseHotelPP = baseRoomType === 'double' ? ppDouble : ppSingle;

    const priceNonPlayerBase = baseHotelPP + commonPP;
    const pricePlayerBase =
      summary.playersCount > 0 ? priceNonPlayerBase + summary.golfTotal / summary.playersCount : null;

    const hasSingleSupplement = summary.doubleRooms > 0 && summary.singleRooms > 0;
    let supplementSingle = null;
    if (hasSingleSupplement) {
      supplementSingle = Math.max(0, ppSingle - ppDouble);
    }

    return {
      ...summary,
      totalTrip,
      baseTotal,
      baseRoomType,
      priceNonPlayerBase,
      pricePlayerBase,
      supplementSingle,
      hasSingleSupplement,
    };
  }, [snapshotHeader?.pax_total, snapshotHeader?.players_count, snapshotItems, snapshotTotals?.totals_sell_price]);
  const { includeRoomLines, informativeExtras } = useMemo(() => {
    const includeLines = [];
    const extras = [];
    const paxTotal = Math.max(0, pricingSummary.paxTotal);
    const currency = snapshotHeader.currency || 'EUR';

    snapshotItems.forEach((item, idx) => {
      if (item.service_type !== 'hotel') {
        return;
      }
      const hotelLabel = item.display_name || item.title || 'Alojamiento';
      const allocation = buildRoomAllocation(item.room_pricing || {}, paxTotal);
      const doubleInfo = allocation.types.double || { needed: 0, extra: 0, rooms: 0, perRoomPrice: 0 };
      const singleInfo = allocation.types.single || { needed: 0, extra: 0, rooms: 0, perRoomPrice: 0 };
      const informativeQuote = !!item.hotel_informative_quote;

      const pushIncludeLine = (suffix, text) => {
        includeLines.push({
          key: `${idx}-${suffix}`,
          text: hotelLabel ? `${hotelLabel} · ${text}` : text,
        });
      };

      if (informativeQuote) {
        if (doubleInfo.needed > 0) {
          pushIncludeLine('double-needed', formatRoomLabel('double', doubleInfo.needed));
        }
        if (singleInfo.needed > 0) {
          pushIncludeLine('single-needed', formatRoomLabel('single', singleInfo.needed));
        }
        if (allocation.hasExtra) {
          if (doubleInfo.extra > 0) {
            extras.push({
              key: `${idx}-double-extra`,
              text: buildInformativeExtraLine(
                hotelLabel,
                formatRoomLabel('double', doubleInfo.extra, true),
                doubleInfo.perRoomPrice,
                currency
              ),
            });
          }
          if (singleInfo.extra > 0) {
            extras.push({
              key: `${idx}-single-extra`,
              text: buildInformativeExtraLine(
                hotelLabel,
                formatRoomLabel('single', singleInfo.extra, true),
                singleInfo.perRoomPrice,
                currency
              ),
            });
          }
        }
      } else {
        if (doubleInfo.rooms > 0) {
          pushIncludeLine('double-total', formatRoomLabel('double', doubleInfo.rooms));
        }
        if (singleInfo.rooms > 0) {
          pushIncludeLine('single-total', formatRoomLabel('single', singleInfo.rooms));
        }
      }
    });

    return {
      includeRoomLines: includeLines,
      informativeExtras: extras,
    };
  }, [snapshotItems, pricingSummary.paxTotal, snapshotHeader.currency]);
  const hasEmail = Boolean(snapshotHeader.customer_email);
  // UX: "Enviar" aquí no envía emails, solo publica/crea versión y marca como enviada.
  // Así que lo llamamos "Compartir".
  const primaryLabel =
    mode === 'edit'
      ? 'Guardar nueva versión'
      : hasEmail
      ? 'Compartir propuesta'
      : 'Crear enlace público';

  const resolveProposalId = () => {
    // Resolve proposalId from props first, then from URL query as fallback.
    const getProposalIdFromUrl = () => {
      try {
        const qs = window.location.search || '';
        if (!qs) return null;
        const params = new URLSearchParams(qs);
        const keys = ['proposal_id', 'id', 'proposalId', 'proposalId'];
        for (let k of keys) {
          const v = params.get(k);
          if (v) {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) return n;
          }
        }
      } catch (err) {
        // ignore
      }
      return null;
    };

    const pid = proposalId && Number(proposalId) > 0 ? Number(proposalId) : null;
    if (pid) return pid;
    const fromUrl = getProposalIdFromUrl();
    if (fromUrl) return fromUrl;
    const fromStorage = getStoredProposalId();
    if (fromStorage) return fromStorage;
    return null;
  };

  const normalizeLanguageCode = (value) => {
    const raw = String(value || 'es').trim();
    if (!raw) return 'es';
    const base = raw.split(/[-_]/)[0] || raw;
    if (!base) return 'es';
    return base.slice(0, 2);
  };

  const buildProposalPayload = () => {
    const computedCustomerName = buildCustomerFullName(
      basics.first_name,
      basics.last_name,
      basics.customer_name
    );

    return {
      ...basics,
      customer_name: computedCustomerName,
      customer_language: normalizeLanguageCode(basics.customer_language),
      pax_total: Math.max(1, toInt(basics.pax_total ?? 1, 1)),
      players_count: Math.max(0, toInt(basics.players_count ?? 0, 0)),
      customer_country: basics.customer_country ? String(basics.customer_country).toUpperCase() : '',
    };
  };

  const ensureProposalId = async () => {
    const resolved = resolveProposalId();
    if (resolved && Number.isFinite(resolved) && resolved > 0) {
      return resolved;
    }

    if (!basics) {
      return null;
    }

    const payload = buildProposalPayload();
    const created = await API.createProposal(payload);
    const newId = Number(created?.proposal_id || 0);
    if (newId > 0) {
      onProposalCreated?.({ proposalId: newId, basics: payload });
      return newId;
    }
    return null;
  };

  const saveBasicsOnly = async () => {
    const id = resolveProposalId();
    if (!id) return;
    setBasicsSaved('');
    setSavingBasics(true);
    try {
      await API.updateProposal(id, basics || {});
      setBasicsSaved('Cambios guardados.');
    } catch (e) {
      setError(e?.message || 'Error guardando datos básicos.');
    } finally {
      setSavingBasics(false);
    }
  };

  const runCreateVersion = async () => {
    setLoading(true);
    setError('');

    const resolvedProposalId = await ensureProposalId();

    // Dev-only debug logging
    try {
      const isDev = typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV !== 'production';
      if (isDev && typeof console !== 'undefined' && console.debug) {
        console.debug('StepPreview: send clicked', { proposalIdProp: proposalId, resolvedProposalId, snapshot });
      }
    } catch (e) {}

    if (!resolvedProposalId || Number(resolvedProposalId) <= 0) {
      setLoading(false);
      setError('No se pudo continuar: falta el identificador de propuesta válido (proposalId).');
      return;
    }
    try {
      const res = await API.createProposalVersion(resolvedProposalId, snapshot, versionNumber);

      onSent({
        versionId: res.version_id,
        publicToken: res.public_token,
        publicUrl: res.public_url,
        status: res.status,
        snapshot,
      });
    } catch (e) {
      setError(e?.message || 'Error guardando la versión.');
    } finally {
      setLoading(false);
    }
  };

  const runShare = async () => {
    setLoading(true);
    setError('');

    const resolvedProposalId = await ensureProposalId();
    if (!resolvedProposalId || Number(resolvedProposalId) <= 0) {
      setLoading(false);
      setError('No se pudo compartir: falta el identificador de propuesta válido (proposalId).');
      return;
    }

    const confirmed = window.confirm(
      '¿Marcar como enviada y generar enlace público? (Esto no envía emails automáticamente)'
    );
    if (!confirmed) {
      setLoading(false);
      return;
    }

    try {
      const res = await API.sendProposal(resolvedProposalId, snapshot, versionNumber);
      onSent({
        versionId: res.version_id,
        publicToken: res.public_token,
        publicUrl: res.public_url,
        status: res.status || 'sent',
        snapshot,
      });
    } catch (e) {
      setError(e?.message || 'Error compartiendo la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <strong>Preview y envío</strong>
      </CardHeader>

      <CardBody>
        {basicsSaved && (
          <Notice status="success" isDismissible onRemove={() => setBasicsSaved('')}>
            {basicsSaved}
          </Notice>
        )}

        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
            {error}
          </Notice>
        )}

        <Notice status={statusType} isDismissible={false}>
          {statusLabel}
        </Notice>

        <Notice status="info" isDismissible={false}>
          El cliente vera solo el total del paquete. El desglose por lineas queda guardado internamente en la version.
        </Notice>

        <div className="proposal-preview">
          <div className="proposal-preview__header">
            <div className="proposal-preview__name">{snapshotCustomerName || '—'}</div>
            <div className="proposal-preview__meta">
              {snapshotHeader.start_date} - {snapshotHeader.end_date} | Pax: {snapshotHeader.pax_total} | Moneda: {snapshotHeader.currency}
            </div>
          </div>

          <div className="proposal-preview__includes">
            <div className="proposal-preview__includes-title">Incluye</div>
            {includeRoomLines.length > 0 && (
              <div className="proposal-preview__includes-lines">
                {includeRoomLines.map((line) => (
                  <div key={line.key} className="proposal-preview__includes-line">
                    {line.text}
                  </div>
                ))}
              </div>
            )}
            <div className="preview-items">
              {snapshotItems.map((it, idx) => {
                const warnings = Array.isArray(it?.warnings) ? it.warnings : [];
                const blocking = Array.isArray(it?.blocking) ? it.blocking : [];
                const displayName = it.display_name || it.title || `Item ${idx + 1}`;
                const supplierName = it.giav_supplier_name || 'Proveedor no especificado';
                const hasBlocking = blocking.length > 0;
                const hasWarnings = warnings.length > 0;

                return (
                  <div key={idx} className="preview-item">
                    <div className="preview-item__main">
                      <div className="preview-item__title">
                        <strong>{it.service_type?.toUpperCase()}</strong> - {displayName}
                      </div>
                      <div className="preview-item__supplier">Proveedor: {supplierName}</div>

                      {it.service_type === 'hotel' && it.hotel_room_type ? (
                        <div className="preview-item__meta">Habitacion: {it.hotel_room_type}</div>
                      ) : null}

                      {it.service_type === 'package' && it.package_components_text ? (
                        <div className="preview-item__meta">
                          Incluye: {it.package_components_text.split('\n').filter(Boolean).join(', ')}
                        </div>
                      ) : null}

                      {it.service_type === 'package' && (it.package_pricing_basis || 'per_person') === 'per_person' ? (
                        (() => {
                          const currency = snapshotHeader.currency || 'EUR';
                          const basis = it.package_pricing_basis === 'per_room' ? 'per_room' : 'per_person';

                          if (basis === 'per_room') {
                            const roomDouble = toNumber(it.package_room_double ?? it.unit_sell_price ?? 0);
                            const modeRoom = it.package_single_room_mode === 'supplement' ? 'supplement' : 'price';
                            const roomSingle = toNumber(it.package_room_single ?? it.unit_sell_price_single_room ?? 0);
                            const rawSuppRoom = toNumber(it.package_room_single_supplement ?? it.package_single_room_supplement_sell ?? 0);
                            const hasSingleRoom = (roomSingle > 0) || (modeRoom === 'supplement' && rawSuppRoom > 0);

                            return (
                              <div className="preview-item__meta">
                                Precio paquete por habitación (doble): {currency} {round2(roomDouble).toFixed(2)}
                                {hasSingleRoom && (
                                  <>
                                    {' · '}
                                    {modeRoom === 'supplement'
                                      ? `Suplemento habitación individual: ${currency} ${round2(rawSuppRoom).toFixed(2)}`
                                      : `Precio habitación individual: ${currency} ${round2(roomSingle).toFixed(2)}`}
                                  </>
                                )}
                              </div>
                            );
                          }

                          const ppDouble = toNumber(it.package_pp_double ?? it.unit_sell_price ?? 0);
                          const mode = it.package_individual_mode === 'supplement' ? 'supplement' : 'price';
                          const rawSupp = toNumber(it.package_single_supplement ?? it.package_single_supplement_sell ?? 0);
                          const ppSingle =
                            mode === 'supplement'
                              ? (ppDouble + rawSupp)
                              : toNumber(it.package_pp_single ?? it.unit_sell_price_individual ?? 0);
                          const hasSingle = ppSingle > 0 && (mode === 'supplement' ? rawSupp >= 0 : true);
                          const supp = hasSingle ? Math.max(0, ppSingle - ppDouble) : null;

                          return (
                            <div className="preview-item__meta">
                              Precio paquete por persona (doble): {currency} {round2(ppDouble).toFixed(2)}
                              {hasSingle && (
                                <>
                                  {' · '}
                                  {mode === 'supplement'
                                    ? `Suplemento individual: ${currency} ${round2(supp || 0).toFixed(2)}`
                                    : `Precio en individual: ${currency} ${round2(ppSingle).toFixed(2)}`}
                                </>
                              )}
                            </div>
                          );
                        })()
                      ) : null}

                      {hasBlocking && (
                        <div className="preview-item__blocking">
                          <span className="preview-item__badge preview-item__badge--error">Error</span>
                          Este servicio impide la confirmacion.
                        </div>
                      )}

                      {hasBlocking && (
                        <details className="preview-item__details">
                          <summary>Ver motivos</summary>
                          <ul>
                            {blocking.map((b, i) => (
                              <li key={i}>{b?.message || 'Revision requerida'}</li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {hasWarnings && (
                        <details className="preview-item__details">
                          <summary>
                            <span className="preview-item__badge preview-item__badge--warning">Aviso</span>
                            Ver avisos ({warnings.length})
                          </summary>
                          <ul>
                            {warnings.map((w, i) => (
                              <li key={i}>{w?.message || 'Aviso'}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
            {informativeExtras.length > 0 && (
              <div className="proposal-preview__informative-block">
                <div className="proposal-preview__informative-title">
                  Cotización informativa
                </div>
                <div className="proposal-preview__informative-lines">
                  {informativeExtras.map((line) => (
                    <div key={line.key} className="proposal-preview__informative-line">
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="proposal-preview__totals">
            <div className="proposal-preview__totals-label">Total viaje</div>
            <div className="proposal-preview__totals-value">
              {snapshotHeader.currency} {round2(pricingSummary.totalTrip).toFixed(2)}
            </div>

            {pricingSummary.playersCount > 0 && (
              <div className="proposal-preview__totals-line">
                Precio jugador en {pricingSummary.baseRoomType === 'single' ? 'individual' : 'doble'}: {snapshotHeader.currency} {round2(pricingSummary.pricePlayerBase || 0).toFixed(2)}
              </div>
            )}
            <div className="proposal-preview__totals-line">
              Precio no jugador en {pricingSummary.baseRoomType === 'single' ? 'individual' : 'doble'}: {snapshotHeader.currency} {round2(pricingSummary.priceNonPlayerBase || 0).toFixed(2)}
            </div>
            {pricingSummary.hasSingleSupplement && (
              <div className="proposal-preview__totals-line">
                Suplemento individual: {snapshotHeader.currency} {round2(pricingSummary.supplementSingle || 0).toFixed(2)}
              </div>
            )}
            <div className="proposal-preview__totals-note">
              {pricingSummary.hasSingleSupplement
                ? 'Precios por persona. El suplemento individual aplica por persona alojada en habitación individual.'
                : pricingSummary.baseRoomType === 'single'
                ? 'Precios por persona en habitación individual.'
                : 'Precios por persona en habitación doble.'}
            </div>
          </div>
        </div>


        <div className="proposal-preview__actions">
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Volver
          </Button>

          {resolveProposalId() && (
            <Button variant="secondary" onClick={saveBasicsOnly} disabled={loading || savingBasics}>
              Guardar datos básicos
            </Button>
          )}

        {mode === 'edit' ? (
          <>
            <Button variant="secondary" onClick={runCreateVersion} disabled={loading}>
              Guardar nueva versión
            </Button>
            <Button variant="primary" onClick={runShare} disabled={loading}>
              Compartir propuesta
            </Button>
          </>
        ) : (
          <>
            {hasEmail && (
              <Button variant="secondary" onClick={runCreateVersion} disabled={loading}>
                Guardar borrador
              </Button>
            )}
            <Button variant="primary" onClick={hasEmail ? runShare : runCreateVersion} disabled={loading}>
              {primaryLabel}
            </Button>
          </>
        )}

          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}

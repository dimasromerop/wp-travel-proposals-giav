import { useMemo, useState } from '@wordpress/element';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import API from '../../api';

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

export default function StepPreview({
  proposalId,
  basics,
  items,
  totals,
  onBack,
  onSent,
  mode = 'create',
  versionNumber = 1,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Snapshot completo (cabecera + items + totales + metadata)
  const snapshot = useMemo(() => {
    const header = {
      crm_customer_id: null,
      customer_name: basics.customer_name,
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
      room_pricing: it.room_pricing ?? null,
      discounts: it.discounts ?? null,
      giav_pricing: it.giav_pricing ?? null,

      // Package (descriptivo)
      package_components: Array.isArray(it.package_components) ? it.package_components : [],
      package_components_text: it.package_components_text ?? '',

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
        source: 'wp-travel-giav-admin',
        schema_version: 'v2',
      },
    };
  }, [basics, items, totals]);

  // Snapshot = fuente de verdad (sin recalcular ni consultar backends en este paso).
  const snapshotHeader = snapshot?.header || {};
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

    let golfTotal = 0;
    let totalDouble = 0;
    let totalSingle = 0;
    let doubleRooms = 0;
    let singleRooms = 0;

    snapshotItems.forEach((item) => {
      if (item.service_type === 'golf') {
        golfTotal += toNumber(item.line_sell_price || 0);
      }
      if (item.service_type === 'hotel') {
        const roomPricing = item.room_pricing || {};
        if (roomPricing.double?.enabled) {
          totalDouble += toNumber(roomPricing.double?.total_pvp || 0);
          doubleRooms += Math.max(0, toInt(roomPricing.double?.rooms ?? 0, 0));
        }
        if (roomPricing.single?.enabled) {
          totalSingle += toNumber(roomPricing.single?.total_pvp || 0);
          singleRooms += Math.max(0, toInt(roomPricing.single?.rooms ?? 0, 0));
        }
      }
    });

    const totalTrip = toNumber(snapshotTotals?.totals_sell_price || 0);
    const baseTotal = totalTrip - golfTotal;
    const priceNonPlayerDouble = paxTotal > 0 ? baseTotal / paxTotal : 0;
    const pricePlayerDouble =
      playersCount > 0 ? priceNonPlayerDouble + golfTotal / playersCount : null;

    const hasSingleSupplement = doubleRooms > 0 && singleRooms > 0;
    let supplementSingle = null;
    if (hasSingleSupplement) {
      const ppDouble = totalDouble / (doubleRooms * 2);
      const ppSingle = totalSingle / singleRooms;
      supplementSingle = Math.max(0, ppSingle - ppDouble);
    }

    return {
      paxTotal,
      playersCount,
      nonPlayersCount,
      totalTrip,
      priceNonPlayerDouble,
      pricePlayerDouble,
      supplementSingle,
      hasSingleSupplement,
    };
  }, [snapshotHeader?.pax_total, snapshotHeader?.players_count, snapshotItems, snapshotTotals?.totals_sell_price]);
  const primaryLabel =
    mode === 'edit'
      ? 'Guardar nueva versión'
      : snapshotHeader.customer_email
      ? 'Enviar propuesta'
      : 'Crear enlace';

  const send = async () => {
    setLoading(true);
    setError('');

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

    const resolvedProposalId = (function () {
      const pid = proposalId && Number(proposalId) > 0 ? Number(proposalId) : null;
      if (pid) return pid;
      const fromUrl = getProposalIdFromUrl();
      if (fromUrl) return fromUrl;
      return null;
    })();

    // Dev-only debug logging
    try {
      const isDev = typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV !== 'production';
      if (isDev && typeof console !== 'undefined' && console.debug) {
        console.debug('StepPreview: send clicked', { proposalIdProp: proposalId, resolvedProposalId, snapshot });
      }
    } catch (e) {}

    if (!resolvedProposalId || Number(resolvedProposalId) <= 0) {
      setLoading(false);
      setError('No se pudo enviar: falta el identificador de propuesta válido (proposalId).');
      return;
    }

    try {
      const res =
        mode === 'edit'
          ? await API.createProposalVersion(resolvedProposalId, snapshot, versionNumber)
          : await API.sendProposal(resolvedProposalId, snapshot, versionNumber);

      onSent({
        versionId: res.version_id,
        publicToken: res.public_token,
        publicUrl: res.public_url,
        status: res.status,
        snapshot,
      });
    } catch (e) {
      setError(e?.message || 'Error enviando la propuesta.');
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

        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            background: '#fff',
          }}
        >
          <div style={{ fontWeight: 800 }}>{snapshotHeader.customer_name}</div>
          <div style={{ opacity: 0.8 }}>
            {snapshotHeader.start_date} - {snapshotHeader.end_date} | Pax: {snapshotHeader.pax_total} | Moneda: {snapshotHeader.currency}
          </div>


          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
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
                        Incluye: {it.package_components_text.split('\\n').filter(Boolean).join(', ')}
                      </div>
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
                  <div className="preview-item__price">
                    {snapshotHeader.currency} {round2(it.line_sell_price || 0).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Total paquete</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              {snapshotHeader.currency} {round2(pricingSummary.totalTrip).toFixed(2)}
            </div>

            {pricingSummary.playersCount > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                Precio jugador en doble: {snapshotHeader.currency} {round2(pricingSummary.pricePlayerDouble || 0).toFixed(2)}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              Precio no jugador en doble: {snapshotHeader.currency} {round2(pricingSummary.priceNonPlayerDouble || 0).toFixed(2)}
            </div>
            {pricingSummary.hasSingleSupplement && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                Suplemento individual: {snapshotHeader.currency} {round2(pricingSummary.supplementSingle || 0).toFixed(2)}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>
              Precios por persona. El suplemento individual aplica por persona alojada en habitación individual.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Volver
          </Button>

          <Button variant="primary" onClick={send} disabled={loading}>
            {primaryLabel}
          </Button>

          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}

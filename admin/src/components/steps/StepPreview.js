import { useMemo, useState } from '@wordpress/element';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import API from '../../api';
import { buildCustomerFullName } from '../../utils/customer';

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

    const priceNonPlayerDouble = ppDouble + commonPP;
    const pricePlayerDouble =
      summary.playersCount > 0 ? priceNonPlayerDouble + summary.golfTotal / summary.playersCount : null;

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
  }, [snapshotHeader?.pax_total, snapshotHeader?.players_count, snapshotItems, snapshotTotals?.totals_sell_price]);
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
    return null;
  };

  const runCreateVersion = async () => {
    setLoading(true);
    setError('');

    const resolvedProposalId = resolveProposalId();

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

    const resolvedProposalId = resolveProposalId();
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
          </div>

          <div className="proposal-preview__totals">
            <div className="proposal-preview__totals-label">Total viaje</div>
            <div className="proposal-preview__totals-value">
              {snapshotHeader.currency} {round2(pricingSummary.totalTrip).toFixed(2)}
            </div>

            {pricingSummary.playersCount > 0 && (
              <div className="proposal-preview__totals-line">
                Precio jugador en doble: {snapshotHeader.currency} {round2(pricingSummary.pricePlayerDouble || 0).toFixed(2)}
              </div>
            )}
            <div className="proposal-preview__totals-line">
              Precio no jugador en doble: {snapshotHeader.currency} {round2(pricingSummary.priceNonPlayerDouble || 0).toFixed(2)}
            </div>
            {pricingSummary.hasSingleSupplement && (
              <div className="proposal-preview__totals-line">
                Suplemento individual: {snapshotHeader.currency} {round2(pricingSummary.supplementSingle || 0).toFixed(2)}
              </div>
            )}
            <div className="proposal-preview__totals-note">
              Precios por persona. El suplemento individual aplica por persona alojada en habitacion individual.
            </div>
          </div>
        </div>


        <div className="proposal-preview__actions">
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Volver
          </Button>

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
            <Button variant="primary" onClick={hasEmail ? runShare : runCreateVersion} disabled={loading}>
              {primaryLabel}
            </Button>
          )}

          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}

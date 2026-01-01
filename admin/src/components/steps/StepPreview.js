import { useMemo, useState } from '@wordpress/element';
import { Button, Card, CardBody, CardHeader, Notice, Spinner } from '@wordpress/components';
import API from '../../api';

function round2(n) {
  const x = parseFloat(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export default function StepPreview({
  proposalId,
  basics,
  items,
  totals,
  onBack,
  onSent,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pax = Math.max(1, parseInt(basics?.pax_total || 1, 10));
  const perPerson = (totals?.totals_sell_price || 0) / pax;

  // Snapshot completo (cabecera + items + totales + metadata)
  const snapshot = useMemo(() => {
    const header = {
      crm_customer_id: null,
      customer_name: basics.customer_name,
      customer_email: basics.customer_email,
      customer_country: basics.customer_country,
      customer_language: basics.customer_language,
      start_date: basics.start_date,
      end_date: basics.end_date,
      pax_total: basics.pax_total,
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

      // Package (descriptivo)
      package_components: Array.isArray(it.package_components) ? it.package_components : [],
      package_components_text: it.package_components_text ?? '',

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

  const send = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await API.sendProposal(proposalId, snapshot, 1);

      onSent({
        versionId: res.version_id,
        publicToken: res.public_token,
        publicUrl: res.public_url,
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
        <strong>Preview & envío</strong>
      </CardHeader>

      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
            {error}
          </Notice>
        )}

        <Notice status="info" isDismissible={false}>
          El cliente verá solo el total del paquete. El desglose por líneas queda guardado internamente en la versión.
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
          <div style={{ fontWeight: 800 }}>{basics.customer_name}</div>
          <div style={{ opacity: 0.8 }}>
            {basics.start_date} → {basics.end_date} | Pax: {basics.pax_total} | Moneda: {basics.currency}
          </div>

          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {(items || []).map((it, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ opacity: 0.9 }}>
                  <strong>{it.service_type?.toUpperCase()}</strong> · {it.title}
                  {it.service_type === 'hotel' && it.hotel_room_type ? ` · ${it.hotel_room_type}` : ''}
                  {it.service_type === 'package' && it.package_components_text
                    ? ` · Incluye: ${it.package_components_text.split('\n').filter(Boolean).join(', ')}`
                    : ''}
                </div>
                <div style={{ fontWeight: 700 }}>
                  {basics.currency} {round2(it.line_sell_price || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Total paquete</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              {basics.currency} {round2(totals?.totals_sell_price || 0).toFixed(2)}
            </div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
              Precio por persona: {basics.currency} {round2(perPerson).toFixed(2)}
            </div>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
              Margen interno: {basics.currency} {round2(totals?.totals_margin_abs || 0).toFixed(2)} (
              {round2(totals?.totals_margin_pct || 0).toFixed(2)}%)
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="secondary" onClick={onBack} disabled={loading}>
            Volver
          </Button>

          <Button variant="primary" onClick={send} disabled={loading}>
            Enviar propuesta
          </Button>

          {loading && <Spinner />}
        </div>
      </CardBody>
    </Card>
  );
}

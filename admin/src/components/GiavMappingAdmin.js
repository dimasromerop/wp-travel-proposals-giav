import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  SelectControl,
  Spinner,
  TextControl,
} from '@wordpress/components';
import API from '../api';

function SupplierSearchSelect({ selectedId, selectedLabel, onPick, disabled }) {
  const [query, setQuery] = useState(selectedLabel || '');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if ((selectedLabel || '') !== query && selectedLabel) {
      setQuery(selectedLabel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLabel]);

  async function doSearch(term) {
    const q = (term || '').trim();

    if (q.length < 2) {
      setItems([]);
      setError('');
      setOpen(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await API.searchGiavProviders({ q, pageSize: 20, pageIndex: 0, includeDisabled: false });

      const list = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);

      const norm = list
        .map((x) => ({
          id: String(x.id ?? x.ID ?? x.Id ?? x.proveedorId ?? ''),
          label: String(x.label ?? x.NombreAlias ?? x.Nombre ?? x.title ?? ''),
        }))
        .filter((x) => x.id && x.label);

      setItems(norm);
      setOpen(norm.length > 0);
    } catch (e) {
      setError(e?.message || 'No se pudo buscar en GIAV.');
      setItems([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function onChange(v) {
    setQuery(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 250);
  }

  function choose(it) {
    setQuery(it.label);
    setItems([]);
    setOpen(false);
    setError('');
    onPick?.(it);
  }

  const helpText = selectedId
    ? `Seleccionado: ${selectedLabel ? `${selectedLabel} (#${selectedId})` : `#${selectedId}`}`
    : 'Se valida en GIAV al guardar (Proveedor_GET).';

  return (
    <div style={{ position: 'relative' }}>
      <TextControl
        value={query}
        onChange={onChange}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        placeholder="Busca por nombre (mín. 2 letras)…"
        disabled={disabled}
        help={helpText}
      />

      {loading && (
        <div style={{ marginTop: 6 }}>
          <Spinner />
        </div>
      )}

      {error && (
        <div style={{ marginTop: 6, color: '#b32d2e', fontSize: 12 }}>
          {error}
        </div>
      )}

      {open && items.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: '100%',
            background: '#fff',
            border: '1px solid #ddd',
            borderTop: 'none',
            maxHeight: 260,
            overflow: 'auto',
          }}
        >
          {items.map((it) => (
            <div
              key={it.id}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it);
              }}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ fontWeight: 600 }}>{it.label}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>ID: {it.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function MappingStatus({ status }) {
  let label = '⚠️ missing';
  if (status === 'active') label = '✅ active';
  if (status === 'needs_review') label = '🟠 needs_review';
  if (status === 'deprecated') label = '⛔ deprecated';
  return <span style={{ whiteSpace: 'nowrap' }}>{label}</span>;
}

export default function GiavMappingAdmin() {
  const [type, setType] = useState('hotel');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [data, setData] = useState({ items: [], total: 0 });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [selected, setSelected] = useState({}); // key => true
  const [bulkProvider, setBulkProvider] = useState({ id: '', label: '' });
  const [bulkApplying, setBulkApplying] = useState(false);

  const rows = useMemo(() => (data.items || []), [data]);

  const selectedKeys = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const allSelected = useMemo(() => rows.length > 0 && rows.every((r) => selected[keyFor(r)]), [rows, selected]);

  function keyFor(r) {
    return `${r.wp_object_type}:${r.wp_object_id}`;
  }

  function getEdit(r) {
    const k = keyFor(r);
    const cur = edits[k] || {};
    const m = r.mapping || { status: 'missing' };
    return {
      providerId: cur.providerId ?? (m.giav_entity_id ? String(m.giav_entity_id) : ''),
      providerName: cur.providerName ?? (m.giav_supplier_name ? String(m.giav_supplier_name) : ''),
      status: cur.status ?? (m.status || 'missing'),
    };
  }

  function setEdit(r, patch) {
    const k = keyFor(r);
    setEdits((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...patch } }));
  }

  async function refresh() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await API.listGiavMappings({ type, q });
      setData(res || { items: [], total: 0 });
    } catch (err) {
      setNotice({ status: 'error', message: err?.message || 'No se pudo cargar el mapeo.' });
      setData({ items: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(r, checked) {
    const k = keyFor(r);
    setSelected((prev) => ({ ...prev, [k]: !!checked }));
  }

  function toggleAll(checked) {
    const next = {};
    rows.forEach((r) => {
      next[keyFor(r)] = !!checked;
    });
    setSelected(next);
  }

  async function applyBulkMapping() {
    const wp_object_type = type === 'hotel' ? 'hotel' : 'course';
    const ids = selectedKeys;

    if (!bulkProvider?.id) {
      setNotice({ status: 'warning', message: 'Selecciona un proveedor para aplicar en lote.' });
      return;
    }
    if (ids.length === 0) {
      setNotice({ status: 'warning', message: 'Selecciona al menos una fila para aplicar el mapeo en lote.' });
      return;
    }

    setBulkApplying(true);
    setNotice(null);
    try {
      const items = ids.map((k) => {
        const parts = String(k).split(':');
        const wp_object_id = parseInt(parts[1], 10);
        return { wp_object_id };
      }).filter((x) => x.wp_object_id > 0);

      const res = await API.batchUpsertGiavMappings({
        wp_object_type,
        giav_supplier_id: String(bulkProvider.id),
        items,
        status: 'active',
        match_type: 'batch',
      });

      const msg = `Mapeo en lote aplicado. Creados: ${res?.created ?? 0}, actualizados: ${res?.updated ?? 0}${(res?.errors?.length || 0) ? `, errores: ${res.errors.length}` : ''}.`;
      setNotice({ status: (res?.ok === false ? 'warning' : 'success'), message: msg });

      setSelected({});
      await refresh();
    } catch (err) {
      setNotice({ status: 'error', message: err?.message || 'No se pudo aplicar el mapeo en lote.' });
    } finally {
      setBulkApplying(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function saveRow(r) {
    const k = keyFor(r);
    const e = getEdit(r);
    if (!e.providerId) {
      setNotice({ status: 'warning', message: 'Selecciona un proveedor de GIAV.' });
      return;
    }

    setSaving(k);
    setNotice(null);
    const DEFAULT_SUPPLIER_ID = '1734698';
    const isGeneric = String(e.providerId) === DEFAULT_SUPPLIER_ID;

    try {
      await API.upsertGiavMapping({
        wp_object_type: r.wp_object_type,
        wp_object_id: r.wp_object_id,
        giav_entity_type: 'supplier',
        giav_entity_id: String(e.providerId),
        giav_supplier_id: String(e.providerId),
        giav_supplier_name: e.providerName || null,
        status: isGeneric ? 'needs_review' : 'active',
        match_type: isGeneric ? 'auto_generic' : 'manual',
      });
      setNotice({ status: 'success', message: 'Mapeo guardado (validado en GIAV).' });
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      });
      await refresh();
    } catch (err) {
      setNotice({ status: 'error', message: err?.message || 'No se pudo guardar el mapeo.' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto' }}>
      <Card>
        <CardHeader>
          <strong>GIAV Mapping</strong>
        </CardHeader>
        <CardBody>
          {notice && <Notice status={notice.status} isDismissible onRemove={() => setNotice(null)}>{notice.message}</Notice>}

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
            <SelectControl
              label="Tipo"
              value={type}
              options={[
                { label: 'Hoteles', value: 'hotel' },
                { label: 'Campos', value: 'golf' },
              ]}
              onChange={(v) => setType(v)}
            />
            <TextControl
              label="Buscar"
              value={q}
              onChange={(v) => setQ(v)}
              placeholder={type === 'hotel' ? 'Nombre del hotel…' : 'Nombre del campo…'}
            />
            <Button variant="secondary" onClick={() => refresh()} disabled={loading}>
              {loading ? <Spinner /> : 'Actualizar'}
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, opacity: 0.8 }}>Aplicar proveedor a seleccionados</label>
              <SupplierSearchSelect
                selectedId={bulkProvider?.id}
                selectedLabel={bulkProvider?.label}
                disabled={bulkApplying}
                onPick={({ id, label }) => setBulkProvider({ id, label })}
              />
            </div>
            <Button
              variant="primary"
              onClick={applyBulkMapping}
              isBusy={bulkApplying}
              disabled={bulkApplying}
            >
              Aplicar en lote ({selectedKeys.length})
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="widefat striped">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th>Objeto</th>
                  <th>Estado</th>
                  <th>Proveedor (GIAV)</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="4" style={{ padding: 16, textAlign: 'center' }}>
                      <Spinner />
                    </td>
                  </tr>
                )}

                {!loading &&
                  rows.map((r) => {
                    const k = keyFor(r);
                    const e = getEdit(r);
                    return (
                      <tr key={k}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!selected[k]}
                            onChange={(evt) => toggleRow(r, evt.target.checked)}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.title}</div>
                          <div style={{ opacity: 0.7, fontSize: 12 }}>
                            {r.wp_object_type} #{r.wp_object_id}
                          </div>
                        </td>
                        <td>
                          <MappingStatus status={r.mapping?.status || 'missing'} />
                        </td>
                        <td>
                          <SupplierSearchSelect
                            selectedId={e.providerId}
                            selectedLabel={e.providerName || r.mapping?.giav_supplier_name || ''}
                            disabled={saving && saving !== k}
                            onPick={({ id, label }) =>
                              setEdit(r, {
                                providerId: id,
                                providerName: label,
                                status: 'active',
                              })
                            }
                          />
                          {r.mapping?.giav_entity_id && (
                            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                              Actual: #{r.mapping.giav_entity_id}{' '}
                              {r.mapping?.giav_supplier_name ? (
                                <span>({r.mapping.giav_supplier_name})</span>
                              ) : null}{' '}
                              ({r.mapping.status})
                            </div>
                          )}
                        </td>
                        <td>
                          <Button
                            variant="primary"
                            onClick={() => saveRow(r)}
                            isBusy={saving === k}
                            disabled={saving && saving !== k}
                          >
                            Guardar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                {!loading && (data.items || []).length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ padding: 16, textAlign: 'center', opacity: 0.7 }}>
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

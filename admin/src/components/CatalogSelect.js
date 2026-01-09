import { useEffect, useState } from '@wordpress/element';
import { TextControl, Spinner } from '@wordpress/components';
import API from '../api';

export default function CatalogSelect({ label, type, valueTitle, onPick }) {
  const [q, setQ] = useState(valueTitle || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    setQ(valueTitle || '');
  }, [valueTitle]);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    setLoading(true);
    API.searchCatalog({ type, q })
      .then((r) => alive && setResults(Array.isArray(r) ? r : []))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [q, open, type]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 320, minWidth: 0 }}>
      <TextControl
        label={label}
        value={q}
        onChange={(v) => {
          setQ(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={type === 'hotel' ? 'Buscar hotel…' : 'Buscar campo…'}
      />

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 30,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 8,
            width: '100%',
            maxHeight: 220,
            overflow: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,.08)',
          }}
        >
          {loading && (
            <div style={{ padding: 8 }}>
              <Spinner />
            </div>
          )}

          {!loading && results.length === 0 && (
            <div style={{ padding: 8, fontSize: 12, opacity: 0.6 }}>
              Sin resultados
            </div>
          )}

          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 10px',
                  border: 0,
                  background: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {r.title}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

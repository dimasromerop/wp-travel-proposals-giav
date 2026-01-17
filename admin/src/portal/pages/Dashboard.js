import { useEffect, useMemo, useState } from 'react';
import { getDashboard } from '../api';

const formatMoney = (amount, currency = 'EUR') => {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch (e) {
    return `${n.toFixed(0)} ${currency}`;
  }
};

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('es-ES', { dateStyle: 'medium' });
};

export default function Dashboard() {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currency = data?.currency || 'EUR';

  const kpis = useMemo(() => {
    const k = data?.summary || {};
    return [
      {
        label: 'Beneficio neto (GIAV)',
        value: formatMoney(k.margen_neto_total || 0, currency),
      },
      {
        label: 'Pendiente de cobrar',
        value: formatMoney(k.pending_cobrar_total || 0, currency),
      },
      {
        label: 'Pendiente de pagar',
        value: formatMoney(k.pending_pagar_total || 0, currency),
      },
      {
        label: 'Expedientes',
        value: String(k.expedientes_count || 0),
      },
    ];
  }, [data, currency]);

  const load = async (opts = {}) => {
    setLoading(true);
    setError('');
    try {
      const payload = await getDashboard({ year, ...opts });
      setData(payload || null);
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el dashboard.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  return (
    <div className="casanova-portal-section">
      <div className="casanova-portal-detail__header">
        <div>
          <p className="casanova-portal__eyebrow">Resumen</p>
          <h2>Dashboard {year}</h2>
          <p>Ventas, margen y expedientes del año natural.</p>
        </div>
        <div className="casanova-portal-detail__actions">
          <label className="casanova-portal-filter" style={{ minWidth: 160 }}>
            <span>Año</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 5 }).map((_, idx) => {
                const y = nowYear - idx;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="button-secondary"
            onClick={() => load({ force: true })}
            disabled={loading}
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="casanova-portal-section__notice casanova-portal-section__notice--error">
          {error}
        </div>
      ) : null}

      <div className="casanova-portal-grid" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="casanova-portal-card">
            <p className="casanova-portal__eyebrow">{kpi.label}</p>
            <h3 style={{ marginTop: 6 }}>{kpi.value}</h3>
          </div>
        ))}
      </div>

      <div className="casanova-portal-card" style={{ marginTop: 18 }}>
        <h3>Expedientes</h3>
        <p style={{ marginTop: 6 }}>
          {data?.expedientes?.length
            ? `Mostrando ${data.expedientes.length} expedientes (máx. 250).`
            : 'No hay expedientes para este año.'}
        </p>

        {data?.expedientes?.length ? (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table className="widefat striped" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Título</th>
                  <th style={{ textAlign: 'left' }}>Fechas viaje</th>
                  <th style={{ textAlign: 'left' }}>Estado</th>
                  <th style={{ textAlign: 'right' }}>Pendiente cobrar</th>
                  <th style={{ textAlign: 'right' }}>Margen neto</th>
                </tr>
              </thead>
              <tbody>
                {data.expedientes.map((row) => (
                  <tr key={row.id || row.titulo}>
                    <td>
                      <strong>{row.titulo || '—'}</strong>
                      {row.id ? <div style={{ opacity: 0.7 }}>#{row.id}</div> : null}
                    </td>
                    <td>
                      {formatDate(row.fecha_desde)} – {formatDate(row.fecha_hasta)}
                    </td>
                    <td>{row.cerrado ? 'Cerrado' : 'Abierto'}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(row.pendiente_cobrar || 0, currency)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(row.margen_neto || 0, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

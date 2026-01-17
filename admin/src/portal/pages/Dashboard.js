import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboard } from '../api';

const PER_PAGE = 25;

const formatMoney = (amount, currency = 'EUR') => {
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch (error) {
    return `${value.toFixed(0)} ${currency}`;
  }
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('es-ES', { dateStyle: 'medium' });
};

const MonthlyChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="dashboard-chart__empty">Sin datos mensuales</div>;
  }

  const width = 700;
  const height = 220;
  const maxValue = Math.max(1, ...data.map((point) => point.ventas));
  const xStep = data.length > 1 ? width / (data.length - 1) : width / 2;
  const points = data
    .map((point, index) => {
      const x = index * xStep;
      const ratio = point.ventas / maxValue;
      const y = height - ratio * height;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <div className="dashboard-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Ventas por mes">
        <g className="dashboard-chart__grid">
          {[0.25, 0.5, 0.75].map((position) => (
            <line
              key={position}
              x1={0}
              x2={width}
              y1={height - position * height}
              y2={height - position * height}
              stroke="#e2e8f0"
              strokeDasharray="4 6"
              strokeWidth="1"
            />
          ))}
        </g>
        <polygon points={areaPoints} fill="rgba(59,130,246,0.08)" />
        <polyline
          fill="none"
          stroke="#3b82f6"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
      <div className="dashboard-chart__labels">
        {data.map((point) => (
          <span key={point.month}>{point.month.slice(5)}</span>
        ))}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [filters, setFilters] = useState({
    page: 1,
    sortBy: 'fecha_inicio',
    order: 'asc',
    agent: '',
    paymentStatus: '',
    paymentDueDays: null,
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(
    async ({ force } = {}) => {
      setLoading(true);
      setError('');
      try {
        const payload = await getDashboard({
          year,
          force,
          page: filters.page,
          perPage: PER_PAGE,
          sortBy: filters.sortBy,
          order: filters.order,
          agent: filters.agent || undefined,
          paymentStatus: filters.paymentStatus || undefined,
          paymentDueDays: filters.paymentDueDays ?? undefined,
        });
        setData(payload);
      } catch (err) {
        setError(err?.message || 'No se pudo cargar el dashboard.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [year, filters]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: 1 }));
  }, [year]);

  const summary = data?.summary ?? {};
  const chartData = data?.chart ?? [];
  const expedientes = data?.expedientes?.items ?? [];
  const meta = data?.expedientes?.meta;

  const kpis = useMemo(
    () => [
      {
        label: 'Ventas estimadas',
        value: formatMoney(summary.ventas_estimadas_total || 0, data?.currency),
      },
      {
        label: 'Margen estimado',
        value: formatMoney(summary.margen_estimado_total || 0, data?.currency),
      },
      {
        label: 'Expedientes',
        value: String(summary.expedientes_total || 0),
      },
      {
        label: 'Riesgo de cobro',
        value: String(summary.expedientes_riesgo_cobro || 0),
      },
    ],
    [summary, data?.currency]
  );

  const handleSort = (key) => {
    setFilters((prev) => {
      const nextOrder = prev.sortBy === key && prev.order === 'asc' ? 'desc' : 'asc';
      return { ...prev, sortBy: key, order: nextOrder, page: 1 };
    });
  };

  const handleQuickFilter = (type) => {
    setFilters((prev) => {
      if (type === 'overdue') {
        return { ...prev, paymentStatus: 'vencido', paymentDueDays: null, page: 1 };
      }
      if (type === 'upcoming') {
        return { ...prev, paymentStatus: '', paymentDueDays: 15, page: 1 };
      }
      return { ...prev, paymentStatus: '', paymentDueDays: null, agent: '', page: 1 };
    });
  };

  const hasFiltersActive = Boolean(
    filters.agent || filters.paymentStatus || filters.paymentDueDays !== null
  );

  const handleAgentChange = (value) => {
    setFilters((prev) => ({ ...prev, agent: value, page: 1 }));
  };

  const navigatePage = (delta) => {
    setFilters((prev) => {
      const nextPage = Math.max(1, Math.min(totalPages, prev.page + delta));
      return { ...prev, page: nextPage };
    });
  };

  const totalPages = meta?.total_pages || 1;
  const currentPage = filters.page;

  return (
    <div className="dashboard-section">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Resumen</p>
          <h1>Dashboard {year}</h1>
          <p>Ventas y pagos por año natural.</p>
        </div>
        <div className="dashboard-actions">
          <label className="dashboard-year-picker">
            <span>Año</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
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
            onClick={() => loadDashboard({ force: true })}
            disabled={loading}
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <div className="dashboard-cards">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="dashboard-card">
            <p className="dashboard-card__label">{kpi.label}</p>
            <h3 className="dashboard-card__value">{kpi.value}</h3>
          </div>
        ))}
      </div>

      <div className="dashboard-chart-card">
        <div className="dashboard-chart-card__header">
          <h2>Ventas por mes</h2>
          <span className="dashboard-chart-card__hint">Basado en fecha de inicio</span>
        </div>
        <MonthlyChart data={chartData} />
      </div>

      <section className="dashboard-table-card">
        <header className="dashboard-toolbar">
          <div className="dashboard-toolbar__input">
            <label>
              <span>Agente comercial</span>
              <input
                type="search"
                placeholder="Buscar agente"
                value={filters.agent}
                onChange={(event) => handleAgentChange(event.target.value)}
              />
            </label>
          </div>
          <div className="dashboard-quick-filters">
            <button
              type="button"
              className={`dashboard-quick-filter ${filters.paymentStatus === 'vencido' ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('overdue')}
            >
              Pagos vencidos
            </button>
            <button
              type="button"
              className={`dashboard-quick-filter ${filters.paymentDueDays === 15 ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('upcoming')}
            >
              Próximos pagos
            </button>
            <button
              type="button"
              className={`dashboard-quick-filter ${hasFiltersActive ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('clear')}
            >
              Limpiar filtros
            </button>
          </div>
        </header>

        {error && <div className="dashboard-error">{error}</div>}

        <div className="dashboard-table-wrapper">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => handleSort('giav_id_humano')}>
                    Expediente{' '}
                    {filters.sortBy === 'giav_id_humano' ? (filters.order === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </th>
                <th>Cliente</th>
                <th>
                  <button type="button" onClick={() => handleSort('agente_comercial')}>
                    Agente{' '}
                    {filters.sortBy === 'agente_comercial' ? (filters.order === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </th>
                <th>Viaje</th>
                <th>
                  <button type="button" onClick={() => handleSort('fecha_inicio')}>
                    Inicio{' '}
                    {filters.sortBy === 'fecha_inicio' ? (filters.order === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </th>
                <th>Fin</th>
                <th>
                  <button type="button" onClick={() => handleSort('dias_hasta_viaje')}>
                    Días hasta el viaje{' '}
                    {filters.sortBy === 'dias_hasta_viaje' ? (filters.order === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </th>
                <th>Pagos</th>
                <th>
                  <button type="button" onClick={() => handleSort('total_pvp')}>
                    Total PVP{' '}
                    {filters.sortBy === 'total_pvp' ? (filters.order === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="dashboard-table__status">
                    Cargando expedientes…
                  </td>
                </tr>
              )}
              {!loading && expedientes.length === 0 && (
                <tr>
                  <td colSpan={9} className="dashboard-table__status">
                    No hay expedientes registrados para este año.
                  </td>
                </tr>
              )}
              {!loading &&
                expedientes.map((row, index) => (
                  <tr key={`${row.giav_id_humano}-${index}`}>
                    <td>
                      <strong>{row.giav_id_humano || '—'}</strong>
                    </td>
                    <td>
                      <div className="dashboard-table__name">{row.cliente_nombre || '—'}</div>
                    </td>
                    <td>{row.agente_comercial || '—'}</td>
                    <td>
                      <div className="dashboard-table__travel">{row.nombre_viaje || '—'}</div>
                    </td>
                    <td>{formatDate(row.fecha_inicio)}</td>
                    <td>{formatDate(row.fecha_fin)}</td>
                    <td>
                      <span className={`dashboard-badge dashboard-badge--${row.riesgo || 'ok'}`}>
                        {row.dias_hasta_viaje ?? '—'} días
                      </span>
                    </td>
                    <td>
                      <div className="dashboard-payments">
                        <span className={`dashboard-badge dashboard-badge--${row.pagos?.estado || 'pendiente'}`}>
                          {row.pagos?.estado || 'pendiente'} · {row.pagos?.tipo || '—'}
                        </span>
                        <small>
                          {row.pagos?.proximo_vencimiento ? `Vence ${row.pagos.proximo_vencimiento}` : 'Sin vencimiento'}
                        </small>
                      </div>
                    </td>
                    <td>{formatMoney(row.total_pvp, data?.currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <footer className="dashboard-pagination">
          <div className="dashboard-pagination__meta">
            <span>
              Página {currentPage} de {totalPages}
            </span>
            <span>
              Mostrando {expedientes.length} de {meta?.total ?? 0} expedientes
            </span>
          </div>
          <div className="dashboard-pagination__actions">
            <button type="button" onClick={() => navigatePage(-1)} disabled={currentPage <= 1 || loading}>
              Anterior
            </button>
            <button type="button" onClick={() => navigatePage(1)} disabled={currentPage >= totalPages || loading}>
              Siguiente
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default Dashboard;

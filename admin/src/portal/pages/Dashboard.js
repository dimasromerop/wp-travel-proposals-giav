import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDashboard } from '../api';
import '../styles/dashboard.css';

const MONTH_LABELS = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
};

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

const formatMonthLabel = (month) => {
  if (!month || typeof month !== 'string') {
    return '—';
  }
  const [, mm] = month.split('-');
  return MONTH_LABELS[mm] || month;
};

const formatChartCurrency = (value, currency = 'EUR') => {
  const safeValue = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(safeValue);
  } catch (error) {
    return `${safeValue.toFixed(0)} ${currency}`;
  }
};

const SummaryIcon = ({ type }) => {
    const icons = {
      ventas: (
        <svg viewBox="0 0 24 24" role="presentation">
          <rect x="4" y="9" width="16" height="10" rx="3" stroke="currentColor" fill="none" />
          <path d="M4 9h16l-2-4H6z" stroke="currentColor" fill="none" />
        </svg>
      ),
      margen: (
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M6 16l4-6 4 4 4-8" stroke="currentColor" fill="none" />
          <path d="M4 20h16" stroke="currentColor" fill="none" />
        </svg>
      ),
      expedientes: (
        <svg viewBox="0 0 24 24" role="presentation">
          <rect x="5" y="6" width="14" height="12" rx="2" stroke="currentColor" fill="none" />
          <path d="M8 9h8" stroke="currentColor" fill="none" />
          <path d="M8 13h6" stroke="currentColor" fill="none" />
        </svg>
      ),
      riesgo: (
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M12 4l6 10h-12z" stroke="currentColor" fill="none" />
          <path d="M12 12v4" stroke="currentColor" fill="none" />
          <path d="M12 17h.01" stroke="currentColor" fill="none" />
        </svg>
      ),
    };
  return icons[type] || icons.ventas;
};

const SummaryTile = ({ icon, label, value, helper }) => (
  <article className="dashboard-summary-card">
    <div className={`dashboard-summary-card__icon dashboard-summary-card__icon--${icon}`} aria-hidden="true">
      <SummaryIcon type={icon} />
    </div>
    <div>
      <p className="dashboard-summary-card__label">{label}</p>
      <p className="dashboard-summary-card__value">{value}</p>
      <p className="dashboard-summary-card__helper">{helper}</p>
    </div>
  </article>
);

const SortButton = ({ label, onClick, isActive, order }) => (
  <button
    type="button"
    className="dashboard-table__sort-button"
    onClick={onClick}
  >
    <span>{label}</span>
    <span
      className={`dashboard-table__sort-icon ${isActive ? 'is-active' : ''}`}
      data-order={isActive ? order : 'none'}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 14" role="presentation" focusable="false">
        <polygon
          className="dashboard-table__sort-chevron dashboard-table__sort-chevron--up"
          points="2,8 6,3 10,8"
        />
        <polygon
          className="dashboard-table__sort-chevron dashboard-table__sort-chevron--down"
          points="2,6 6,11 10,6"
        />
      </svg>
    </span>
  </button>
);

const MonthlyChart = ({ data, currency }) => {
  if (!data || data.length === 0) {
    return <div className="dashboard-chart__empty">Sin datos mensuales</div>;
  }

  const pointsData = [...data].sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const width = 720;
  const height = 260;
  const maxValue = Math.max(1, ...pointsData.map((point) => point.ventas));
  const xStep = pointsData.length > 1 ? width / (pointsData.length - 1) : width / 2;
  const points = pointsData
    .map((point, index) => {
      const x = index * xStep;
      const ratio = point.ventas / maxValue;
      const y = height - ratio * height;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPath = `${points} ${width},${height} 0,${height}`;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((weight) => maxValue * weight);

  return (
    <div className="dashboard-chart">
      <div className="dashboard-chart__axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={`tick-${tick}`}>{formatChartCurrency(tick, currency)}</span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Ventas por mes"
        preserveAspectRatio="none"
      >
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
              strokeWidth={1}
            />
          ))}
        </g>
        <polygon points={areaPath} />
        <polyline points={points} />
        <g className="dashboard-chart__dots">
          {pointsData.map((point, index) => {
            const x = index * xStep;
            const ratio = point.ventas / maxValue;
            const y = height - ratio * height;
            return (
              <circle
                key={`dot-${point.month}`}
                cx={x}
                cy={y}
                r={5}
              >
                <title>{`Ventas ${formatChartCurrency(point.ventas, currency)} · ${formatMonthLabel(point.month)}`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      <div className="dashboard-chart__labels">
        {pointsData.map((point) => (
          <span
            key={`label-${point.month}`}
            title={`Ventas ${formatChartCurrency(point.ventas, currency)}`}
          >
            {formatMonthLabel(point.month)}
          </span>
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
    tripDueDays: null,
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
          tripDueDays: filters.tripDueDays ?? undefined,
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
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);

  const normalizedChartData = useMemo(() => {
    return (chartData || [])
      .map((point) => {
        const ventas = typeof point.ventas === 'number'
          ? point.ventas
          : Number(point.value ?? 0);
        return {
          month: point.month || point.mes || '',
          ventas: Number.isFinite(ventas) ? ventas : 0,
          expedientes: Number.isFinite(point.expedientes)
            ? point.expedientes
            : Number.isFinite(point.count)
              ? point.count
              : 0,
        };
      })
      .filter((point) => point.month);
  }, [chartData]);

  const summaryTiles = useMemo(
    () => [
      {
        label: 'Ventas estimadas',
        value: formatMoney(summary.ventas_estimadas_total || 0, data?.currency),
        helper: 'Basado en viajes iniciados',
        icon: 'ventas',
      },
      {
        label: 'Margen estimado',
        value: formatMoney(summary.margen_estimado_total || 0, data?.currency),
        helper: 'Margen operativo previsto',
        icon: 'margen',
      },
      {
        label: 'Expedientes',
        value: String(summary.expedientes_total || 0),
        helper: 'Expedientes aceptados',
        icon: 'expedientes',
      },
      {
        label: 'Riesgo de cobro',
        value: String(summary.expedientes_riesgo_cobro || 0),
        helper: 'Pagos con alertas',
        icon: 'riesgo',
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
        return {
          ...prev,
          paymentStatus: 'vencido',
          paymentDueDays: null,
          tripDueDays: null,
          page: 1,
        };
      }
      if (type === 'upcoming') {
        return {
          ...prev,
          paymentStatus: '',
          paymentDueDays: 15,
          tripDueDays: null,
          page: 1,
        };
      }
      if (type === 'soon') {
        return {
          ...prev,
          paymentStatus: '',
          paymentDueDays: null,
          tripDueDays: 30,
          page: 1,
        };
      }
      if (type === 'clear') {
        return {
          ...prev,
          paymentStatus: '',
          paymentDueDays: null,
          tripDueDays: null,
          agent: '',
          page: 1,
        };
      }
      return prev;
    });
  };

  const hasFiltersActive = Boolean(
    filters.agent ||
      filters.paymentStatus ||
      filters.paymentDueDays !== null ||
      filters.tripDueDays !== null
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

  const todayStats = useMemo(() => {
    const stats = {
      overdue: 0,
      upcoming: 0,
      soon: 0,
    };
    expedientes.forEach((row) => {
      const estado = (row.pagos?.estado || '').toString().toLowerCase();
      if (estado === 'vencido') {
        stats.overdue += 1;
      }
      const diasParaVencer = typeof row.pagos?.dias_para_vencer === 'number'
        ? row.pagos.dias_para_vencer
        : null;
      if (diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 15) {
        stats.upcoming += 1;
      }
      const diasDesdeHoy = typeof row.dias_hasta_viaje === 'number'
        ? row.dias_hasta_viaje
        : null;
      if (diasDesdeHoy !== null && diasDesdeHoy >= 0 && diasDesdeHoy <= 30) {
        stats.soon += 1;
      }
    });
    return stats;
  }, [expedientes]);

  const agentLeaderboard = useMemo(() => {
    const map = {};
    expedientes.forEach((row) => {
      const key = (row.agente_comercial || 'Sin agente').trim();
      const label = key || 'Sin agente';
      const entry = map[label] ?? { agent: label, expedientes: 0, total: 0, overdue: 0 };
      entry.expedientes += 1;
      entry.total += Number(row.total_pvp || 0);
      if ((row.pagos?.estado || '').toString().toLowerCase() === 'vencido') {
        entry.overdue += 1;
      }
      map[label] = entry;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expedientes]);

  const renderDayStatus = (row) => {
    const dias = typeof row.dias_hasta_viaje === 'number' ? row.dias_hasta_viaje : null;
    const startDate = row.fecha_inicio ? new Date(row.fecha_inicio) : null;
    const endDate = row.fecha_fin ? new Date(row.fecha_fin) : null;
    const now = new Date();

    const inProgress = startDate && endDate && now >= startDate && now <= endDate;
    if (inProgress) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--active">En curso</span>
        </div>
      );
    }

    if (dias !== null && dias < 0) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--past">Finalizado</span>
          <small>Hace {Math.abs(dias)} días</small>
        </div>
      );
    }

    if (dias === 0) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--today">Hoy</span>
        </div>
      );
    }

    const label = dias !== null ? `En ${dias} días` : '—';
    return (
      <div className="dashboard-day-status">
        <span className="dashboard-day-status__badge">{label}</span>
      </div>
    );
  };

  const renderPaymentAmounts = (pagos) => {
    if (!pagos) {
      return null;
    }
    const parts = [];
    if (pagos.pagado_total !== undefined && pagos.pagado_total !== null) {
      parts.push(`Pagado: ${formatMoney(pagos.pagado_total, data?.currency)}`);
    }
    if (pagos.total_pvp !== undefined && pagos.total_pvp !== null) {
      parts.push(`Total: ${formatMoney(pagos.total_pvp, data?.currency)}`);
    }
    if (pagos.pendiente_total !== undefined && pagos.pendiente_total !== null) {
      parts.push(`Pendiente: ${formatMoney(pagos.pendiente_total, data?.currency)}`);
    }
    if (parts.length === 0) {
      return null;
    }
    return <small className="dashboard-payments__amounts">{parts.join(' / ')}</small>;
  };

  const copyToClipboard = async (value) => {
    if (!value || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      // ignore clipboard errors
    }
  };

  return (
    <div className="dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <p className="dashboard-eyebrow">Resumen</p>
          <h1>Dashboard {year}</h1>
          <p className="dashboard-page__subtitle">Ventas y pagos por año natural.</p>
        </div>
        <div className="dashboard-page__actions">
          <label className="dashboard-page__year-picker">
            <span>Año</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {Array.from({ length: 5 }).map((_, idx) => {
                const optionYear = nowYear - idx;
                return (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            type="button"
            className="button-secondary dashboard-page__refresh"
            onClick={() => loadDashboard({ force: true })}
            disabled={loading}
          >
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      <section className="dashboard-section dashboard-section--chart-summary">
        <div className="dashboard-section__header">
          <div>
            <p className="dashboard-section__eyebrow">Ventas por mes</p>
            <h2>Ventas por mes</h2>
            <p className="dashboard-section__hint">Basado en fecha de inicio del viaje.</p>
          </div>
        </div>
          <div className="dashboard-chart-summary">
            <div className="dashboard-chart-summary__chart">
              <MonthlyChart data={normalizedChartData} currency={data?.currency} />
            </div>
            <div className="dashboard-chart-summary__cards">
              {summaryTiles.slice(0, 2).map((tile) => (
                <SummaryTile key={tile.label} {...tile} />
              ))}
              <div className="dashboard-summary-row">
                {summaryTiles.slice(2).map((tile) => (
                  <SummaryTile key={tile.label} {...tile} />
                ))}
              </div>
            </div>
          </div>
      </section>

      <div className="dashboard-ops">
        <section className="dashboard-section dashboard-section--today">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Hoy</p>
              <h2>Prioridades</h2>
            </div>
          </div>
          <div className="dashboard-today-block">
            <button
              type="button"
              className={`dashboard-today-pill dashboard-today-pill--overdue ${filters.paymentStatus === 'vencido' ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('overdue')}
            >
              <span className="dashboard-today-pill__label">Pagos vencidos</span>
              <strong>{todayStats.overdue}</strong>
            </button>
            <button
              type="button"
              className={`dashboard-today-pill dashboard-today-pill--upcoming ${filters.paymentDueDays === 15 ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('upcoming')}
            >
              <span className="dashboard-today-pill__label">Pagos próximos</span>
              <strong>{todayStats.upcoming}</strong>
            </button>
            <button
              type="button"
              className={`dashboard-today-pill dashboard-today-pill--soon ${filters.tripDueDays === 30 ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('soon')}
            >
              <span className="dashboard-today-pill__label">Viajes en 30 días</span>
              <strong>{todayStats.soon}</strong>
            </button>
            {todayStats.overdue === 0 && todayStats.upcoming === 0 && expedientes.length > 0 && (
              <span className="dashboard-today-pill dashboard-today-pill--healthy">Todo al día</span>
            )}
          </div>
        </section>

        <section className="dashboard-section dashboard-section--agents">
          <div className="dashboard-section__header">
            <div>
              <p className="dashboard-section__eyebrow">Agentes</p>
              <h2>Cartera por agente</h2>
              <p className="dashboard-section__hint">Ordenado por ventas estimadas.</p>
            </div>
          </div>
          <div className="dashboard-agent-table-wrapper">
            {agentLeaderboard.length === 0 ? (
              <p className="dashboard-agent-table__empty">No hay datos de agentes disponibles.</p>
            ) : (
              <table className="dashboard-agent-table">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Expedientes</th>
                    <th>Ventas</th>
                    <th>Vencidos</th>
                  </tr>
                </thead>
                <tbody>
                  {agentLeaderboard.map((row) => (
                    <tr
                      key={row.agent}
                      className={row.overdue > 0 ? 'dashboard-agent-table__row--alert' : ''}
                      onClick={() => handleAgentChange(row.agent)}
                      tabIndex={0}
                      role="button"
                    >
                      <td>{row.agent}</td>
                      <td>{row.expedientes}</td>
                      <td>{formatMoney(row.total, data?.currency)}</td>
                      <td>
                        {row.overdue > 0 ? (
                          <span className="dashboard-agent-table__badge">{row.overdue}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="dashboard-section dashboard-section--table">
        <div className="dashboard-section__header">
          <div>
            <p className="dashboard-section__eyebrow">Expedientes</p>
            <h2>Gestión de pagos y riesgos</h2>
            <p className="dashboard-section__hint">Priorización operativa.</p>
          </div>
        </div>

        <div className="dashboard-table__controls">
          <label className="dashboard-table__filter">
            <span>Agente comercial</span>
            <input
              type="search"
              placeholder="Buscar agente"
              value={filters.agent}
              onChange={(event) => handleAgentChange(event.target.value)}
            />
          </label>
          <div className="dashboard-table__chips">
            <button
              type="button"
              className={`dashboard-chip ${filters.paymentStatus === 'vencido' ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('overdue')}
            >
              Pagos vencidos
            </button>
            <button
              type="button"
              className={`dashboard-chip ${filters.paymentDueDays === 15 ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('upcoming')}
            >
              Próximos pagos
            </button>
            <button
              type="button"
              className={`dashboard-chip ${hasFiltersActive ? 'is-active' : ''}`}
              onClick={() => handleQuickFilter('clear')}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {error && <div className="dashboard-error">{error}</div>}

        <div className="dashboard-table-wrapper">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>
                  <SortButton
                    label="Expediente"
                    onClick={() => handleSort('giav_id_humano')}
                    isActive={filters.sortBy === 'giav_id_humano'}
                    order={filters.order}
                  />
                </th>
                <th>Cliente</th>
                <th>
                  <SortButton
                    label="Agente"
                    onClick={() => handleSort('agente_comercial')}
                    isActive={filters.sortBy === 'agente_comercial'}
                    order={filters.order}
                  />
                </th>
                <th>Viaje</th>
                <th>
                  <SortButton
                    label="Inicio"
                    onClick={() => handleSort('fecha_inicio')}
                    isActive={filters.sortBy === 'fecha_inicio'}
                    order={filters.order}
                  />
                </th>
                <th>Fin</th>
                <th>
                  <SortButton
                    label="Días hasta el viaje"
                    onClick={() => handleSort('dias_hasta_viaje')}
                    isActive={filters.sortBy === 'dias_hasta_viaje'}
                    order={filters.order}
                  />
                </th>
                <th>Pagos</th>
                <th>Margen est.</th>
                <th>
                  <SortButton
                    label="Total PVP"
                    onClick={() => handleSort('total_pvp')}
                    isActive={filters.sortBy === 'total_pvp'}
                    order={filters.order}
                  />
                </th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="dashboard-table__status">
                    Cargando expedientes…
                  </td>
                </tr>
              )}
              {!loading && expedientes.length === 0 && (
                <tr>
                  <td colSpan={11} className="dashboard-table__status">
                    No hay expedientes registrados para este año.
                  </td>
                </tr>
              )}
              {!loading &&
                expedientes.map((row) => {
                  const riskLevel = (row.riesgo || 'ok').toString().toLowerCase();
                  const paymentState = (row.pagos?.estado || 'pendiente').toString().toLowerCase();
                  const isLowMargin =
                    typeof row.margen_estimado === 'number' &&
                    typeof row.total_pvp === 'number' &&
                    row.total_pvp > 0 &&
                    row.margen_estimado / row.total_pvp < 0.1;
                  return (
                    <tr key={`${row.giav_id_humano}-${row.fecha_inicio}-${row.fecha_fin}`}>
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
                      <td>{renderDayStatus(row)}</td>
                      <td>
                        <div className="dashboard-payments">
                          <span className={`dashboard-badge dashboard-badge--${paymentState}`}>
                            {paymentState}
                          </span>
                          {renderPaymentAmounts(row.pagos)}
                        </div>
                      </td>
                      <td className="dashboard-table__align-right">
                        <div className="dashboard-margin-cell">
                          <span>{formatMoney(row.margen_estimado || 0, data?.currency)}</span>
                          {isLowMargin && <span className="dashboard-badge dashboard-badge--margin-low">Bajo</span>}
                        </div>
                      </td>
                      <td>{formatMoney(row.total_pvp || 0, data?.currency)}</td>
                      <td>
                        <div className="dashboard-actions">
                          <button
                            type="button"
                            className="dashboard-action"
                            onClick={() => copyToClipboard(row.giav_id_humano)}
                          >
                            Copiar ID
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
            <button
              type="button"
              onClick={() => navigatePage(-1)}
              disabled={currentPage <= 1 || loading}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => navigatePage(1)}
              disabled={currentPage >= totalPages || loading}
            >
              Siguiente
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};

export default Dashboard;

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
    return '—';
  }
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
        <rect x="4" y="8" width="16" height="10" rx="3" fill="none" />
        <path d="M4 8h16l-2-4H6z" fill="none" />
      </svg>
    ),
    margen: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M6 16l4-6 4 5 4-8" fill="none" />
        <path d="M4 20h16" fill="none" />
      </svg>
    ),
    expedientes: (
      <svg viewBox="0 0 24 24" role="presentation">
        <rect x="5" y="6" width="14" height="12" rx="2" fill="none" />
        <path d="M8 10h8" fill="none" />
        <path d="M8 14h6" fill="none" />
      </svg>
    ),
    riesgo: (
      <svg viewBox="0 0 24 24" role="presentation">
        <path d="M12 4l7 12H5z" fill="none" />
        <path d="M12 12v4" fill="none" />
        <path d="M12 18h.01" />
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

const SkeletonBlock = ({ className = '', style = {} }) => (
  <span className={`dashboard-skeleton ${className}`.trim()} style={style} aria-hidden="true" />
);

const SummaryTileSkeleton = () => (
  <article className="dashboard-summary-card dashboard-summary-card--skeleton" aria-hidden="true">
    <SkeletonBlock className="dashboard-skeleton--icon" />
    <div className="dashboard-summary-card__body">
      <SkeletonBlock className="dashboard-skeleton--label" />
      <SkeletonBlock className="dashboard-skeleton--value" />
      <SkeletonBlock className="dashboard-skeleton--helper" />
    </div>
  </article>
);

const ChartSkeleton = () => (
  <div className="dashboard-chart-skeleton" aria-hidden="true">
    <div className="dashboard-chart-skeleton__axis">
      {Array.from({ length: 5 }).map((_, idx) => (
        <SkeletonBlock key={`axis-${idx}`} className="dashboard-skeleton--axis" />
      ))}
    </div>
    <div className="dashboard-chart-skeleton__plot">
      <div className="dashboard-chart-skeleton__grid">
        {[0, 1, 2].map((idx) => (
          <span key={`grid-${idx}`} className="dashboard-chart-skeleton__grid-line" />
        ))}
      </div>
      <SkeletonBlock className="dashboard-chart-skeleton__line" />
      <div className="dashboard-chart-skeleton__dots">
        {Array.from({ length: 8 }).map((_, idx) => (
          <SkeletonBlock key={`dot-${idx}`} className="dashboard-chart-skeleton__dot" />
        ))}
      </div>
    </div>
  </div>
);

const ChartLabelsSkeleton = () => (
  <div className="dashboard-chart-skeleton__labels" aria-hidden="true">
    {Array.from({ length: 12 }).map((_, idx) => (
      <SkeletonBlock key={`label-${idx}`} className="dashboard-skeleton--label-xs" />
    ))}
  </div>
);

const SortButton = ({ label, onClick, isActive, order }) => (
  <button
    type="button"
    className={`dashboard-table__sort-button${isActive ? ' is-active' : ''}`}
    onClick={onClick}
    aria-pressed={isActive}
    aria-label={`${label} ${isActive ? (order === 'asc' ? 'orden ascendente' : 'orden descendente') : 'ordenar ascendente'}`}
  >
    <span className="dashboard-table__sort-label">{label}</span>
    <span className="dashboard-table__sort-icon" data-order={isActive ? order : 'none'}>
      <svg viewBox="0 0 12 14" role="presentation" focusable="false">
        <path className="dashboard-table__sort-arrow dashboard-table__sort-arrow--up" d="M3 8.5L6 5l3 3.5" />
        <path className="dashboard-table__sort-arrow dashboard-table__sort-arrow--down" d="M3 5.5L6 9l3-3.5" />
      </svg>
    </span>
  </button>
);

const MonthlyChart = ({ data, currency }) => {
  if (!data || data.length === 0) {
    return <div className="dashboard-chart__empty">Sin datos mensuales</div>;
  }

  const sorted = [...data].sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const width = Math.max(420, sorted.length * 70);
  const height = 320;
  const values = sorted.map((point) => point.ventas ?? 0);
  const maxValue = Math.max(1, ...values);
  const xStep = sorted.length > 1 ? width / (sorted.length - 1) : width / 2;

  const polylinePoints = sorted.map((point, index) => {
    const x = index * xStep;
    const ratio = (point.ventas ?? 0) / maxValue;
    const y = height - ratio * height;
    return `${x},${y}`;
  });

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((factor) => factor * maxValue);

  return (
    <div className="dashboard-chart" role="img" aria-label="Ventas por mes">
      <div className="dashboard-chart__axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={`tick-${tick}`}>{formatChartCurrency(tick, currency)}</span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="presentation"
      >
        <g className="dashboard-chart__grid">
          {[0.25, 0.5, 0.75].map((position) => (
            <line
              key={`grid-${position}`}
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
        <polygon
          points={`${polylinePoints.join(' ')} ${width},${height} 0,${height}`}
        />
        <polyline
          points={polylinePoints.join(' ')}
        />
        <g className="dashboard-chart__dots">
          {sorted.map((point, index) => {
            const x = index * xStep;
            const ratio = (point.ventas ?? 0) / maxValue;
            const y = height - ratio * height;
            return (
              <circle
                key={`dot-${point.month}-${index}`}
                cx={x}
                cy={y}
                r={5}
              >
                <title>
                  {`Ventas ${formatChartCurrency(point.ventas ?? 0, currency)} · ${formatMonthLabel(point.month)} · ${point.expedientes ?? 0} expediente${(point.expedientes ?? 0) === 1 ? '' : 's'}`}
                </title>
              </circle>
            );
          })}
        </g>
      </svg>
      <div className="dashboard-chart__labels">
        {sorted.map((point) => (
          <span key={`label-${point.month}`}>{formatMonthLabel(point.month)}</span>
        ))}
      </div>
    </div>
  );
};

const TableRowSkeleton = ({ index }) => (
  <tr key={`row-skel-${index}`} className="dashboard-table__row is-skeleton" aria-hidden="true">
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--short" /></td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--long" /></td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--medium" /></td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--long" /></td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--medium" /></td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--medium" /></td>
    <td>
      <div className="dashboard-day-status">
        <SkeletonBlock className="dashboard-skeleton--pill" />
        <SkeletonBlock className="dashboard-skeleton--subline" />
      </div>
    </td>
    <td>
      <div className="dashboard-payments">
        <SkeletonBlock className="dashboard-skeleton--pill" />
        <SkeletonBlock className="dashboard-skeleton--subline" />
        <SkeletonBlock className="dashboard-skeleton--subline dashboard-skeleton--subline-short" />
      </div>
    </td>
    <td className="dashboard-table__align-right">
      <SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--short" />
    </td>
    <td className="dashboard-table__align-right">
      <div className="dashboard-margin-cell">
        <SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--short" />
        <SkeletonBlock className="dashboard-skeleton--pill dashboard-skeleton--pill-small" />
      </div>
    </td>
    <td><SkeletonBlock className="dashboard-skeleton--text dashboard-skeleton--short" /></td>
    <td>
      <div className="dashboard-actions is-skeleton">
        <SkeletonBlock className="dashboard-skeleton--button" />
        <SkeletonBlock className="dashboard-skeleton--button" />
      </div>
    </td>
  </tr>
);

const Dashboard = () => {
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(nowYear);
  const [filters, setFilters] = useState({
    page: 1,
    sortBy: 'fecha_inicio',
    order: 'asc',
    agent: '',
    client: '',
    expediente: '',
    paymentStatus: '',
    paymentDueDays: null,
    tripDueDays: null,
    showCompleted: false,
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
        perPage: 25,
        sortBy: filters.sortBy,
        order: filters.order,
        agent: filters.agent || undefined,
        client: filters.client || undefined,
        expediente: filters.expediente || undefined,
        paymentStatus: filters.paymentStatus || undefined,
        paymentDueDays: filters.paymentDueDays ?? undefined,
        tripDueDays: filters.tripDueDays ?? undefined,
        showCompleted: filters.showCompleted,
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
  const normalizedChartData = useMemo(() => {
    return (chartData || [])
      .map((point) => {
        const ventas =
          typeof point.ventas === 'number'
            ? point.ventas
            : Number(point.value ?? point.valor ?? 0);
        return {
          month: point.month || point.mes || point.label || '',
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

  const expedientes = data?.expedientes?.items ?? [];
  const meta = data?.expedientes?.meta;
  const totalPages = Math.max(1, meta?.total_pages ?? 1);
  const currentPage = Math.min(Math.max(1, filters.page), totalPages);

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
          client: '',
          expediente: '',
          showCompleted: false,
          page: 1,
        };
      }
      return prev;
    });
  };

  const hasFiltersActive = Boolean(
    filters.agent ||
    filters.client ||
    filters.expediente ||
      filters.paymentStatus ||
      filters.paymentDueDays !== null ||
      filters.tripDueDays !== null ||
      filters.showCompleted
  );

  const hasInputFilters = Boolean(
    filters.agent ||
    filters.client ||
    filters.expediente ||
    filters.paymentStatus ||
    filters.paymentDueDays !== null ||
    filters.tripDueDays !== null
  );

  const handleAgentChange = (value) => {
    setFilters((prev) => ({ ...prev, agent: value, page: 1 }));
  };

  const handleClientChange = (value) => {
    setFilters((prev) => ({ ...prev, client: value, page: 1 }));
  };

  const handleExpedienteChange = (value) => {
    setFilters((prev) => ({ ...prev, expediente: value, page: 1 }));
  };

  const handleToggleCompleted = () => {
    setFilters((prev) => ({ ...prev, showCompleted: !prev.showCompleted, page: 1 }));
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
      const diasParaVencer =
        typeof row.pagos?.dias_para_vencer === 'number'
          ? row.pagos.dias_para_vencer
          : null;
      if (diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 15) {
        stats.upcoming += 1;
      }
      const diasDesdeHoy =
        typeof row.dias_hasta_viaje === 'number'
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
    const dias =
      typeof row.dias_hasta_viaje === 'number' ? row.dias_hasta_viaje : null;
    const startDate = row.fecha_inicio ? new Date(row.fecha_inicio) : null;
    const endDate = row.fecha_fin ? new Date(row.fecha_fin) : null;
    const now = new Date();

    if (startDate && endDate && now >= startDate && now <= endDate) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--active">
            En curso
          </span>
        </div>
      );
    }

    if (dias !== null && dias < 0) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--past">
            Finalizado
          </span>
          <small>Hace {Math.abs(dias)} días</small>
        </div>
      );
    }

    if (dias === 0) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge dashboard-day-status__badge--today">
            Hoy
          </span>
        </div>
      );
    }

    if (dias !== null) {
      return (
        <div className="dashboard-day-status">
          <span className="dashboard-day-status__badge">
            En {dias} días
          </span>
        </div>
      );
    }

    return (
      <div className="dashboard-day-status">
        <span className="dashboard-day-status__badge">Fecha pendiente</span>
      </div>
    );
  };

  const renderNextPaymentDate = (pagos) => {
    const nextDate = pagos?.proximo_vencimiento;
    if (!nextDate) {
      return null;
    }
    return (
      <small className="dashboard-payments__amounts">
        Próximo pago: {formatDate(nextDate)}
      </small>
    );
  };

  const renderPaidAmount = (pagos) => {
    const paid = pagos?.pagado_total;
    if (paid === undefined || paid === null) {
      return null;
    }
    return (
      <small className="dashboard-payments__amounts">
        Pagado: {formatMoney(paid, data?.currency)}
      </small>
    );
  };

  const capitalize = (value) => {
    if (!value) {
      return '—';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
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
            {loading ? 'Actualizando...' : 'Actualizar'}
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
          <div className="dashboard-chart-summary__layout">
            <div className="dashboard-chart-summary__chart">
              {loading ? (
                <>
                  <ChartSkeleton />
                  <ChartLabelsSkeleton />
                </>
              ) : (
                <MonthlyChart data={normalizedChartData} currency={data?.currency} />
              )}
            </div>
            <div className="dashboard-chart-summary__cards">
              {loading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <SummaryTileSkeleton key={`summary-skel-${idx}`} />
                  ))
                : summaryTiles.map((tile) => (
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
            {todayStats.overdue === 0 &&
              todayStats.upcoming === 0 &&
              expedientes.length > 0 && (
                <span className="dashboard-today-pill dashboard-today-pill--healthy">
                  Todo al día
                </span>
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
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleAgentChange(row.agent);
                        }
                      }}
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
          <label className="dashboard-table__filter">
            <span>Cliente</span>
            <input
              type="search"
              placeholder="Buscar cliente"
              value={filters.client}
              onChange={(event) => handleClientChange(event.target.value)}
            />
          </label>
          <label className="dashboard-table__filter">
            <span>Expediente</span>
            <input
              type="search"
              placeholder="Buscar expediente"
              value={filters.expediente}
              onChange={(event) => handleExpedienteChange(event.target.value)}
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
              className={`dashboard-chip ${filters.showCompleted ? 'is-active' : ''}`}
              onClick={handleToggleCompleted}
              aria-pressed={filters.showCompleted}
            >
              {filters.showCompleted ? 'Ocultar finalizados' : 'Ver finalizados'}
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
                <th>
                  <SortButton
                    label="Cliente"
                    onClick={() => handleSort('cliente_nombre')}
                    isActive={filters.sortBy === 'cliente_nombre'}
                    order={filters.order}
                  />
                </th>
                <th>
                  <SortButton
                    label="Agente"
                    onClick={() => handleSort('agente_comercial')}
                    isActive={filters.sortBy === 'agente_comercial'}
                    order={filters.order}
                  />
                </th>
                <th>
                  <SortButton
                    label="Viaje"
                    onClick={() => handleSort('nombre_viaje')}
                    isActive={filters.sortBy === 'nombre_viaje'}
                    order={filters.order}
                  />
                </th>
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
                <th>Pendiente</th>
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
              {loading && Array.from({ length: 6 }).map((_, idx) => (
                <TableRowSkeleton key={`table-skel-${idx}`} index={idx} />
              ))}
              {!loading && expedientes.length === 0 && (
                <tr>
                  <td colSpan={12} className="dashboard-table__status">
                    {hasInputFilters
                      ? 'No hay expedientes que coincidan con los filtros actuales.'
                      : filters.showCompleted
                        ? 'No hay expedientes registrados para este año.'
                        : 'No hay expedientes activos para este año. Activa "Ver finalizados" para ver viajes cerrados.'}
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
                    <tr
                      key={`${row.giav_id_humano}-${row.fecha_inicio}-${row.total_pvp}-${row.nombre_viaje}`}
                      className={`dashboard-table__row dashboard-table__row--risk-${riskLevel}`}
                    >
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
                            {capitalize(paymentState)}
                          </span>
                          {renderNextPaymentDate(row.pagos)}
                          {renderPaidAmount(row.pagos)}
                        </div>
                      </td>
                      <td className="dashboard-table__align-right">
                        {formatMoney(row.pagos?.pendiente_total ?? 0, data?.currency)}
                      </td>
                      <td className="dashboard-table__align-right">
                        <div className="dashboard-margin-cell">
                          <span>{formatMoney(row.margen_estimado || 0, data?.currency)}</span>
                          {isLowMargin && (
                            <span className="dashboard-badge dashboard-badge--margin-low">Bajo</span>
                          )}
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


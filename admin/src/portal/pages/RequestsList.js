import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import API from '../api';
import RequestActionsInline from '../components/RequestActionsInline';

const STATUS_LABELS = {
  new: 'Nueva',
  contacted: 'Contactado',
  quoting: 'Cotizando',
  proposal_sent: 'Propuesta enviada',
  won: 'Ganada',
  lost: 'Perdida',
  archived: 'Archivada',
};

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const languageOptions = [
  { value: '', label: 'Todos los idiomas' },
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const parseDateValue = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }

  const slashMatch = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (slashMatch) {
    const [, d, m, yRaw] = slashMatch;
    const year = yRaw.length === 2 ? 2000 + parseInt(yRaw, 10) : parseInt(yRaw, 10);
    return Date.UTC(year, parseInt(m, 10) - 1, parseInt(d, 10));
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }
  return null;
};

const getCustomerFullName = (mapped = {}) => {
  const first = mapped.first_name || mapped.nombre || '';
  const last = mapped.last_name || mapped.apellido || '';
  const combined = [first, last].filter(Boolean).join(' ');
  if (combined) return combined;
  if (mapped.customer_name) return mapped.customer_name;
  return 'Sin nombre';
};

export default function RequestsList() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [arrivalOrder, setArrivalOrder] = useState('asc');
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    lang: '',
    page: 1,
  });
  const [pagination, setPagination] = useState({ total_pages: 1 });
  const [converting, setConverting] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const result = await API.listRequests({
        search: filters.search,
        status: filters.status,
        lang: filters.lang,
        page: filters.page,
        perPage: 20,
      });
      setRequests(result.items || []);
      setPagination({
        total_pages: result.total_pages || 1,
        page: result.page || 1,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'No se pudo cargar las solicitudes.',
      });
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleConvert = useCallback(async (requestId) => {
    setConverting(requestId);
    setNotice(null);
    try {
      const response = await API.convertRequest(requestId);
      if (response?.edit_url) {
        window.location.assign(response.edit_url);
        return;
      }
      if (response?.redirect_url) {
        window.location.assign(response.redirect_url);
        return;
      }
      setNotice({
        type: 'success',
        message: 'Propuesta creada correctamente.',
      });
      await loadRequests();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'No se pudo convertir la solicitud.',
      });
    } finally {
      setConverting(null);
    }
  }, [loadRequests]);

  const handleInlineStatusChange = useCallback(async (requestId, nextStatus) => {
    if (!requestId || !nextStatus) {
      return;
    }

    const current = requests.find((req) => req.id === requestId);
    const previousStatus = current?.status || 'new';
    if (previousStatus === nextStatus) {
      return;
    }

    setNotice(null);
    setRequests((prev) =>
      prev.map((req) => (req.id === requestId ? { ...req, status: nextStatus } : req))
    );
    setUpdatingStatus((prev) => ({ ...prev, [requestId]: true }));

    try {
      const updated = await API.updateRequestStatus(requestId, { status: nextStatus });
      if (updated?.id) {
        setRequests((prev) =>
          prev.map((req) => (req.id === requestId ? { ...req, ...updated } : req))
        );
      }
    } catch (err) {
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status: previousStatus } : req))
      );
      setNotice({
        type: 'error',
        message: err.message || 'No se pudo actualizar el estado.',
      });
    } finally {
      setUpdatingStatus((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    }
  }, [requests]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? value : 1,
    }));
  };

  const sortedRequests = useMemo(() => {
    const copy = [...requests];
    copy.sort((a, b) => {
      const aValue = parseDateValue(a?.mapped?.fecha_llegada);
      const bValue = parseDateValue(b?.mapped?.fecha_llegada);

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return arrivalOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
    return copy;
  }, [requests, arrivalOrder]);

  const rows = useMemo(() => {
    return sortedRequests.map((req) => {
      const mapped = req.mapped || {};
      const intentions = req.intentions || {};
      const name = getCustomerFullName(mapped);
      const gf = intentions.golf?.green_fees_per_player;
      const flights = intentions.flights;
      const pax = mapped.pax_total || ((mapped.jugadores || 0) + (mapped.no_jugadores || 0));
      const proposal = req.proposal;

      return (
        <div
          key={req.id}
          className="casanova-portal-table__row casanova-portal-table__row--item"
        >
          <span>{formatDate(req.created_at)}</span>
          <span>{name}</span>
          <span>{mapped.package || '—'}</span>
          <span>{mapped.email || '—'}</span>
          <span>{formatDate(mapped.fecha_llegada) || '—'}</span>
          <span>{formatDate(mapped.fecha_regreso) || '—'}</span>
          <span>{pax}</span>
          <span>
            <select
              className="casanova-portal-table__status-select"
              value={req.status || 'new'}
              onChange={(event) => handleInlineStatusChange(req.id, event.target.value)}
              disabled={!!updatingStatus[req.id]}
              aria-label="Actualizar estado"
            >
              {statusOptions.filter((opt) => opt.value).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {updatingStatus[req.id] ? (
              <div className="casanova-portal-table__status-saving">Guardando...</div>
            ) : null}
          </span>
          <span>
            {gf ? `${gf} GF/jug` : '—'}
            {flights?.requested ? (
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Vuelos desde {flights.departure_airport || '—'}
              </div>
            ) : null}
          </span>
          <span className="casanova-portal-table__actions">
            <RequestActionsInline
              request={req}
              proposal={proposal}
              isConverting={converting}
              onConvert={handleConvert}
            />
          </span>
        </div>
      );
    });
  }, [sortedRequests, converting, handleConvert, updatingStatus, handleInlineStatusChange]);

  return (
    <div className="casanova-portal-section">
      <header className="casanova-portal-section__header">
        <div>
          <h2>Solicitudes recibidas</h2>
          <p>Monitorea Gravity Forms, califica el estado y convierte en propuestas.</p>
        </div>
      </header>

      <div className="casanova-portal-filters">
        <label className="casanova-portal-filter">
          <span>Buscar</span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => handleFilterChange('search', event.target.value)}
            placeholder="Nombre, email o ID"
          />
        </label>
        <label className="casanova-portal-filter">
          <span>Estado</span>
          <select
            value={filters.status}
            onChange={(event) => handleFilterChange('status', event.target.value)}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="casanova-portal-filter">
          <span>Idioma</span>
          <select
            value={filters.lang}
            onChange={(event) => handleFilterChange('lang', event.target.value)}
          >
            {languageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="casanova-portal-filters__actions">
          <button className="button-secondary" onClick={() => loadRequests()} disabled={loading}>
            Refrescar
          </button>
        </div>
      </div>

      {notice ? (
        <div
          className={`casanova-portal-section__notice ${notice.type === 'success' ? 'casanova-portal-section__notice--success' : ''}`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="casanova-portal-table casanova-portal-table--requests">
        <div className="casanova-portal-table__row casanova-portal-table__row--header">
          <span>Fecha</span>
          <span>Nombre</span>
          <span>Paquete</span>
          <span>Email</span>
          <button
            type="button"
            className="dashboard-table__sort-button is-active"
            onClick={() => setArrivalOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            aria-pressed="true"
            aria-label={`Llegada ${arrivalOrder === 'asc' ? 'orden ascendente' : 'orden descendente'}`}
          >
            <span className="dashboard-table__sort-label">Llegada</span>
            <span className="dashboard-table__sort-icon" data-order={arrivalOrder}>
              <svg viewBox="0 0 12 14" role="presentation" focusable="false">
                <path className="dashboard-table__sort-arrow dashboard-table__sort-arrow--up" d="M3 8.5L6 5l3 3.5" />
                <path className="dashboard-table__sort-arrow dashboard-table__sort-arrow--down" d="M3 5.5L6 9l3-3.5" />
              </svg>
            </span>
          </button>
          <span>Regreso</span>
          <span>PAX</span>
          <span>Estado</span>
          <span>Intenciones</span>
          <span>Acciones</span>
        </div>
        {loading ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--loading">
            Cargando solicitudes...
          </div>
        ) : null}
        {!loading && !rows.length ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--empty">
            No hay solicitudes que coincidan.
          </div>
        ) : null}
        {!loading && rows}
      </div>

      <div className="casanova-portal-filters" style={{ justifyContent: 'space-between' }}>
        <button className="button-secondary" onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))} disabled={filters.page <= 1}>
          Anterior
        </button>
        <span style={{ alignSelf: 'center' }}>
          Pagina {filters.page} de {pagination.total_pages || 1}
        </span>
        <button className="button-secondary" onClick={() => handleFilterChange('page', filters.page + 1)} disabled={filters.page >= (pagination.total_pages || 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

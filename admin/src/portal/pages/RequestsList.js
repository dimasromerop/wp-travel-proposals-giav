import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import { Link } from 'react-router-dom';
import API from '../api';

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

const PROPOSAL_STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  queued: 'En cola',
  synced: 'Sincronizada',
  error: 'Error',
  revoked: 'Revocada',
  lost: 'Perdida',
};

const PORTAL_BASE_URL = (() => {
  if (typeof window === 'undefined') {
    return '';
  }
  const base = window.CASANOVA_GESTION_RESERVAS?.pageBase || '';
  return base.replace(/\/$/, '');
})();

const buildPortalProposalUrl = (proposalId, edit = false) => {
  if (!PORTAL_BASE_URL || !proposalId) {
    return '';
  }
  const suffix = edit ? '/editar' : '';
  return `${PORTAL_BASE_URL}#/propuesta/${proposalId}${suffix}`;
};






const formatDate = (value) => {
  if (!value) return 'â';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getCustomerFullName = (mapped = {}) => {
  const first = mapped.first_name || mapped.nombre || '';
  const last = mapped.last_name || mapped.apellido || '';
  const full = [first, last].filter(Boolean).join(' ');
  if (full) return full;
  if (mapped.customer_name) return mapped.customer_name;
  return 'Sin nombre';
};


export default function RequestsList() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
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

  const handleConvert = async (requestId) => {
    setConverting(requestId);
    setNotice(null);
    try {
      const response = await API.convertRequest(requestId);
      setNotice({
        type: 'success',
        message: 'Propuesta creada. Abriendo wizard...',
      });
      if (response?.redirect_url) {
        window.open(response.redirect_url, '_blank', 'noopener');
      }
      await loadRequests();
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'No se pudo convertir la solicitud.',
      });
    } finally {
      setConverting(null);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? value : 1,
    }));
  };

  const rows = useMemo(() => {
    return requests.map((req) => {
      const mapped = req.mapped || {};
      const intentions = req.intentions || {};
      const name = getCustomerFullName(mapped);
      const gf = intentions.golf?.green_fees_per_player;
      const flights = intentions.flights;
      const pax = mapped.pax_total || ((mapped.jugadores || 0) + (mapped.no_jugadores || 0));
      const proposal = req.proposal;
      const hasProposal = Boolean(proposal?.id);
      const showProposalActions = hasProposal && Boolean(PORTAL_BASE_URL);
      const proposalStatusLabel = hasProposal
        ? PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status || '—'
        : 'Sin propuesta';
      const proposalViewUrl = hasProposal ? buildPortalProposalUrl(proposal.id) : '';
      const proposalEditUrl = hasProposal ? buildPortalProposalUrl(proposal.id, true) : '';
      const convertLabel = hasProposal ? 'Actualizar propuesta' : 'Convertir';
      return (
        <div key={req.id} className="casanova-portal-table__row casanova-portal-table__row--item" data-idx={req.id}>
          <span>{formatDate(req.created_at)}</span>
          <span>{name}</span>
          <span>{mapped.email || '—'}</span>
          <span>
            {mapped.fecha_llegada || '—'} – {mapped.fecha_regreso || '—'}
          </span>
          <span>{pax}</span>
          <span>
            <span
              className={`status-chip status-chip--${
                (req.status || 'new').replace(/[^a-z0-9_-]/gi, '-')
              }`}
            >
              {STATUS_LABELS[req.status] || req.status || 'Nueva'}
            </span>
            {hasProposal ? (
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Propuesta: {proposalStatusLabel}
              </div>
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
            <Link className="button-secondary casanova-portal-table__action" to={`/requests/${req.id}`}>
              Ver
            </Link>
            {showProposalActions && (
              <>
                <button
                  type="button"
                  className="button-secondary casanova-portal-table__action"
                  onClick={() => window.open(proposalViewUrl, '_blank', 'noopener')}
                >
                  Ver propuesta
                </button>
                <button
                  type="button"
                  className="button-secondary casanova-portal-table__action"
                  onClick={() => window.open(proposalEditUrl, '_blank', 'noopener')}
                >
                  Editar propuesta
                </button>
              </>
            )}
            <button
              type="button"
              className="button-primary casanova-portal-table__action"
              onClick={() => handleConvert(req.id)}
              disabled={converting === req.id}
            >
              {converting === req.id ? 'Convertiendo...' : convertLabel}
            </button>
          </span>
        </div>
      );
    });
  }, [requests, converting]);

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

      {notice && (
        <div
          className={`casanova-portal-section__notice ${
            notice.type === 'success' ? 'casanova-portal-section__notice--success' : ''
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="casanova-portal-table">
        <div className="casanova-portal-table__row casanova-portal-table__row--header">
          <span>Fecha</span>
          <span>Nombre</span>
          <span>Email</span>
          <span>Fechas</span>
          <span>PAX</span>
          <span>Estado</span>
          <span>Intenciones</span>
          <span>Acciones</span>
        </div>
        {loading ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--loading">
            Cargando solicitudesâ¦
          </div>
        ) : null}
        {!loading && !rows.length && (
          <div className="casanova-portal-table__row casanova-portal-table__row--empty">
            No hay solicitudes que coincidan.
          </div>
        )}
        {!loading && rows}
      </div>

      <div className="casanova-portal-filters" style={{ justifyContent: 'space-between' }}>
        <button
          className="button-secondary"
          onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
          disabled={filters.page <= 1}
        >
          Anterior
        </button>
        <span style={{ alignSelf: 'center' }}>
          PÃ¡gina {filters.page} de {pagination.total_pages || 1}
        </span>
        <button
          className="button-secondary"
          onClick={() => handleFilterChange('page', filters.page + 1)}
          disabled={filters.page >= (pagination.total_pages || 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

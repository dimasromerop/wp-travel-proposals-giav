import { useEffect, useMemo, useState } from '@wordpress/element';
import { Link } from 'react-router-dom';
import API from '../api';

const STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  queued: 'En cola',
  synced: 'Sincronizada',
  error: 'Error',
  revoked: 'Revocada',
  lost: 'Perdida',
};

const statuses = [
  { value: 'all', label: 'Todos los estados' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatCurrency = (value, currency) => {
  if (value === undefined || value === null) {
    return '—';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'EUR',
    maximumFractionDigits: 2,
  }).format(number);
};

const ProposalsList = () => {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');

  const loadProposals = async (nextSearch) => {
    setLoading(true);
    setError('');
    try {
      const list = await API.listProposals({
        orderBy: sortBy,
        order: sortOrder,
        search: nextSearch !== undefined ? nextSearch : search,
      });
      setProposals(list);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [sortBy, sortOrder]);

  const filteredProposals = useMemo(() => {
    if (status === 'all') {
      return proposals;
    }
    return proposals.filter((proposal) => proposal.status === status);
  }, [proposals, status]);

  return (
    <div className="casanova-portal-section">
      <header className="casanova-portal-section__header">
        <div>
          <h2>Repositorio de propuestas</h2>
          <p>
            Revisa estados, clientes y detalles sin entrar al admin tradicional.
          </p>
        </div>
        <div className="casanova-portal-section__actions">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <div>
            <label>
              Buscar
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, email o token"
              />
            </label>
          </div>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="updated_at">Última actualización</option>
            <option value="id">ID</option>
          </select>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>
          <button onClick={() => loadProposals(search)} disabled={loading}>
            Refrescar
          </button>
        </div>
      </header>

      {error ? (
        <div className="casanova-portal-section__notice">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="casanova-portal-table">
        <div className="casanova-portal-table__row casanova-portal-table__row--header">
          <span>ID</span>
          <span>Título</span>
          <span>Cliente</span>
          <span>Estado</span>
          <span>Última actualización</span>
          <span>Total</span>
          <span>Acciones</span>
        </div>

        {loading ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--loading">
            Cargando propuestas…
          </div>
        ) : null}

        {!loading && filteredProposals.length === 0 ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--empty">
            No hay propuestas en este filtro.
          </div>
        ) : null}

        {!loading &&
          filteredProposals.map((proposal) => (
            <div
              key={proposal.id}
              className="casanova-portal-table__row casanova-portal-table__row--item"
            >
              <span>#{proposal.id}</span>
              <span>{proposal.proposal_title || 'Propuesta sin título'}</span>
              <span>{proposal.customer_name || proposal.customer_email || '—'}</span>
              <span className={`status-badge status-${proposal.status || 'draft'}`}>
                {STATUS_LABELS[proposal.status] || proposal.status || '—'}
              </span>
              <span>{formatDate(proposal.updated_at)}</span>
              <span>{formatCurrency(proposal.totals_sell_price, proposal.currency)}</span>
              <span>
                <Link to={`/propuesta/${proposal.id}`}>Ver detalle</Link>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ProposalsList;

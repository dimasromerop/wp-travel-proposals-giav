import { useCallback, useEffect, useState } from '@wordpress/element';
import { Link, useSearchParams } from 'react-router-dom';
import API from '../api';
import RowActionsMenu from '../components/RowActionsMenu';
import { buildCustomerFullName } from '../../utils/customer';

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

const sortableColumns = [
  { key: 'id', label: 'ID' },
  { key: 'proposal_title', label: 'Título' },
  { key: 'customer_name', label: 'Cliente' },
  { key: 'author_name', label: 'Autor' },
  { key: 'status', label: 'Estado' },
  { key: 'updated_at', label: 'Última actualización' },
  { key: 'totals_sell_price', label: 'Total' },
];

const formatDate = (value) => {
  if (!value) return '—';
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

const SortIndicator = ({ column, sortBy, order }) => {
  const state = sortBy === column ? order : 'none';
  return (
    <span
      className={`casanova-portal-table__sort-icon is-${state}`}
      aria-hidden="true"
    />
  );
};

const ProposalsList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedSorts = sortableColumns.map((column) => column.key);
  const initialSearch = searchParams.get('q') || '';
  const initialStatus = searchParams.get('status') || 'all';
  const initialSort = searchParams.get('sort') || 'updated_at';
  const initialOrder = (searchParams.get('order') || 'desc').toLowerCase();

  const normalizeSort = (value) => (allowedSorts.includes(value) ? value : 'updated_at');

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [sortBy, setSortBy] = useState(normalizeSort(initialSort));
  const [order, setOrder] = useState(initialOrder === 'asc' ? 'asc' : 'desc');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await API.listProposals({
        search: debouncedSearch,
        status: status !== 'all' ? status : undefined,
        sortBy,
        order,
      });
      setProposals(result.items);
      setSelectedIds((prev) =>
        prev.filter((id) => result.items.some((proposal) => proposal.id === id))
      );
    } catch (err) {
      setError(err.message || 'No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, sortBy, order]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  useEffect(() => {
    const params = {};
    if (debouncedSearch) {
      params.q = debouncedSearch;
    }
    if (status && status !== 'all') {
      params.status = status;
    }
    if (sortBy) {
      params.sort = sortBy;
    }
    if (order) {
      params.order = order;
    }
    setSearchParams(params, { replace: true });
    loadProposals();
  }, [debouncedSearch, status, sortBy, order, loadProposals, setSearchParams]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setOrder('desc');
  };

  const toggleSelected = (proposalId) => {
    setSelectedIds((prev) =>
      prev.includes(proposalId)
        ? prev.filter((id) => id !== proposalId)
        : [...prev, proposalId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === proposals.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(proposals.map((proposal) => proposal.id));
  };

  const handleDelete = async (proposal) => {
    if (!proposal?.id) {
      return;
    }
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la propuesta #${proposal.id}?`
    );
    if (!confirmed) return;
    setLoading(true);
    setError('');
    try {
      await API.deleteProposal(proposal.id);
      setSelectedIds((prev) => prev.filter((id) => id !== proposal.id));
      await loadProposals();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar ${selectedIds.length} propuestas?`
    );
    if (!confirmed) return;
    setLoading(true);
    setError('');
    try {
      await API.bulkDeleteProposals(selectedIds);
      setSelectedIds([]);
      await loadProposals();
    } catch (err) {
      setError(err.message || 'No se pudieron eliminar las propuestas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="casanova-portal-section">
      <header className="casanova-portal-section__header">
        <div>
          <h2>Repositorio de propuestas</h2>
          <p>Revisa estados, clientes y detalles sin salir del portal.</p>
        </div>
        <div className="casanova-portal-section__actions">
          <Link className="button-secondary" to="/nueva">
            Nueva propuesta
          </Link>
          <button
            className="button-primary"
            onClick={loadProposals}
            disabled={loading}
          >
            Refrescar
          </button>
        </div>
      </header>

      <div className="casanova-portal-filters">
        <label className="casanova-portal-filter">
          <span>Buscar</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cliente, email, token o ID"
          />
        </label>
        <label className="casanova-portal-filter">
          <span>Estado</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="casanova-portal-filter">
          <span>Ordenar por</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(normalizeSort(event.target.value))}
          >
            {sortableColumns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="casanova-portal-filter">
          <span>Orden</span>
          <select
            value={order}
            onChange={(event) => setOrder(event.target.value === 'asc' ? 'asc' : 'desc')}
          >
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </select>
        </label>
        <div className="casanova-portal-filters__actions">
          <button
            className="button-secondary"
            onClick={() => {
              setSearchTerm('');
              setStatus('all');
              setSortBy('updated_at');
              setOrder('desc');
            }}
          >
            Limpiar filtros
          </button>
          <button
            className="button-danger"
            onClick={handleBulkDelete}
            disabled={loading || selectedIds.length === 0}
          >
            Eliminar seleccionadas ({selectedIds.length})
          </button>
        </div>
      </div>

      {error ? (
        <div className="casanova-portal-section__notice">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="casanova-portal-table">
        <div className="casanova-portal-table__row casanova-portal-table__row--header">
          <span className="casanova-portal-table__select">
            <input
              type="checkbox"
              checked={proposals.length > 0 && selectedIds.length === proposals.length}
              onChange={toggleSelectAll}
              disabled={loading || proposals.length === 0}
              aria-label="Seleccionar todas las propuestas"
            />
          </span>
          {sortableColumns.map((column) => (
            <span key={column.key}>
              <button
                type="button"
                className="casanova-portal-table__sort-button"
                onClick={() => handleSort(column.key)}
              >
                {column.label}
                <SortIndicator column={column.key} sortBy={sortBy} order={order} />
              </button>
            </span>
          ))}
          <span>Acciones</span>
        </div>

        {loading ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--loading">
            Cargando propuestas…
          </div>
        ) : null}

        {!loading && proposals.length === 0 ? (
          <div className="casanova-portal-table__row casanova-portal-table__row--empty">
            No hay propuestas que coincidan con los filtros seleccionados.
          </div>
        ) : null}

        {!loading &&
          proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="casanova-portal-table__row casanova-portal-table__row--item"
            >
              <span className="casanova-portal-table__select">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(proposal.id)}
                  onChange={() => toggleSelected(proposal.id)}
                  disabled={loading}
                  aria-label={`Seleccionar propuesta #${proposal.id}`}
                />
              </span>
              <span>#{proposal.id}</span>
              <span>{proposal.display_title || proposal.proposal_title || 'Propuesta sin título'}</span>
              <span>
                {(buildCustomerFullName(
                  proposal.first_name,
                  proposal.last_name,
                  proposal.customer_name
                ) || proposal.customer_email || '—')}
              </span>
              <span>{proposal.author_name || '—'}</span>
              <span>
                <span
                  className={`status-chip status-chip--${
                    (proposal.status || 'draft').replace(/[^a-z0-9_-]/gi, '-')
                  }`}
                >
                  {STATUS_LABELS[proposal.status] || proposal.status || '—'}
                </span>
              </span>
              <span>{formatDate(proposal.updated_at)}</span>
              <span>
                {formatCurrency(
                  proposal.current_version_total ?? proposal.totals_sell_price,
                  proposal.currency
                )}
              </span>
              <span className="casanova-portal-table__actions">
                <Link
                  className="button-secondary casanova-portal-table__action"
                  to={`/propuesta/${proposal.id}`}
                >
                  Ver detalle
                </Link>
                <RowActionsMenu proposal={proposal} onDelete={handleDelete} />
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ProposalsList;

import { useEffect, useMemo, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxControl,
  DropdownMenu,
  Notice,
  SelectControl,
  Spinner,
} from '@wordpress/components';
import ProposalWizard from './components/ProposalWizard';
import GiavMappingAdmin from './components/GiavMappingAdmin';
import ProposalDetail from './components/ProposalDetail';
import API from './api';

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

const formatDate = (value) => {
  if (!value) return '—';
  const raw = String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const buildAdminUrl = (params = {}) => {
  const url = new URL(window.location.href);
  url.searchParams.set('page', 'travel_proposals');
  url.searchParams.delete('proposal_id');
  url.searchParams.delete('action');
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, value);
  });
  return url.toString();
};

export default function App() {
  const params = new URLSearchParams(window.location.search || '');
  const page = params.get('page') || '';
  const proposalIdParam = params.get('proposal_id');
  const action = params.get('action');

  if (page === 'wp-travel-giav-mapping') {
    return <GiavMappingAdmin />;
  }

  const [creating, setCreating] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedIds, setSelectedIds] = useState([]);

  const proposalId = proposalIdParam ? parseInt(proposalIdParam, 10) : null;
  const isEditing = action === 'edit' && proposalId;

  useEffect(() => {
    if (!isEditing) {
      setEditData(null);
      setEditError('');
      return;
    }

    let active = true;

    const fetchEditData = async () => {
      setEditLoading(true);
      setEditError('');
      try {
        const res = await API.getProposalDetail(proposalId);
        if (active) {
          setEditData(res);
        }
      } catch (e) {
        if (active) {
          setEditError(e?.message || 'No se pudo cargar la propuesta para editar.');
        }
      } finally {
        if (active) {
          setEditLoading(false);
        }
      }
    };

    fetchEditData();

    return () => {
      active = false;
    };
  }, [isEditing, proposalId]);

  const wizardProps = useMemo(() => {
    if (!editData?.proposal) {
      return null;
    }
    return {
      initialProposal: editData.proposal,
      initialSnapshot: editData.current_snapshot,
      nextVersionNumber: editData.next_version_number || 1,
    };
  }, [editData]);

  const loadProposals = async ({ nextSearch } = {}) => {
    setLoading(true);
    setError('');
    try {
      const searchTerm = nextSearch !== undefined ? nextSearch : search;
      const res = await API.listProposals({
        orderBy: sortBy,
        order: sortOrder,
        limit: 50,
        offset: 0,
        search: searchTerm?.trim() ? searchTerm.trim() : undefined,
      });
      const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      setProposals(list);
      setSelectedIds((prev) => prev.filter((id) => list.some((proposal) => proposal.id === id)));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el repositorio.');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProposal) {
      loadProposals();
    }
  }, [sortBy, sortOrder, selectedProposal]);

  const openProposalDetail = async (proposal) => {
    if (!proposal?.id) return;
    setDetailLoading(true);
    setError('');
    try {
      const detail = await API.getProposal(proposal.id);
      setSelectedProposal(detail);
    } catch (err) {
      setSelectedProposal(proposal);
      setError(err?.message || 'No se pudo cargar el detalle de la propuesta.');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSelected = (proposalId) => {
    setSelectedIds((prev) =>
      prev.includes(proposalId) ? prev.filter((id) => id !== proposalId) : [...prev, proposalId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === proposals.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(proposals.map((proposal) => proposal.id));
  };

  const handleDelete = async (proposalId) => {
    const confirmed = window.confirm('¿Seguro que quieres eliminar esta propuesta?');
    if (!confirmed) return;
    setLoading(true);
    setError('');
    try {
      await API.deleteProposal(proposalId);
      setSelectedIds((prev) => prev.filter((id) => id !== proposalId));
      await loadProposals();
    } catch (err) {
      setError(err?.message || 'No se pudo eliminar la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
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
      setError(err?.message || 'No se pudieron eliminar las propuestas.');
    } finally {
      setLoading(false);
    }
  };

  if (creating) {
    return <ProposalWizard onExit={() => setCreating(false)} />;
  }

  if (isEditing) {
    if (editLoading) {
      return <div style={{ padding: 16 }}>Cargando...</div>;
    }
    if (editError) {
      return <div style={{ padding: 16, color: '#b91c1c' }}>{editError}</div>;
    }
    if (!wizardProps) {
      return null;
    }
    return (
      <ProposalWizard
        onExit={() => {
          const url = new URL(window.location.href);
          url.searchParams.set('page', 'travel_proposals');
          url.searchParams.set('proposal_id', proposalId);
          url.searchParams.delete('action');
          window.location.href = url.toString();
        }}
        mode="edit"
        {...wizardProps}
      />
    );
  }

  if (proposalId) {
    return <ProposalDetail proposalId={proposalId} />;
  }

  if (detailLoading) {
    return (
      <div className="wp-travel-giav-app">
        <Card>
          <CardBody className="proposal-detail__loading">
            <Spinner />
            <span>Cargando detalle…</span>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (selectedProposal) {
    const statusLabel = STATUS_LABELS[selectedProposal.status] || selectedProposal.status || '—';
    return (
      <div className="wp-travel-giav-app">
        <Card className="proposal-detail">
          <CardHeader>
            <div className="proposal-detail__header">
              <div>
                <div className="proposal-detail__eyebrow">Detalle de propuesta</div>
                <strong>Propuesta #{selectedProposal.id}</strong>
              </div>
              <div className="proposal-detail__actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedProposal(null);
                    setError('');
                  }}
                >
                  Volver al listado
                </Button>
                {selectedProposal.public_url ? (
                  <Button variant="primary" href={selectedProposal.public_url} target="_blank" rel="noreferrer">
                    Abrir vista pública
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {error ? (
              <Notice status="error" isDismissible onRemove={() => setError('')}>
                {error}
              </Notice>
            ) : null}
            <div className="proposal-detail__grid">
              <div>
                <div className="proposal-detail__label">Título</div>
                <div className="proposal-detail__value">{selectedProposal.proposal_title || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Cliente</div>
                <div className="proposal-detail__value">{selectedProposal.customer_name || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Email</div>
                <div className="proposal-detail__value">{selectedProposal.customer_email || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Estado</div>
                <div className="proposal-detail__value">
                  <span className={`proposal-status proposal-status--${selectedProposal.status || 'draft'}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Autor</div>
                <div className="proposal-detail__value">{selectedProposal.author_name || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Fechas</div>
                <div className="proposal-detail__value">
                  {selectedProposal.start_date || '—'} - {selectedProposal.end_date || '—'}
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Pax</div>
                <div className="proposal-detail__value">{selectedProposal.pax_total || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Moneda</div>
                <div className="proposal-detail__value">{selectedProposal.currency || '—'}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Última actualización</div>
                <div className="proposal-detail__value">{formatDate(selectedProposal.updated_at)}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="wp-travel-giav-app">
      <Card className="proposal-list">
        <CardHeader>
          <div className="proposal-list__header">
            <div>
              <strong>Repositorio de propuestas</strong>
              <div className="proposal-list__subtitle">
                Gestiona propuestas creadas, revisa su estado y accede al detalle.
              </div>
            </div>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Nueva propuesta
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {error ? (
            <Notice status="error" isDismissible onRemove={() => setError('')}>
              {error}
            </Notice>
          ) : null}
          <div className="proposal-list__filters">
            <div className="proposal-list__search">
              <label className="proposal-list__search-label" htmlFor="proposal-search">
                Buscar cliente
              </label>
              <input
                id="proposal-search"
                className="proposal-list__search-input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, email o token"
              />
            </div>
            <SelectControl
              label="Ordenar por"
              value={sortBy}
              options={[
                { label: 'Última actualización', value: 'updated_at' },
                { label: 'ID', value: 'id' },
              ]}
              onChange={(value) => setSortBy(value)}
            />
            <SelectControl
              label="Orden"
              value={sortOrder}
              options={[
                { label: 'Descendente', value: 'desc' },
                { label: 'Ascendente', value: 'asc' },
              ]}
              onChange={(value) => setSortOrder(value)}
            />
            <Button
              variant="primary"
              onClick={() => loadProposals({ nextSearch: search })}
              disabled={loading}
            >
              Buscar
            </Button>
            <Button
              variant="tertiary"
              onClick={() => {
                setSearch('');
                loadProposals({ nextSearch: '' });
              }}
              disabled={loading}
            >
              Limpiar filtros
            </Button>
            <Button
              variant="secondary"
              isDestructive
              onClick={handleBulkDelete}
              disabled={loading || selectedIds.length === 0}
            >
              Eliminar seleccionadas ({selectedIds.length})
            </Button>
          </div>
          <div className="proposal-list__table">
            <div className="proposal-list__row proposal-list__row--header">
              <div className="proposal-list__select">
                <CheckboxControl
                  checked={selectedIds.length === proposals.length && proposals.length > 0}
                  onChange={toggleSelectAll}
                />
              </div>
              <div>ID</div>
              <div>Título</div>
              <div>Cliente</div>
              <div>Estado</div>
              <div>Última actualización</div>
              <div>Autor</div>
              <div>Acciones</div>
            </div>
            {loading ? (
              <div className="proposal-list__row proposal-list__row--loading">
                <Spinner />
                <span>Cargando propuestas…</span>
              </div>
            ) : null}
            {!loading && proposals.length === 0 ? (
              <div className="proposal-list__empty">No hay propuestas aún.</div>
            ) : null}
            {!loading &&
              proposals.map((proposal) => {
                const statusLabel = STATUS_LABELS[proposal.status] || proposal.status || '—';
                const displayTitle = proposal.display_title || proposal.proposal_title || '—';
                return (
                  <div key={proposal.id} className="proposal-list__row">
                    <div className="proposal-list__select">
                      <CheckboxControl
                        checked={selectedIds.includes(proposal.id)}
                        onChange={() => toggleSelected(proposal.id)}
                      />
                    </div>
                    <div className="proposal-list__id">#{proposal.id}</div>
                    <div className="proposal-list__title">{displayTitle}</div>
                    <div className="proposal-list__customer">
                      <div className="proposal-list__customer-name">{proposal.customer_name || '—'}</div>
                      <div className="proposal-list__customer-meta">
                        {proposal.start_date || '—'} - {proposal.end_date || '—'}
                      </div>
                    </div>
                    <div>
                      <span className={`proposal-status proposal-status--${proposal.status || 'draft'}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div>{formatDate(proposal.updated_at)}</div>
                    <div>{proposal.author_name || '—'}</div>
                    <div className="proposal-list__actions">
                      <Button variant="primary" onClick={() => openProposalDetail(proposal)}>
                        Ver detalle
                      </Button>
                      <DropdownMenu
                        className="proposal-list__actions-menu"
                        icon="ellipsis"
                        label="Más acciones"
                        controls={[
                          {
                            title: 'Editar',
                            onClick: () => {
                              window.location.href = buildAdminUrl({
                                proposal_id: proposal.id,
                                action: 'edit',
                              });
                            },
                          },
                          ...(proposal.public_url
                            ? [
                                {
                                  title: 'Vista pública',
                                  onClick: () => {
                                    window.open(proposal.public_url, '_blank', 'noopener,noreferrer');
                                  },
                                },
                              ]
                            : []),
                          {
                            title: 'Eliminar',
                            isDestructive: true,
                            onClick: () => handleDelete(proposal.id),
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

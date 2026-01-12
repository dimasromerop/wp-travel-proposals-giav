import { useCallback, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { Button, Notice, SelectControl, Spinner, TextControl } from '@wordpress/components';
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

const PER_PAGE = 20;

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getCustomerName = (mapped = {}) => {
  const first = mapped.first_name || mapped.nombre || '';
  const last = mapped.last_name || mapped.apellido || '';
  const full = [first, last].filter(Boolean).join(' ');
  if (full) {
    return full;
  }
  if (mapped.customer_name) {
    return mapped.customer_name;
  }
  return 'Sin nombre';
};

const buildProposalUrl = (proposalId) => {
  if (!proposalId) {
    return '';
  }
  const url = new URL(window.location.href);
  url.searchParams.set('page', 'travel_proposals');
  url.searchParams.set('proposal_id', proposalId);
  url.searchParams.delete('action');
  return url.toString();
};

const RequestsListAdmin = () => {
  const [forms, setForms] = useState({ es_form_id: '', en_form_id: '' });
  const [gfActive, setGfActive] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState('');
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [notice, setNotice] = useState(null);
  const [filters, setFilters] = useState({ status: '', lang: '', q: '', page: 1 });
  const [pagination, setPagination] = useState({ total_pages: 1, page: 1, total: 0 });
  const [convertingId, setConvertingId] = useState(null);
  const filtersRef = useRef(filters);

  const hasConfiguredForms = Boolean(forms.es_form_id || forms.en_form_id);
  const configUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', 'wp-travel-giav-requests-settings');
    return url.toString();
  }, []);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError('');
    try {
      const res = await API.getRequestMappingConfig();
      setForms({
        es_form_id: res.forms?.es_form_id || '',
        en_form_id: res.forms?.en_form_id || '',
      });
      setGfActive(true);
    } catch (err) {
      if (err?.status === 503) {
        setGfActive(false);
        setConfigError('Gravity Forms no está activo o no responde.');
      } else {
        setConfigError(err?.message || 'No se pudo cargar la configuración.');
      }
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const loadRequests = useCallback(async () => {
    if (loadingRequests || !gfActive || !hasConfiguredForms) {
      return;
    }
    setLoadingRequests(true);
    setRequestError('');
    try {
      const activeFilters = filtersRef.current;
      const res = await API.listRequests({
        status: activeFilters.status || undefined,
        lang: activeFilters.lang || undefined,
        q: activeFilters.q?.trim() || undefined,
        page: activeFilters.page,
        per_page: PER_PAGE,
      });
      const list = Array.isArray(res?.items) ? res.items : [];
      setRequests(list);
      setPagination({
        total_pages: res.total_pages || 1,
        page: res.page || activeFilters.page,
        total: res.total || list.length,
      });
    } catch (err) {
      setRequestError(err?.message || 'No se pudieron cargar las solicitudes.');
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
    }, [gfActive, hasConfiguredForms]);

  useEffect(() => {
    if (!loadingConfig && gfActive && hasConfiguredForms) {
      loadRequests();
    }
  }, [loadingConfig, gfActive, hasConfiguredForms, loadRequests]);

  const updateFilter = (key, value) => {
    setFilters((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };
      if (key !== 'page') {
        next.page = 1;
      }
      filtersRef.current = next;
      return next;
    });
  };

  const statusOptions = useMemo(
    () => [
      { value: '', label: 'Todos los estados' },
      ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    ],
    []
  );

  const languageOptions = [
    { value: '', label: 'Todos los idiomas' },
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ];

  const handleConvert = async (requestId) => {
    setConvertingId(requestId);
    setNotice(null);
    try {
      const res = await API.convertRequest(requestId);
      setNotice({
        status: 'success',
        message: 'Propuesta creada. Abriendo el wizard...',
      });
      if (res?.redirect_url) {
        window.open(res.redirect_url, '_blank', 'noopener,noreferrer');
      }
      loadRequests();
    } catch (err) {
      setNotice({
        status: 'error',
        message: err?.message || 'No se pudo convertir la solicitud.',
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handlePageChange = (direction) => {
    const target = direction === 'next' ? pagination.page + 1 : pagination.page - 1;
    if (target < 1 || target > (pagination.total_pages || 1)) {
      return;
    }
    updateFilter('page', target);
    loadRequests();
  };

  return (
    <div className="wp-travel-giav-app">
      <div className="requests-list-admin">
        <header className="requests-list-admin__header">
          <div>
            <h1>Solicitudes recibidas</h1>
            <p>Sincroniza Gravity Forms, filtra y convierte solicitudes en propuestas.</p>
          </div>
          <Button variant="primary" onClick={() => (window.location.href = configUrl)}>
            Configurar formularios
          </Button>
        </header>

        {loadingConfig && (
          <div className="requests-list-admin__loading">
            <Spinner />
          </div>
        )}

        {!loadingConfig && !gfActive && (
          <Notice status="error">
            Gravity Forms no está activo. Instala o actívalo para continuar.
            <div style={{ marginTop: 8 }}>
              <Button variant="primary" onClick={() => (window.location.href = configUrl)}>
                Configurar formularios
              </Button>
            </div>
          </Notice>
        )}

        {!loadingConfig && gfActive && !hasConfiguredForms && (
          <Notice status="warning">
            No hay formularios configurados. Asigna los IDs ES/EN para sincronizar las solicitudes.
            <div style={{ marginTop: 8 }}>
              <Button variant="primary" onClick={() => (window.location.href = configUrl)}>
                Configurar formularios
              </Button>
            </div>
          </Notice>
        )}

        {configError && gfActive && (
          <Notice status="error">{configError}</Notice>
        )}

        {notice && (
          <Notice status={notice.status} isDismissible onRemove={() => setNotice(null)}>
            {notice.message}
          </Notice>
        )}

        {requestError && (
          <Notice status="error">{requestError}</Notice>
        )}

        {gfActive && hasConfiguredForms && (
          <>
            <div className="requests-list-admin__filters">
              <TextControl
                label="Buscar"
                value={filters.q}
                onChange={(value) => updateFilter('q', value)}
                placeholder="Cliente, email o ID"
              />
              <SelectControl
                label="Estado"
                value={filters.status}
                options={statusOptions}
                onChange={(value) => updateFilter('status', value)}
              />
              <SelectControl
                label="Idioma"
                value={filters.lang}
                options={languageOptions}
                onChange={(value) => updateFilter('lang', value)}
              />
              <Button variant="primary" onClick={loadRequests} disabled={loadingRequests}>
                Actualizar listado
              </Button>
            </div>

            <div className="requests-list-admin__table">
              <div className="requests-list-admin__row requests-list-admin__row--header">
                <span>Fecha</span>
                <span>Cliente</span>
                <span>Email</span>
                <span>Fechas</span>
                <span>PAX</span>
                <span>Idioma / Estado</span>
                <span>Acciones</span>
              </div>

              {loadingRequests && (
                <div className="requests-list-admin__row requests-list-admin__row--loading">
                  <Spinner />
                  <span>Cargando solicitudes…</span>
                </div>
              )}

              {!loadingRequests && requests.length === 0 && (
                <div className="requests-list-admin__empty">
                  No hay solicitudes registradas para los filtros actuales.
                </div>
              )}

              {!loadingRequests &&
                requests.map((request) => {
                  const mapped = request.mapped || {};
                  const status = request.status || 'new';
                  const pax =
                    mapped.pax_total ||
                    ((mapped.jugadores || 0) + (mapped.no_jugadores || 0));
                  return (
                    <div key={request.id} className="requests-list-admin__row">
                      <span>{formatDate(request.created_at)}</span>
                      <span>
                        <strong>{getCustomerName(mapped)}</strong>
                        <br />
                        <small>ID GF #{request.entry_id}</small>
                      </span>
                      <span>{mapped.email || '—'}</span>
                      <span>
                        {mapped.fecha_llegada || '—'} – {mapped.fecha_regreso || '—'}
                      </span>
                      <span>{pax}</span>
                      <span>
                        <span className={`requests-list-admin__status requests-list-admin__status--${status}`}>
                          {STATUS_LABELS[status] || status}
                        </span>
                        <br />
                        <small>{request.lang?.toUpperCase() || 'ES'}</small>
                      </span>
                      <span className="requests-list-admin__actions">
                        <Button
                          variant="secondary"
                          onClick={() => handleConvert(request.id)}
                          disabled={convertingId === request.id}
                          isBusy={convertingId === request.id}
                        >
                          {request.proposal_id ? 'Actualizar propuesta' : 'Crear propuesta'}
                        </Button>
                        {request.proposal_id && (
                          <Button
                            variant="tertiary"
                            onClick={() => window.open(buildProposalUrl(request.proposal_id), '_blank', 'noopener')}
                          >
                            Abrir propuesta
                          </Button>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>

            <div className="requests-list-admin__pagination">
              <Button variant="secondary" onClick={() => handlePageChange('prev')} disabled={pagination.page <= 1}>
                Anterior
              </Button>
              <span>
                Página {pagination.page} de {pagination.total_pages || 1}
              </span>
              <Button
                variant="secondary"
                onClick={() => handlePageChange('next')}
                disabled={pagination.page >= (pagination.total_pages || 1)}
              >
                Siguiente
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RequestsListAdmin;

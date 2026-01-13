import { useEffect, useState } from '@wordpress/element';
import { useNavigate, useParams } from 'react-router-dom';
import API, { acceptProposal, markProposalSent } from '../api';
import { buildCustomerFullName } from '../../utils/customer';

const ACCEPTED_BY_LABELS = {
  admin: 'Admin',
  client: 'Cliente',
};

const GIAV_STATUS_LABELS = {
  none: 'No iniciado',
  pending: 'En proceso',
  ok: 'Creado',
  error: 'Error',
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const buildAdminUrl = (query = {}) => {
  const url = new URL(window.location.href);
  url.searchParams.set('page', 'travel_proposals');
  url.searchParams.delete('proposal_id');
  url.searchParams.delete('action');
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, value);
  });
  return url.toString();
};

export default function ProposalDetail() {
  const { proposalId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [giavProcessing, setGiavProcessing] = useState(false);
  const [giavDisabledReason, setGiavDisabledReason] = useState('');
  const [sharing, setSharing] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await API.getProposalDetail(proposalId);
      setDetail(response);
    } catch (err) {
      setLoadError(err?.message || 'No se pudo cargar la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!proposalId) {
      setDetail(null);
      setLoadError('Propuesta no encontrada.');
      return;
    }
    loadDetail();
  }, [proposalId]);

  useEffect(() => {
    const current = detail?.proposal?.current_version_id;
    setSelectedVersionId(current ? String(current) : '');
  }, [detail?.proposal?.current_version_id]);

  useEffect(() => {
    let cancelled = false;
    const acceptedVersionId = detail?.proposal?.accepted_version_id;
    if (!acceptedVersionId) {
      setGiavDisabledReason('');
      return undefined;
    }

    API.giavPreflight(acceptedVersionId)
      .then(() => {
        if (!cancelled) {
          setGiavDisabledReason('');
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const status = err?.data?.status || err?.status;
        const message = err?.message || err?.data?.message || '';
        if (status === 503 || message.includes('DB')) {
          setGiavDisabledReason('La base de datos no está actualizada. Ejecuta migraciones.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detail?.proposal?.accepted_version_id]);

  const proposal = detail?.proposal;
  const versions = detail?.versions || [];
  const displayName = proposal
    ? buildCustomerFullName(
        proposal.first_name,
        proposal.last_name,
        proposal.customer_name
      ) || 'Sin nombre'
    : 'Sin nombre';

  useEffect(() => {
    if (!proposal) {
      return;
    }
    const publicUrl = proposal.public_url || detail?.current_snapshot?.public_url;
    if (publicUrl) {
      setCopied(false);
    }
  }, [proposal?.public_url]);

  const handleCopyLink = async () => {
    const publicUrl = proposal?.public_url || detail?.current_snapshot?.public_url;
    if (!publicUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const acceptedVersion = versions.find(
    (version) => Number(version.id) === Number(proposal?.accepted_version_id)
  );
  const selectedVersion = versions.find((version) => String(version.id) === selectedVersionId);
  const versionOptions = [{ value: '', label: 'Selecciona una versión' }].concat(
    versions.map((version) => ({
      value: String(version.id),
      label: `#${version.version_number ?? version.id} · ${formatDate(version.created_at)}`,
    }))
  );

  const confirmationStatus =
    proposal?.confirmation_status === 'confirmed'
      ? 'Confirmada'
      : proposal?.confirmation_status === 'pending'
        ? 'Pendiente'
        : '-';

  const isAccepted = proposal?.status === 'accepted';
  const giavStatus = proposal?.giav_sync_status || 'none';
  const giavStatusLabel = GIAV_STATUS_LABELS[giavStatus] || giavStatus || '-';
  const hasGiavExpediente = Boolean(proposal?.giav_expediente_id);
  const giavIsPending = giavStatus === 'pending';
  const hasGiavError = giavStatus === 'error';

  const giavIds = [
    { label: 'ID cliente', value: proposal?.giav_client_id },
    { label: 'ID expediente', value: proposal?.giav_expediente_id },
    { label: 'ID reserva PQ', value: proposal?.giav_pq_reserva_id },
  ].filter((item) => item.value);

  const handleAcceptVersion = async () => {
    if (!proposal?.id) {
      setActionError('No se encontró la propuesta.');
      return;
    }
    if (!selectedVersion?.id) {
      setActionError('Selecciona una versión para aceptar.');
      return;
    }

    const label = selectedVersion.version_number
      ? `#${selectedVersion.version_number}`
      : `#${selectedVersion.id}`;

    const confirmed = window.confirm(
      `¿Confirmas que la versión ${label} se marcará como aceptada? Esta acción no se puede deshacer fácilmente.`
    );
    if (!confirmed) {
      return;
    }

    setAccepting(true);
    setActionError('');
    setSuccessMessage('');
    try {
      await acceptProposal(proposal.id, selectedVersion.id);
      setSuccessMessage(`Versión ${label} marcada como aceptada.`);
      await loadDetail();
    } catch (err) {
      setActionError(err?.message || 'No se pudo marcar como aceptada.');
    } finally {
      setAccepting(false);
    }
  };

  const handleGiavAction = async () => {
    if (!proposal) {
      return;
    }

    setGiavProcessing(true);
    setActionError('');
    setSuccessMessage('');
    try {
      await API.retryGiavSync(proposal.id);
      setSuccessMessage(
        proposal.giav_sync_status === 'error'
          ? 'Solicitud de reintento en GIAV enviada correctamente.'
          : 'Expediente solicitado en GIAV.'
      );
      await loadDetail();
    } catch (err) {
      setActionError(err?.message || 'No se pudo crear el expediente en GIAV.');
    } finally {
      setGiavProcessing(false);
    }
  };

  const handleShare = async () => {
    if (!proposal?.id) {
      setActionError('No se encontró la propuesta.');
      return;
    }

    const confirmed = window.confirm(
      '¿Marcar como enviada y habilitar el enlace público? (No envía emails automáticamente)'
    );
    if (!confirmed) {
      return;
    }

    setSharing(true);
    setActionError('');
    setSuccessMessage('');
    try {
      await markProposalSent(proposal.id);
      setSuccessMessage('Propuesta marcada como enviada.');
      await loadDetail();
    } catch (err) {
      setActionError(err?.message || 'No se pudo marcar como enviada.');
    } finally {
      setSharing(false);
    }
  };

  if (loading && !proposal) {
    return <div className="casanova-portal-section">Cargando detalle…</div>;
  }

  if (loadError && !proposal) {
    return (
      <div className="casanova-portal-section">
        <div className="casanova-portal-section__notice">{loadError}</div>
      </div>
    );
  }

  if (!proposal) {
    return null;
  }

  return (
    <div className="casanova-portal-section">
      <header className="casanova-portal-detail__header">
        <div>
          <p className="casanova-portal__eyebrow">Propuesta #{proposal.id}</p>
          <h2>{proposal.proposal_title || 'Nueva propuesta'}</h2>
          <p>
            {displayName} · {proposal.customer_email}
          </p>
        </div>
        <div className="casanova-portal-detail__actions">
          {proposal.status !== 'accepted' ? (
            <button
              type="button"
              className="button-secondary"
              onClick={handleShare}
              disabled={sharing}
            >
              {sharing ? 'Compartiendo...' : 'Compartir propuesta'}
            </button>
          ) : null}
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              const openUrl = proposal.public_url || detail?.current_snapshot?.public_url;
              if (openUrl) {
                window.open(openUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            disabled={!proposal.public_url && !detail?.current_snapshot?.public_url}
          >
            Abrir vista pública
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleCopyLink}
            disabled={!proposal.public_url && !detail?.current_snapshot?.public_url}
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button type="button" className="button-primary" onClick={() => navigate('/proposals')}>
            Volver al listado
          </button>
        </div>
      </header>

      {actionError && (
        <div className="casanova-portal-section__notice casanova-portal-section__notice--error">
          {actionError}
        </div>
      )}
      {successMessage && (
        <div className="casanova-portal-section__notice casanova-portal-section__notice--success">
          {successMessage}
        </div>
      )}

      <div className="casanova-portal-detail__grid">
        <div className="casanova-portal-card">
          <h3>Resumen</h3>
          <p>
            Fechas: {proposal.start_date || '—'} — {proposal.end_date || '—'}
          </p>
          <p>Estado: {proposal.status || '—'}</p>
          <p>PAX: {proposal.pax_total || 0}</p>
          <p>Jugadores: {proposal.players_count || 0}</p>
          <p>
            Total estimado:{' '}
            {detail?.current_version?.totals_sell_price
              ? `${detail.current_version.totals_sell_price} ${proposal.currency || ''}`
              : '—'}
          </p>
        </div>

        <div className="casanova-portal-card">
          <h3>Aceptación</h3>
          <p className="proposal-detail__helper">
            Estado: {proposal.confirmation_status ? proposal.confirmation_status : 'Pendiente'}
          </p>
          {isAccepted ? (
            <div className="proposal-detail__grid">
              <div>
                <div className="proposal-detail__label">Versión aceptada</div>
                <div className="proposal-detail__value">
                  {acceptedVersion
                    ? `#${acceptedVersion.version_number ?? acceptedVersion.id}`
                    : proposal.accepted_version_id || '—'}
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Aceptada por</div>
                <div className="proposal-detail__value">
                  {ACCEPTED_BY_LABELS[proposal.accepted_by] || proposal.accepted_by || '—'}
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Fecha de aceptación</div>
                <div className="proposal-detail__value">{formatDate(proposal.accepted_at)}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Confirmación</div>
                <div className="proposal-detail__value">{confirmationStatus}</div>
              </div>
            </div>
          ) : (
            <div className="proposal-detail__block">
              <label htmlFor="proposal-accept-version" className="proposal-detail__label">
                Versión a aceptar
              </label>
              <select
                id="proposal-accept-version"
                className="proposal-detail__select"
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value)}
                disabled={accepting || versionOptions.length === 0}
              >
                {versionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="proposal-detail__button-row">
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleAcceptVersion}
                  disabled={accepting || !selectedVersion}
                >
                  {accepting ? 'Procesando…' : 'Marcar como aceptada'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="casanova-portal-card">
          <h3>Integración GIAV</h3>
          <div className="proposal-detail__section-title">
            <span
              className={`proposal-detail__pill proposal-detail__pill--${
                giavStatus === 'ok'
                  ? 'success'
                  : giavStatus === 'error'
                  ? 'danger'
                  : giavStatus === 'pending'
                    ? 'warning'
                    : 'neutral'
              }`}
            >
              {giavStatusLabel}
            </span>
          </div>
          <div className="proposal-detail__block">
            {giavIds.length > 0 ? (
              <div className="proposal-detail__grid">
                {giavIds.map((item) => (
                  <div key={item.label}>
                    <div className="proposal-detail__label">{item.label}</div>
                    <div className="proposal-detail__value">{item.value}</div>
                  </div>
                ))}
                {proposal.giav_sync_updated_at && (
                  <div>
                    <div className="proposal-detail__label">Última actualización</div>
                    <div className="proposal-detail__value">
                      {formatDate(proposal.giav_sync_updated_at)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="proposal-detail__helper">Aún no hay identificadores de GIAV vinculados.</p>
            )}
            {proposal.giav_sync_error && (
              <div className="proposal-detail__error">
                <strong>Error:</strong> {proposal.giav_sync_error}
              </div>
            )}
            <div className="proposal-detail__cta">
              {!isAccepted ? (
                <span className="proposal-detail__helper">
                  Necesitas aceptar una versión antes de crear expediente en GIAV.
                </span>
              ) : hasGiavError && !hasGiavExpediente ? (
                <button
                  type="button"
                  className="button-primary"
                  disabled={giavProcessing || Boolean(giavDisabledReason)}
                  onClick={handleGiavAction}
                  title={
                    giavDisabledReason ||
                    'Se reintentará la creación del expediente en GIAV y se actualizará el estado.'
                  }
                >
                  {giavProcessing ? 'Creando…' : 'Reintentar GIAV'}
                </button>
              ) : !hasGiavExpediente && !giavIsPending ? (
                <button
                  type="button"
                  className="button-primary"
                  disabled={giavProcessing || Boolean(giavDisabledReason)}
                  onClick={handleGiavAction}
                  title={
                    giavDisabledReason ||
                    'Crear expediente en GIAV. Esta acción puede tardar varios segundos.'
                  }
                >
                  {giavProcessing ? 'Creando…' : 'Crear expediente en GIAV'}
                </button>
              ) : giavIsPending ? (
                <span className="proposal-detail__helper">En proceso de creación en GIAV.</span>
              ) : (
                <span className="proposal-detail__helper">Expediente creado y sincronizado.</span>
              )}
              {giavDisabledReason && (
                <p className="proposal-detail__helper">{giavDisabledReason}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="casanova-portal-detail__actions-row">
        <button
          type="button"
          className="button-primary"
          onClick={() => navigate(`/proposals/${proposalId}/edit`)}
        >
          Editar propuesta
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            window.open(buildAdminUrl({ proposal_id: proposalId, action: 'edit' }), '_blank');
          }}
        >
          Abrir wizard en wp-admin
        </button>
      </div>

      <div className="casanova-portal-card">
        <h3>Versiones</h3>
        <div className="casanova-portal-table">
          <div className="casanova-portal-table__row casanova-portal-table__row--header">
            <span>Versión</span>
            <span>Fecha</span>
            <span>Total</span>
            <span>Publicación</span>
          </div>
          {versions.length ? (
            versions.map((version) => (
              <div key={version.id} className="casanova-portal-table__row">
                <span>{version.version_number ?? version.id}</span>
                <span>{formatDate(version.created_at)}</span>
                <span>{version.totals_sell_price ?? '—'}</span>
                <span>
                  {version.public_url ? (
                    <a href={version.public_url} target="_blank" rel="noreferrer">
                      Vista pública
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            ))
          ) : (
            <div className="casanova-portal-table__row casanova-portal-table__row--empty">
              No hay versiones registradas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  Spinner,
  TextControl,
  SelectControl,
} from '@wordpress/components';
import API from '../api';
import { buildCustomerFullName } from '../utils/customer';

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

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

const ACCEPTED_BY_LABELS = {
  client: 'Cliente',
  admin: 'Admin',
};

const CONFIRMATION_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
};

const GIAV_STATUS_LABELS = {
  none: 'No iniciado',
  pending: 'En proceso',
  ok: 'Creado',
  error: 'Error',
};

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fallback below
  }

  const temp = document.createElement('textarea');
  temp.value = text;
  temp.style.position = 'fixed';
  temp.style.top = '-1000px';
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  const result = document.execCommand('copy');
  document.body.removeChild(temp);
  return result;
}

function buildAdminUrl(params = {}) {
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
}

export default function ProposalDetail({ proposalId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [updatingVersionId, setUpdatingVersionId] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [retryingGiav, setRetryingGiav] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.getProposalDetail(proposalId);
      setData(res);
    } catch (e) {
      setError(e?.message || 'No se pudo cargar la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!proposalId) {
      setData(null);
      setError('Propuesta no encontrada.');
      return;
    }
    load();
  }, [proposalId]);

  useEffect(() => {
    if (data?.proposal) {
      const current = data.proposal.current_version_id;
      setSelectedVersionId(current ? String(current) : '');
    }
  }, [data?.proposal?.current_version_id]);

  if (loading && !data) {
    return <Spinner />;
  }

  if (!data?.proposal && error) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Notice status="error" isDismissible onRemove={() => setError('')}>
          {error}
        </Notice>
        <Button variant="secondary" onClick={() => (window.location.href = buildAdminUrl())}>
          Volver al listado
        </Button>
      </div>
    );
  }

  if (!data?.proposal) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Notice status="warning" isDismissible={false}>
          Propuesta no encontrada.
        </Notice>
        <Button variant="secondary" onClick={() => (window.location.href = buildAdminUrl())}>
          Volver al listado
        </Button>
      </div>
    );
  }

  const { proposal, versions = [] } = data;
  const confirmationLabel =
    CONFIRMATION_STATUS_LABELS[proposal.confirmation_status] ||
    (proposal.status === 'accepted' ? 'Pendiente' : '-');
  const acceptedVersion = versions.find(
    (version) => Number(version.id) === Number(proposal.accepted_version_id)
  );
  const selectedVersion = versions.find(
    (version) => String(version.id) === String(selectedVersionId)
  );
  const versionOptions = versions.map((version) => ({
    label: `#${version.version_number ?? version.id} · ${formatDate(version.created_at)}`,
    value: String(version.id),
  }));
  const statusLabel = STATUS_LABELS[proposal.status] || proposal.status || '-';
  const giavStatus = proposal.giav_sync_status || 'none';
  const giavStatusLabel = GIAV_STATUS_LABELS[giavStatus] || giavStatus || '-';
  const isAccepted = proposal.status === 'accepted';
  const hasGiavExpediente = Boolean(proposal.giav_expediente_id);
  const hasGiavError = giavStatus === 'error';
  const giavIsPending = giavStatus === 'pending';
  const giavIds = [
    { label: 'ID cliente', value: proposal.giav_client_id },
    { label: 'ID expediente', value: proposal.giav_expediente_id },
    { label: 'ID reserva PQ', value: proposal.giav_pq_reserva_id },
  ].filter((item) => item.value);

  const displayName = buildCustomerFullName(
    proposal.first_name,
    proposal.last_name,
    proposal.customer_name
  ) || '-';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && (
        <Notice status="error" isDismissible onRemove={() => setError('')}>
          {error}
        </Notice>
      )}

      <Card>
        <CardHeader>
          <div className="proposal-detail__header">
            <div>
              <div className="proposal-detail__eyebrow">Detalle de propuesta · #{proposal.id}</div>
              <div className="proposal-detail__title-row">
                <h2 className="proposal-detail__title">{proposal.proposal_title || 'Propuesta sin título'}</h2>
                <span
                  className={`proposal-status proposal-status--${proposal.status || 'draft'} proposal-status--large`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
            <div className="proposal-detail__actions">
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = buildAdminUrl({ proposal_id: proposal.id, action: 'edit' });
                }}
              >
                Editar propuesta
              </Button>
              {proposal.public_url ? (
                <Button
                  variant="primary"
                  onClick={() => window.open(proposal.public_url, '_blank', 'noopener')}
                >
                  Abrir vista pública
                </Button>
              ) : null}
              <Button
                variant="tertiary"
                onClick={() => {
                  window.location.href = buildAdminUrl();
                }}
              >
                Volver al listado
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="proposal-detail__summary">
            <div className="proposal-detail__summary-item">
              <div className="proposal-detail__label">Cliente</div>
              <div className="proposal-detail__value">{displayName}</div>
            </div>
            <div className="proposal-detail__summary-item">
              <div className="proposal-detail__label">Email</div>
              <div className="proposal-detail__value">{proposal.customer_email || '-'}</div>
            </div>
            <div className="proposal-detail__summary-item">
              <div className="proposal-detail__label">Fechas</div>
              <div className="proposal-detail__value">
                {proposal.start_date} - {proposal.end_date}
              </div>
            </div>
            <div className="proposal-detail__summary-item">
              <div className="proposal-detail__label">Última actualización</div>
              <div className="proposal-detail__value">{formatDate(proposal.updated_at)}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <strong>Enlace para cliente</strong>
        </CardHeader>
        <CardBody>
          <div className="proposal-detail__block">
            <TextControl label="URL pública" value={proposal.public_url || ''} readOnly />
            <p className="proposal-detail__helper">Este es el enlace que verá el cliente.</p>
            <div className="proposal-detail__button-row">
              <Button
                variant="primary"
                onClick={async () => {
                  const ok = await copyToClipboard(proposal.public_url);
                  if (ok) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }
                }}
              >
                {copied ? 'Enlace copiado' : 'Copiar'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.open(proposal.public_url, '_blank', 'noopener')}
              >
                Abrir
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="proposal-detail__section-title">
            <strong>Estado de aceptación</strong>
            <span
              className={`proposal-detail__pill ${
                isAccepted ? 'proposal-detail__pill--success' : 'proposal-detail__pill--warning'
              }`}
            >
              {isAccepted ? 'Aceptada' : 'Pendiente de aceptación'}
            </span>
          </div>
        </CardHeader>
        <CardBody>
          {isAccepted ? (
            <div className="proposal-detail__grid">
              <div>
                <div className="proposal-detail__label">Fecha de aceptación</div>
                <div className="proposal-detail__value">{formatDate(proposal.accepted_at)}</div>
              </div>
              <div>
                <div className="proposal-detail__label">Aceptada por</div>
                <div className="proposal-detail__value">
                  {ACCEPTED_BY_LABELS[proposal.accepted_by] || '-'}
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Versión aceptada</div>
                <div className="proposal-detail__value">
                  {acceptedVersion
                    ? `#${acceptedVersion.version_number ?? acceptedVersion.id}`
                    : proposal.accepted_version_id || '-'}
                </div>
              </div>
              <div>
                <div className="proposal-detail__label">Confirmación</div>
                <div className="proposal-detail__value">{confirmationLabel}</div>
              </div>
            </div>
          ) : (
            <div className="proposal-detail__block">
              <SelectControl
                label="Versión a aceptar"
                value={selectedVersionId}
                options={versionOptions}
                onChange={(value) => setSelectedVersionId(value)}
                disabled={accepting || versionOptions.length === 0}
              />
              <div className="proposal-detail__button-row">
                <Button
                  variant="primary"
                  disabled={accepting || !selectedVersion}
                  onClick={async () => {
                    setAccepting(true);
                    setError('');
                    try {
                      await API.acceptProposal(proposal.id, selectedVersion.id);
                      await load();
                    } catch (e) {
                      setError(e?.message || 'No se pudo marcar como aceptada.');
                    } finally {
                      setAccepting(false);
                    }
                  }}
                >
                  Marcar como aceptada
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {(proposal.traveler_full_name || proposal.traveler_dni) && (
        <Card>
          <CardHeader>
            <strong>Datos del viajero</strong>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gap: 8 }}>
              <div><strong>Nombre completo:</strong> {proposal.traveler_full_name || '-'}</div>
              <div><strong>DNI:</strong> {proposal.traveler_dni || '-'}</div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="proposal-detail__section-title">
            <strong>Integración GIAV</strong>
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
        </CardHeader>
        <CardBody>
          <div className="proposal-detail__block">
            {giavIds.length > 0 ? (
              <div className="proposal-detail__grid">
                {giavIds.map((item) => (
                  <div key={item.label}>
                    <div className="proposal-detail__label">{item.label}</div>
                    <div className="proposal-detail__value">{item.value}</div>
                  </div>
                ))}
                {proposal.giav_sync_updated_at ? (
                  <div>
                    <div className="proposal-detail__label">Última actualización</div>
                    <div className="proposal-detail__value">
                      {formatDate(proposal.giav_sync_updated_at)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="proposal-detail__helper">Aún no hay identificadores de GIAV vinculados.</p>
            )}
            {proposal.giav_sync_error ? (
              <div className="proposal-detail__error">
                <strong>Error:</strong> {proposal.giav_sync_error}
              </div>
            ) : null}
            <div className="proposal-detail__cta">
              {!isAccepted ? (
                <span className="proposal-detail__helper">Disponible tras aceptación.</span>
              ) : hasGiavError && !hasGiavExpediente ? (
                <Button
                  variant="primary"
                  disabled={retryingGiav}
                  onClick={async () => {
                    setRetryingGiav(true);
                    setError('');
                    try {
                      await API.retryGiavSync(proposal.id);
                      await load();
                    } catch (e) {
                      setError(e?.message || 'No se pudo reintentar GIAV.');
                    } finally {
                      setRetryingGiav(false);
                    }
                  }}
                >
                  Reintentar GIAV
                </Button>
              ) : !hasGiavExpediente && !giavIsPending ? (
                <Button
                  variant="primary"
                  disabled={retryingGiav}
                  onClick={async () => {
                    setRetryingGiav(true);
                    setError('');
                    try {
                      await API.retryGiavSync(proposal.id);
                      await load();
                    } catch (e) {
                      setError(e?.message || 'No se pudo crear en GIAV.');
                    } finally {
                      setRetryingGiav(false);
                    }
                  }}
                >
                  Crear expediente en GIAV
                </Button>
              ) : giavIsPending ? (
                <span className="proposal-detail__helper">En proceso de creación en GIAV.</span>
              ) : (
                <span className="proposal-detail__helper">Expediente creado y sincronizado.</span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {proposal.status === 'accepted' && (
        <Card>
          <CardHeader>
            <strong>Siguiente paso</strong>
          </CardHeader>
          <CardBody>
            <p style={{ margin: 0 }}>
              Confirmar disponibilidad y servicios. Cuando esté confirmada, se invitará al portal (futuro).
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <strong>Versiones</strong>
        </CardHeader>
        <CardBody>
          <details className="proposal-detail__versions" open>
            <summary>Histórico de versiones ({versions.length})</summary>
            <div className="proposal-detail__table">
              <table className="wp-list-table widefat fixed striped">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Versión</th>
                    <th>Fecha</th>
                    <th>Total comercial</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No hay versiones.</td>
                    </tr>
                  ) : (
                    versions.map((version) => {
                      const isCurrent = Number(proposal.current_version_id) === Number(version.id);
                      const isAcceptedVersion =
                        Number(proposal.accepted_version_id) === Number(version.id);
                      return (
                        <tr
                          key={version.id}
                          className={
                            isAcceptedVersion ? 'proposal-detail__row--accepted' : undefined
                          }
                        >
                          <td>{version.id}</td>
                          <td>{version.version_number ?? '-'}</td>
                          <td>{formatDate(version.created_at)}</td>
                          <td>{version.totals_sell_price ?? '-'}</td>
                          <td>
                            <div className="proposal-detail__version-badges">
                              {isCurrent && (
                                <span className="proposal-detail__pill proposal-detail__pill--info">
                                  Vigente
                                </span>
                              )}
                              {isAcceptedVersion && (
                                <span className="proposal-detail__pill proposal-detail__pill--success">
                                  Aceptada
                                </span>
                              )}
                              {!isCurrent && !isAcceptedVersion ? '—' : null}
                            </div>
                          </td>
                          <td>
                            <div className="proposal-detail__action-stack">
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  window.open(version.public_url || proposal.public_url, '_blank', 'noopener')
                                }
                              >
                                Ver
                              </Button>
                              {!isCurrent && (
                                <Button
                                  variant="tertiary"
                                  disabled={updatingVersionId === version.id}
                                  onClick={async () => {
                                    setUpdatingVersionId(version.id);
                                    try {
                                      await API.setCurrentVersion(proposal.id, version.id);
                                      await load();
                                    } catch (e) {
                                      setError(e?.message || 'No se pudo actualizar la versión vigente.');
                                    } finally {
                                      setUpdatingVersionId(null);
                                    }
                                  }}
                                >
                                  Marcar vigente
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}

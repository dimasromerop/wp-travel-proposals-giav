import { useEffect, useMemo, useState } from '@wordpress/element';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../api';
import ActionIconButton from '../components/ActionIconButton';

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
  { value: '', label: 'Selecciona un estado' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
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

const EDITABLE_PROPOSAL_STATUSES = ['draft', 'sent'];

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

const getCustomerFullName = (mapped = {}) => {
  const first = mapped.first_name || mapped.nombre || '';
  const last = mapped.last_name || mapped.apellido || '';
  const full = [first, last].filter(Boolean).join(' ');
  if (full) return full;
  if (mapped.customer_name) return mapped.customer_name;
  return 'Sin nombre';
};

export default function RequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [converting, setConverting] = useState(false);

  const loadRequest = async () => {
    if (!requestId) {
      setError('Solicitud inválida.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await API.getRequest(requestId);
      setRequest(res.request);
      setStatus(res.request?.status || '');
      setNotes(res.request?.notes || '');
    } catch (err) {
      setError(err.message || 'No se pudo cargar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequest();
  }, [requestId]);

  const handleStatusUpdate = async () => {
    if (!status) {
      setActionMessage({ type: 'error', text: 'Selecciona un estado.' });
      return;
    }

    setUpdating(true);
    setActionMessage(null);
    try {
      await API.updateRequestStatus(requestId, {
        status,
        notes,
      });
      setActionMessage({ type: 'success', text: 'Estado actualizado.' });
      await loadRequest();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'No se pudo actualizar.' });
    } finally {
      setUpdating(false);
    }
  };

  const handleConvert = async () => {
    setConverting(true);
    setActionMessage(null);
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
      setActionMessage({ type: 'success', text: 'Propuesta creada correctamente.' });
      await loadRequest();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'No se pudo convertir.' });
    } finally {
      setConverting(false);
    }
  };

  const intentions = useMemo(() => {
    const data = request?.intentions;
    if (!data) {
      return null;
    }
    const parts = [];
    if (data.golf?.requested) {
      parts.push(`Green-fees por jugador: ${data.golf.green_fees_per_player || '—'}.`);
    }
    if (data.flights?.requested) {
      parts.push(`Requiere vuelos desde ${data.flights.departure_airport || '—'}.`);
    }
    if (parts.length === 0 && data.package) {
      parts.push(`Paquete: ${data.package}.`);
    }
    return parts;
  }, [request?.intentions]);

  if (loading) {
    return <div className="casanova-portal-section">Cargando solicitud…</div>;
  }

  if (error) {
    return (
      <div className="casanova-portal-section">
        <div className="casanova-portal-section__notice casanova-portal-section__notice--error">
          {error}
        </div>
      </div>
    );
  }

  if (!request) {
    return null;
  }

  return (
    <div className="casanova-portal-section">
      <header className="casanova-portal-detail__header">
        <div>
          <p className="casanova-portal__eyebrow">Solicitud #{request.entry_id}</p>
          <h2>{getCustomerFullName(request.mapped)}</h2>
          <p>
            {request.mapped?.email || '—'} · {request.mapped?.telefono || '—'}
          </p>
        </div>
        <div className="casanova-portal-detail__actions">
          <button type="button" className="button-secondary" onClick={() => navigate('/requests')}>
            Volver al listado
          </button>
          {request.proposal?.public_url ? (
            <a
              className="button-secondary"
              href={request.proposal.public_url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir propuesta
            </a>
          ) : null}
        </div>
      </header>

      {actionMessage && (
        <div
          className={`casanova-portal-section__notice ${
            actionMessage.type === 'success' ? 'casanova-portal-section__notice--success' : ''
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {intentions && intentions.length > 0 && (
        <div className="casanova-portal-section__notice casanova-portal-section__notice--success">
          Solicitud indica: {intentions.join(' ')}
        </div>
      )}

      <div className="casanova-portal-requests-detail">
        <div className="casanova-portal-card">
          <h3>Resumen</h3>
          <p>
            Fechas: {request.mapped?.fecha_llegada || '—'} – {request.mapped?.fecha_regreso || '—'}
          </p>
          <p>Paquete: {request.mapped?.package || '—'}</p>
          <p>Jugadores: {request.mapped?.jugadores || 0}</p>
          <p>No jugadores: {request.mapped?.no_jugadores || 0}</p>
          <p>Green-fees por jugador: {request.mapped?.green_fees_per_player || '—'}</p>
          <p>Solicita vuelos: {request.intentions?.flights?.requested ? 'Sí' : 'No'}</p>
          <p>Más info: {request.mapped?.more_info || '—'}</p>
        </div>

        <div className="casanova-portal-card">
          <h3>Estado CRM</h3>
          <label htmlFor="request-status" className="casanova-portal-filter">
            <span>Estado</span>
            <select id="request-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="casanova-portal-filter">
            <span>Notas</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows="4"
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid #cbd5f5',
                padding: 10,
                fontSize: 14,
              }}
            />
          </label>
          <div className="casanova-portal-detail__actions-row">
            <button
              type="button"
              className="button-primary"
              onClick={handleStatusUpdate}
              disabled={updating || request.status === status}
            >
              {updating ? 'Guardando…' : 'Actualizar estado'}
            </button>
            <button type="button" className="button-primary" onClick={handleConvert} disabled={converting}>
              {converting ? 'Convirtiendo…' : 'Crear propuesta'}
            </button>
          </div>
        </div>

        {request.linked_proposals?.length > 0 && (
          <div className="casanova-portal-card">
            <h3>Propuestas generadas</h3>
            <div className="casanova-portal-requests-detail__proposals">
              {request.linked_proposals.map((proposal) => {
                const statusLabel =
                  PROPOSAL_STATUS_LABELS[proposal.status] || proposal.status || 'Sin estado';
                const updatedAt = proposal.updated_at || proposal.created_at;
                const canEdit = EDITABLE_PROPOSAL_STATUSES.includes(proposal.status);
                return (
                  <div key={proposal.id} className="casanova-portal-requests-detail__proposal-row">
                    <div className="casanova-portal-requests-detail__proposal-info">
                      <strong>#{proposal.id}</strong>
                      <span>{proposal.proposal_title || proposal.client_name || 'Propuesta'}</span>
                      <small className="casanova-portal-requests-detail__proposal-meta">
                        {statusLabel} · {formatDate(updatedAt)}
                      </small>
                    </div>
                    <div className="casanova-action-icons">
                      <ActionIconButton
                        icon="document"
                        label="Ver propuesta"
                        tooltip="Ver propuesta"
                        onClick={() => navigate(`/propuesta/${proposal.id}`)}
                      />
                      <ActionIconButton
                        icon="pencil"
                        label="Editar propuesta"
                        tooltip="Editar propuesta"
                        onClick={() => navigate(`/propuesta/${proposal.id}/editar`)}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

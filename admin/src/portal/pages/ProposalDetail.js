import { useEffect, useMemo, useState } from '@wordpress/element';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../api';

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

const ProposalDetail = () => {
  const { proposalId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await API.getProposalDetail(proposalId);
      setDetail(response);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la propuesta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [proposalId]);

  const proposal = detail?.proposal;
  const versions = detail?.versions || [];
  const currentVersion = detail?.current_version;
  const publicUrl = proposal?.public_url || detail?.current_snapshot?.public_url;

  const handleCopyLink = async () => {
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

  const adminUrl = () => {
    const base = `${window.location.origin}/wp-admin/admin.php?page=travel_proposals`;
    const params = new URLSearchParams({
      proposal_id: proposalId,
      action: 'edit',
    });
    return `${base}&${params.toString()}`;
  };

  const versionRows = useMemo(() => {
    return versions.map((version) => {
      const label = version.version_number
        ? `Versión ${version.version_number}`
        : `Versión ${version.id}`;
      return (
        <div key={version.id} className="casanova-portal-table__row">
          <span>{label}</span>
          <span>{formatDate(version.created_at)}</span>
          <span>{version.totals_sell_price ? `${version.totals_sell_price} ${proposal?.currency || ''}` : '—'}</span>
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
      );
    });
  }, [versions, proposal]);

  if (loading) {
    return <div className="casanova-portal-section">Cargando detalle…</div>;
  }

  if (error) {
    return (
      <div className="casanova-portal-section">
        <div className="casanova-portal-section__notice">{error}</div>
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
            {proposal.customer_name} · {proposal.customer_email}
          </p>
        </div>
        <div className="casanova-portal-detail__actions">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              if (publicUrl) {
                window.open(publicUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            disabled={!publicUrl}
          >
            Abrir vista pública
          </button>
          <button
            type="button"
            className="button-outline"
            onClick={handleCopyLink}
            disabled={!publicUrl}
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="button-link"
          >
            Volver al listado
          </button>
        </div>
      </header>

      <div className="casanova-portal-detail__grid">
        <div className="casanova-portal-card">
          <h3>Resumen</h3>
          <p>
            Fechas: {proposal.start_date || '—'} → {proposal.end_date || '—'}
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
          <p>
            Estado:{' '}
            {proposal.confirmation_status
              ? proposal.confirmation_status
              : 'Pendiente'}
          </p>
          <p>Aceptada por: {proposal.accepted_by || '—'}</p>
          <p>Fecha aceptación: {formatDate(proposal.accepted_at)}</p>
        </div>
        <div className="casanova-portal-card">
          <h3>Integración GIAV</h3>
          <p>Estado: {proposal.giav_sync_status || '—'}</p>
          <p>Expediente: {proposal.giav_expediente_id || '—'}</p>
          <p>Reserva: {proposal.giav_pq_reserva_id || '—'}</p>
          <p>Error: {proposal.giav_sync_error || '—'}</p>
        </div>
      </div>

      <div className="casanova-portal-detail__actions-row">
        <button
          type="button"
          className="button-primary"
          onClick={() => {
            window.location.href = adminUrl();
          }}
        >
          Editar propuesta
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            window.open(adminUrl(), '_blank', 'noopener,noreferrer');
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
          {versionRows.length ? (
            versionRows
          ) : (
            <div className="casanova-portal-table__row casanova-portal-table__row--empty">
              No hay versiones registradas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProposalDetail;

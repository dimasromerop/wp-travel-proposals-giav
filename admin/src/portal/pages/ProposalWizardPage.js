import { useEffect, useMemo, useState } from '@wordpress/element';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProposalWizard from '../../components/ProposalWizard';
import API from '../../api';

const ProposalWizardPage = ({ mode = 'create' }) => {
  const navigate = useNavigate();
  const { proposalId } = useParams();
  const normalizedId = proposalId ? parseInt(proposalId, 10) : null;
  const isEditing = mode === 'edit' && Number.isFinite(normalizedId);
  const title = isEditing ? `Editar propuesta #${normalizedId}` : 'Nueva propuesta';
  const breadcrumb = isEditing ? `#${normalizedId}` : 'Nueva propuesta';

  const [editData, setEditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEditing || !normalizedId) {
      setEditData(null);
      setError('');
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await API.getProposalDetail(normalizedId);
        if (active) {
          setEditData(res);
        }
      } catch (err) {
        if (active) {
          setError(err?.message || 'No se pudo cargar la propuesta.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [isEditing, normalizedId]);

  const wizardProps = useMemo(() => {
    if (!isEditing || !editData?.proposal) {
      return null;
    }
    return {
      initialProposal: editData.proposal,
      initialSnapshot: editData.current_snapshot,
      nextVersionNumber: editData.next_version_number || 1,
      mode: 'edit',
    };
  }, [editData, isEditing]);

  return (
    <div className="casanova-portal-section casanova-portal-section--wizard">
      <header className="casanova-portal-section__header">
        <div>
          <div className="casanova-portal-breadcrumbs">
            <Link to="/proposals">Propuestas</Link>
            <span>/</span>
            <span>{breadcrumb}</span>
          </div>
          <h2>{title}</h2>
          <p>Completa los pasos para crear o actualizar la propuesta.</p>
        </div>
        <div className="casanova-portal-section__actions">
          <Link className="button-secondary" to="/proposals">
            Volver al listado
          </Link>
        </div>
      </header>

      {loading ? <div className="casanova-portal__loading">Cargando...</div> : null}
      {error ? <div className="casanova-portal-section__notice">{error}</div> : null}

      {!loading && (!isEditing || wizardProps) ? (
        <div className="casanova-portal-wizard">
          <ProposalWizard
            showStepper
            onExit={() => navigate('/proposals')}
            {...(wizardProps || {})}
          />
        </div>
      ) : null}
    </div>
  );
};

export default ProposalWizardPage;

import { useEffect, useMemo, useState } from '@wordpress/element';
import ProposalWizard from './components/ProposalWizard';
import GiavMappingAdmin from './components/GiavMappingAdmin';
import ProposalList from './components/ProposalList';
import ProposalDetail from './components/ProposalDetail';
import API from './api';

export default function App() {
  const params = new URLSearchParams(window.location.search || '');
  const page = params.get('page') || '';
  const proposalIdParam = params.get('proposal_id');
  const action = params.get('action');

  // Mapping UI lives in submenu page=wp-travel-giav-mapping
  if (page === 'wp-travel-giav-mapping') {
    return <GiavMappingAdmin />;
  }

  const [creating, setCreating] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const proposalId = proposalIdParam ? parseInt(proposalIdParam, 10) : null;
  const isEditing = action === 'edit' && proposalId;

  useEffect(() => {
    if (!isEditing) return;
    const fetchEditData = async () => {
      setEditLoading(true);
      setEditError('');
      try {
        const res = await API.getProposalDetail(proposalId);
        setEditData(res);
      } catch (e) {
        setEditError(e?.message || 'No se pudo cargar la propuesta para editar.');
      } finally {
        setEditLoading(false);
      }
    };
    fetchEditData();
  }, [isEditing, proposalId]);

  const wizardProps = useMemo(() => {
    if (!editData?.proposal) return null;
    return {
      initialProposal: editData.proposal,
      initialSnapshot: editData.current_snapshot,
      nextVersionNumber: editData.next_version_number || 1,
    };
  }, [editData]);

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

  return (
    <div className="wp-travel-giav-app">
      <ProposalList onCreate={() => setCreating(true)} />
    </div>
  );
}

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionIconButton from './ActionIconButton';

export default function RequestActionsInline({ request, proposal, isConverting, onConvert }) {
  const navigate = useNavigate();
  const proposalId = proposal?.id;
  const canEditProposal = proposal && ['draft', 'sent'].includes(proposal.status);

  const goToRequest = useCallback(() => {
    navigate(`/requests/${request.id}`);
  }, [navigate, request.id]);

  const goToProposal = useCallback(() => {
    if (!proposalId) return;
    navigate(`/propuesta/${proposalId}`);
  }, [navigate, proposalId]);

  const goToProposalEdit = useCallback(() => {
    if (!proposalId) return;
    navigate(`/propuesta/${proposalId}/editar`);
  }, [navigate, proposalId]);

  return (
    <div className="casanova-action-icons">
      <ActionIconButton
        icon="eye"
        label="Ver solicitud"
        tooltip="Ver solicitud"
        onClick={goToRequest}
      />
      {proposalId && (
        <>
          <ActionIconButton
            icon="document"
            label="Ver propuesta"
            tooltip="Ver propuesta"
            onClick={goToProposal}
          />
          <ActionIconButton
            icon="pencil"
            label="Editar propuesta"
            tooltip="Editar propuesta"
            onClick={goToProposalEdit}
            disabled={!canEditProposal}
          />
        </>
      )}
      <ActionIconButton
        icon="arrow"
        label="Convertir solicitud"
        tooltip="Convertir solicitud"
        className="casanova-action-icon--primary"
        onClick={() => onConvert(request.id)}
        disabled={isConverting === request.id}
      />
    </div>
  );
}

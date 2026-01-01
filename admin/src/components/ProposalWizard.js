import { useState } from '@wordpress/element';
import { Notice, Button, Spinner } from '@wordpress/components';
import StepBasics from './steps/StepBasics';
import StepServices from './steps/StepServices';
import StepPreview from './steps/StepPreview';
import API from '../api';

export default function ProposalWizard({ onExit }) {
  const [step, setStep] = useState(1);

  const [proposalId, setProposalId] = useState(null);
  const [basics, setBasics] = useState(null);

  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);

  const [snapshot, setSnapshot] = useState(null);
  const [versionId, setVersionId] = useState(null);

  // GIAV preflight & confirm
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmOk, setConfirmOk] = useState(false);


  const onConfirmGiav = async () => {
    if (!versionId) return;
    setConfirmLoading(true);
    setConfirmError('');
    setConfirmOk(false);

    try {
      await API.confirmGiav(versionId);
      setConfirmOk(true);
    } catch (e) {
      setConfirmError(e?.message || 'Error confirmando en GIAV.');
    } finally {
      setConfirmLoading(false);
    }
  };


  if (step === 1) {
    return (
      <StepBasics
        initialValues={basics || { customer_language: 'en', currency: 'EUR', pax_total: 1 }}
        // Si ya existe proposalId, no recreamos. Solo avanzamos guardando el state.
        onNext={({ basics: b }) => {
          setBasics(b);
          setStep(2);
        }}
        // Si no existe proposalId aún, StepBasics creará la propuesta y llamará aquí.
        onCreated={({ proposalId: id, basics: b }) => {
          setProposalId(id);
          setBasics(b);
          setStep(2);
        }}
        proposalId={proposalId}
      />
    );
  }

  if (step === 2) {
  return (
    <StepServices
      basics={basics}
      initialItems={items}
      onDraftChange={({ items: it, totals: t }) => {
        setItems(it);
        setTotals(t);
      }}
      onBack={() => setStep(1)}
      onNext={({ items: it, totals: t }) => {
        setItems(it);
        setTotals(t);
        setStep(3);
      }}
    />
  );
}

  if (step === 3) {
    return (
      <StepPreview
        proposalId={proposalId}
        basics={basics}
        items={items}
        totals={totals}
        onBack={() => setStep(2)}
        onSent={({ versionId: vId, snapshot: sentSnapshot }) => {
          setVersionId(vId);
          setSnapshot(sentSnapshot || null);
          setStep(4);
        }}
      />
    );
  }


  if (step === 4) {
    const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const warningCount = snapshotItems.reduce((acc, it) => {
      const warnings = Array.isArray(it?.warnings) ? it.warnings : [];
      return acc + warnings.length;
    }, 0);
    const blockingCount = snapshotItems.reduce((acc, it) => {
      const blocking = Array.isArray(it?.blocking) ? it.blocking : [];
      return acc + blocking.length;
    }, 0);

    const statusType = blockingCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'success';
    const statusLabel = blockingCount > 0
      ? 'No se puede confirmar'
      : warningCount > 0
      ? `Listo para confirmar (${warningCount} avisos)`
      : 'Listo para confirmar';

    const canConfirm = blockingCount === 0;

    return (
      <div>
        <Notice status="success" isDismissible={false}>
          Propuesta enviada. Version creada: <strong>{versionId}</strong>
        </Notice>

        {confirmOk && (
          <Notice status="success" isDismissible={false}>
            Confirmacion GIAV iniciada (encolada).
          </Notice>
        )}

        {confirmError && (
          <Notice status="error" isDismissible onRemove={() => setConfirmError('')}>
            {confirmError}
          </Notice>
        )}

        <div style={{ marginTop: 12 }}>
          <strong>Estado GIAV</strong>
          <div style={{ marginTop: 8 }}>
            <Notice status={statusType} isDismissible={false}>
              {statusLabel}
            </Notice>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary" onClick={onExit}>
            Salir
          </Button>

          <Button
            variant="secondary"
            onClick={onConfirmGiav}
            disabled={!canConfirm || confirmLoading}
          >
            {confirmLoading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Spinner />
                Confirmando...
              </span>
            ) : (
              'Confirmar en GIAV'
            )}
          </Button>

          {!canConfirm && (
            <span style={{ fontSize: 12, color: '#b91c1c' }}>
              Hay servicios que requieren correccion.
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
}
    

  

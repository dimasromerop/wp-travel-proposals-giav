import { useEffect, useState } from '@wordpress/element';
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

  const [versionId, setVersionId] = useState(null);

  // GIAV preflight & confirm
  const [preflight, setPreflight] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmOk, setConfirmOk] = useState(false);


  useEffect(() => {
    if (!versionId || step !== 4) return;

    let cancelled = false;
    (async () => {
      setPreflightLoading(true);
      setConfirmError('');
      try {
        const res = await API.giavPreflight(versionId);
        if (!cancelled) setPreflight(res);
      } catch (e) {
        if (!cancelled) setConfirmError(e?.message || 'No se pudo comprobar el estado GIAV.');
      } finally {
        if (!cancelled) setPreflightLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [versionId, step]);

  const onConfirmGiav = async () => {
    if (!versionId) return;
    setConfirmLoading(true);
    setConfirmError('');
    setConfirmOk(false);

    try {
      await API.confirmGiav(versionId);
      setConfirmOk(true);

      // Refresh preflight after confirming/queuing
      try {
        const res = await API.giavPreflight(versionId);
        setPreflight(res);
      } catch (e) {
        // ignore refresh errors, confirmation already triggered
      }
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
        onSent={({ versionId: vId }) => {
          setVersionId(vId);
          setStep(4);
        }}
      />
    );
  }

  if (step === 4) {
    const canConfirm = !!preflight?.ok;

    return (
      <div>
        <Notice status="success" isDismissible={false}>
          Propuesta enviada. Versión creada: <strong>{versionId}</strong>
        </Notice>

        {confirmOk && (
          <Notice status="success" isDismissible={false}>
            Confirmación GIAV iniciada (encolada).
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
            {preflightLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner />
                <span>Comprobando mapeos...</span>
              </div>
            ) : preflight ? (
              preflight.ok ? (
                <Notice status="success" isDismissible={false}>
                  Todo mapeado. Lista para confirmar en GIAV.
                </Notice>
              ) : (
                <Notice status="warning" isDismissible={false}>
                  Faltan mapeos GIAV. No se puede confirmar hasta resolverlo.
                  {Array.isArray(preflight.blocking) && preflight.blocking.length > 0 && (
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {preflight.blocking.map((b, i) => (
                        <li key={i}>
                          <strong>{(b.service_type || '').toUpperCase()}</strong> · {b.title || 'Sin título'}{' '}
                          <span style={{ opacity: 0.8 }}>
                            ({b.reason || 'sin mapeo'})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Notice>
              )
            ) : (
              <Notice status="warning" isDismissible={false}>
                No se pudo obtener el estado GIAV.
              </Notice>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
        </div>
      </div>
    );
  }
return null;
}
    

  
import { useMemo, useState } from '@wordpress/element';
import { Notice, Button, Card, CardBody, CardHeader } from '@wordpress/components';
import StepBasics from './steps/StepBasics';
import StepServices, { syncServiceDatesFromBasics } from './steps/StepServices';
import StepPreview from './steps/StepPreview';

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

const formatDate = (value) => {
  if (!value) return '-';
  const raw = String(value);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const buildAdminUrl = (params = {}) => {
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
};

const buildPublicUrl = (proposalToken, versionToken) => {
  if (!proposalToken) return '';
  const base = `${window.location.origin}/travel-proposal/${proposalToken}/`;
  if (!versionToken) return base;
  return `${window.location.origin}/travel-proposal/${proposalToken}/v/${versionToken}/`;
};

async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // fall back below
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  return ok;
}

const buildEmailLink = ({ email, name, publicUrl }) => {
  if (!email || !publicUrl) return '';
  const subject = `Tu propuesta de viaje`;
  const greeting = name ? `Hola ${name},` : 'Hola,';
  const body = `${greeting}\n\nAquí tienes el enlace a tu propuesta:\n${publicUrl}\n\nQuedamos a tu disposición para cualquier duda.`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export default function ProposalWizard({
  onExit,
  mode = 'create',
  initialProposal = null,
  initialSnapshot = null,
  nextVersionNumber = 1,
}) {
  const [step, setStep] = useState(1);

  const [proposalId, setProposalId] = useState(initialProposal?.id || null);
  const [proposalStatus, setProposalStatus] = useState(initialProposal?.status || 'draft');
  const [proposalAcceptedAt] = useState(initialProposal?.accepted_at || '');
  const [proposalToken] = useState(initialProposal?.proposal_token || '');
  const [publicUrl, setPublicUrl] = useState(initialProposal?.public_url || '');
  const [publicToken, setPublicToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const initialBasics = useMemo(() => {
    if (!initialProposal && !initialSnapshot) {
      return null;
    }
    const header = initialSnapshot?.header || {};
    return {
      proposal_title: header.proposal_title || initialProposal?.proposal_title || '',
      customer_name: header.customer_name || initialProposal?.customer_name || '',
      customer_email: header.customer_email || initialProposal?.customer_email || '',
      customer_country: header.customer_country || initialProposal?.customer_country || '',
      customer_language: header.customer_language || initialProposal?.customer_language || 'en',
      start_date: header.start_date || initialProposal?.start_date || '',
      end_date: header.end_date || initialProposal?.end_date || '',
      pax_total: header.pax_total || initialProposal?.pax_total || 1,
      currency: header.currency || initialProposal?.currency || 'EUR',
    };
  }, [initialProposal, initialSnapshot]);

  const [basics, setBasics] = useState(initialBasics);

  const [items, setItems] = useState(initialSnapshot?.items || []);
  const [totals, setTotals] = useState(initialSnapshot?.totals || null);

  const [snapshot, setSnapshot] = useState(null);
  const [versionId, setVersionId] = useState(null);

  if (step === 1) {
    return (
      <StepBasics
        initialValues={basics || { customer_language: 'en', currency: 'EUR', pax_total: 1 }}
        // Si ya existe proposalId, no recreamos. Solo avanzamos guardando el state.
        onNext={({ basics: b }) => {
          setBasics(b);
          setItems((prev) => syncServiceDatesFromBasics(prev, b));
          setStep(2);
        }}
        // Si no existe proposalId aún, StepBasics creará la propuesta y llamará aquí.
        onCreated={({ proposalId: id, basics: b }) => {
          setProposalId(id);
          setBasics(b);
          setItems((prev) => syncServiceDatesFromBasics(prev, b));
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
        mode={mode}
        versionNumber={nextVersionNumber}
        onBack={() => setStep(2)}
        onSent={({ versionId: vId, snapshot: sentSnapshot, publicUrl: sentUrl, publicToken: sentToken, status }) => {
          setVersionId(vId);
          setSnapshot(sentSnapshot || null);
          if (sentUrl) {
            setPublicUrl(sentUrl);
          }
          if (sentToken) {
            setPublicToken(sentToken);
          }
          if (status) {
            setProposalStatus(status);
          }
          setStep(4);
        }}
      />
    );
  }


  if (step === 4) {
    const resolvedPublicUrl = publicUrl || buildPublicUrl(proposalToken, publicToken);
    const statusLabel = STATUS_LABELS[proposalStatus] || proposalStatus || '-';
    const acceptanceLabel = proposalAcceptedAt
      ? `Aceptada el ${formatDate(proposalAcceptedAt)}`
      : 'Pendiente';
    const emailLink = buildEmailLink({
      email: basics?.customer_email,
      name: basics?.customer_name,
      publicUrl: resolvedPublicUrl,
    });
    const handleCopyLink = async () => {
      const ok = await copyToClipboard(resolvedPublicUrl);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    };

    return (
      <Card>
        <CardHeader>
          <strong>Preview y envío</strong>
        </CardHeader>
        <CardBody>
          <Notice status="success" isDismissible={false}>
            {mode === 'edit' ? 'Nueva versión creada:' : 'Propuesta enviada. Versión creada:'}{' '}
            <strong>{versionId}</strong>
          </Notice>

          {proposalStatus === 'accepted' && proposalAcceptedAt ? (
            <Notice status="info" isDismissible={false}>
              Aceptada el {formatDate(proposalAcceptedAt)}.
            </Notice>
          ) : null}

          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            <div>
              <strong>Estado:</strong> {statusLabel}
            </div>
            <div>
              <strong>Aceptación:</strong> {acceptanceLabel}
            </div>
            <div>
              <strong>GIAV:</strong> El expediente se creará tras la aceptación del cliente.
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {proposalStatus !== 'accepted' ? (
              <Button variant="primary" onClick={handleCopyLink} disabled={!resolvedPublicUrl}>
                {copied ? 'Enlace copiado' : 'Copiar enlace público'}
              </Button>
            ) : null}

            {emailLink ? (
              <Button variant="secondary" onClick={() => window.location.assign(emailLink)}>
                Enviar email al cliente
              </Button>
            ) : null}

            {resolvedPublicUrl ? (
              <Button variant="link" href={resolvedPublicUrl} target="_blank" rel="noopener noreferrer">
                Abrir vista pública
              </Button>
            ) : null}

            <Button variant="link" href={buildAdminUrl({ proposal_id: proposalId })}>
              Ir al repositorio / ver detalle
            </Button>

            <Button variant="tertiary" onClick={onExit}>
              Salir
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }
  return null;
}
    

  

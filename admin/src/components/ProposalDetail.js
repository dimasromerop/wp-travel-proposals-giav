import { useEffect, useState } from '@wordpress/element';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Flex,
  FlexItem,
  Notice,
  Spinner,
  TextControl,
} from '@wordpress/components';
import API from '../api';

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

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
    load();
  }, [proposalId]);

  if (loading && !data) {
    return <Spinner />;
  }

  if (!data?.proposal && error) {
    return (
      <Notice status="error" isDismissible onRemove={() => setError('')}>
        {error}
      </Notice>
    );
  }

  if (!data?.proposal) {
    return null;
  }

  const { proposal, versions = [] } = data;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && (
        <Notice status="error" isDismissible onRemove={() => setError('')}>
          {error}
        </Notice>
      )}

      <Card>
        <CardHeader>
          <Flex align="center">
            <FlexItem>
              <strong>Detalle de propuesta #{proposal.id}</strong>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                onClick={() => {
                  window.location.href = buildAdminUrl({ proposal_id: proposal.id, action: 'edit' });
                }}
              >
                Editar propuesta
              </Button>
            </FlexItem>
            <FlexItem>
              <Button
                variant="tertiary"
                onClick={() => {
                  window.location.href = buildAdminUrl();
                }}
              >
                Volver al listado
              </Button>
            </FlexItem>
          </Flex>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gap: 8 }}>
            <div><strong>Cliente:</strong> {proposal.customer_name}</div>
            <div><strong>Email:</strong> {proposal.customer_email || '-'}</div>
            <div><strong>Fechas:</strong> {proposal.start_date} - {proposal.end_date}</div>
            <div><strong>Status:</strong> {proposal.status}</div>
            <div><strong>Última actualización:</strong> {formatDate(proposal.updated_at)}</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <strong>Enlace para cliente</strong>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gap: 8 }}>
            <TextControl label="URL pública" value={proposal.public_url || ''} readOnly />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
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
                variant="primary"
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
          <strong>Versiones</strong>
        </CardHeader>
        <CardBody>
          <div style={{ overflowX: 'auto' }}>
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
                    return (
                      <tr key={version.id}>
                        <td>{version.id}</td>
                        <td>{version.version_number ?? '-'}</td>
                        <td>{formatDate(version.created_at)}</td>
                        <td>{version.totals_sell_price ?? '-'}</td>
                        <td>{isCurrent ? 'Vigente' : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Button
                              variant="secondary"
                              onClick={() => window.open(version.public_url || proposal.public_url, '_blank', 'noopener')}
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
        </CardBody>
      </Card>
    </div>
  );
}

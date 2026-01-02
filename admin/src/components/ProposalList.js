import { useEffect, useMemo, useState } from '@wordpress/element';
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

export default function ProposalList({ onCreate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [data, setData] = useState({ items: [], total: 0, total_pages: 1 });
  const [copiedId, setCopiedId] = useState(null);

  const totalPages = data.total_pages || 1;

  const load = async (nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await API.listProposals({ search, page: nextPage, per_page: perPage });
      setData(res);
    } catch (e) {
      setError(e?.message || 'No se pudo cargar el listado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const onSearch = async () => {
    setPage(1);
    await load(1);
  };

  const rows = useMemo(() => data.items || [], [data.items]);

  return (
    <Card>
      <CardHeader>
        <Flex align="center">
          <FlexItem>
            <strong>Repositorio de propuestas</strong>
          </FlexItem>
          <FlexItem>
            <Button variant="primary" onClick={onCreate}>
              Nueva propuesta
            </Button>
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {error && (
          <Notice status="error" isDismissible onRemove={() => setError('')}>
            {error}
          </Notice>
        )}

        <Flex align="center" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <TextControl
            label="Buscar"
            value={search}
            onChange={setSearch}
            placeholder="Cliente, email o token"
          />
          <Button variant="secondary" onClick={onSearch} disabled={loading}>
            Buscar
          </Button>
        </Flex>

        {loading ? (
          <Spinner />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wp-list-table widefat fixed striped">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Fechas</th>
                  <th>Versión vigente</th>
                  <th>Última actualización</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No hay propuestas.</td>
                  </tr>
                ) : (
                  rows.map((proposal) => {
                    const currentVersionLabel = proposal.current_version_id
                      ? `#${proposal.current_version_id}${proposal.current_version_created_at ? ` · ${formatDate(proposal.current_version_created_at)}` : ''}`
                      : '—';
                    return (
                      <tr key={proposal.id}>
                        <td>{proposal.id}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{proposal.customer_name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{proposal.customer_email}</div>
                        </td>
                        <td>
                          {proposal.start_date} - {proposal.end_date}
                        </td>
                        <td>{currentVersionLabel}</td>
                        <td>{formatDate(proposal.updated_at)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <a href={buildAdminUrl({ proposal_id: proposal.id })}>Ver detalle</a>
                            <a href={buildAdminUrl({ proposal_id: proposal.id, action: 'edit' })}>Editar</a>
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                const ok = await copyToClipboard(proposal.public_url);
                                if (ok) {
                                  setCopiedId(proposal.id);
                                  window.setTimeout(() => setCopiedId(null), 1500);
                                }
                              }}
                            >
                              {copiedId === proposal.id ? 'Enlace copiado' : 'Copiar enlace'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <Flex align="center" justify="space-between" style={{ marginTop: 16 }}>
          <FlexItem>
            Mostrando {rows.length} de {data.total || 0}
          </FlexItem>
          <FlexItem>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Anterior
              </Button>
              <span style={{ alignSelf: 'center' }}>
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  );
}

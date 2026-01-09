const config = window.CASANOVA_GESTION_RESERVAS || {};
const baseRestUrl =
  (config.restUrl || `${window.location.origin}/wp-json/travel/v1`).replace(
    /\/$/,
    ''
  );

const buildUrl = (endpoint) => {
  const trimmed = endpoint.replace(/^\/+/, '');
  return new URL(trimmed, `${baseRestUrl}/`).toString();
};

const handleResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const hasJson = contentType.indexOf('application/json') !== -1;
  const payload = hasJson ? await response.json() : null;
  if (response.ok) {
    return payload;
  }

  const error = new Error(
    payload?.message || 'No se pudo completar la solicitud'
  );
  error.status = response.status;
  throw error;
};

export const fetchJSON = async (endpoint, options = {}) => {
  const headers = {
    'X-WP-Nonce': config.nonce || '',
    ...options.headers,
  };
  const init = {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(endpoint), init);
  return handleResponse(response);
};

const listEndpoint = (params = {}) => {
  const searchParams = new URLSearchParams();
  const setParam = (key, value) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  };

  setParam('order_by', params.orderBy || 'updated_at');
  setParam('order', params.order || 'desc');
  setParam('limit', params.limit ?? 50);
  setParam('offset', params.offset ?? 0);
  setParam('search', params.search);

  return `proposals?${searchParams.toString()}`;
};

const API = {
  listProposals: async (options = {}) => {
    const result = await fetchJSON(listEndpoint(options));
    const items = Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result)
      ? result
      : [];
    return items;
  },

  getProposalDetail: (proposalId) => {
    return fetchJSON(`proposals/${proposalId}/detail`);
  },
};

export default API;

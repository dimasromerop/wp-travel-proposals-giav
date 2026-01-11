import apiFetch from '@wordpress/api-fetch';

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

const configureApiFetch = (() => {
  let configured = false;
  return () => {
    if (configured) {
      return;
    }
    const resolveRoot = () => {
      if (config.restUrl) {
        return config.restUrl.replace(/\/travel\/v1\/?$/, '/');
      }
      if (config.apiUrl) {
        return config.apiUrl.replace(/\/travel\/v1\/?$/, '/');
      }
      return `${window.location.origin}/wp-json/`;
    };

    const root = resolveRoot();
    if (root) {
      apiFetch.use(apiFetch.createRootURLMiddleware(root));
    }
    if (config.nonce) {
      apiFetch.use(apiFetch.createNonceMiddleware(config.nonce));
    }
    configured = true;
  };
})();

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

export const acceptProposal = async (proposalId, versionId) => {
  if (!proposalId) {
    return Promise.reject(new Error('ID de propuesta inválido'));
  }
  if (!versionId) {
    return Promise.reject(new Error('Selecciona una versión a aceptar'));
  }

  configureApiFetch();

  return apiFetch({
    path: `/travel/v1/proposals/${proposalId}/accept`,
    method: 'POST',
    data: { version_id: versionId },
  });
};

export const giavPreflight = async (versionId) => {
  if (!versionId) {
    return Promise.reject(new Error('Versión inválida'));
  }

  configureApiFetch();

  return apiFetch({
    path: `/travel/v1/versions/${versionId}/giav-preflight`,
    method: 'GET',
  });
};

export const retryGiavSync = async (proposalId) => {
  if (!proposalId) {
    return Promise.reject(new Error('ID de propuesta inválido'));
  }

  configureApiFetch();

  return apiFetch({
    path: `/travel/v1/proposals/${proposalId}/giav-retry`,
    method: 'POST',
  });
};

const listEndpoint = (params = {}) => {
  const searchParams = new URLSearchParams();
  const setParam = (key, value) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  };

  setParam('q', params.search);
  setParam('status', params.status);
  setParam('sort', params.sortBy || 'updated_at');
  setParam('order', params.order || 'desc');
  setParam('page', params.page ?? 1);
  setParam('per_page', params.perPage ?? 50);

  return `proposals?${searchParams.toString()}`;
};

const API = {
  listProposals: async (options = {}) => {
    const result = await fetchJSON(listEndpoint(options));
    const items = Array.isArray(result?.items) ? result.items : [];
    return {
      items,
      total: typeof result?.total === 'number' ? result.total : items.length,
      page: result?.page ?? 1,
      per_page: result?.per_page ?? 50,
    };
  },

  getProposalDetail: (proposalId) => {
    return fetchJSON(`proposals/${proposalId}/detail`);
  },

  giavPreflight,
  retryGiavSync,
};

export default API;

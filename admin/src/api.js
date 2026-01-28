import apiFetch from '@wordpress/api-fetch';

const globalConfig = window.WP_TRAVEL_GIAV || window.CASANOVA_GESTION_RESERVAS || {};
const resolveRoot = (config) => {
  if (config.wpRestRoot) {
    return config.wpRestRoot;
  }
  const base = config.apiUrl || config.restUrl;
  if (!base) {
    return '/wp-json/';
  }
  return base.replace(/\/travel\/v1\/?$/, '/');
};

if (!apiFetch.__WP_TRAVEL_GIAV_CONFIGURED) {
  const nonce = globalConfig.nonce || '';
  const root = resolveRoot(globalConfig);
  if (root) {
    apiFetch.use(apiFetch.createRootURLMiddleware(root));
  }
  if (nonce) {
    apiFetch.use(apiFetch.createNonceMiddleware(nonce));
  }
  apiFetch.__WP_TRAVEL_GIAV_CONFIGURED = true;
}

const API = {
  createProposal: (data) =>
    apiFetch({
      path: `/travel/v1/proposals`,
      method: 'POST',
      data,
    }),

  listProposals: ({
    orderBy = 'updated_at',
    order = 'desc',
    limit = 50,
    offset = 0,
    search,
    author,
    page,
    per_page,
  } = {}) => {
    const params = new URLSearchParams();
    params.set('order_by', orderBy);
    params.set('order', order);
    params.set('limit', limit);
    params.set('offset', offset);
    if (search !== undefined) {
      params.set('search', search);
    }
    if (author !== undefined) {
      params.set('author', author);
    }
    if (page !== undefined) {
      params.set('page', page);
    }
    if (per_page !== undefined) {
      params.set('per_page', per_page);
    }
    return apiFetch({
      path: `/travel/v1/proposals?${params.toString()}`,
      method: 'GET',
    });
  },

  getProposal: (proposalId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}`,
      method: 'GET',
    }),

  getProposalDetail: (proposalId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/detail`,
      method: 'GET',
    }),

  updateProposal: (proposalId, data) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}`,
      method: 'PUT',
      data,
    }),

  deleteProposal: (proposalId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}`,
      method: 'DELETE',
    }),

  bulkDeleteProposals: (ids) =>
    apiFetch({
      path: `/travel/v1/proposals/bulk-delete`,
      method: 'POST',
      data: { ids },
    }),

  sendProposal: (proposalId, snapshot, version_number) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/send`,
      method: 'POST',
      data: { snapshot, version_number },
    }),

  createProposalVersion: (proposalId, snapshot, version_number) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/versions`,
      method: 'POST',
      data: { snapshot, version_number },
    }),

  setCurrentVersion: (proposalId, versionId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/current-version`,
      method: 'POST',
      data: { version_id: versionId },
    }),

  acceptProposal: (proposalId, versionId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/accept`,
      method: 'POST',
      data: { version_id: versionId },
    }),

  retryGiavSync: (proposalId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/giav-retry`,
      method: 'POST',
    }),

  searchCatalog: ({ type, q }) =>
    apiFetch({
      path: `/travel/v1/catalog/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q || '')}`,
      method: 'GET',
    }),

  getGiavMapping: ({ wp_object_type, wp_object_id }) =>
    apiFetch({
      path: `/travel/v1/giav-mapping?wp_object_type=${encodeURIComponent(
        wp_object_type
      )}&wp_object_id=${encodeURIComponent(wp_object_id)}`,
      method: 'GET',
    }),

  listGiavMappings: ({ type, q, limit = 50, offset = 0 }) =>
    apiFetch({
      path: `/travel/v1/giav-mapping/list?type=${encodeURIComponent(type)}&q=${encodeURIComponent(
        q || ''
      )}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
      method: 'GET',
    }),

  upsertGiavMapping: (data) =>
    apiFetch({
      path: `/travel/v1/giav-mapping/upsert`,
      method: 'POST',
      data,
    }),

  batchUpsertGiavMappings: ({ wp_object_type, giav_supplier_id, items, status = 'active', match_type = 'batch' }) =>
    apiFetch({
      path: `/travel/v1/giav-mapping/batch-upsert`,
      method: 'POST',
      data: { wp_object_type, giav_supplier_id, items, status, match_type },
    }),

  listRequests: ({ status, lang, form, q, page = 1, per_page = 20 } = {}) => {
    const params = new URLSearchParams();
    if (status) {
      params.set('status', status);
    }
    if (lang) {
      params.set('lang', lang);
    }
    if (form) {
      params.set('form', form);
    }
    if (q) {
      params.set('q', q);
    }
    params.set('page', page);
    params.set('per_page', per_page);

    return apiFetch({
      path: `/travel/v1/requests?${params.toString()}`,
      method: 'GET',
    });
  },

  convertRequest: (requestId) =>
    apiFetch({
      path: `/travel/v1/requests/${requestId}/convert`,
      method: 'POST',
    }),

  searchGiavProviders: async ({ q, pageSize = 20, pageIndex = 0, includeDisabled = false }) => {
    const res = await apiFetch({
      path: `/travel/v1/giav/providers/search?q=${encodeURIComponent(q)}&pageSize=${encodeURIComponent(
        pageSize
      )}&pageIndex=${encodeURIComponent(pageIndex)}&includeDisabled=${encodeURIComponent(includeDisabled)}`,
      method: 'GET',
    });

    const list = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
    const items = list
      .map((x) => ({
        id: String(x.id ?? x.ID ?? x.Id ?? x.proveedorId ?? ''),
        label: String(x.label ?? x.NombreAlias ?? x.Nombre ?? x.title ?? ''),
        raw: x,
      }))
      .filter((x) => x.id && x.label);

    return { items };
  },

  searchGiavAgents: async ({
    q,
    email,
    pageSize = 20,
    pageIndex = 0,
    includeLinked = true,
    includeBlocked = false,
  }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (email) params.set('email', email);
    params.set('pageSize', pageSize);
    params.set('pageIndex', pageIndex);
    params.set('includeLinked', includeLinked ? '1' : '0');
    params.set('includeBlocked', includeBlocked ? '1' : '0');

    const res = await apiFetch({
      path: `/travel/v1/giav/agents/search?${params.toString()}`,
      method: 'GET',
    });

    const list = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : [];
    const items = list
      .map((x) => ({
        id: String(x.id ?? x.ID ?? x.Id ?? ''),
        label: String(x.label ?? x.title ?? x.Nombre ?? x.AliasAgente ?? ''),
        email: String(x.email ?? x.Correo ?? ''),
        raw: x,
      }))
      .filter((x) => x.id && x.label);

    return { items };
  },

  getGiavAgent: async (id) => {
    if (!id) {
      return null;
    }
    const res = await apiFetch({
      path: `/travel/v1/giav/agents/${encodeURIComponent(id)}`,
      method: 'GET',
    });
    if (!res) {
      return null;
    }
    const label = String(res.label ?? res.title ?? res.Nombre ?? res.AliasAgente ?? '');
    return {
      id: String(res.id ?? res.ID ?? res.Id ?? id),
      label,
      email: String(res.email ?? res.Correo ?? ''),
      raw: res,
    };
  },

  giavPreflight: (versionId) =>
    apiFetch({
      path: `/travel/v1/versions/${versionId}/giav-preflight`,
      method: 'GET',
    }),

  confirmGiav: (versionId) =>
    apiFetch({
      path: `/travel/v1/versions/${versionId}/confirm`,
      method: 'POST',
    }),

  getRequestMappingConfig: () =>
    apiFetch({
      path: `/travel/v1/requests/mapping`,
      method: 'GET',
    }),

  saveRequestFormsMapping: (data) =>
    apiFetch({
      path: `/travel/v1/requests/mapping`,
      method: 'POST',
      data,
    }),

  getRequestFormMapping: (formId) =>
    apiFetch({
      path: `/travel/v1/requests/mapping/${formId}`,
      method: 'GET',
    }),

  saveRequestFormMapping: (formId, mapping) =>
    apiFetch({
      path: `/travel/v1/requests/mapping/${formId}`,
      method: 'POST',
      data: mapping,
    }),
};

export default API;

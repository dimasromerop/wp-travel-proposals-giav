import apiFetch from '@wordpress/api-fetch';

apiFetch.use(apiFetch.createNonceMiddleware(WP_TRAVEL_GIAV.nonce));

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
};

export default API;

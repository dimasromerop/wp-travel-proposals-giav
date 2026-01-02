import apiFetch from '@wordpress/api-fetch';

apiFetch.use(apiFetch.createNonceMiddleware(WP_TRAVEL_GIAV.nonce));

const API = {
  createProposal: (data) =>
    apiFetch({
      path: `/travel/v1/proposals`,
      method: 'POST',
      data,
    }),

  listProposals: ({ search = '', page = 1, per_page = 20 }) =>
    apiFetch({
      path: `/travel/v1/proposals?search=${encodeURIComponent(search)}&page=${encodeURIComponent(
        page
      )}&per_page=${encodeURIComponent(per_page)}`,
      method: 'GET',
    }),

  getProposalDetail: (proposalId) =>
    apiFetch({
      path: `/travel/v1/proposals/${proposalId}/detail`,
      method: 'GET',
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
    )}&pageIndex=${encodeURIComponent(pageIndex)}&includeDisabled=${encodeURIComponent(
      includeDisabled
    )}`,
    method: 'GET',
  });

  // Normaliza siempre a { items: [{id,label}] }
  const list = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : []);
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

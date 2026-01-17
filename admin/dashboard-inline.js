(function () {
  if (typeof WP_TRAVEL_GIAV === 'undefined' || !WP_TRAVEL_GIAV.apiUrl) return;

  const root = document.getElementById('wp-travel-giav-dashboard');
  if (!root) return;

  const apiFetch = (window.wp && window.wp.apiFetch) ? window.wp.apiFetch : null;
  if (apiFetch) {
    apiFetch.use(apiFetch.createNonceMiddleware(WP_TRAVEL_GIAV.nonce));
  }

  const formatMoney = (n) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n || 0);
    } catch (e) {
      return (n || 0).toFixed(2) + ' EUR';
    }
  };

  const esc = (s) => (s || '').toString().replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[c]));

  function renderLoading() {
    root.innerHTML = '<div class="giav-card"><p class="muted">Cargando datos desde GIAV… (sí, también me parece lento)</p></div>';
  }

  function renderError(msg) {
    root.innerHTML = '<div class="giav-card"><p style="color:#b91c1c;font-weight:600">Error</p><p class="muted">' + esc(msg) + '</p></div>';
  }

  function buildChart(monthly) {
    const pts = [];
    for (let m = 1; m <= 12; m++) {
      const v = (monthly[m] && monthly[m].margen_neto) ? Number(monthly[m].margen_neto) : 0;
      pts.push(v);
    }
    const max = Math.max(1, ...pts);
    const w = 900;
    const h = 220;
    const pad = 18;
    const dx = (w - pad * 2) / 11;

    const toXY = (i, v) => {
      const x = pad + dx * i;
      const y = h - pad - (v / max) * (h - pad * 2);
      return [x, y];
    };

    let d = '';
    pts.forEach((v, i) => {
      const [x, y] = toXY(i, v);
      d += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    });

    return (
      '<svg class="giav-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + d.trim() + '" fill="none" stroke="currentColor" stroke-width="2" />' +
      '</svg>'
    );
  }

  function render(data, year) {
    const s = data.summary || {};
    const monthly = data.monthly || {};
    const rows = Array.isArray(data.expedientes) ? data.expedientes : [];

    const header =
      '<div class="giav-actions">' +
        '<label class="muted" for="giav-year">Año</label>' +
        '<select id="giav-year">' +
          [year-1, year, year+1].map(y => '<option value="' + y + '"' + (y===year?' selected':'') + '>' + y + '</option>').join('') +
        '</select>' +
        '<button class="button" id="giav-refresh">Refrescar</button>' +
        '<span class="muted">(caché 10 min)</span>' +
      '</div>';

    const cards =
      '<div class="giav-dash-grid">' +
        '<div class="giav-card giav-span-3"><h3>Expedientes</h3><p class="value">' + (s.expedientes_count || 0) + '</p><p class="muted">' + (s.expedientes_open || 0) + ' abiertos · ' + (s.expedientes_closed || 0) + ' cerrados</p></div>' +
        '<div class="giav-card giav-span-3"><h3>Margen neto</h3><p class="value">' + formatMoney(s.margen_neto_total || 0) + '</p><p class="muted">Acumulado ' + year + '</p></div>' +
        '<div class="giav-card giav-span-3"><h3>Pendiente cobrar</h3><p class="value">' + formatMoney(s.pending_cobrar_total || 0) + '</p><p class="muted">Según GIAV</p></div>' +
        '<div class="giav-card giav-span-3"><h3>Pendiente pagar</h3><p class="value">' + formatMoney(s.pending_pagar_total || 0) + '</p><p class="muted">Según GIAV</p></div>' +
        '<div class="giav-card giav-span-12"><h3>Margen neto por mes</h3>' + buildChart(monthly) + '</div>' +
        '<div class="giav-card giav-span-12"><h3>Expedientes ' + year + '</h3>' +
          '<div style="overflow:auto">' +
            '<table>' +
              '<thead><tr><th>Código</th><th>Título</th><th>Fechas viaje</th><th>Estado</th><th>Margen neto</th><th>Pendiente cobrar</th></tr></thead>' +
              '<tbody>' +
                (rows.length ? rows.map(r => {
                  const pill = r.cerrado ? '<span class="pill ok">Cerrado</span>' : '<span class="pill warn">Abierto</span>';
                  const fechas = (r.fecha_desde || '—') + ' → ' + (r.fecha_hasta || '—');
                  return '<tr>' +
                    '<td><strong>' + esc(r.codigo || '') + '</strong><div class="muted">#' + (r.id || '') + '</div></td>' +
                    '<td>' + esc(r.titulo || '') + '<div class="muted">Creación: ' + esc(r.fecha_creacion || '—') + '</div></td>' +
                    '<td>' + esc(fechas) + '</td>' +
                    '<td>' + pill + '</td>' +
                    '<td>' + formatMoney(r.margen_neto || 0) + '</td>' +
                    '<td>' + formatMoney(r.pendiente_cobrar || 0) + '</td>' +
                  '</tr>';
                }).join('') : '<tr><td colspan="6" class="muted">No hay expedientes en este año.</td></tr>') +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>';

    root.innerHTML = header + cards;

    const sel = document.getElementById('giav-year');
    const refresh = document.getElementById('giav-refresh');
    if (sel) sel.addEventListener('change', () => load(Number(sel.value), false));
    if (refresh) refresh.addEventListener('click', () => load(year, true));
  }

  async function load(year, force) {
    renderLoading();
    try {
      const path = WP_TRAVEL_GIAV.apiUrl.replace(/\/$/, '') + '/dashboard?year=' + encodeURIComponent(year) + (force ? '&force=1' : '');
      const data = apiFetch ? await apiFetch({ path }) : await (await fetch(path, { credentials: 'same-origin', headers: { 'X-WP-Nonce': WP_TRAVEL_GIAV.nonce } })).json();
      if (data && data.code) {
        renderError(data.message || data.code);
        return;
      }
      render(data, year);
    } catch (e) {
      renderError(e && e.message ? e.message : String(e));
    }
  }

  const year = Number(root.getAttribute('data-year')) || new Date().getFullYear();
  load(year, false);
})();

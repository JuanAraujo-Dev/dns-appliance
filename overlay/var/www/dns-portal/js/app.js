/* DNS Portal v2 — secure client (no token in URL, safe DOM) */
(() => {
  const state = {
    token: sessionStorage.getItem('dnsToken') || '',
    user: null,
    period: 'LastHour',
    refreshInterval: 30,
    timer: null,
    blockedDomains: [],
    allowedDomains: [],
    runtime: {},
    health: {},
    logPage: 1,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');

  function showLoading(v) { $('loading').classList.toggle('hidden', !v); }

  async function api(path, params = {}, method = 'GET') {
    const url = new URL(`/api/${path}`, location.origin);
    const opts = { method, headers: {} };
    if (state.token) opts.headers.Authorization = `Bearer ${state.token}`;
    if (method === 'GET') {
      Object.entries({ ...params, token: state.token }).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
      });
      // Prefer Authorization; still send token query for Technitium compatibility but never put in links/exports user-visible
    } else {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const body = new URLSearchParams({ ...params, token: state.token });
      opts.body = body;
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.errorMessage || data.message || 'Erro API');
    return data.response ?? data;
  }

  const API = {
    async login(user, pass) {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user, pass }),
      });
      const data = await res.json();
      if (data.status === 'error') throw new Error(data.errorMessage || 'Login falhou');
      const token = data.token || data.response?.token;
      if (!token) throw new Error('Token ausente');
      state.token = token;
      state.user = data.response || data;
      sessionStorage.setItem('dnsToken', token);
    },
    logout() { state.token = ''; sessionStorage.removeItem('dnsToken'); },
    stats: (period) => api('dashboard/stats/get', { type: period || state.period }),
    settings: () => api('settings/get'),
    queryLogs: (page, filters) => api('logs/query', {
      classPath: 'QueryLogsSqliteApp',
      pageNumber: page,
      entriesPerPage: 50,
      ...filters,
    }),
    blockedExport: () => api('blocked/export').then(async () => {
      // Technitium may return text via separate endpoint
      const url = new URL('/api/blocked/export', location.origin);
      url.searchParams.set('token', state.token);
      const res = await fetch(url);
      return res.text();
    }),
    blockedAdd: (domain) => api('blocked/add', { domain }, 'POST'),
    blockedDelete: (domain) => api('blocked/delete', { domain }, 'POST'),
    blockedImport: async (domains) => {
      const res = await fetch('/api/blocked/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: state.token, blockedZones: domains.join(',') }),
      });
      const data = await res.json();
      if (data.status === 'error') throw new Error(data.errorMessage || 'Import falhou');
      return data;
    },
    allowedExport: async () => {
      const url = new URL('/api/allowed/export', location.origin);
      url.searchParams.set('token', state.token);
      return (await fetch(url)).text();
    },
    allowedAdd: (domain) => api('allowed/add', { domain }, 'POST'),
    allowedDelete: (domain) => api('allowed/delete', { domain }, 'POST'),
    pauseBlocking: (minutes) => api('settings/temporaryDisableBlocking', { minutes }, 'POST'),
  };

  function showView(view) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    const el = $(`view-${view}`);
    if (el) el.classList.remove('hidden');
    document.querySelectorAll('.nav-item[data-view]').forEach((n) => {
      n.classList.toggle('active', n.dataset.view === view);
    });
    const titles = {
      dashboard: 'Dashboard', logs: 'Logs', clients: 'Top Clientes', domains: 'Top Domínios',
      blocked: 'Políticas', network: 'Redes / ACL', cluster: 'Cluster', encrypted: 'DoH / DoT',
    };
    $('page-title').textContent = titles[view] || view;
  }

  async function loadRuntime() {
    try {
      state.runtime = await (await fetch('runtime.json', { cache: 'no-store' })).json();
    } catch { state.runtime = {}; }
    try {
      state.health = await (await fetch('health.json', { cache: 'no-store' })).json();
    } catch { state.health = {}; }
    if (state.runtime.company) $('brand-name').textContent = state.runtime.company;
    if (state.runtime.fqdn) $('runtime-fqdn').textContent = state.runtime.fqdn;
    const pill = $('health-pill');
    if (state.health.dnsOk) {
      pill.textContent = state.health.master ? 'MASTER · DNS OK' : 'DNS OK';
      pill.className = 'health-pill ok';
    } else {
      pill.textContent = 'DNS degradado';
      pill.className = 'health-pill bad';
    }
  }

  function renderStats(s = {}) {
    const grid = $('stats-grid');
    const cards = [
      ['Consultas', s.totalQueries, 'accent'],
      ['Cache', s.cachedResponses],
      ['Bloqueadas', s.blockedQueries, 'danger'],
      ['Clientes', s.clients],
      ['Servidores', s.servers || '—'],
    ];
    grid.innerHTML = '';
    cards.forEach(([label, value, cls]) => {
      const d = document.createElement('div');
      d.className = `stat-card ${cls || ''}`;
      d.innerHTML = `<div class="label">${esc(label)}</div><div class="value">${esc(fmt(value))}</div>`;
      grid.appendChild(d);
    });
  }

  function renderCharts(data) {
    const main = $('mainChart');
    const resp = $('responseChart');
    if (!main || !window.ChartsLite) return;
    const series = data.mainChartData || data.chartData || [];
    const labels = series.map((x) => x.label || x.time || '');
    const values = series.map((x) => Number(x.totalQueries || x.hits || x.value || 0));
    ChartsLite.line(main, labels, values, getComputedStyle(document.documentElement).getPropertyValue('--orange').trim() || '#ff5a00');
    const parts = [
      { label: 'NoError', value: Number(data.stats?.noError || 0) },
      { label: 'NxDomain', value: Number(data.stats?.nxDomain || 0) },
      { label: 'Blocked', value: Number(data.stats?.blockedQueries || 0) },
      { label: 'ServFail', value: Number(data.stats?.serverFailure || 0) },
    ].filter((p) => p.value > 0);
    ChartsLite.doughnut(resp, parts.length ? parts : [{ label: 'n/a', value: 1 }], ['#22c55e', '#9ca3af', '#ef4444', '#f59e0b']);
  }

  function renderTopList(el, rows, nameKey = 'name', hitsKey = 'hits') {
    if (!el) return;
    el.innerHTML = '';
    (rows || []).slice(0, 20).forEach((r, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${i + 1}. ${r[nameKey] || r.domain || r.client || r.ip || '—'}`;
      const hits = document.createElement('span');
      hits.textContent = fmt(r[hitsKey] || r.totalQueries || r.count || 0);
      li.append(name, hits);
      el.appendChild(li);
    });
  }

  async function loadDashboard() {
    try {
      showLoading(true);
      await loadRuntime();
      const data = await API.stats(state.period);
      renderStats(data.stats || data);
      renderCharts(data);
      renderTopList($('top-clients-list'), data.topClients || []);
      renderTopList($('top-domains-list'), data.topDomains || [], 'name', 'hits');
      renderTopList($('top-blocked-list'), data.topBlockedDomains || [], 'name', 'hits');
    } catch (e) {
      console.error(e);
    } finally {
      showLoading(false);
    }
  }

  async function loadLogs(page = 1) {
    state.logPage = page;
    const filters = {
      clientIpAddress: $('filter-client')?.value || '',
      qname: $('filter-domain')?.value || '',
    };
    const start = $('filter-start')?.value;
    const end = $('filter-end')?.value;
    if (start) filters.start = new Date(start).toISOString();
    if (end) filters.end = new Date(end).toISOString();
    try {
      showLoading(true);
      const data = await API.queryLogs(page, filters);
      const rows = data.entries || data.logs || [];
      const tb = $('logs-tbody');
      tb.innerHTML = '';
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        [r.timestamp || r.time, r.clientIpAddress || r.client, r.qname || r.domain, r.qtype || r.type, r.responseType, r.rcode]
          .forEach((v) => {
            const td = document.createElement('td');
            td.textContent = v ?? '—';
            tr.appendChild(td);
          });
        tb.appendChild(tr);
      });
      $('logs-total').textContent = `${fmt(data.totalEntries || rows.length)} registros`;
    } catch (e) {
      console.error(e);
    } finally {
      showLoading(false);
    }
  }

  function showBlockMsg(text, err = false) {
    const el = $('block-msg');
    el.textContent = text;
    el.className = `block-msg ${err ? 'err' : 'ok'}`;
    el.classList.remove('hidden');
  }

  async function loadBlockedView() {
    try {
      showLoading(true);
      const [settings, blockedText, allowedText, stats] = await Promise.all([
        API.settings(),
        API.blockedExport().catch(() => ''),
        API.allowedExport().catch(() => ''),
        API.stats(state.period).catch(() => ({})),
      ]);
      state.blockedDomains = String(blockedText).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).sort();
      state.allowedDomains = String(allowedText).split(/\r?\n/).map((x) => x.trim()).filter(Boolean).sort();
      const st = $('block-status');
      st.innerHTML = '';
      const addCard = (label, value, sub, cls = '') => {
        const d = document.createElement('div');
        d.className = `stat-card ${cls}`;
        d.innerHTML = `<div class="label">${esc(label)}</div><div class="value" style="font-size:1rem">${esc(value)}</div><div class="sub">${esc(sub || '')}</div>`;
        st.appendChild(d);
      };
      addCard('Status', settings.enableBlocking ? 'Ativo' : 'Off', settings.blockingType || '', settings.enableBlocking ? 'danger' : '');
      addCard('Lista manual', fmt(state.blockedDomains.length), `${fmt(state.allowedDomains.length)} exceções`, 'accent');
      addCard('Pausa', '—', 'Use Admin Technitium para pausa avançada');
      renderBlockedTable();
      renderAllowedList();
      renderTopList($('top-blocked-list'), stats.topBlockedDomains || [], 'name', 'hits');
    } catch (e) {
      showBlockMsg(e.message, true);
    } finally {
      showLoading(false);
    }
  }

  function renderBlockedTable() {
    const q = ($('block-search')?.value || '').toLowerCase();
    const list = q ? state.blockedDomains.filter((d) => d.includes(q)) : state.blockedDomains;
    $('blocked-total').textContent = `${fmt(list.length)} domínio(s)`;
    const tb = $('blocked-tbody');
    tb.innerHTML = '';
    list.forEach((d, i) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = String(i + 1);
      const td2 = document.createElement('td'); td2.textContent = d;
      const td3 = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-sm';
      btn.type = 'button';
      btn.textContent = 'Remover';
      btn.addEventListener('click', () => removeBlocked(d));
      td3.appendChild(btn);
      tr.append(td1, td2, td3);
      tb.appendChild(tr);
    });
  }

  function renderAllowedList() {
    const ul = $('allowed-list');
    ul.innerHTML = '';
    state.allowedDomains.forEach((d) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = d;
      const btn = document.createElement('button');
      btn.className = 'btn btn-danger btn-sm';
      btn.type = 'button';
      btn.textContent = 'Remover';
      btn.addEventListener('click', async () => {
        await API.allowedDelete(d);
        loadBlockedView();
      });
      li.append(span, btn);
      ul.appendChild(li);
    });
  }

  async function addBlocked() {
    const domain = ($('block-domain-input').value || '').trim().toLowerCase();
    if (!domain) return showBlockMsg('Domínio inválido', true);
    try {
      await API.blockedAdd(domain);
      $('block-domain-input').value = '';
      showBlockMsg(`Bloqueado: ${domain}`);
      loadBlockedView();
    } catch (e) { showBlockMsg(e.message, true); }
  }

  async function removeBlocked(domain) {
    try {
      await API.blockedDelete(domain);
      showBlockMsg(`Removido: ${domain}`);
      loadBlockedView();
    } catch (e) { showBlockMsg(e.message, true); }
  }

  async function importBlocked() {
    const domains = ($('block-bulk-input').value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!domains.length) return showBlockMsg('Lista vazia', true);
    try {
      await API.blockedImport(domains);
      $('block-bulk-input').value = '';
      showBlockMsg(`Importados ${domains.length}`);
      loadBlockedView();
    } catch (e) { showBlockMsg(e.message, true); }
  }

  async function exportBlocked() {
    const blob = new Blob([state.blockedDomains.join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'provider-blocked-domains.txt';
    a.click();
  }

  function renderNetwork() {
    $('acl-client').textContent = state.runtime.clientCidrs || '(definido no appliance.env — CLIENT_CIDRS)';
    $('acl-mgmt').textContent = state.runtime.mgmtCidrs || '(definido no appliance.env — MGMT_CIDRS)';
    // enrich from runtime if present
    fetch('/portal/runtime.json').catch(() => null);
  }

  function renderCluster() {
    const h = state.health || {};
    const box = $('cluster-stats');
    box.innerHTML = '';
    [['Papel', h.master ? 'MASTER' : 'BACKUP/standalone'], ['VIP', h.vip || '—'], ['Nó', h.nodeIp || '—'], ['DNS', h.dnsOk ? 'OK' : 'DOWN'], ['API', h.apiOk ? 'OK' : 'DOWN']]
      .forEach(([label, value]) => {
        const d = document.createElement('div');
        d.className = 'stat-card';
        d.innerHTML = `<div class="label">${esc(label)}</div><div class="value" style="font-size:1.1rem">${esc(value)}</div>`;
        box.appendChild(d);
      });
    $('cluster-json').textContent = JSON.stringify(h, null, 2);
  }

  function renderEncrypted() {
    const r = state.runtime || {};
    $('doh-url').textContent = r.dohUrl || `https://${location.host}/dns-query`;
    $('dot-host').textContent = r.dotHost || location.hostname;
    $('enc-snippet').textContent = `# DoH\n${r.dohUrl || `https://${location.host}/dns-query`}\n\n# DoT\n${r.dotHost || location.hostname}:853\n`;
  }

  async function initApp() {
    if (!state.token) {
      $('login-screen').classList.remove('hidden');
      $('app').classList.add('hidden');
      return;
    }
    $('login-screen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('user-name').textContent = state.user?.displayName || 'Admin';
    showView('dashboard');
    await loadDashboard();
    startAutoRefresh();
  }

  function startAutoRefresh() {
    if (state.timer) clearInterval(state.timer);
    if (!state.refreshInterval) return;
    state.timer = setInterval(() => {
      const active = document.querySelector('.nav-item.active')?.dataset.view;
      if (active === 'dashboard') loadDashboard();
      else loadRuntime();
    }, state.refreshInterval * 1000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('login-error');
      err.classList.add('hidden');
      const btn = $('login-btn');
      btn.disabled = true;
      try {
        await API.login($('login-user').value, $('login-pass').value);
        await initApp();
      } catch (ex) {
        err.textContent = ex.message;
        err.classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });

    document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        showView(view);
        if (view === 'dashboard' || view === 'clients' || view === 'domains') loadDashboard();
        else if (view === 'logs') loadLogs(1);
        else if (view === 'blocked') loadBlockedView();
        else if (view === 'network') { loadRuntime().then(renderNetwork); }
        else if (view === 'cluster') { loadRuntime().then(renderCluster); }
        else if (view === 'encrypted') { loadRuntime().then(renderEncrypted); }
        $('sidebar')?.classList.remove('open');
      });
    });

    $('period-select')?.addEventListener('change', (e) => { state.period = e.target.value; loadDashboard(); });
    $('refresh-select')?.addEventListener('change', (e) => { state.refreshInterval = parseInt(e.target.value, 10); startAutoRefresh(); });
    $('logout-btn')?.addEventListener('click', () => { API.logout(); location.reload(); });
    $('menu-toggle')?.addEventListener('click', () => $('sidebar').classList.toggle('open'));
    $('filter-btn')?.addEventListener('click', () => loadLogs(1));
    $('export-btn')?.addEventListener('click', async () => {
      // CSV without exposing token in UI: fetch blob with header
      const url = new URL('/api/logs/export', location.origin);
      url.searchParams.set('token', state.token);
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'query-logs.csv';
      a.click();
    });
    $('block-add-btn')?.addEventListener('click', addBlocked);
    $('block-import-btn')?.addEventListener('click', importBlocked);
    $('block-export-btn')?.addEventListener('click', exportBlocked);
    $('block-refresh-btn')?.addEventListener('click', loadBlockedView);
    $('block-search')?.addEventListener('input', renderBlockedTable);
    $('block-bulk-toggle')?.addEventListener('click', () => $('block-bulk-panel').classList.toggle('hidden'));
    $('block-bulk-close')?.addEventListener('click', () => $('block-bulk-panel').classList.add('hidden'));
    $('allow-add-btn')?.addEventListener('click', async () => {
      const d = ($('allow-domain-input').value || '').trim().toLowerCase();
      if (!d) return;
      await API.allowedAdd(d);
      $('allow-domain-input').value = '';
      loadBlockedView();
    });
    initApp();
  });
})();

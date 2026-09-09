const API = {
  token: localStorage.getItem('dns_token') || null,
  user: JSON.parse(localStorage.getItem('dns_user') || 'null'),

  async login(user, pass) {
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}`
    });
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.errorMessage || 'Falha no login');
    this.token = data.token;
    this.user = { username: data.username, displayName: data.displayName };
    localStorage.setItem('dns_token', data.token);
    localStorage.setItem('dns_user', JSON.stringify(this.user));
    return data;
  },

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('dns_token');
    localStorage.removeItem('dns_user');
  },

  async get(path, params = {}) {
    const qs = new URLSearchParams({ token: this.token, ...params });
    const res = await fetch(`/api/${path}?${qs}`);
    const data = await res.json();
    if (data.status === 'error') {
      if (data.errorMessage?.includes('token') || data.errorMessage?.includes('Invalid')) {
        this.logout();
        location.reload();
      }
      throw new Error(data.errorMessage || 'Erro na API');
    }
    return data.response;
  },

  async stats(period = 'LastHour') {
    return this.get('dashboard/stats/get', { type: period });
  },

  async queryLogs(params = {}) {
    return this.get('logs/query', {
      name: 'Query Logs (Sqlite)',
      classPath: 'QueryLogsSqlite.App',
      pageNumber: params.page || 1,
      entriesPerPage: params.perPage || 50,
      descendingOrder: true,
      ...(params.clientIp && { clientIpAddress: params.clientIp }),
      ...(params.qname && { qname: params.qname }),
      ...(params.responseType && { responseType: params.responseType }),
      ...(params.rcode && { rcode: params.rcode }),
      ...(params.start && { start: params.start }),
      ...(params.end && { end: params.end })
    });
  },

  exportUrl(params = {}) {
    const qs = new URLSearchParams({
      token: this.token,
      name: 'Query Logs (Sqlite)',
      classPath: 'QueryLogsSqlite.App',
      ...(params.clientIp && { clientIpAddress: params.clientIp }),
      ...(params.qname && { qname: params.qname }),
      ...(params.responseType && { responseType: params.responseType }),
      ...(params.start && { start: params.start }),
      ...(params.end && { end: params.end })
    });
    return `/api/logs/export?${qs}`;
  },

  async settings() {
    return this.get('settings/get');
  },

  async listBlockedExport() {
    const qs = new URLSearchParams({ token: this.token });
    const res = await fetch(`/api/blocked/export?${qs}`);
    if (!res.ok) throw new Error('Falha ao listar bloqueios');
    const text = await res.text();
    return text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  },

  async blockDomain(domain) {
    return this.get('blocked/add', { domain });
  },

  async unblockDomain(domain) {
    return this.get('blocked/delete', { domain });
  },

  async importBlocked(domains) {
    const body = new URLSearchParams({
      token: this.token,
      blockedZones: domains.join(',')
    });
    const res = await fetch('/api/blocked/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (data.status === 'error') throw new Error(data.errorMessage || 'Falha ao importar');
    return data;
  },

  async listAllowedExport() {
    const qs = new URLSearchParams({ token: this.token });
    const res = await fetch(`/api/allowed/export?${qs}`);
    if (!res.ok) throw new Error('Falha ao listar exceções');
    const text = await res.text();
    return text
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  },

  async allowDomain(domain) {
    return this.get('allowed/add', { domain });
  },

  async denyDomain(domain) {
    return this.get('allowed/delete', { domain });
  },

  async temporaryDisableBlocking(minutes) {
    return this.get('settings/temporaryDisableBlocking', { minutes });
  }
};

const PERIODS = {
  LastHour: 'Última Hora',
  LastDay: 'Último Dia',
  LastWeek: 'Última Semana',
  LastMonth: 'Último Mês'
};

const RESPONSE_BADGES = {
  Cached: 'badge-cached',
  Recursive: 'badge-recursive',
  Authoritative: 'badge-authoritative',
  Blocked: 'badge-blocked',
  UpstreamBlocked: 'badge-blocked',
  Dropped: 'badge-failure'
};

const RCODE_BADGES = {
  NoError: 'badge-noerror',
  NxDomain: 'badge-nxdomain',
  ServerFailure: 'badge-failure',
  Refused: 'badge-failure'
};

let state = {
  period: 'LastHour',
  refreshInterval: 30,
  refreshTimer: null,
  charts: {},
  logPage: 1,
  logFilters: {},
  blockedDomains: [],
  allowedDomains: [],
  topBlocked: []
};

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n?.toLocaleString('pt-BR') ?? '0';
}

function fmtPct(a, b) {
  if (!b) return '0%';
  return ((a / b) * 100).toFixed(1) + '%';
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('hidden', !show);
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${view}`).classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  const titles = { dashboard: 'Dashboard', logs: 'Logs de Consultas', clients: 'Top Clientes', domains: 'Top Domínios', blocked: 'Bloqueios' };
  document.getElementById('page-title').textContent = titles[view] || view;
}

async function initApp() {
  if (!API.token) {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('user-name').textContent = API.user?.displayName || 'Admin';
  showView('dashboard');
  await loadDashboard();
  startAutoRefresh();
}

async function loadDashboard() {
  try {
    showLoading(true);
    const data = await API.stats(state.period);
    renderStats(data.stats);
    renderCharts(data);
    renderTopClients(data.topClients || []);
    renderTopDomains(data.topDomains || []);
    state.topBlocked = data.topBlockedDomains || [];
    renderTopBlocked(state.topBlocked);
  } catch (e) {
    console.error(e);
  } finally {
    showLoading(false);
  }
}

function renderTopBlocked(domains) {
  const el = document.getElementById('top-blocked-list');
  if (!el) return;
  if (!domains.length) {
    el.innerHTML = '<li class="empty-state">Nenhum domínio bloqueado no período</li>';
    return;
  }
  const max = domains[0]?.hits || 1;
  el.innerHTML = domains.slice(0, 15).map((d, i) => `
    <li>
      <div class="item-left">
        <span class="rank">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <span class="item-name clickable" onclick="filterByDomain('${d.name}')">${d.name}</span>
          <div class="bar-bg"><div class="bar-fill" style="width:${(d.hits / max * 100).toFixed(0)}%"></div></div>
        </div>
      </div>
      <span class="hits">${fmt(d.hits)}</span>
    </li>
  `).join('');
}

function normalizeDomain(raw) {
  let d = (raw || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (d.startsWith('*.')) d = d.slice(2);
  return d;
}

function showBlockMsg(text, isError = false) {
  const el = document.getElementById('block-msg');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden', 'ok', 'err');
  el.classList.add(isError ? 'err' : 'ok');
}

async function loadBlockedView() {
  try {
    showLoading(true);
    const [settings, blocked, allowed, stats] = await Promise.all([
      API.settings(),
      API.listBlockedExport(),
      API.listAllowedExport(),
      API.stats(state.period)
    ]);
    state.blockedDomains = blocked.sort((a, b) => a.localeCompare(b));
    state.allowedDomains = allowed.sort((a, b) => a.localeCompare(b));
    state.topBlocked = stats.topBlockedDomains || [];
    renderBlockStatus(settings);
    renderBlockedTable();
    renderAllowedList();
    renderTopBlocked(state.topBlocked);
  } catch (e) {
    console.error(e);
    showBlockMsg(e.message || 'Erro ao carregar bloqueios', true);
  } finally {
    showLoading(false);
  }
}

function renderBlockStatus(s) {
  const el = document.getElementById('block-status');
  if (!el) return;
  const enabled = !!s.enableBlocking;
  const till = s.temporaryDisableBlockingTill ? new Date(s.temporaryDisableBlockingTill) : null;
  const tempOff = till && till > new Date();
  const addrs = (s.customBlockingAddresses || []).join(', ') || '—';
  el.innerHTML = `
    <div class="stat-card ${enabled && !tempOff ? 'danger' : ''}">
      <div class="label">Status</div>
      <div class="value" style="font-size:1.05rem">${tempOff ? 'Pausado' : (enabled ? 'Ativo' : 'Off')}</div>
      <div class="sub">${s.blockingType || '—'} · TTL ${s.blockingAnswerTtl ?? '—'}s</div>
    </div>
    <div class="stat-card">
      <div class="label">Página de bloqueio</div>
      <div class="value" style="font-size:0.82rem;line-height:1.35;word-break:break-all">${addrs}</div>
      <div class="sub">IPs CustomAddress</div>
    </div>
    <div class="stat-card accent">
      <div class="label">Lista manual</div>
      <div class="value">${fmt(state.blockedDomains.length)}</div>
      <div class="sub">${fmt(state.allowedDomains.length)} exceções</div>
    </div>
    <div class="stat-card">
      <div class="label">Pausa rápida</div>
      <div class="block-form" style="margin-top:8px">
        <select id="block-pause-min" class="period-select" style="flex:1;min-width:0">
          <option value="5">5 min</option>
          <option value="15">15 min</option>
          <option value="30" selected>30 min</option>
          <option value="60">60 min</option>
        </select>
        <button id="block-pause-btn" class="btn btn-secondary btn-sm" type="button">Pausar</button>
      </div>
      <div class="sub">${tempOff ? 'Até ' + till.toLocaleString('pt-BR') : 'Desliga bloqueio temporariamente'}</div>
    </div>
  `;
  document.getElementById('block-pause-btn')?.addEventListener('click', pauseBlocking);
}

function renderBlockedTable() {
  const tbody = document.getElementById('blocked-tbody');
  const q = (document.getElementById('block-search')?.value || '').trim().toLowerCase();
  const list = q ? state.blockedDomains.filter(d => d.includes(q)) : state.blockedDomains;
  document.getElementById('blocked-total').textContent = `${fmt(list.length)} domínio${list.length === 1 ? '' : 's'}`;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Nenhum domínio na lista de bloqueio</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="truncate"><span class="clickable" onclick="filterByDomain('${d}')">${d}</span></td>
      <td><button class="btn btn-secondary btn-sm" type="button" onclick="unblockDomain('${d}')">Desbloquear</button></td>
    </tr>
  `).join('');
}

function renderAllowedList() {
  const el = document.getElementById('allowed-list');
  if (!el) return;
  if (!state.allowedDomains.length) {
    el.innerHTML = '<li class="empty-state">Nenhuma exceção cadastrada</li>';
    return;
  }
  el.innerHTML = state.allowedDomains.map(d => `
    <li>
      <div class="item-left"><span class="item-name">${d}</span></div>
      <button class="btn btn-secondary btn-sm" type="button" onclick="removeAllow('${d}')">Remover</button>
    </li>
  `).join('');
}

async function addBlockedDomain() {
  const input = document.getElementById('block-domain-input');
  const domain = normalizeDomain(input.value);
  if (!domain || !domain.includes('.')) {
    showBlockMsg('Informe um domínio válido (ex: ads.exemplo.com)', true);
    return;
  }
  try {
    showLoading(true);
    await API.blockDomain(domain);
    input.value = '';
    showBlockMsg(`Bloqueado: ${domain}`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao bloquear', true);
    showLoading(false);
  }
}

async function unblockDomain(domain) {
  if (!confirm(`Desbloquear ${domain}?`)) return;
  try {
    showLoading(true);
    await API.unblockDomain(domain);
    showBlockMsg(`Desbloqueado: ${domain}`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao desbloquear', true);
    showLoading(false);
  }
}

async function importBlockedList() {
  const raw = document.getElementById('block-bulk-input').value || '';
  const domains = [...new Set(raw.split(/[\n,;\s]+/).map(normalizeDomain).filter(d => d && d.includes('.')))];
  if (!domains.length) {
    showBlockMsg('Cole ao menos um domínio válido na lista', true);
    return;
  }
  try {
    showLoading(true);
    await API.importBlocked(domains);
    document.getElementById('block-bulk-input').value = '';
    showBlockMsg(`Importados ${domains.length} domínio(s)`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao importar', true);
    showLoading(false);
  }
}

function exportBlockedList() {
  const blob = new Blob([state.blockedDomains.join('\n') + (state.blockedDomains.length ? '\n' : '')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'provider-blocked-domains.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function addAllowedDomain() {
  const input = document.getElementById('allow-domain-input');
  const domain = normalizeDomain(input.value);
  if (!domain || !domain.includes('.')) {
    showBlockMsg('Informe um domínio válido para exceção', true);
    return;
  }
  try {
    showLoading(true);
    await API.allowDomain(domain);
    input.value = '';
    showBlockMsg(`Exceção criada: ${domain}`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao permitir', true);
    showLoading(false);
  }
}

async function removeAllow(domain) {
  if (!confirm(`Remover exceção ${domain}?`)) return;
  try {
    showLoading(true);
    await API.denyDomain(domain);
    showBlockMsg(`Exceção removida: ${domain}`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao remover exceção', true);
    showLoading(false);
  }
}

async function pauseBlocking() {
  const minutes = parseInt(document.getElementById('block-pause-min')?.value || '30', 10);
  if (!confirm(`Pausar todos os bloqueios por ${minutes} minutos?`)) return;
  try {
    showLoading(true);
    await API.temporaryDisableBlocking(minutes);
    showBlockMsg(`Bloqueio pausado por ${minutes} minutos`);
    await loadBlockedView();
  } catch (e) {
    showBlockMsg(e.message || 'Falha ao pausar', true);
    showLoading(false);
  }
}

function renderStats(s) {
  const grid = document.getElementById('stats-grid');
  const items = [
    { label: 'Total de Consultas', value: fmt(s.totalQueries), sub: `${s.totalClients} clientes`, cls: 'accent' },
    { label: 'Sem Erro', value: fmt(s.totalNoError), sub: fmtPct(s.totalNoError, s.totalQueries), cls: 'success' },
    { label: 'Recursivas', value: fmt(s.totalRecursive), sub: fmtPct(s.totalRecursive, s.totalQueries), cls: 'info' },
    { label: 'Em Cache', value: fmt(s.totalCached), sub: fmtPct(s.totalCached, s.totalQueries), cls: 'purple' },
    { label: 'NX Domain', value: fmt(s.totalNxDomain), sub: fmtPct(s.totalNxDomain, s.totalQueries), cls: '' },
    { label: 'Falhas', value: fmt(s.totalServerFailure), sub: fmtPct(s.totalServerFailure, s.totalQueries), cls: 'danger' },
    { label: 'Bloqueadas', value: fmt(s.totalBlocked), sub: fmtPct(s.totalBlocked, s.totalQueries), cls: 'danger' },
    { label: 'Entradas Cache', value: fmt(s.cachedEntries), sub: 'registros ativos', cls: '' }
  ];
  grid.innerHTML = items.map(i => `
    <div class="stat-card ${i.cls}">
      <div class="label">${i.label}</div>
      <div class="value">${i.value}</div>
      <div class="sub">${i.sub}</div>
    </div>
  `).join('');
}

function renderCharts(data) {
  destroyChart('mainChart');
  destroyChart('responseChart');
  destroyChart('typeChart');
  destroyChart('protocolChart');

  const mainCtx = document.getElementById('mainChart').getContext('2d');
  const mc = data.mainChartData;
  state.charts.mainChart = new Chart(mainCtx, {
    type: 'line',
    data: {
      labels: mc.labels,
      datasets: [
        { label: 'Total', data: mc.datasets[0]?.data || [], borderColor: '#ff7a25', backgroundColor: 'rgba(255,122,37,0.08)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: 'Recursivas', data: mc.datasets[6]?.data || [], borderColor: '#06b6d4', backgroundColor: 'transparent', tension: 0.3, borderWidth: 1.5, pointRadius: 0 },
        { label: 'Cache', data: mc.datasets[7]?.data || [], borderColor: '#a855f7', backgroundColor: 'transparent', tension: 0.3, borderWidth: 1.5, pointRadius: 0 }
      ]
    },
    options: chartOpts(false)
  });

  const rc = data.queryResponseChartData;
  state.charts.responseChart = new Chart(document.getElementById('responseChart'), {
    type: 'doughnut',
    data: { labels: rc.labels, datasets: [{ data: rc.datasets[0].data, backgroundColor: ['#eab308', '#06b6d4', '#a855f7', '#ef4444', '#374151'] }] },
    options: { ...chartOpts(true), cutout: '65%' }
  });

  const tc = data.queryTypeChartData;
  state.charts.typeChart = new Chart(document.getElementById('typeChart'), {
    type: 'doughnut',
    data: { labels: tc.labels, datasets: [{ data: tc.datasets[0].data, backgroundColor: ['#6699ff', '#5cb85c', '#333', '#5bc0de', '#969600', '#17a2b8', '#6f5499', '#ffa500', '#337ab7', '#999'] }] },
    options: { ...chartOpts(true), cutout: '60%' }
  });

  const pc = data.protocolTypeChartData;
  state.charts.protocolChart = new Chart(document.getElementById('protocolChart'), {
    type: 'doughnut',
    data: { labels: pc.labels, datasets: [{ data: pc.datasets[0].data, backgroundColor: ['#6f5499', '#969600', '#17a2b8'] }] },
    options: { ...chartOpts(true), cutout: '60%' }
  });
}

function chartOpts(legend) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: legend, labels: { color: '#9ca3ad', font: { size: 11 }, boxWidth: 12 } }
    },
    scales: legend ? {} : {
      x: { ticks: { color: '#737b86', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#737b86' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
    }
  };
}

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

function renderTopList(items, listId, onClickFn) {
  const el = document.getElementById(listId);
  if (!el) return;
  const max = items[0]?.hits || 1;
  el.innerHTML = items.slice(0, 15).map((c, i) => `
    <li>
      <div class="item-left">
        <span class="rank">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <span class="item-name clickable" onclick="${onClickFn}('${c.name}')">${c.name}</span>
          <div class="bar-bg"><div class="bar-fill" style="width:${(c.hits / max * 100).toFixed(0)}%"></div></div>
        </div>
      </div>
      <span class="hits">${fmt(c.hits)}</span>
    </li>
  `).join('') || '<li class="empty-state">Nenhum dado</li>';
}

function renderBarChart(canvasId, items, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !items.length) return;
  destroyChart(canvasId);
  state.charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: items.map(i => i.name.length > 22 ? i.name.slice(0, 20) + '…' : i.name),
      datasets: [{ label, data: items.map(i => i.hits), backgroundColor: 'rgba(255,122,37,0.6)', borderColor: '#ff7a25', borderWidth: 1, borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#737b86' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#9ca3ad', font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function renderTopClients(clients) {
  renderTopList(clients, 'top-clients-list', 'filterByClient');
  renderTopList(clients, 'top-clients-list-2', 'filterByClient');
  renderBarChart('clientsChart', clients.slice(0, 10), 'Consultas');
}

function renderTopDomains(domains) {
  renderTopList(domains, 'top-domains-list', 'filterByDomain');
  renderTopList(domains, 'top-domains-list-2', 'filterByDomain');
  renderBarChart('domainsChart', domains.slice(0, 10), 'Consultas');
}

async function loadLogs(page = 1) {
  state.logPage = page;
  try {
    showLoading(true);
    const data = await API.queryLogs({ page, perPage: 50, ...state.logFilters });
    renderLogsTable(data);
  } catch (e) {
    console.error(e);
  } finally {
    showLoading(false);
  }
}

function renderLogsTable(data) {
  const tbody = document.getElementById('logs-tbody');
  if (!data.entries?.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum registro encontrado</td></tr>';
  } else {
    tbody.innerHTML = data.entries.map(e => `
      <tr>
        <td>${fmtTime(e.timestamp)}</td>
        <td><span class="clickable" onclick="filterByClient('${e.clientIpAddress}')">${e.clientIpAddress}</span></td>
        <td class="truncate"><span class="clickable" onclick="filterByDomain('${e.qname}')">${e.qname}</span></td>
        <td>${e.qtype}</td>
        <td><span class="badge ${RESPONSE_BADGES[e.responseType] || ''}">${e.responseType}</span></td>
        <td><span class="badge ${RCODE_BADGES[e.rcode] || ''}">${e.rcode}</span></td>
        <td>${e.responseRtt ? e.responseRtt.toFixed(0) + 'ms' : '—'}</td>
        <td class="answer-cell" title="${e.answer || ''}">${e.answer || '—'}</td>
      </tr>
    `).join('');
  }
  document.getElementById('logs-total').textContent = `${fmt(data.totalEntries)} registros`;
  renderPagination(data.pageNumber, data.totalPages);
}

function renderPagination(current, total) {
  const el = document.getElementById('logs-pagination');
  if (total <= 1) { el.innerHTML = ''; return; }
  let html = `<button ${current <= 1 ? 'disabled' : ''} onclick="loadLogs(${current - 1})">←</button>`;
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="${i === current ? 'active' : ''}" onclick="loadLogs(${i})">${i}</button>`;
  }
  html += `<button ${current >= total ? 'disabled' : ''} onclick="loadLogs(${current + 1})">→</button>`;
  el.innerHTML = html;
}

function filterByClient(ip) {
  state.logFilters = { clientIp: ip };
  document.getElementById('filter-client').value = ip;
  document.getElementById('filter-domain').value = '';
  showView('logs');
  loadLogs(1);
}

function filterByDomain(domain) {
  state.logFilters = { qname: domain };
  document.getElementById('filter-domain').value = domain;
  document.getElementById('filter-client').value = '';
  showView('logs');
  loadLogs(1);
}

function applyLogFilters() {
  state.logFilters = {};
  const client = document.getElementById('filter-client').value.trim();
  const domain = document.getElementById('filter-domain').value.trim();
  const type = document.getElementById('filter-type').value;
  const rcode = document.getElementById('filter-rcode').value;
  if (client) state.logFilters.clientIp = client;
  if (domain) state.logFilters.qname = domain;
  if (type) state.logFilters.responseType = type;
  if (rcode) state.logFilters.rcode = rcode;
  loadLogs(1);
}

function clearLogFilters() {
  state.logFilters = {};
  ['filter-client', 'filter-domain'].forEach(id => document.getElementById(id).value = '');
  ['filter-type', 'filter-rcode'].forEach(id => document.getElementById(id).value = '');
  loadLogs(1);
}

function exportLogs() {
  window.open(API.exportUrl(state.logFilters), '_blank');
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.refreshInterval > 0) {
    state.refreshTimer = setInterval(() => {
      const active = document.querySelector('.view:not(.hidden)');
      if (active?.id === 'view-dashboard') loadDashboard();
      else if (active?.id === 'view-logs') loadLogs(state.logPage);
    }, state.refreshInterval * 1000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    try {
      await API.login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value
      );
      initApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (!view) return;
      showView(view);
      if (view === 'dashboard') loadDashboard();
      else if (view === 'logs') loadLogs(1);
      else if (view === 'clients' || view === 'domains') loadDashboard();
      else if (view === 'blocked') loadBlockedView();
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('period-select').addEventListener('change', e => {
    state.period = e.target.value;
    loadDashboard();
  });

  document.getElementById('refresh-select').addEventListener('change', e => {
    state.refreshInterval = parseInt(e.target.value);
    startAutoRefresh();
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    API.logout();
    location.reload();
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('export-btn').addEventListener('click', exportLogs);
  document.getElementById('filter-btn').addEventListener('click', applyLogFilters);
  document.getElementById('clear-filter-btn').addEventListener('click', clearLogFilters);

  document.getElementById('block-add-btn')?.addEventListener('click', addBlockedDomain);
  document.getElementById('block-import-btn')?.addEventListener('click', importBlockedList);
  document.getElementById('block-export-btn')?.addEventListener('click', exportBlockedList);
  document.getElementById('block-refresh-btn')?.addEventListener('click', loadBlockedView);
  document.getElementById('block-bulk-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('block-bulk-panel');
    panel?.classList.toggle('hidden');
    if (panel && !panel.classList.contains('hidden')) {
      document.getElementById('block-bulk-input')?.focus();
    }
  });
  document.getElementById('block-bulk-close')?.addEventListener('click', () => {
    document.getElementById('block-bulk-panel')?.classList.add('hidden');
  });
  document.getElementById('allow-add-btn')?.addEventListener('click', addAllowedDomain);
  document.getElementById('block-domain-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addBlockedDomain();
  });
  document.getElementById('allow-domain-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addAllowedDomain();
  });
  document.getElementById('block-search')?.addEventListener('input', renderBlockedTable);

  ['filter-client', 'filter-domain'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') applyLogFilters();
    });
  });

  initApp();
});

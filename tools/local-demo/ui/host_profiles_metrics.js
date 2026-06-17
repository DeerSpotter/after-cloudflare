(() => {
  const storageKey = "flareless-app-settings";
  let settings = { hosting: { safeApplyMode: "generate-instructions-only", locations: [] } };
  const q = (selector) => document.querySelector(selector);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hasBridge = () => Boolean(window.pywebview && window.pywebview.api);
  const profiles = () => settings.hosting?.locations || [];

  async function loadSettings() {
    try {
      settings = hasBridge() ? await window.pywebview.api.get_app_settings() : JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      settings = {};
    }
    settings.hosting = { safeApplyMode: "generate-instructions-only", locations: [], ...(settings.hosting || {}) };
    if (!Array.isArray(settings.hosting.locations)) settings.hosting.locations = [];
  }

  async function saveSettings() {
    if (hasBridge()) settings = await window.pywebview.api.save_app_settings(settings);
    else localStorage.setItem(storageKey, JSON.stringify(settings));
    if (typeof toast === "function") toast("Host profiles saved.");
    renderHostsPage();
    renderHostMetric();
  }

  function risk(profile) {
    const criticality = { critical: 40, high: 28, medium: 16, low: 8 }[profile.criticality] || 16;
    const status = { offline: 45, degraded: 28, "needs-setup": 22, unknown: 16, healthy: 0 }[profile.status] ?? 16;
    const issues = Math.min(30, Number(profile.issueCount || 0) * 7);
    const missing = (!profile.domain ? 8 : 0) + (!profile.detectedFile ? 8 : 0) + (!profile.path ? 6 : 0);
    return Math.min(100, criticality + status + issues + missing);
  }

  function summary() {
    const items = profiles();
    return {
      total: items.length,
      critical: items.filter((item) => ["critical", "high"].includes(item.criticality)).length,
      setup: items.filter((item) => !item.domain || !item.path || !item.detectedFile || item.status === "needs-setup").length,
      degraded: items.filter((item) => ["degraded", "offline", "unknown"].includes(item.status)).length,
      issues: items.reduce((sum, item) => sum + Number(item.issueCount || 0), 0),
      risk: items.length ? Math.round(items.reduce((sum, item) => sum + risk(item), 0) / items.length) : 0,
    };
  }

  function injectCss() {
    if (q("#host-profile-css")) return;
    const style = document.createElement("style");
    style.id = "host-profile-css";
    style.textContent = `.host-profile-grid{display:grid;grid-template-columns:minmax(320px,.85fr) minmax(0,1.15fr);gap:14px;height:100%;min-height:0}.host-profile-form,.host-profile-table,.host-fleet-card{background:#07111b;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;min-height:0;overflow:auto}.host-profile-form{display:grid;gap:8px;align-content:start}.host-profile-form label{display:grid;gap:4px;color:#9cafbf;font-size:11px}.host-profile-form input,.host-profile-form select,.host-profile-form textarea{width:100%;background:#111c28;color:#eef8ff;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:8px;font-size:12px}.host-profile-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.host-profile-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start;background:#0c1722;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px;margin-bottom:8px;font-size:12px}.host-profile-row b{display:block;margin-bottom:4px}.host-profile-meta{color:#91a4b5;font:11px Consolas,monospace}.host-risk,.host-fleet-bar{height:7px;background:#132333;border-radius:999px;overflow:hidden;margin-top:8px}.host-risk span,.host-fleet-bar span{display:block;height:100%;background:linear-gradient(90deg,#46f0a0,#ffd784,#f04455)}.host-fleet-kpis{display:grid;grid-template-columns:repeat(6,minmax(58px,1fr));gap:8px}.host-fleet-kpis div{background:#0b1520;border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:8px;text-align:center}.host-fleet-kpis span{display:block;color:#91a4b5;font-size:10px}.host-fleet-kpis b{display:block;font-size:20px;color:#eaf6ff}.host-fleet-list{display:grid;gap:7px;max-height:230px;overflow:auto}.host-fleet-line{display:grid;grid-template-columns:minmax(120px,1fr) 78px 1fr 44px;gap:8px;align-items:center;font-size:12px}.host-widget-toolbar{display:flex;justify-content:space-between;gap:8px;align-items:center}@media(max-width:1300px){.host-profile-grid{grid-template-columns:1fr}.host-fleet-kpis{grid-template-columns:repeat(3,1fr)}}`;
    document.head.appendChild(style);
  }

  function ensureHostsPage() {
    if (!q('.nav-item[data-view="hosts"]')) {
      const settingsNav = q('.nav-item[data-view="settings"]');
      const button = document.createElement('button');
      button.className = 'nav-item';
      button.dataset.view = 'hosts';
      button.textContent = 'Hosts';
      button.addEventListener('click', () => { if (typeof showView === 'function') showView('hosts'); renderHostsPage(); });
      settingsNav?.parentElement?.insertBefore(button, settingsNav);
    }
    if (!q('#hosts')) {
      const section = document.createElement('section');
      section.id = 'hosts';
      section.className = 'view';
      section.innerHTML = `<article class="card page-card"><div class="card-head"><div><div class="card-title">Host Profiles</div><div class="card-subtitle">Profiles for every host the user is responsible for. These feed the Metrics page.</div></div><button id="saveHostProfilesBtn" class="primary">Save Profiles</button></div><div class="page-body host-profile-grid"><div class="host-profile-form"><b>Host Profile</b><label>Name<input id="profileName" placeholder="Production Website" /></label><label>Domain<input id="profileDomain" placeholder="example.com" /></label><label>Platform<select id="profileType"><option value="manual">Manual</option><option value="cpanel">cPanel</option><option value="cloudflare-pages">Cloudflare Pages</option><option value="static-host">Static host</option><option value="other">Other</option></select></label><label>Environment<select id="profileEnvironment"><option>production</option><option>staging</option><option>dev</option><option>client</option></select></label><label>Criticality<select id="profileCriticality"><option>critical</option><option>high</option><option selected>medium</option><option>low</option></select></label><label>Status<select id="profileStatus"><option>healthy</option><option>degraded</option><option>offline</option><option selected>needs-setup</option><option>unknown</option></select></label><label>Issue count<input id="profileIssues" type="number" min="0" value="0" /></label><label>Web root path<input id="profilePath" placeholder="/public_html or /dist" /></label><label>Detected file<input id="profileDetectedFile" placeholder="index.html, worker.js, _headers" /></label><label>Notes<textarea id="profileNotes" rows="3"></textarea></label><div class="host-profile-actions"><button id="addHostProfileBtn" class="primary">Add Profile</button><button id="clearHostProfileFormBtn">Clear</button></div></div><div><div id="hostFleetSummary" class="host-fleet-card"></div><div id="hostProfileList" class="host-profile-table"></div></div></div></article>`;
      q('.stage').appendChild(section);
      q('#saveHostProfilesBtn')?.addEventListener('click', saveSettings);
      q('#addHostProfileBtn')?.addEventListener('click', addProfile);
      q('#clearHostProfileFormBtn')?.addEventListener('click', clearForm);
    }
  }

  function formProfile() {
    return {
      id: `host-${Date.now()}`,
      name: q('#profileName')?.value.trim() || 'Hosted location',
      type: q('#profileType')?.value || 'manual',
      platform: q('#profileType')?.value || 'manual',
      domain: q('#profileDomain')?.value.trim() || '',
      path: q('#profilePath')?.value.trim() || '',
      detectedFile: q('#profileDetectedFile')?.value.trim() || '',
      applyMode: 'manual-instructions',
      environment: q('#profileEnvironment')?.value || 'production',
      criticality: q('#profileCriticality')?.value || 'medium',
      status: q('#profileStatus')?.value || 'needs-setup',
      lastCheck: new Date().toLocaleString(),
      issueCount: Number(q('#profileIssues')?.value || 0),
      owner: 'me',
      notes: q('#profileNotes')?.value.trim() || '',
    };
  }

  function clearForm() { ['#profileName', '#profileDomain', '#profilePath', '#profileDetectedFile', '#profileNotes'].forEach((selector) => { const input = q(selector); if (input) input.value = ''; }); if (q('#profileIssues')) q('#profileIssues').value = '0'; }
  async function addProfile() { settings.hosting.locations.push(formProfile()); clearForm(); await saveSettings(); }

  function renderHostsPage() {
    ensureHostsPage();
    const s = summary();
    const summaryBox = q('#hostFleetSummary');
    if (summaryBox) summaryBox.innerHTML = `<div class="host-widget-toolbar"><b>All Responsible Hosts</b><span class="host-profile-meta">local ownership metric</span></div><div class="host-fleet-kpis"><div><span>HOSTS</span><b>${s.total}</b></div><div><span>CRITICAL</span><b>${s.critical}</b></div><div><span>SETUP</span><b>${s.setup}</b></div><div><span>DEGRADED</span><b>${s.degraded}</b></div><div><span>ISSUES</span><b>${s.issues}</b></div><div><span>RISK</span><b>${s.risk}%</b></div></div>`;
    const list = q('#hostProfileList');
    if (!list) return;
    if (!profiles().length) { list.innerHTML = '<div class="host-profile-row"><div><b>No host profiles yet.</b><div class="host-profile-meta">Add every site or host you are responsible for.</div></div></div>'; return; }
    list.innerHTML = profiles().map((profile, index) => { const r = risk(profile); return `<div class="host-profile-row"><div><b>${esc(profile.name)}</b><div>${esc(profile.domain || 'no domain')} · ${esc(profile.platform || profile.type)} · ${esc(profile.environment)} · ${esc(profile.criticality)} · ${esc(profile.status)}</div><div class="host-profile-meta">${esc(profile.path || '/')} / ${esc(profile.detectedFile || 'file not detected')} · issues=${Number(profile.issueCount || 0)} · last=${esc(profile.lastCheck || 'never')}</div><div class="host-risk"><span style="width:${r}%"></span></div></div><div><button data-remove-profile="${index}">Remove</button></div></div>`; }).join('');
    qa('[data-remove-profile]').forEach((button) => button.addEventListener('click', async () => { settings.hosting.locations.splice(Number(button.dataset.removeProfile), 1); await saveSettings(); }));
  }

  function renderHostMetric() {
    const grid = q('#metrics .metrics-grid');
    if (!grid) return;
    let card = q('#hostFleetMetricCard');
    if (!card) { card = document.createElement('div'); card.id = 'hostFleetMetricCard'; card.className = 'metric-card host-fleet-card'; grid.appendChild(card); }
    const s = summary();
    const sorted = [...profiles()].sort((a, b) => risk(b) - risk(a));
    card.innerHTML = `<div class="host-widget-toolbar"><b>Host Responsibility</b><button id="openHostsFromMetricBtn">Manage</button></div><div class="host-fleet-kpis"><div><span>HOSTS</span><b>${s.total}</b></div><div><span>CRITICAL</span><b>${s.critical}</b></div><div><span>SETUP</span><b>${s.setup}</b></div><div><span>DEGRADED</span><b>${s.degraded}</b></div><div><span>ISSUES</span><b>${s.issues}</b></div><div><span>RISK</span><b>${s.risk}%</b></div></div><div class="host-fleet-list">${sorted.length ? sorted.map((profile) => { const r = risk(profile); return `<div class="host-fleet-line"><span>${esc(profile.name)}</span><code>${esc(profile.status || 'unknown')}</code><div class="host-fleet-bar"><span style="width:${r}%"></span></div><b>${r}%</b></div>`; }).join('') : '<div class="host-profile-meta">No host profiles configured.</div>'}</div>`;
    q('#openHostsFromMetricBtn')?.addEventListener('click', () => { if (typeof showView === 'function') showView('hosts'); renderHostsPage(); });
  }

  async function start() { injectCss(); ensureHostsPage(); await loadSettings(); renderHostsPage(); renderHostMetric(); setInterval(renderHostMetric, 3000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

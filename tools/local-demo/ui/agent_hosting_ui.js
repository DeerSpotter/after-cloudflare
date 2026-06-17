(() => {
  const defaultSettings = {
    keepServerRunningAfterGuiClose: false,
    agent: {
      mode: "free-local",
      freeAgent: "local-rule-agent",
      paidProvider: "openai-compatible",
      paidModel: "gpt-4o-mini",
      apiKeyConfigured: false,
      apiKeyPreview: "",
      apiKeyStoredInDemo: false,
    },
    hosting: {
      safeApplyMode: "generate-instructions-only",
      locations: [],
    },
  };

  const fallbackStorageKey = "flareless-app-settings";
  let appSettings = JSON.parse(JSON.stringify(defaultSettings));

  function q(selector) { return document.querySelector(selector); }
  function qa(selector) { return [...document.querySelectorAll(selector)]; }
  function hasPywebviewApi() { return Boolean(window.pywebview && window.pywebview.api); }

  function mergeSettings(base, incoming) {
    const merged = JSON.parse(JSON.stringify(base));
    if (!incoming || typeof incoming !== "object") return merged;
    Object.entries(incoming).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value) && merged[key] && typeof merged[key] === "object") {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    });
    if (!merged.agent) merged.agent = JSON.parse(JSON.stringify(defaultSettings.agent));
    if (!merged.hosting) merged.hosting = JSON.parse(JSON.stringify(defaultSettings.hosting));
    if (!Array.isArray(merged.hosting.locations)) merged.hosting.locations = [];
    return merged;
  }

  async function loadAppSettings() {
    try {
      if (hasPywebviewApi() && window.pywebview.api.get_app_settings) {
        appSettings = mergeSettings(defaultSettings, await window.pywebview.api.get_app_settings());
        return appSettings;
      }
    } catch (error) {
      console.warn("Unable to read pywebview settings", error);
    }
    try {
      appSettings = mergeSettings(defaultSettings, JSON.parse(localStorage.getItem(fallbackStorageKey) || "{}"));
    } catch {
      appSettings = JSON.parse(JSON.stringify(defaultSettings));
    }
    return appSettings;
  }

  async function saveAppSettings(patch = {}) {
    const outgoing = mergeSettings(appSettings, patch);
    try {
      if (hasPywebviewApi() && window.pywebview.api.save_app_settings) {
        appSettings = mergeSettings(defaultSettings, await window.pywebview.api.save_app_settings(outgoing));
      } else {
        appSettings = outgoing;
        localStorage.setItem(fallbackStorageKey, JSON.stringify(appSettings));
      }
      if (typeof toast === "function") toast("Settings saved.");
    } catch (error) {
      console.error(error);
      if (typeof toast === "function") toast("Settings save failed.");
    }
    renderAgentHostingPanel();
    return appSettings;
  }

  function injectCss() {
    if (document.getElementById("agent-hosting-css")) return;
    const style = document.createElement("style");
    style.id = "agent-hosting-css";
    style.textContent = `
      .agent-hosting-grid { display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap:14px; margin-top:14px; }
      .agent-panel { background:#0b1520; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:14px; min-width:0; }
      .agent-panel h3 { margin:0 0 8px; font-size:14px; }
      .agent-panel p { margin:6px 0 10px; color:#91a4b5; font-size:12px; line-height:1.35; }
      .agent-form { display:grid; gap:8px; }
      .agent-form label { display:grid; gap:4px; color:#9cafbf; font-size:11px; }
      .agent-form input, .agent-form select, .agent-form textarea { width:100%; background:#111c28; color:#eef8ff; border:1px solid rgba(255,255,255,.12); border-radius:7px; padding:8px; font-size:12px; }
      .agent-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .host-list { display:grid; gap:8px; margin-top:10px; max-height:220px; overflow:auto; }
      .host-card { background:#111c28; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:10px; font-size:12px; }
      .host-card b { display:block; margin-bottom:4px; }
      .host-card code { color:#8ee9c4; }
      .setup-recommendation { white-space:pre-wrap; font:12px Consolas, monospace; background:#07111b; border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:12px; min-height:170px; max-height:300px; overflow:auto; color:#d8e9ff; }
      .agent-note { border-left:3px solid #ffd784; padding:8px 10px; background:rgba(255,215,132,.08); color:#ffe0a3; border-radius:8px; font-size:12px; }
      @media (max-width: 1200px) { .agent-hosting-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function renameApprovalsToAgents() {
    const nav = q('.nav-item[data-view="approvals"]');
    if (nav) nav.textContent = "Agent Ops";
    const title = q('#approvals .card-title');
    if (title) title.textContent = "Agent Operations";
    const subtitle = q('#approvals .card-subtitle');
    if (subtitle) subtitle.textContent = "Recommendation inbox, operator decision, and agent audit trail";
  }

  function buildSettingsMarkup() {
    return `
      <div class="agent-hosting-grid" id="agentHostingGrid">
        <section class="agent-panel">
          <h3>Agent Runtime</h3>
          <p>Use a free local rule agent for safe offline recommendations, or configure a paid API compatible agent. The demo does not persist raw API keys. It stores only whether a key was configured and a masked preview.</p>
          <div class="agent-form">
            <label>Agent mode
              <select id="agentModeSelect">
                <option value="free-local">Free local rule agent</option>
                <option value="paid-api">Paid API agent</option>
              </select>
            </label>
            <label>Free agent
              <select id="freeAgentSelect">
                <option value="local-rule-agent">Local Rule Agent, offline</option>
                <option value="local-setup-agent">Local Setup Agent, offline</option>
                <option value="manual-agent">Manual operator only</option>
              </select>
            </label>
            <label>Paid provider type
              <select id="paidProviderSelect">
                <option value="openai-compatible">OpenAI compatible API</option>
                <option value="anthropic-compatible">Anthropic compatible API</option>
                <option value="local-openai-compatible">Local OpenAI compatible server</option>
              </select>
            </label>
            <label>Paid model
              <input id="paidModelInput" placeholder="model name" />
            </label>
            <label>API key
              <input id="agentApiKeyInput" type="password" placeholder="Paste key to mark configured" />
            </label>
            <div class="agent-note" id="agentKeyStatus">No API key configured.</div>
            <div class="agent-actions">
              <button class="primary" id="saveAgentSettingsBtn">Save agent settings</button>
              <button id="clearAgentKeyBtn">Clear key marker</button>
              <button id="setupAgentRecommendationBtn">Generate setup recommendation</button>
            </div>
          </div>
        </section>

        <section class="agent-panel">
          <h3>Server Behavior</h3>
          <p>Choose what happens when the GUI window closes.</p>
          <div class="agent-form">
            <label>Keep server running after GUI closes
              <select id="keepServerSelect">
                <option value="false">False, close server when GUI closes</option>
                <option value="true">True, keep server running until Ctrl+C</option>
              </select>
            </label>
            <div class="agent-note">Default is false. True is useful when testing browser clients against the local server.</div>
            <div class="agent-actions"><button class="primary" id="saveServerBehaviorBtn">Save server behavior</button></div>
          </div>
        </section>

        <section class="agent-panel">
          <h3>Hosted Locations</h3>
          <p>Define where Flareless should be installed later: cPanel, static host, SFTP/FTP, Cloudflare Pages, or manual hosting. Automatic file changes should stay disabled until credentials and operator approval are explicitly added.</p>
          <div class="agent-form">
            <label>Name <input id="hostNameInput" placeholder="Production website" /></label>
            <label>Type
              <select id="hostTypeSelect">
                <option value="manual">Manual / unknown</option>
                <option value="sftp">SFTP</option>
                <option value="ftp">FTP</option>
                <option value="cpanel">cPanel file manager</option>
                <option value="cloudflare-pages">Cloudflare Pages</option>
                <option value="static-host">Static host</option>
              </select>
            </label>
            <label>Domain <input id="hostDomainInput" placeholder="example.com" /></label>
            <label>Host / account URL <input id="hostServerInput" placeholder="host.example.com or dashboard URL" /></label>
            <label>Web root path <input id="hostPathInput" placeholder="/public_html or /dist" /></label>
            <label>Detected file <input id="hostDetectedFileInput" placeholder="index.html, _headers, worker.js" /></label>
            <label>Apply mode
              <select id="hostApplyModeSelect">
                <option value="manual-instructions">Manual instructions only</option>
                <option value="generate-patch">Generate patch only</option>
                <option value="future-sftp-apply-disabled">Future SFTP apply, disabled</option>
              </select>
            </label>
            <label>Notes <textarea id="hostNotesInput" rows="3" placeholder="Login steps, host notes, constraints"></textarea></label>
            <div class="agent-actions"><button class="primary" id="addHostedLocationBtn">Add hosted location</button><button id="saveHostingBtn">Save hosting</button></div>
          </div>
          <div class="host-list" id="hostedLocationList"></div>
        </section>

        <section class="agent-panel">
          <h3>Setup Assistant</h3>
          <p>This is where the agent should guide the user through host setup. For now it generates safe instructions and recommended next steps. Later it can create a patch and, only after approval, apply through SFTP/FTP or a host API.</p>
          <div class="agent-form">
            <label>Global apply mode
              <select id="safeApplyModeSelect">
                <option value="generate-instructions-only">Generate instructions only</option>
                <option value="generate-patch-only">Generate patch only</option>
                <option value="future-credentialed-apply-disabled">Future credentialed apply, disabled</option>
              </select>
            </label>
            <div class="setup-recommendation" id="setupRecommendationText">Add a hosted location, then generate a setup recommendation.</div>
          </div>
        </section>
      </div>
    `;
  }

  function ensureSettingsPanel() {
    const body = q('#settings .page-body');
    if (!body || document.getElementById('agentHostingGrid')) return;
    body.insertAdjacentHTML('beforeend', buildSettingsMarkup());
  }

  function locationFromInputs() {
    return {
      id: `host-${Date.now()}`,
      name: q('#hostNameInput')?.value.trim() || 'Hosted location',
      type: q('#hostTypeSelect')?.value || 'manual',
      domain: q('#hostDomainInput')?.value.trim() || '',
      host: q('#hostServerInput')?.value.trim() || '',
      path: q('#hostPathInput')?.value.trim() || '',
      detectedFile: q('#hostDetectedFileInput')?.value.trim() || '',
      applyMode: q('#hostApplyModeSelect')?.value || 'manual-instructions',
      notes: q('#hostNotesInput')?.value.trim() || '',
    };
  }

  function syncControls() {
    q('#agentModeSelect').value = appSettings.agent.mode || 'free-local';
    q('#freeAgentSelect').value = appSettings.agent.freeAgent || 'local-rule-agent';
    q('#paidProviderSelect').value = appSettings.agent.paidProvider || 'openai-compatible';
    q('#paidModelInput').value = appSettings.agent.paidModel || '';
    q('#agentApiKeyInput').value = '';
    q('#agentKeyStatus').textContent = appSettings.agent.apiKeyConfigured
      ? `API key configured: ${appSettings.agent.apiKeyPreview || 'configured'}; raw key is not persisted by this demo.`
      : 'No API key configured.';
    q('#keepServerSelect').value = appSettings.keepServerRunningAfterGuiClose ? 'true' : 'false';
    q('#safeApplyModeSelect').value = appSettings.hosting.safeApplyMode || 'generate-instructions-only';
  }

  function renderHostedLocations() {
    const list = q('#hostedLocationList');
    if (!list) return;
    if (!appSettings.hosting.locations.length) {
      list.innerHTML = '<div class="host-card">No hosted locations configured yet.</div>';
      return;
    }
    list.innerHTML = appSettings.hosting.locations.map((item, index) => `
      <div class="host-card">
        <b>${item.name}</b>
        <div>${item.type} · ${item.domain || 'no domain'} · ${item.applyMode}</div>
        <div><code>${item.path || '/'}/${item.detectedFile || 'detect file later'}</code></div>
        <div>${item.notes || ''}</div>
        <div class="agent-actions"><button data-remove-host="${index}">Remove</button></div>
      </div>
    `).join('');
    qa('[data-remove-host]').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number(button.getAttribute('data-remove-host'));
        appSettings.hosting.locations.splice(index, 1);
        await saveAppSettings({ hosting: appSettings.hosting });
      });
    });
  }

  function generateSetupRecommendation() {
    const locations = appSettings.hosting.locations || [];
    const agentName = appSettings.agent.mode === 'paid-api'
      ? `${appSettings.agent.paidProvider} / ${appSettings.agent.paidModel || 'model not set'}`
      : appSettings.agent.freeAgent;
    const lines = [
      'FLARELESS HOST SETUP RECOMMENDATION',
      '',
      `Agent: ${agentName}`,
      `Apply mode: ${appSettings.hosting.safeApplyMode}`,
      '',
    ];

    if (!locations.length) {
      lines.push('No hosted locations are configured. Add one location first.');
    }

    locations.forEach((item, index) => {
      const missing = [];
      if (!item.domain) missing.push('domain');
      if (!item.path) missing.push('web root path');
      if (!item.detectedFile) missing.push('detected file');
      lines.push(`Location ${index + 1}: ${item.name}`);
      lines.push(`  Type: ${item.type}`);
      lines.push(`  Domain: ${item.domain || 'missing'}`);
      lines.push(`  Web root: ${item.path || 'missing'}`);
      lines.push(`  Target file: ${item.detectedFile || 'missing'}`);
      lines.push(`  Apply mode: ${item.applyMode}`);
      lines.push(`  Status: ${missing.length ? `needs ${missing.join(', ')}` : 'ready for manual instructions'}`);
      lines.push('  User steps:');
      lines.push('    1. Log into the hosting provider or FTP/SFTP account.');
      lines.push('    2. Open the web root path listed above.');
      lines.push('    3. Download a backup copy of the detected file before changing anything.');
      lines.push('    4. Let Flareless generate a patch/instructions, then review the diff.');
      lines.push('    5. Apply manually for now. Automatic apply should require credentials and explicit approval later.');
      lines.push('');
    });

    lines.push('RECOMMENDED PRODUCT RULE');
    lines.push('  Do not auto modify a host until all are true:');
    lines.push('    - host credentials are configured');
    lines.push('    - target file is detected');
    lines.push('    - backup is created');
    lines.push('    - diff is shown to the operator');
    lines.push('    - operator presses Apply');

    q('#setupRecommendationText').textContent = lines.join('\n');
  }

  function bindSettingsEvents() {
    q('#saveAgentSettingsBtn')?.addEventListener('click', async () => {
      const patch = {
        agent: {
          mode: q('#agentModeSelect').value,
          freeAgent: q('#freeAgentSelect').value,
          paidProvider: q('#paidProviderSelect').value,
          paidModel: q('#paidModelInput').value,
          apiKey: q('#agentApiKeyInput').value,
        },
      };
      await saveAppSettings(patch);
    });
    q('#clearAgentKeyBtn')?.addEventListener('click', async () => saveAppSettings({ agent: { clearApiKey: true } }));
    q('#saveServerBehaviorBtn')?.addEventListener('click', async () => saveAppSettings({ keepServerRunningAfterGuiClose: q('#keepServerSelect').value === 'true' }));
    q('#addHostedLocationBtn')?.addEventListener('click', async () => {
      appSettings.hosting.locations.push(locationFromInputs());
      await saveAppSettings({ hosting: appSettings.hosting });
    });
    q('#saveHostingBtn')?.addEventListener('click', async () => saveAppSettings({ hosting: { ...appSettings.hosting, safeApplyMode: q('#safeApplyModeSelect').value } }));
    q('#safeApplyModeSelect')?.addEventListener('change', async () => saveAppSettings({ hosting: { ...appSettings.hosting, safeApplyMode: q('#safeApplyModeSelect').value } }));
    q('#setupAgentRecommendationBtn')?.addEventListener('click', generateSetupRecommendation);
  }

  function renderAgentHostingPanel() {
    ensureSettingsPanel();
    if (!q('#agentHostingGrid')) return;
    syncControls();
    renderHostedLocations();
    generateSetupRecommendation();
  }

  async function start() {
    injectCss();
    renameApprovalsToAgents();
    ensureSettingsPanel();
    bindSettingsEvents();
    await loadAppSettings();
    renderAgentHostingPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

const providerState = {
  Cloudflare: { id: "Cloudflare", selector: "providerCloudflare", flow: "flowCloudflare", node: "nodeCloudflare", baseLatency: "19 ms", failedLatency: "timeout", reason: "PROVIDER_TIMEOUT" },
  Fastly: { id: "Fastly", selector: "providerFastly", flow: "flowFastly", node: "nodeFastly", baseLatency: "26 ms", failedLatency: "429", reason: "PROVIDER_HTTP_429" },
  CloudFront: { id: "CloudFront", selector: "providerCloudFront", flow: "flowCloudFront", node: "nodeCloudFront", baseLatency: "31 ms", failedLatency: "503", reason: "PROVIDER_HTTP_503" }
};

const state = {
  failedProvider: "",
  policyFormat: "yaml",
  incidentOpen: false,
  lastAction: "Control plane loaded"
};

const ui = {
  globalStatus: document.querySelector("#globalStatus"),
  bandwidthMetric: document.querySelector("#bandwidthMetric"),
  trafficMode: document.querySelector("#trafficMode"),
  outageBadge: document.querySelector("#outageBadge"),
  outageSelect: document.querySelector("#outageSelect"),
  applyOutage: document.querySelector("#applyOutage"),
  resetOutage: document.querySelector("#resetOutage"),
  approvalCount: document.querySelector("#approvalCount"),
  ticketTitle: document.querySelector("#ticketTitle"),
  ticketSeverity: document.querySelector("#ticketSeverity"),
  ticketSummary: document.querySelector("#ticketSummary"),
  beforeDiff: document.querySelector("#beforeDiff"),
  afterDiff: document.querySelector("#afterDiff"),
  approveTicket: document.querySelector("#approveTicket"),
  rejectTicket: document.querySelector("#rejectTicket"),
  testPolicy: document.querySelector("#testPolicy"),
  policyTestResult: document.querySelector("#policyTestResult"),
  policyCode: document.querySelector("#policyCode"),
  copyConfig: document.querySelector("#copyConfig"),
  auditLog: document.querySelector("#auditLog")
};

function render() {
  renderStatus();
  renderProviders();
  renderTicket();
  renderPolicyCode();
  renderAuditLog();
}

function renderStatus() {
  const hasFailure = state.failedProvider.length > 0;
  ui.globalStatus.textContent = hasFailure ? "Status: Rerouting" : "Status: Optimal";
  ui.globalStatus.className = hasFailure ? "status-pill warning" : "status-pill good";
  ui.bandwidthMetric.textContent = hasFailure ? "219.4 MB/s" : "226.0 MB/s";
  ui.trafficMode.textContent = hasFailure ? "Outage simulation active" : "Real time overview";

  ui.outageBadge.querySelector("strong").textContent = hasFailure ? `${state.failedProvider} degraded` : "None";
  ui.outageBadge.classList.toggle("has-outage", hasFailure);
}

function renderProviders() {
  for (const provider of Object.values(providerState)) {
    const failed = state.failedProvider === provider.id;
    const card = document.querySelector(`#${provider.selector}`);
    const flow = document.querySelector(`#${provider.flow}`);
    const node = document.querySelector(`#${provider.node}`);

    card.classList.toggle("is-failed", failed);
    card.querySelector(".provider-status").textContent = failed ? "Degraded" : "Online";
    card.querySelector(".provider-status").className = failed ? "provider-status warning" : "provider-status good";
    card.querySelector("b").textContent = failed ? provider.failedLatency : provider.baseLatency;

    flow.classList.toggle("is-failed", failed);
    node.classList.toggle("is-failed", failed);
  }

  document.querySelector("#flowPeer").classList.toggle("is-active", state.failedProvider.length > 0);
  document.querySelector("#providerPeer").classList.toggle("is-active", state.failedProvider.length > 0);
}

function renderTicket() {
  const hasFailure = state.failedProvider.length > 0;
  state.incidentOpen = hasFailure && state.lastAction !== "approved" && state.lastAction !== "rejected";

  ui.approvalCount.textContent = state.incidentOpen ? "1 pending" : "0 pending";
  ui.approvalCount.className = state.incidentOpen ? "small-pill warning" : "small-pill good";
  ui.approveTicket.disabled = !state.incidentOpen;
  ui.rejectTicket.disabled = !state.incidentOpen;

  if (!hasFailure) {
    ui.ticketTitle.textContent = "No active incident";
    ui.ticketSeverity.textContent = "Healthy";
    ui.ticketSeverity.className = "severity good";
    ui.ticketSummary.textContent = "All providers are within policy. Simulate an outage to generate an approval manifest.";
    ui.beforeDiff.textContent = "primary: Cloudflare\nfallback: Fastly\npeer: enabled";
    ui.afterDiff.textContent = "primary: Cloudflare\nfallback: Fastly\npeer: enabled";
    return;
  }

  if (state.lastAction === "approved") {
    ui.ticketTitle.textContent = "Policy change approved";
    ui.ticketSeverity.textContent = "Applied";
    ui.ticketSeverity.className = "severity good";
    ui.ticketSummary.textContent = `${state.failedProvider} is cooled down for this route class. Peer assist stays enabled and origin remains protected.`;
    return;
  }

  if (state.lastAction === "rejected") {
    ui.ticketTitle.textContent = "Recommendation rejected";
    ui.ticketSeverity.textContent = "Manual review";
    ui.ticketSeverity.className = "severity warning";
    ui.ticketSummary.textContent = "The agent recommendation was rejected. Routing simulation remains visible, but no policy change was applied.";
    return;
  }

  ui.ticketTitle.textContent = `${state.failedProvider} degradation detected`;
  ui.ticketSeverity.textContent = "Action requested";
  ui.ticketSeverity.className = "severity warning";
  ui.ticketSummary.textContent = `Agent recommendation: cool down ${state.failedProvider} for route:/video/*, retry the next CDN, and allow hash verified Micro CDN fallback before origin.`;
  ui.beforeDiff.textContent = `primary: ${state.failedProvider}\nfallback: next-cdn\npeer: enabled\norigin: blocked`;
  ui.afterDiff.textContent = `primary: next-healthy-cdn\ncooldown: ${state.failedProvider} 10m\npeer: hash-verified\norigin: blocked`;
}

function renderPolicyCode() {
  const policyObject = {
    policy: "video-public-peer-first",
    match: {
      status: document.querySelector("#conditionStatus").value,
      provider: document.querySelector("#conditionProvider").value
    },
    action: document.querySelector("#actionRoute").value,
    safeguards: {
      hashVerification: true,
      originFallback: false,
      operatorApproval: true
    }
  };

  ui.policyCode.textContent = state.policyFormat === "json" ? JSON.stringify(policyObject, null, 2) : toYaml(policyObject);
}

function toYaml(value, indent = 0) {
  const space = " ".repeat(indent);

  if (typeof value !== "object" || value === null) {
    return String(value);
  }

  return Object.entries(value).map(([key, item]) => {
    if (typeof item === "object" && item !== null) {
      return `${space}${key}:\n${toYaml(item, indent + 2)}`;
    }

    return `${space}${key}: ${item}`;
  }).join("\n");
}

function renderAuditLog() {
  const entries = createAuditEntries();
  ui.auditLog.replaceChildren();

  for (const entry of entries) {
    const item = document.createElement("li");
    item.innerHTML = `<span>${entry.time}</span><strong>${entry.title}</strong><p>${entry.body}</p>`;
    ui.auditLog.append(item);
  }
}

function createAuditEntries() {
  const base = [
    { time: "now", title: "Hash manifest verified", body: "Micro CDN peer response matched the signed manifest before delivery." },
    { time: "-01m", title: "Route health sampled", body: "Cloudflare, Fastly, and CloudFront normalized into a single route health model." },
    { time: "-03m", title: "Policy export ready", body: "Current rule builder state can be copied as JSON or YAML for GitOps review." }
  ];

  if (state.failedProvider.length > 0) {
    base.unshift({ time: "live", title: `${state.failedProvider} simulated outage`, body: `Traffic rerouted through healthy CDN paths and hash verified Micro CDN fallback.` });
  }

  if (state.lastAction === "approved") {
    base.unshift({ time: "live", title: "Operator approved recommendation", body: `Temporary cooldown applied for ${state.failedProvider}.` });
  }

  if (state.lastAction === "rejected") {
    base.unshift({ time: "live", title: "Operator rejected recommendation", body: "No route policy mutation was applied." });
  }

  return base.slice(0, 5);
}

function applyOutage() {
  const selected = ui.outageSelect.value;

  if (selected.length === 0) {
    ui.outageSelect.focus();
    return;
  }

  state.failedProvider = selected;
  state.lastAction = "outage";
  render();
}

function resetOutage() {
  state.failedProvider = "";
  state.lastAction = "Control plane reset";
  ui.outageSelect.value = "";
  ui.policyTestResult.textContent = "Not tested";
  ui.policyTestResult.className = "small-pill";
  render();
}

function approveTicket() {
  if (!state.incidentOpen) return;
  state.lastAction = "approved";
  render();
}

function rejectTicket() {
  if (!state.incidentOpen) return;
  state.lastAction = "rejected";
  render();
}

function testPolicy() {
  ui.policyTestResult.textContent = "Test passed";
  ui.policyTestResult.className = "small-pill good";
  state.lastAction = "Policy test passed";
  renderPolicyCode();
  renderAuditLog();
}

async function copyConfig() {
  const text = ui.policyCode.textContent;

  try {
    await navigator.clipboard.writeText(text);
    ui.copyConfig.textContent = "Copied";
  } catch {
    ui.copyConfig.textContent = "Select code below";
  }

  window.setTimeout(() => {
    ui.copyConfig.textContent = "Copy config";
  }, 1400);
}

function setPolicyFormat(format) {
  state.policyFormat = format;

  for (const button of document.querySelectorAll("[data-policy-format]")) {
    button.classList.toggle("is-active", button.dataset.policyFormat === format);
  }

  renderPolicyCode();
}

ui.applyOutage.addEventListener("click", applyOutage);
ui.resetOutage.addEventListener("click", resetOutage);
ui.approveTicket.addEventListener("click", approveTicket);
ui.rejectTicket.addEventListener("click", rejectTicket);
ui.testPolicy.addEventListener("click", testPolicy);
ui.copyConfig.addEventListener("click", copyConfig);

for (const select of document.querySelectorAll("#conditionStatus, #conditionProvider, #actionRoute")) {
  select.addEventListener("change", renderPolicyCode);
}

for (const button of document.querySelectorAll("[data-policy-format]")) {
  button.addEventListener("click", () => setPolicyFormat(button.dataset.policyFormat));
}

for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => {
    for (const navItem of document.querySelectorAll(".nav-item")) {
      navItem.classList.toggle("is-active", navItem === item);
    }
  });
}

render();

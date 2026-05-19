const HEARTBEAT_MS = 5000;
const SNAPSHOT_MS = 3000;
const SESSION_KEY = "flareless-demo-presence-session-id";
const POOL_KEY = "flareless-demo-pool-member";
const ENDPOINT_QUERY_KEY = "presence";

const endpoint = resolvePresenceEndpoint();
const snapshotEndpoint = resolveSnapshotEndpoint(endpoint);
const sessionId = getSessionId();
let poolMember = localStorage.getItem(POOL_KEY) === "true";

const style = document.createElement("style");
style.textContent = `
  .presence-card {
    display: grid;
    gap: 1rem;
  }

  .presence-topline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .presence-counts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .presence-count {
    display: grid;
    place-items: center;
    min-width: 5.5rem;
    min-height: 5.5rem;
    border-radius: 1.2rem;
    background: linear-gradient(180deg, rgba(102, 240, 194, 0.18), rgba(158, 178, 255, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  .presence-count strong {
    display: block;
    font-size: 2rem;
    line-height: 1;
  }

  .presence-count span {
    display: block;
    margin-top: 0.25rem;
    color: #c6cfdd;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .presence-copy p {
    margin-bottom: 0;
    color: #c6cfdd;
    line-height: 1.55;
  }

  .presence-status {
    display: inline-flex;
    width: fit-content;
    padding: 0.32rem 0.58rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: #dbe4ff;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .presence-status.online {
    background: rgba(63, 210, 142, 0.16);
    color: #9effce;
  }

  .presence-status.offline {
    background: rgba(255, 200, 87, 0.16);
    color: #ffe1a1;
  }

  .presence-actions {
    display: grid;
    gap: 0.7rem;
  }

  .presence-actions button {
    min-height: 2.85rem;
    text-align: center;
  }

  .presence-list {
    display: grid;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .presence-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.78rem 0.85rem;
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.055);
    border-left: 0.25rem solid rgba(102, 240, 194, 0.78);
  }

  .presence-list strong {
    display: block;
    font-size: 0.92rem;
  }

  .presence-list span {
    color: #aeb9ca;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: right;
  }

  .presence-note {
    margin: 0;
    color: #aeb9ca;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .presence-snapshot {
    padding: 0.85rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .presence-snapshot h3 {
    margin: 0 0 0.5rem;
    font-size: 0.92rem;
  }

  .presence-snapshot pre {
    max-height: 12rem;
    overflow: auto;
  }

  @media (min-width: 42rem) {
    .presence-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
document.head.append(style);

const card = document.createElement("section");
card.className = "card presence-card";
card.setAttribute("aria-live", "polite");
card.innerHTML = `
  <div class="presence-topline">
    <div class="presence-copy">
      <p id="presenceStatus" class="presence-status offline">Connecting</p>
      <h2>Live control plane</h2>
      <p>
        Browsers join the demo pool through the Flareless Worker. The Worker coordinates active viewers and candidate peer nodes, while the public snapshot is exposed as a micro CDN readable status artifact.
      </p>
    </div>
    <div class="presence-counts" aria-label="Demo control plane counts">
      <div class="presence-count">
        <strong id="presenceCount">1</strong>
        <span>viewers</span>
      </div>
      <div class="presence-count">
        <strong id="poolCount">0</strong>
        <span>pool</span>
      </div>
    </div>
  </div>
  <div class="presence-actions">
    <button id="joinPoolButton" type="button">Join demo pool</button>
    <button id="leavePoolButton" type="button">Leave demo pool</button>
  </div>
  <ul id="presenceList" class="presence-list"></ul>
  <div class="presence-snapshot">
    <h3>Micro CDN public snapshot</h3>
    <pre id="snapshotPreview">Waiting for snapshot route.</pre>
  </div>
  <p id="presenceNote" class="presence-note">
    Waiting for the presence endpoint.
  </p>
`;

const demoControls = document.querySelector("#demoControls");
if (demoControls !== null && demoControls.parentElement !== null) {
  demoControls.parentElement.insertBefore(card, demoControls);
}

const presenceStatus = document.querySelector("#presenceStatus");
const presenceCount = document.querySelector("#presenceCount");
const poolCount = document.querySelector("#poolCount");
const presenceList = document.querySelector("#presenceList");
const presenceNote = document.querySelector("#presenceNote");
const snapshotPreview = document.querySelector("#snapshotPreview");
const joinPoolButton = document.querySelector("#joinPoolButton");
const leavePoolButton = document.querySelector("#leavePoolButton");

joinPoolButton.addEventListener("click", () => {
  poolMember = true;
  localStorage.setItem(POOL_KEY, "true");
  updatePoolButtons();
  heartbeat();
});

leavePoolButton.addEventListener("click", () => {
  poolMember = false;
  localStorage.setItem(POOL_KEY, "false");
  updatePoolButtons();
  heartbeat();
});

updatePoolButtons();
heartbeat();
loadSnapshot();
setInterval(heartbeat, HEARTBEAT_MS);
setInterval(loadSnapshot, SNAPSHOT_MS);
window.addEventListener("beforeunload", leavePresence);

async function heartbeat() {
  if (endpoint === null) {
    renderOffline("No Worker endpoint configured. Add ?presence=https://your-worker.example.com/demo/presence or set window.FLARELESS_PRESENCE_ENDPOINT.");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sessionId: sessionId,
        label: createViewerLabel(),
        route: currentDemoRoute(),
        poolMember: poolMember
      })
    });

    if (response.ok !== true) {
      renderOffline(`Presence endpoint returned HTTP ${response.status}.`);
      return;
    }

    const snapshot = await response.json();
    renderSnapshot(snapshot);
  } catch (error) {
    renderOffline("Presence endpoint is not reachable from this page yet.");
  }
}

async function loadSnapshot() {
  if (snapshotEndpoint === null) {
    snapshotPreview.textContent = "No snapshot endpoint configured yet.";
    return;
  }

  try {
    const response = await fetch(snapshotEndpoint, {
      cache: "no-store"
    });

    if (response.ok !== true) {
      snapshotPreview.textContent = `Snapshot route returned HTTP ${response.status}.`;
      return;
    }

    const snapshot = await response.json();
    snapshotPreview.textContent = JSON.stringify({
      protocol: snapshot.protocol,
      route: snapshot.route,
      viewerCount: snapshot.viewerCount,
      poolMemberCount: snapshot.poolMemberCount,
      cachePolicy: snapshot.cachePolicy,
      serverTime: snapshot.serverTime
    }, null, 2);
  } catch (error) {
    snapshotPreview.textContent = "Snapshot route is not reachable yet.";
  }
}

function renderSnapshot(snapshot) {
  const viewers = Array.isArray(snapshot.viewers) ? snapshot.viewers : [];
  presenceStatus.textContent = "Live";
  presenceStatus.className = "presence-status online";
  presenceCount.textContent = String(snapshot.viewerCount || viewers.length || 1);
  poolCount.textContent = String(snapshot.poolMemberCount || 0);
  presenceNote.textContent = `Endpoint: ${endpoint}. Snapshot route: ${snapshotEndpoint || "not configured"}. Active sessions expire after ${Math.round((snapshot.ttlMs || 15000) / 1000)} seconds without a heartbeat.`;
  presenceList.replaceChildren();

  for (const viewer of viewers) {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    const status = document.createElement("span");

    label.textContent = viewer.sessionId === sessionId ? `${viewer.label} (this tab)` : viewer.label;
    status.textContent = `${viewer.poolMember ? "pool member" : "viewer"} · ${viewer.route} · ${viewer.secondsAgo}s ago`;
    item.append(label, status);
    presenceList.append(item);
  }
}

function renderOffline(message) {
  presenceStatus.textContent = "Setup needed";
  presenceStatus.className = "presence-status offline";
  presenceCount.textContent = "1";
  poolCount.textContent = poolMember ? "1" : "0";
  presenceNote.textContent = message;
  presenceList.replaceChildren();

  const item = document.createElement("li");
  const label = document.createElement("strong");
  const status = document.createElement("span");

  label.textContent = `${createViewerLabel()} (this tab)`;
  status.textContent = poolMember ? "local pool member" : "local only";
  item.append(label, status);
  presenceList.append(item);
}

function updatePoolButtons() {
  joinPoolButton.disabled = poolMember;
  leavePoolButton.disabled = !poolMember;
  joinPoolButton.textContent = poolMember ? "In demo pool" : "Join demo pool";
}

function resolvePresenceEndpoint() {
  const queryValue = new URLSearchParams(window.location.search).get(ENDPOINT_QUERY_KEY);

  if (queryValue !== null && queryValue.trim().length > 0) {
    return normalizeEndpoint(queryValue);
  }

  if (typeof window.FLARELESS_PRESENCE_ENDPOINT === "string" && window.FLARELESS_PRESENCE_ENDPOINT.trim().length > 0) {
    return normalizeEndpoint(window.FLARELESS_PRESENCE_ENDPOINT);
  }

  if (window.location.hostname.endsWith("github.io")) {
    return null;
  }

  return `${window.location.origin}/demo/presence`;
}

function resolveSnapshotEndpoint(presenceEndpoint) {
  if (presenceEndpoint === null) {
    return null;
  }

  const url = new URL(presenceEndpoint);
  url.pathname = "/demo/presence-snapshot.json";
  url.search = "";
  return url.toString();
}

function normalizeEndpoint(value) {
  const url = new URL(value, window.location.href);
  return url.toString();
}

function getSessionId() {
  const existing = sessionStorage.getItem(SESSION_KEY);

  if (existing !== null) {
    return existing;
  }

  const next = createId();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createViewerLabel() {
  if (/iphone|android|mobile/i.test(navigator.userAgent)) {
    return "Phone viewer";
  }

  if (/ipad|tablet/i.test(navigator.userAgent)) {
    return "Tablet viewer";
  }

  if (/mac|win|linux/i.test(navigator.platform)) {
    return "Desktop viewer";
  }

  return "Browser viewer";
}

function currentDemoRoute() {
  const activeButton = document.querySelector("button[data-scenario].is-active");

  if (activeButton !== null) {
    return activeButton.textContent.trim();
  }

  return "demo open";
}

function leavePresence() {
  if (endpoint === null) {
    return;
  }

  const url = new URL(endpoint);
  url.searchParams.set("sessionId", sessionId);

  fetch(url.toString(), {
    method: "DELETE",
    keepalive: true
  }).catch(() => {});
}

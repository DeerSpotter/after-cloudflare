const HEARTBEAT_MS = 5000;
const SNAPSHOT_MS = 3000;
const BUFFER_TICK_MS = 450;
const SESSION_KEY = "flareless-demo-presence-session-id";
const ENDPOINT_QUERY_KEY = "presence";

const endpoint = resolvePresenceEndpoint();
const snapshotEndpoint = resolveSnapshotEndpoint(endpoint);
const sessionId = getSessionId();
let poolMember = false;
let demoRunning = false;
let playbackStarted = false;
let simulatedPeerCount = 0;
let bufferLevel = 0;
let storyStatus = "Press play to join the demo pool and start finding peer help.";
let realViewerCount = 1;
let realPoolCount = 0;
let bufferTimer = null;
let storyTimers = [];

const style = document.createElement("style");
style.textContent = `
  .presence-card {
    display: grid;
    gap: 1rem;
    overflow: hidden;
  }

  .presence-topline {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: 1rem;
  }

  .presence-copy {
    min-width: 0;
  }

  .presence-counts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    width: min(13rem, 100%);
    max-width: 100%;
  }

  .presence-count {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 5.5rem;
    border-radius: 1.2rem;
    background: linear-gradient(180deg, rgba(102, 240, 194, 0.18), rgba(158, 178, 255, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  .presence-count strong {
    display: block;
    max-width: 100%;
    font-size: clamp(1.45rem, 9vw, 2rem);
    line-height: 1;
    overflow-wrap: anywhere;
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
    max-width: 100%;
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

  .presence-actions button.is-active {
    outline: 2px solid #66f0c2;
    outline-offset: 0.18rem;
    background: linear-gradient(180deg, #ffffff 0%, #dbe4ff 100%);
  }

  .playback-demo {
    display: grid;
    gap: 0.85rem;
    padding: 0.9rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .playback-stage {
    width: 100%;
    min-height: 15rem;
    border-radius: 1rem;
    background: radial-gradient(circle at center, rgba(102, 240, 194, 0.13), rgba(8, 11, 18, 0.4));
    overflow: hidden;
  }

  .playback-stage svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .svg-node {
    fill: rgba(245, 247, 251, 0.95);
    stroke: rgba(102, 240, 194, 0.85);
    stroke-width: 3;
  }

  .svg-node-muted {
    fill: rgba(245, 247, 251, 0.2);
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 2;
  }

  .svg-line {
    stroke: rgba(102, 240, 194, 0.72);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-dasharray: 12 10;
    animation: peerFlow 1.2s linear infinite;
  }

  .svg-line-muted {
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .svg-text-main {
    fill: #07101f;
    font-size: 13px;
    font-weight: 900;
    text-anchor: middle;
  }

  .svg-text-soft {
    fill: #dbe4ff;
    font-size: 13px;
    font-weight: 800;
    text-anchor: middle;
  }

  .buffer-shell {
    height: 1rem;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.11);
  }

  .buffer-fill {
    width: 0%;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(255, 200, 87, 0.9), rgba(102, 240, 194, 0.95));
    transition: width 0.28s ease;
  }

  .story-status {
    margin: 0;
    color: #dbe4ff;
    font-weight: 800;
    line-height: 1.45;
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
    min-width: 0;
    padding: 0.78rem 0.85rem;
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.055);
    border-left: 0.25rem solid rgba(102, 240, 194, 0.78);
  }

  .presence-list strong {
    display: block;
    min-width: 0;
    font-size: 0.92rem;
    overflow-wrap: anywhere;
  }

  .presence-list span {
    flex: 0 1 auto;
    min-width: 0;
    color: #aeb9ca;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .presence-note {
    margin: 0;
    color: #aeb9ca;
    font-size: 0.82rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .presence-snapshot {
    min-width: 0;
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

  @keyframes peerFlow {
    to {
      stroke-dashoffset: -22;
    }
  }

  @media (min-width: 42rem) {
    .presence-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 41.99rem) {
    .presence-topline {
      grid-template-columns: 1fr;
    }

    .presence-counts {
      width: 100%;
    }

    .presence-count {
      min-height: 4.8rem;
      border-radius: 1rem;
    }

    .presence-list li {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .presence-list span {
      text-align: left;
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
        Press play to show how a browser joins the pool, waits for peer help, starts playback, and fills the buffer faster as more peers appear.
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
    <button id="playDemoButton" type="button">▶ Play pool demo</button>
    <button id="resetDemoButton" type="button">Reset demo</button>
  </div>
  <div class="playback-demo">
    <div class="playback-stage" aria-label="Peer pool playback animation">
      <svg id="poolSvg" viewBox="0 0 420 260" role="img">
        <rect x="24" y="32" width="148" height="88" rx="18" fill="rgba(245,247,251,0.08)" stroke="rgba(255,255,255,0.18)" />
        <text x="98" y="68" class="svg-text-soft">Viewer</text>
        <text x="98" y="94" class="svg-text-soft">presses play</text>
        <line id="lineA" x1="172" y1="76" x2="252" y2="76" class="svg-line-muted" />
        <line id="lineB" x1="174" y1="116" x2="252" y2="160" class="svg-line-muted" />
        <line id="lineC" x1="174" y1="44" x2="252" y2="26" class="svg-line-muted" />
        <circle id="peerA" cx="292" cy="76" r="38" class="svg-node-muted" />
        <text x="292" y="72" class="svg-text-main">Peer 1</text>
        <text x="292" y="91" class="svg-text-main">waiting</text>
        <circle id="peerB" cx="318" cy="166" r="38" class="svg-node-muted" />
        <text x="318" y="162" class="svg-text-main">Peer 2</text>
        <text x="318" y="181" class="svg-text-main">waiting</text>
        <circle id="peerC" cx="318" cy="26" r="38" class="svg-node-muted" />
        <text x="318" y="22" class="svg-text-main">Peer 3</text>
        <text x="318" y="41" class="svg-text-main">waiting</text>
        <rect x="68" y="188" width="284" height="34" rx="17" fill="rgba(255,255,255,0.11)" />
        <rect id="svgBuffer" x="68" y="188" width="0" height="34" rx="17" fill="rgba(102,240,194,0.88)" />
        <text id="svgPlaybackText" x="210" y="211" class="svg-text-soft">buffer empty</text>
      </svg>
    </div>
    <div class="buffer-shell"><div id="bufferFill" class="buffer-fill"></div></div>
    <p id="storyStatus" class="story-status">Press play to join the demo pool.</p>
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
const playDemoButton = document.querySelector("#playDemoButton");
const resetDemoButton = document.querySelector("#resetDemoButton");
const bufferFill = document.querySelector("#bufferFill");
const storyStatusElement = document.querySelector("#storyStatus");
const svgBuffer = document.querySelector("#svgBuffer");
const svgPlaybackText = document.querySelector("#svgPlaybackText");
const peerA = document.querySelector("#peerA");
const peerB = document.querySelector("#peerB");
const peerC = document.querySelector("#peerC");
const lineA = document.querySelector("#lineA");
const lineB = document.querySelector("#lineB");
const lineC = document.querySelector("#lineC");

playDemoButton.addEventListener("click", startPlaybackStory);
resetDemoButton.addEventListener("click", resetPlaybackStory);

renderPlaybackStory();
heartbeat();
loadSnapshot();
setInterval(heartbeat, HEARTBEAT_MS);
setInterval(loadSnapshot, SNAPSHOT_MS);
window.addEventListener("beforeunload", leavePresence);

function startPlaybackStory() {
  resetStoryTimers();
  demoRunning = true;
  playbackStarted = false;
  poolMember = true;
  simulatedPeerCount = 0;
  bufferLevel = 4;
  storyStatus = "You joined the pool. Waiting for another browser that can help.";
  playDemoButton.classList.add("is-active");
  renderPlaybackStory();
  heartbeat();

  storyTimers.push(setTimeout(() => {
    simulatedPeerCount = 1;
    storyStatus = "A second viewer appears in the pool. Playback can start from the peer path.";
    playbackStarted = true;
    renderPlaybackStory();
  }, 1300));

  storyTimers.push(setTimeout(() => {
    simulatedPeerCount = 2;
    storyStatus = "A third viewer appears. The buffer fills faster because more peer paths are available.";
    renderPlaybackStory();
  }, 3300));

  if (bufferTimer !== null) {
    clearInterval(bufferTimer);
  }

  bufferTimer = setInterval(() => {
    if (demoRunning !== true) {
      return;
    }

    const gain = playbackStarted ? 5 + (simulatedPeerCount * 6) : 2;
    bufferLevel = Math.min(100, bufferLevel + gain);

    if (bufferLevel >= 100) {
      storyStatus = "Buffer full. Flareless found peer help and reduced pressure on the normal content path.";
      clearInterval(bufferTimer);
      bufferTimer = null;
    }

    renderPlaybackStory();
  }, BUFFER_TICK_MS);
}

function resetPlaybackStory() {
  resetStoryTimers();
  demoRunning = false;
  playbackStarted = false;
  poolMember = false;
  simulatedPeerCount = 0;
  bufferLevel = 0;
  storyStatus = "Press play to join the demo pool and start finding peer help.";
  playDemoButton.classList.remove("is-active");
  renderPlaybackStory();
  heartbeat();
}

function resetStoryTimers() {
  for (const timer of storyTimers) {
    clearTimeout(timer);
  }

  storyTimers = [];

  if (bufferTimer !== null) {
    clearInterval(bufferTimer);
    bufferTimer = null;
  }
}

function renderPlaybackStory() {
  const visibleViewers = Math.max(realViewerCount, 1 + simulatedPeerCount);
  const visiblePool = Math.max(realPoolCount, poolMember ? 1 + simulatedPeerCount : 0);

  presenceCount.textContent = String(visibleViewers);
  poolCount.textContent = String(visiblePool);
  bufferFill.style.width = `${bufferLevel}%`;
  svgBuffer.setAttribute("width", String(Math.round(284 * bufferLevel / 100)));
  svgPlaybackText.textContent = playbackStarted ? `${Math.round(bufferLevel)}% buffered` : bufferLevel > 0 ? "finding peers" : "buffer empty";
  storyStatusElement.textContent = storyStatus;

  setPeerState(peerA, lineA, simulatedPeerCount >= 1);
  setPeerState(peerB, lineB, simulatedPeerCount >= 2);
  setPeerState(peerC, lineC, simulatedPeerCount >= 3);
}

function setPeerState(node, line, isActive) {
  node.setAttribute("class", isActive ? "svg-node" : "svg-node-muted");
  line.setAttribute("class", isActive ? "svg-line" : "svg-line-muted");
}

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
  realViewerCount = snapshot.viewerCount || viewers.length || 1;
  realPoolCount = snapshot.poolMemberCount || 0;
  presenceStatus.textContent = "Live";
  presenceStatus.className = "presence-status online";
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

  renderPlaybackStory();
}

function renderOffline(message) {
  realViewerCount = 1;
  realPoolCount = poolMember ? 1 : 0;
  presenceStatus.textContent = "Setup needed";
  presenceStatus.className = "presence-status offline";
  presenceNote.textContent = message;
  presenceList.replaceChildren();

  const item = document.createElement("li");
  const label = document.createElement("strong");
  const status = document.createElement("span");

  label.textContent = `${createViewerLabel()} (this tab)`;
  status.textContent = poolMember ? "local pool demo running" : "local only";
  item.append(label, status);
  presenceList.append(item);
  renderPlaybackStory();
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

  return playbackStarted ? "pool playback demo" : "demo open";
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

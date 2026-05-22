const scenarios = {
  normal: scenario("Delivered", "success", "The primary CDN answers successfully, so Flareless does not spend time trying backup routes.", [["cdn-a", "PROVIDER_SUCCESS"]], "PRIMARY_PROVIDER_SUCCESS"),
  timeout: scenario("Delivered after timeout failover", "success", "The first CDN misses its timeout deadline. Flareless records the timeout for this route and chunk, then immediately tries the next provider.", [["cdn-a", "PROVIDER_TIMEOUT", "Deadline exceeded after 1200 ms"], ["cdn-b", "PROVIDER_SUCCESS"]], "PROVIDER_TIMEOUT_FAILOVER"),
  http403: scenario("Delivered after HTTP failover", "success", "The first CDN responds with a failure status. Flareless treats that status as a bad route result and tries the next CDN.", [["cdn-a", "PROVIDER_HTTP_403", "Provider rejected the request"], ["cdn-b", "PROVIDER_SUCCESS"]], "PROVIDER_STATUS_FAILOVER"),
  allCdnFailPeerSuccess: scenario("Delivered from peer layer", "success", "Every CDN route fails, so Flareless moves to the peer assisted layer. The peer layer returns a hash verified public chunk.", [["cdn-a", "PROVIDER_TIMEOUT"], ["cdn-b", "PROVIDER_HTTP_500"], ["cdn-c", "PROVIDER_HTTP_429"], ["peer-assisted-edge", "PEER_SUCCESS", "Hash verified chunk returned"]], "ALL_CDNS_FAILED_PEER_SUCCESS"),
  agentAssistedControl: {
    label: "Agent suggestion ready",
    statusClass: "success",
    explanation: "The fast route layer still makes the delivery decision. The agent assist layer watches the result, explains why the route was slow, and recommends a bounded temporary policy change.",
    attempts: [
      attempt("cdn-a", "PROVIDER_TIMEOUT", "Primary CDN missed the 800 ms target for this chunk."),
      attempt("cdn-b", "PROVIDER_HTTP_429", "Backup CDN is rate limiting this route."),
      attempt("cdn-c", "PROVIDER_HTTP_500", "Third CDN returned a server failure."),
      attempt("peer-assisted-edge", "PEER_SUCCESS", "Peer assisted layer returned a hash verified public chunk."),
      attempt("agent-assist", "POLICY_RECOMMENDATION_READY", "Recommend temporary CDN A cooldown, peer first retry, and 1400 ms timeout profile for this route class.")
    ],
    headers: headersFor("peer-assisted-edge", "demo-agent-assisted-route", "video-public-peer-first", "AGENT_ASSISTED_POLICY_RECOMMENDATION", "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_HTTP_429,cdn-c:PROVIDER_HTTP_500,peer-assisted-edge:PEER_SUCCESS,agent-assist:POLICY_RECOMMENDATION_READY", { "x-flareless-agent-mode": "observe-and-recommend", "x-flareless-agent-recommendation": "temporary-route-policy-update" }),
    agent: {
      mode: "Observe and recommend",
      summary: "Agent assist reviewed the failed CDN chain and found that the content was still recovered through the peer layer. It does not replace the router. It explains the failure and proposes a limited policy change that a developer can review or apply in simulation.",
      steps: [
        "Observed CDN A timeout on the current video route and chunk class.",
        "Observed CDN B rate limiting and CDN C server failure.",
        "Confirmed peer assisted delivery succeeded with hash verification.",
        "Recommended a temporary route scoped cooldown instead of a global provider ban."
      ],
      recommendation: "Suggested policy: lower CDN A priority for this route for 10 minutes, keep peer assisted delivery enabled for public video chunks, and use a 1400 ms timeout profile for this chunk class before retrying the simulation."
    }
  },
  peerFailOriginBlocked: scenario("Blocked before origin", "blocked", "The CDNs fail and the peer layer does not have the file. The route policy blocks origin fallback, so the request stops before origin storage.", [["cdn-a", "PROVIDER_TIMEOUT"], ["cdn-b", "PROVIDER_HTTP_500"], ["peer-assisted-edge", "PEER_MISS"], ["origin", "ORIGIN_FALLBACK_NOT_ALLOWED", "Route policy blocks origin fallback"]], "ORIGIN_FALLBACK_NOT_ALLOWED", "none"),
  peerFailOriginAllowed: scenario("Delivered from origin fallback", "success", "The CDNs fail and the peer layer misses, but this route allows origin fallback as a controlled last resort.", [["cdn-a", "PROVIDER_TIMEOUT"], ["cdn-b", "PROVIDER_HTTP_500"], ["peer-assisted-edge", "PEER_MISS"], ["origin", "ORIGIN_SUCCESS", "Route policy allows origin fallback"]], "ORIGIN_FALLBACK_SUCCESS", "origin", "origin-fallback-allowed"),
  routeScopedHealth: scenario("Route isolation verified", "success", "A CDN failure on one route does not poison unrelated routes. Health stays scoped to the affected route.", [["cdn-a", "PROVIDER_BLOCKED_451", "Failure recorded only for route:/video/show-a/v1."], ["cdn-b", "PROVIDER_SUCCESS", "Same route moves to the next healthy provider."], ["cdn-a", "PROVIDER_SUCCESS", "Unrelated route:/assets still starts on the primary provider."]], "ROUTE_SCOPED_HEALTH_ISOLATION", "cdn-a", "default-public-static"),
  chunkScopedHealth: scenario("Chunk isolation verified", "success", "A CDN failure on one exact video chunk can move that chunk to CDN B without forcing the sibling chunk away from CDN A.", [["cdn-a", "PROVIDER_BLOCKED_451", "Failure recorded for chunk:/video/show-a/v1/chunk-0001.m4s."], ["cdn-b", "PROVIDER_SUCCESS", "The failed chunk is routed to the backup provider."], ["cdn-a", "PROVIDER_SUCCESS", "Sibling chunk still starts on the primary provider."]], "CHUNK_SCOPED_HEALTH_ISOLATION"),
  videoPolicyPeerFallback: scenario("Peer fallback allowed", "success", "The video route policy allows peer fallback and blocks origin fallback. When all CDN providers fail, this route moves to the peer assisted layer.", [["cdn-a", "PROVIDER_HTTP_503"], ["cdn-b", "PROVIDER_HTTP_503"], ["cdn-c", "PROVIDER_HTTP_503"], ["peer-assisted-edge", "PEER_FALLBACK_ALLOWED", "Policy video-public-peer-first allows peer fallback."]], "PEER_FALLBACK_ALLOWED", "peer-assisted-edge"),
  privatePolicyBlocked: scenario("Fallback blocked by policy", "blocked", "The private route policy blocks both peer fallback and origin fallback. If CDN providers fail, the request stops with a policy blocked response.", [["cdn-a", "PROVIDER_HTTP_503"], ["cdn-b", "PROVIDER_HTTP_503"], ["route-policy", "FALLBACK_BLOCKED_BY_POLICY", "Policy private-no-fallback blocks peer and origin fallback."]], "FALLBACK_BLOCKED_BY_POLICY", "none", "private-no-fallback"),
  originPolicyAllowed: scenario("Origin fallback allowed", "success", "The origin allowed route policy blocks peer fallback but allows origin fallback. This is for routes where origin is an acceptable last resort.", [["cdn-a", "PROVIDER_HTTP_503"], ["cdn-b", "PROVIDER_HTTP_503"], ["peer-assisted-edge", "PEER_FALLBACK_NOT_ALLOWED", "Policy origin-fallback-allowed skips peer fallback."], ["origin", "ORIGIN_SUCCESS", "Policy origin-fallback-allowed allows origin fallback."]], "ORIGIN_FALLBACK_SUCCESS", "origin", "origin-fallback-allowed")
};

const peerScenarioKeys = new Set(["allCdnFailPeerSuccess", "agentAssistedControl", "peerFailOriginBlocked", "peerFailOriginAllowed", "videoPolicyPeerFallback"]);
const timeline = document.querySelector("#timeline");
const headers = document.querySelector("#headers");
const statusPill = document.querySelector("#statusPill");
const scenarioExplanation = document.querySelector("#scenarioExplanation");
const routingResult = document.querySelector("#routingResult");
const demoControls = document.querySelector("#demoControls");
const demoControlsToggle = document.querySelector("#demoControlsToggle");
const demoControlsSymbol = document.querySelector("#demoControlsSymbol");
const demoChoices = document.querySelector("#demoChoices");
const peerSection = document.querySelector("#peerSection");
const agentSection = document.querySelector("#agentSection");
const agentMode = document.querySelector("#agentMode");
const agentSummary = document.querySelector("#agentSummary");
const agentSteps = document.querySelector("#agentSteps");
const agentRecommendation = document.querySelector("#agentRecommendation");
const buttons = document.querySelectorAll("button[data-scenario]");
let previousScrollY = window.pageYOffset;
let upwardScrollTotal = 0;
let activeScenarioKey = "timeout";

function attempt(provider, result, detail) {
  return { provider, result, detail };
}

function scenario(label, statusClass, explanation, rows, reason, provider = "cdn-b", policy = "video-public-peer-first") {
  const attempts = rows.map((row) => attempt(row[0], row[1], row[2]));
  return {
    label,
    statusClass,
    explanation,
    attempts,
    headers: headersFor(provider, `demo-${reason.toLowerCase().replaceAll("_", "-")}`, policy, reason, rows.map((row) => `${row[0]}:${row[1]}`).join(","))
  };
}

function headersFor(provider, routeId, policy, reason, attempts, extra = {}) {
  return {
    "x-flareless-provider": provider,
    "x-flareless-route-id": routeId,
    "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
    "x-flareless-policy-id": policy,
    "x-flareless-reason": reason,
    "x-flareless-attempts": attempts,
    ...extra
  };
}

function renderScenario(scenarioKey) {
  const scenarioData = scenarios[scenarioKey];

  if (scenarioData === undefined) {
    return;
  }

  activeScenarioKey = scenarioKey;
  timeline.replaceChildren();

  for (const item of scenarioData.attempts) {
    timeline.append(createTimelineItem(item.provider, item.result, item.detail));
  }

  statusPill.textContent = scenarioData.label;
  statusPill.className = `status-pill ${scenarioData.statusClass}`;
  headers.textContent = formatHeaders(scenarioData.headers);
  scenarioExplanation.textContent = scenarioData.explanation;
  setPeerSectionVisible(peerScenarioKeys.has(scenarioKey));
  renderAgentSection(scenarioData.agent);
  setActiveButton(scenarioKey);
}

function createTimelineItem(providerText, resultText, detailText) {
  const item = document.createElement("li");
  item.className = resultClass(resultText);

  const provider = document.createElement("strong");
  provider.textContent = providerText;

  const result = document.createElement("span");
  result.textContent = resultText;

  item.append(provider, result);

  if (detailText) {
    const detail = document.createElement("p");
    detail.textContent = detailText;
    item.append(detail);
  }

  return item;
}

function renderAgentSection(agent) {
  const hasAgent = agent !== undefined;
  agentSection.hidden = !hasAgent;
  agentSection.classList.toggle("is-hidden", !hasAgent);

  if (!hasAgent) {
    return;
  }

  agentMode.textContent = agent.mode;
  agentSummary.textContent = agent.summary;
  agentRecommendation.textContent = agent.recommendation;
  agentSteps.replaceChildren();

  for (const step of agent.steps) {
    const item = document.createElement("li");
    item.textContent = step;
    agentSteps.append(item);
  }
}

function setPeerSectionVisible(isVisible) {
  peerSection.hidden = !isVisible;
  peerSection.classList.toggle("is-hidden", !isVisible);
}

function setControlsOpen(isOpen) {
  demoControls.classList.toggle("is-open", isOpen);
  demoControls.classList.toggle("is-collapsed", !isOpen);
  demoControlsToggle.setAttribute("aria-expanded", String(isOpen));
  demoControlsToggle.setAttribute("aria-label", isOpen ? "Collapse demo choices" : "Expand demo choices");
  demoControlsSymbol.textContent = isOpen ? "▾" : "▸";
  demoChoices.hidden = !isOpen;
}

function setActiveButton(scenarioKey) {
  for (const button of buttons) {
    const isActive = button.dataset.scenario === scenarioKey;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function scrollToRoutingResult() {
  routingResult.focus({ preventScroll: true });
  window.location.hash = "routingResult";

  setTimeout(() => {
    const resultTop = routingResult.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo(0, Math.max(resultTop - 16, 0));
  }, 0);
}

function resultClass(result) {
  if (result.includes("SUCCESS") || result.includes("ALLOWED") || result.includes("RECOMMENDATION_READY")) {
    return "success-line";
  }

  if (result.includes("NOT_ALLOWED") || result.includes("BLOCKED")) {
    return "blocked-line";
  }

  return "fail-line";
}

function formatHeaders(headerMap) {
  return Object.entries(headerMap).map(([key, value]) => `${key}: ${value}`).join("\n");
}

for (const button of buttons) {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    renderScenario(button.dataset.scenario);
    setControlsOpen(false);
    scrollToRoutingResult();
  });
}

demoControlsToggle.addEventListener("click", () => {
  setControlsOpen(!demoControls.classList.contains("is-open"));
});

window.addEventListener("scroll", () => {
  const currentScrollY = window.pageYOffset;
  const delta = previousScrollY - currentScrollY;

  if (delta > 0) {
    upwardScrollTotal += delta;
  } else if (delta < 0) {
    upwardScrollTotal = 0;
  }

  if (currentScrollY < 420 || upwardScrollTotal > 90) {
    setControlsOpen(true);
    upwardScrollTotal = 0;
  }

  previousScrollY = currentScrollY;
}, { passive: true });

setControlsOpen(true);
renderScenario("timeout");

const scenarios = {
  normal: {
    label: "Delivered",
    statusClass: "success",
    explanation: "The primary CDN answers successfully, so Flareless does not spend time trying backup routes. This is the clean path where the first healthy provider wins and the response headers explain that no failover was needed.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_SUCCESS" }
    ],
    headers: {
      "x-flareless-provider": "cdn-a",
      "x-flareless-route-id": "demo-normal-route",
      "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "PRIMARY_PROVIDER_SUCCESS",
      "x-flareless-attempts": "cdn-a:PROVIDER_SUCCESS"
    }
  },
  timeout: {
    label: "Delivered after timeout failover",
    statusClass: "success",
    explanation: "The first CDN does not answer before its timeout deadline. Flareless records that timeout against this route and chunk, then immediately tries the next provider. The second CDN succeeds, so this route recovers without forcing unrelated routes away from CDN A.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_TIMEOUT", detail: "Deadline exceeded after 1200 ms" },
      { provider: "cdn-b", result: "PROVIDER_SUCCESS" }
    ],
    headers: {
      "x-flareless-provider": "cdn-b",
      "x-flareless-route-id": "demo-timeout-route",
      "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "PROVIDER_TIMEOUT_FAILOVER",
      "x-flareless-attempts": "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_SUCCESS"
    }
  },
  http403: {
    label: "Delivered after HTTP failover",
    statusClass: "success",
    explanation: "The first CDN responds, but it responds with a failure status instead of the content. Flareless treats that status as a bad route and tries the next CDN. The second CDN succeeds, which proves the system can route around provider blocks, bad cache states, rate limits, and server errors.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_HTTP_403", detail: "Provider rejected the request" },
      { provider: "cdn-b", result: "PROVIDER_SUCCESS" }
    ],
    headers: {
      "x-flareless-provider": "cdn-b",
      "x-flareless-route-id": "demo-http-route",
      "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "PROVIDER_STATUS_FAILOVER",
      "x-flareless-attempts": "cdn-a:PROVIDER_HTTP_403,cdn-b:PROVIDER_SUCCESS"
    }
  },
  allCdnFailPeerSuccess: {
    label: "Delivered from peer layer",
    statusClass: "success",
    explanation: "Every CDN route fails, so Flareless moves to the peer assisted layer. The peer layer finds the requested public chunk and verifies it by hash before serving it. This shows how approved public content could still be reachable when the normal CDN paths are down.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_500" },
      { provider: "cdn-c", result: "PROVIDER_HTTP_429" },
      { provider: "peer-assisted-edge", result: "PEER_SUCCESS", detail: "Hash verified chunk returned" }
    ],
    headers: {
      "x-flareless-provider": "peer-assisted-edge",
      "x-flareless-route-id": "demo-peer-route",
      "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "ALL_CDNS_FAILED_PEER_SUCCESS",
      "x-flareless-attempts": "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_HTTP_500,cdn-c:PROVIDER_HTTP_429,peer-assisted-edge:PEER_SUCCESS"
    }
  },
  peerFailOriginBlocked: {
    label: "Blocked before origin",
    statusClass: "blocked",
    explanation: "The CDNs fail and the peer layer does not have the file. Flareless then checks the route policy before touching origin storage. In this test, origin fallback is not allowed, so the request stops there. This protects the origin from surprise traffic spikes and keeps expensive emergency fallback under explicit control.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_500" },
      { provider: "peer-assisted-edge", result: "PEER_MISS" },
      { provider: "origin", result: "ORIGIN_FALLBACK_NOT_ALLOWED", detail: "Route policy blocks origin fallback" }
    ],
    headers: {
      "x-flareless-provider": "none",
      "x-flareless-route-id": "demo-origin-blocked-route",
      "x-flareless-route-key": "route:/video/show-name/episode-001/v17/720p",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "ORIGIN_FALLBACK_NOT_ALLOWED",
      "x-flareless-attempts": "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_HTTP_500,peer-assisted-edge:PEER_MISS,origin:ORIGIN_FALLBACK_NOT_ALLOWED"
    }
  },
  peerFailOriginAllowed: {
    label: "Delivered from origin fallback",
    statusClass: "success",
    explanation: "The CDNs fail and the peer layer misses, but this route allows origin fallback. Flareless sends the request to origin only after the cheaper and more resilient paths have failed. This keeps the site available while still making origin access a controlled last resort.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_500" },
      { provider: "peer-assisted-edge", result: "PEER_MISS" },
      { provider: "origin", result: "ORIGIN_SUCCESS", detail: "Route policy allows origin fallback" }
    ],
    headers: {
      "x-flareless-provider": "origin",
      "x-flareless-route-id": "demo-origin-allowed-route",
      "x-flareless-route-key": "route:/origin-allowed",
      "x-flareless-policy-id": "origin-fallback-allowed",
      "x-flareless-reason": "ORIGIN_FALLBACK_SUCCESS",
      "x-flareless-attempts": "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_HTTP_500,peer-assisted-edge:PEER_MISS,origin:ORIGIN_SUCCESS"
    }
  },
  routeScopedHealth: {
    label: "Route isolation verified",
    statusClass: "success",
    explanation: "CDN A fails for one video route, the next request on that same route starts on CDN B, and an unrelated asset route still starts on CDN A. This shows Flareless is not one shared failover switch where a single failure poisons every path.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_BLOCKED_451", detail: "Failure recorded only for route:/video/show-a/v1." },
      { provider: "cdn-b", result: "PROVIDER_SUCCESS", detail: "Same route moves to the next healthy provider." },
      { provider: "cdn-a", result: "PROVIDER_SUCCESS", detail: "Unrelated route:/assets still starts on the primary provider." }
    ],
    headers: {
      "x-flareless-provider": "cdn-a",
      "x-flareless-route-id": "demo-route-scoped-health",
      "x-flareless-route-key": "route:/assets",
      "x-flareless-policy-id": "default-public-static",
      "x-flareless-reason": "ROUTE_SCOPED_HEALTH_ISOLATION",
      "x-flareless-attempts": "route:/video/show-a/v1:cdn-a:PROVIDER_BLOCKED_451,route:/video/show-a/v1:cdn-b:PROVIDER_SUCCESS,route:/assets:cdn-a:PROVIDER_SUCCESS"
    }
  },
  chunkScopedHealth: {
    label: "Chunk isolation verified",
    statusClass: "success",
    explanation: "CDN A fails for one exact video chunk, so that chunk can move to CDN B without forcing the sibling chunk away from CDN A. This proves the health model can isolate failures at the content chunk level instead of treating the whole route as broken.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_BLOCKED_451", detail: "Failure recorded for chunk:/video/show-a/v1/chunk-0001.m4s." },
      { provider: "cdn-b", result: "PROVIDER_SUCCESS", detail: "The failed chunk is routed to the backup provider." },
      { provider: "cdn-a", result: "PROVIDER_SUCCESS", detail: "Sibling chunk:/video/show-a/v1/chunk-0002.m4s still starts on the primary provider." }
    ],
    headers: {
      "x-flareless-provider": "cdn-a",
      "x-flareless-route-id": "demo-chunk-scoped-health",
      "x-flareless-route-key": "route:/video/show-a/v1",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "CHUNK_SCOPED_HEALTH_ISOLATION",
      "x-flareless-attempts": "chunk:/video/show-a/v1/chunk-0001.m4s:cdn-a:PROVIDER_BLOCKED_451,chunk:/video/show-a/v1/chunk-0001.m4s:cdn-b:PROVIDER_SUCCESS,chunk:/video/show-a/v1/chunk-0002.m4s:cdn-a:PROVIDER_SUCCESS"
    }
  },
  videoPolicyPeerFallback: {
    label: "Peer fallback allowed",
    statusClass: "success",
    explanation: "The video route policy allows peer fallback and blocks origin fallback. When all CDN providers fail, this route moves to the peer assisted layer instead of waking up origin storage.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_HTTP_503" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_503" },
      { provider: "cdn-c", result: "PROVIDER_HTTP_503" },
      { provider: "peer-assisted-edge", result: "PEER_FALLBACK_ALLOWED", detail: "Policy video-public-peer-first allows peer fallback." }
    ],
    headers: {
      "x-flareless-route": "peer-fallback",
      "x-flareless-provider": "peer-assisted-edge",
      "x-flareless-route-id": "demo-video-policy-peer",
      "x-flareless-route-key": "route:/video/policy-test/v1",
      "x-flareless-policy-id": "video-public-peer-first",
      "x-flareless-reason": "PEER_FALLBACK_ALLOWED",
      "x-flareless-attempts": "cdn-a:PROVIDER_HTTP_503,cdn-b:PROVIDER_HTTP_503,cdn-c:PROVIDER_HTTP_503,peer-assisted-edge:PEER_FALLBACK_ALLOWED"
    }
  },
  privatePolicyBlocked: {
    label: "Fallback blocked by policy",
    statusClass: "blocked",
    explanation: "The private route policy blocks both peer fallback and origin fallback. If CDN providers fail, the request stops with a policy blocked response instead of leaking private content into peers or surprising origin.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_HTTP_503" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_503" },
      { provider: "route-policy", result: "FALLBACK_BLOCKED_BY_POLICY", detail: "Policy private-no-fallback blocks peer and origin fallback." }
    ],
    headers: {
      "x-flareless-route": "fallback-blocked",
      "x-flareless-provider": "none",
      "x-flareless-route-id": "demo-private-policy-blocked",
      "x-flareless-route-key": "route:/private",
      "x-flareless-policy-id": "private-no-fallback",
      "x-flareless-reason": "FALLBACK_BLOCKED_BY_POLICY",
      "x-flareless-attempts": "cdn-a:PROVIDER_HTTP_503,cdn-b:PROVIDER_HTTP_503,route-policy:FALLBACK_BLOCKED_BY_POLICY"
    }
  },
  originPolicyAllowed: {
    label: "Origin fallback allowed",
    statusClass: "success",
    explanation: "The origin allowed route policy blocks peer fallback but allows origin fallback. This is for routes where origin is an acceptable last resort and peer delivery is not allowed.",
    attempts: [
      { provider: "cdn-a", result: "PROVIDER_HTTP_503" },
      { provider: "cdn-b", result: "PROVIDER_HTTP_503" },
      { provider: "peer-assisted-edge", result: "PEER_FALLBACK_NOT_ALLOWED", detail: "Policy origin-fallback-allowed skips peer fallback." },
      { provider: "origin", result: "ORIGIN_SUCCESS", detail: "Policy origin-fallback-allowed allows origin fallback." }
    ],
    headers: {
      "x-flareless-route": "origin-fallback",
      "x-flareless-provider": "origin",
      "x-flareless-route-id": "demo-origin-policy-allowed",
      "x-flareless-route-key": "route:/origin-allowed",
      "x-flareless-policy-id": "origin-fallback-allowed",
      "x-flareless-reason": "ORIGIN_FALLBACK_SUCCESS",
      "x-flareless-attempts": "cdn-a:PROVIDER_HTTP_503,cdn-b:PROVIDER_HTTP_503,peer-assisted-edge:PEER_FALLBACK_NOT_ALLOWED,origin:ORIGIN_SUCCESS"
    }
  }
};

const peerScenarioKeys = new Set([
  "allCdnFailPeerSuccess",
  "peerFailOriginBlocked",
  "peerFailOriginAllowed",
  "videoPolicyPeerFallback"
]);

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
const buttons = document.querySelectorAll("button[data-scenario]");
let previousScrollY = window.pageYOffset;
let upwardScrollTotal = 0;

function renderScenario(scenarioKey) {
  const scenario = scenarios[scenarioKey];

  if (scenario === undefined) {
    return;
  }

  timeline.replaceChildren();

  for (const attempt of scenario.attempts) {
    const item = document.createElement("li");
    item.className = resultClass(attempt.result);

    const provider = document.createElement("strong");
    provider.textContent = attempt.provider;

    const result = document.createElement("span");
    result.textContent = attempt.result;

    item.append(provider, result);

    if (attempt.detail) {
      const detail = document.createElement("p");
      detail.textContent = attempt.detail;
      item.append(detail);
    }

    timeline.append(item);
  }

  statusPill.textContent = scenario.label;
  statusPill.className = `status-pill ${scenario.statusClass}`;
  headers.textContent = formatHeaders(scenario.headers);
  scenarioExplanation.textContent = scenario.explanation;
  setPeerSectionVisible(peerScenarioKeys.has(scenarioKey));
  setActiveButton(scenarioKey);
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
  if (result.includes("SUCCESS") || result.includes("ALLOWED")) {
    return "success-line";
  }

  if (result.includes("NOT_ALLOWED") || result.includes("BLOCKED")) {
    return "blocked-line";
  }

  return "fail-line";
}

function formatHeaders(headerMap) {
  return Object.entries(headerMap)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

for (const button of buttons) {
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => {
    const scenarioKey = button.dataset.scenario;
    renderScenario(scenarioKey);
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

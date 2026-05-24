const policyButton = document.querySelector("#applyAgentPolicy");
const policySuggestionButton = document.querySelector("#applyAgentSuggestion");
const policyStatus = document.querySelector("#policyDemoStatus");
const policyText = document.querySelector("#policyDemoText");
const policyNodeIds = [
  "policyUser",
  "policyCdnA",
  "policyCdnB",
  "policyCdnC",
  "policyPeer",
  "policyDelivered",
  "policyAgent",
  "policySuggestion"
];
let policyDemoPlaying = false;

function clearPolicyDemo() {
  for (const nodeId of policyNodeIds) {
    const node = document.querySelector(`#${nodeId}`);

    if (node !== null) {
      node.classList.remove("is-active", "is-fail", "is-error", "is-success", "is-corrected");
    }
  }
}

function setSuggestionButtonVisible(isVisible) {
  if (policySuggestionButton !== null) {
    policySuggestionButton.hidden = !isVisible;
    policySuggestionButton.classList.toggle("is-hidden", !isVisible);
    policySuggestionButton.disabled = !isVisible;
  }
}

function resetPolicyDemo() {
  if (policyButton !== null) {
    policyButton.disabled = false;
    policyButton.textContent = "Play route policy simulation";
  }

  if (policyStatus !== null) {
    policyStatus.textContent = "Ready";
  }

  if (policyText !== null) {
    const loadedAt = new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });

    policyText.textContent = `Policy demo loaded at ${loadedAt}. Press play to show the agent finding the route failure first.`;
  }

  setSuggestionButtonVisible(false);
  clearPolicyDemo();
}

function setPolicyNode(nodeId, className, message, status) {
  const node = document.querySelector(`#${nodeId}`);

  if (node !== null) {
    node.classList.add(className);
  }

  if (policyText !== null) {
    policyText.textContent = message;
  }

  if (policyStatus !== null) {
    policyStatus.textContent = status;
  }
}

function playPolicyDemo() {
  if (policyButton === null || policyDemoPlaying) {
    return;
  }

  policyDemoPlaying = true;
  clearPolicyDemo();
  setSuggestionButtonVisible(false);
  policyButton.disabled = true;
  policyButton.textContent = "Scanning route policy";

  const steps = [
    ["policyUser", "is-active", "A public video chunk request enters the route policy path.", "Request"],
    ["policyCdnA", "is-fail", "CDN A misses the fast timeout target for this route.", "CDN A timeout"],
    ["policyCdnB", "is-fail", "CDN B responds with rate limiting for this route.", "CDN B 429"],
    ["policyCdnC", "is-fail", "CDN C returns a server failure, so the CDN path is exhausted.", "CDN C 500"],
    ["policyAgent", "is-error", "Agent notice: repeated CDN failures are slowing this route. The agent recommends cooling down CDN A and keeping peer fallback enabled.", "Agent noticed error"],
    ["policySuggestion", "is-error", "Suggested fix is ready. Apply the agent suggestion to correct the route policy simulation.", "Fix ready"]
  ];

  steps.forEach((step, index) => {
    window.setTimeout(() => {
      setPolicyNode(step[0], step[1], step[2], step[3]);

      if (index === steps.length - 1) {
        policyDemoPlaying = false;
        policyButton.textContent = "Replay error scan";
        policyButton.disabled = false;
        setSuggestionButtonVisible(true);
      }
    }, index * 650);
  });
}

function applyAgentSuggestion() {
  if (policySuggestionButton === null || policyDemoPlaying) {
    return;
  }

  policyDemoPlaying = true;
  policyButton.disabled = true;
  policySuggestionButton.disabled = true;
  policySuggestionButton.textContent = "Applying agent suggestion";

  const steps = [
    ["policySuggestion", "is-corrected", "Applying suggested policy: cool down CDN A for this route and keep peer assisted delivery enabled.", "Applying fix"],
    ["policyPeer", "is-success", "Corrected route skips the unhealthy CDN path and uses the verified peer assisted path for this public video chunk.", "Peer selected"],
    ["policyDelivered", "is-success", "Corrected route delivers the chunk without touching origin storage.", "Corrected"],
    ["policyAgent", "is-success", "Agent suggestion applied in simulation. The route is now corrected for this failure pattern.", "Policy corrected"]
  ];

  steps.forEach((step, index) => {
    window.setTimeout(() => {
      setPolicyNode(step[0], step[1], step[2], step[3]);

      if (index === steps.length - 1) {
        policyDemoPlaying = false;
        policyButton.disabled = false;
        policySuggestionButton.textContent = "Apply agent suggestion";
        setSuggestionButtonVisible(false);
      }
    }, index * 650);
  });
}

if (policyButton !== null) {
  policyButton.addEventListener("click", (event) => {
    event.preventDefault();
    playPolicyDemo();
  });

  resetPolicyDemo();
}

if (policySuggestionButton !== null) {
  policySuggestionButton.addEventListener("click", (event) => {
    event.preventDefault();
    applyAgentSuggestion();
  });
}

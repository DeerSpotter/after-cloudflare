const policyButton = document.querySelector("#applyAgentPolicy");
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
      node.classList.remove("is-active", "is-fail", "is-success");
    }
  }
}

function setPolicyButtonReady() {
  if (policyButton === null || policyDemoPlaying) {
    return;
  }

  policyButton.disabled = false;
  policyButton.textContent = "Play route policy simulation";
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
  policyButton.disabled = true;
  policyButton.textContent = "Playing route policy simulation";

  const steps = [
    ["policyUser", "is-active", "A public video chunk request enters the route policy path.", "Request"],
    ["policyCdnA", "is-fail", "CDN A misses the fast timeout target for this route.", "CDN A timeout"],
    ["policyCdnB", "is-fail", "CDN B responds with rate limiting for this route.", "CDN B 429"],
    ["policyCdnC", "is-fail", "CDN C returns a server failure, so the CDN path is exhausted.", "CDN C 500"],
    ["policyPeer", "is-success", "The peer assisted layer returns a hash verified public chunk.", "Peer success"],
    ["policyDelivered", "is-success", "The content is delivered without touching origin storage.", "Delivered"],
    ["policyAgent", "is-success", "Agent assist reviews the failure chain after delivery and explains why the route was slow.", "Agent review"],
    ["policySuggestion", "is-success", "Suggested route policy is ready: cool down CDN A for this route, keep peer enabled, and use the longer timeout profile.", "Policy ready"]
  ];

  steps.forEach((step, index) => {
    window.setTimeout(() => {
      setPolicyNode(step[0], step[1], step[2], step[3]);

      if (index === steps.length - 1) {
        policyDemoPlaying = false;
        policyButton.textContent = "Replay route policy simulation";
        policyButton.disabled = false;
      }
    }, index * 650);
  });
}

if (policyButton !== null) {
  policyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    playPolicyDemo();
  }, true);

  const policyButtonObserver = new MutationObserver(() => {
    setPolicyButtonReady();
  });

  policyButtonObserver.observe(policyButton, {
    characterData: true,
    childList: true,
    subtree: true
  });

  setPolicyButtonReady();
}

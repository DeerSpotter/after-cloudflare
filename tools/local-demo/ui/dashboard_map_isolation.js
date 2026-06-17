// Isolated Dashboard MapLibre guard.
// This file never creates a second map. It only resizes the one real dashboard map
// initialized by app.js when the Dashboard view is visible.
(() => {
  function dashboardIsVisible() {
    const dashboard = document.getElementById("dashboard");
    return Boolean(dashboard && dashboard.classList.contains("active"));
  }

  function resizeDashboardMap() {
    if (!dashboardIsVisible()) return;
    if (!state?.map || typeof state.map.resize !== "function") return;
    try {
      state.map.resize();
    } catch (error) {
      recordEvent("DASHBOARD_MAP_RESIZE_FAILED", { message: String(error?.message || error) });
    }
  }

  function queueDashboardMapResize(delay = 80) {
    window.setTimeout(resizeDashboardMap, delay);
    window.setTimeout(resizeDashboardMap, delay + 220);
  }

  window.addEventListener("load", () => queueDashboardMapResize(180));
  window.addEventListener("resize", () => queueDashboardMapResize(80));
  document.addEventListener("click", (event) => {
    if (event.target?.matches?.('[data-view="dashboard"]')) queueDashboardMapResize(80);
  });

  recordEvent("DASHBOARD_MAP_ISOLATED", { duplicateInitializer: false });
})();

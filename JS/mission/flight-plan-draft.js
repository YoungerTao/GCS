(function () {
  const STORAGE_KEY = "gcs-flight-plan-draft-v2";
  const LEGACY_KEY = "gcs-flight-plan-draft-v1";

  function loadFlightPlanDraft() {
    try {
      let raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = sessionStorage.getItem(LEGACY_KEY);
      }
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        return null;
      }
      data.schemaVersion = data.schemaVersion || 1;
      return data;
    } catch (e) {
      return null;
    }
  }

  let saveTimer = null;
  let pendingDraft = null;

  function saveFlightPlanDraft(draft) {
    pendingDraft = Object.assign({ schemaVersion: 2 }, draft || {});
    if (saveTimer) {
      return;
    }
    saveTimer = window.setTimeout(function () {
      saveTimer = null;
      const payload = pendingDraft;
      pendingDraft = null;
      if (!payload) {
        return;
      }
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        /* quota or private mode */
      }
    }, 280);
  }

  function clearFlightPlanDraft() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  window.FlightPlanDraft = {
    load: loadFlightPlanDraft,
    save: saveFlightPlanDraft,
    clear: clearFlightPlanDraft
  };
})();

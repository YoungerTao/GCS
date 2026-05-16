(function () {
  const STORAGE_KEY = "gcs-flight-plan-draft-v1";

  function loadFlightPlanDraft() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  function saveFlightPlanDraft(draft) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) {
      /* quota or private mode */
    }
  }

  function clearFlightPlanDraft() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
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

/**
 * Bootstrap GCS runtime + COM bridge.
 * 本地 http（5501 Live Server / 8766 等）：后台拉起 8767/8766/8765。
 */
(function initGcsAutoStart(global) {
  const RUNTIME_ORIGIN = "http://127.0.0.1:8766";
  const LAUNCHER_ORIGIN = "http://127.0.0.1:8767";
  const BRIDGE_HEALTH = "http://127.0.0.1:8765/health";
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchOk(url, opts) {
    try {
      const resp = await fetch(url, { cache: "no-store", ...opts });
      return resp.ok;
    } catch (_) {
      return false;
    }
  }

  function pageUrl() {
    try {
      return new URL(global.location.href);
    } catch (_) {
      return null;
    }
  }

  function isLocalHttpPage() {
    const u = pageUrl();
    if (!u || u.protocol === "file:") return false;
    return LOCAL_HOSTS.has(u.hostname);
  }

  function hideBootOverlay() {
    const el = document.getElementById("gcs-boot-overlay");
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
    el.style.pointerEvents = "none";
  }

  async function pingRuntime() {
    return fetchOk(`${RUNTIME_ORIGIN}/__gcs/ping`);
  }

  async function pingLauncher() {
    return fetchOk(`${LAUNCHER_ORIGIN}/ping`);
  }

  async function waitForLauncher(maxMs) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (await pingLauncher()) return true;
      await sleep(400);
    }
    return false;
  }

  async function requestLaunch() {
    return fetchOk(`${LAUNCHER_ORIGIN}/launch`, { method: "POST" });
  }

  async function ensureRuntimeStarted() {
    if (await pingRuntime()) return true;
    if (await pingLauncher()) {
      await requestLaunch();
    } else if (!(await waitForLauncher(12000))) {
      return false;
    } else {
      await requestLaunch();
    }
    for (let i = 0; i < 40; i += 1) {
      if (await pingRuntime()) return true;
      await sleep(300);
    }
    return false;
  }

  async function ensureBridgeFromRuntime() {
    if (await fetchOk(BRIDGE_HEALTH)) return true;
    return fetchOk(`${RUNTIME_ORIGIN}/__gcs/ensure-bridge`, { method: "POST" });
  }

  async function waitForBridge(maxMs) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      if (await fetchOk(BRIDGE_HEALTH)) return true;
      await sleep(300);
    }
    return fetchOk(BRIDGE_HEALTH);
  }

  async function bootstrap() {
    hideBootOverlay();
    global.__gcsStackBootstrapping = true;
    try {
      const runtimeOk = await ensureRuntimeStarted();
      if (runtimeOk) {
        await ensureBridgeFromRuntime();
        await waitForBridge(10000);
      }
    } finally {
      global.__gcsStackBootstrapping = false;
      global.__gcsStackReady = true;
    }
    return true;
  }

  global.__gcsLocalDev = isLocalHttpPage();
  global.__gcsLiveServerDev = global.__gcsLocalDev;

  global.__gcsBootstrapPromise = bootstrap();

  global.ensureGcsStackReady = async function ensureGcsStackReady() {
    if (global.__gcsBootstrapPromise) {
      await global.__gcsBootstrapPromise;
    }
    if (await fetchOk(BRIDGE_HEALTH)) return true;
    if (typeof global.ensureComBridgeRunning === "function") {
      return global.ensureComBridgeRunning();
    }
    return false;
  };
})(window);

/**

 * Bootstrap GCS runtime + COM bridge before the rest of the app loads.

 * Flow: ping runtime (8766) -> else POST launcher (8767) -> redirect to canonical URL.

 * Works when opened on wrong port/host or via bookmark; needs watchdog (8767) or GCS.cmd.

 */

(function initGcsAutoStart(global) {

  const RUNTIME_ORIGIN = "http://127.0.0.1:8766";

  const LAUNCHER_ORIGIN = "http://127.0.0.1:8767";

  const BRIDGE_HEALTH = "http://127.0.0.1:8765/health";

  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

  const CUSTOMER_HINT = "请从桌面「GCS」图标打开；若已安装，可重新运行 tools\\install-gcs-desktop.ps1。";



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



  function isLocalDevPage() {

    const u = pageUrl();

    if (!u || u.protocol === "file:") return true;

    return LOCAL_HOSTS.has(u.hostname);

  }



  function isCanonicalRuntimePage() {

    const u = pageUrl();

    if (!u || u.protocol === "file:") return false;

    return LOCAL_HOSTS.has(u.hostname) && u.port === "8766";

  }



  function canonicalUrl() {

    const u = pageUrl();

    const path = (u && u.pathname) || global.location.pathname || "/index.html";

    const base = path.endsWith(".html") ? path : "/index.html";

    const search = (u && u.search) || global.location.search || "";

    const hash = (u && u.hash) || global.location.hash || "";

    return `${RUNTIME_ORIGIN}${base}${search}${hash}`;

  }



  function showBootOverlay(message) {

    let el = document.getElementById("gcs-boot-overlay");

    if (!el) {

      el = document.createElement("div");

      el.id = "gcs-boot-overlay";

      el.setAttribute("role", "status");

      el.style.cssText = [

        "position:fixed", "inset:0", "z-index:99999", "display:flex",

        "align-items:center", "justify-content:center",

        "background:rgba(8,12,20,0.92)", "color:#e8ecf4",

        "font:600 15px/1.5 Inter,system-ui,sans-serif",

      ].join(";");

      const text = document.createElement("div");

      text.id = "gcs-boot-overlay-text";

      text.style.textAlign = "center";

      text.style.maxWidth = "28rem";

      text.style.padding = "0 1.5rem";

      el.appendChild(text);

      document.body.appendChild(el);

    }

    const text = document.getElementById("gcs-boot-overlay-text");

    if (text) text.textContent = message;

    el.hidden = false;

  }



  function hideBootOverlay() {

    const el = document.getElementById("gcs-boot-overlay");

    if (el) el.hidden = true;

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

      await sleep(300);

    }

    return false;

  }



  async function requestLaunch() {

    return fetchOk(`${LAUNCHER_ORIGIN}/launch`, { method: "POST" });

  }



  async function ensureRuntimeStarted() {

    if (await pingRuntime()) return true;

    if (!isLocalDevPage()) return false;



    showBootOverlay("正在启动 GCS 本地服务…");



    if (!(await waitForLauncher(8000))) {

      showBootOverlay(CUSTOMER_HINT);

      return false;

    }



    await requestLaunch();

    for (let i = 0; i < 40; i += 1) {

      if (await pingRuntime()) return true;

      await sleep(300);

    }

    showBootOverlay("GCS 服务启动超时。" + CUSTOMER_HINT);

    return false;

  }



  async function ensureBridgeFromRuntime() {

    if (await fetchOk(BRIDGE_HEALTH)) return true;

    return fetchOk(`${RUNTIME_ORIGIN}/__gcs/ensure-bridge`, { method: "POST" });

  }



  async function bootstrap() {

    const ready = await ensureRuntimeStarted();

    if (!ready) return false;



    await ensureBridgeFromRuntime();

    hideBootOverlay();



    if (!isCanonicalRuntimePage()) {

      global.location.replace(canonicalUrl());

      return false;

    }

    return true;

  }



  global.__gcsBootstrapPromise = bootstrap();



  global.ensureGcsStackReady = async function ensureGcsStackReady() {

    if (global.__gcsBootstrapPromise) {

      await global.__gcsBootstrapPromise;

    }

    if (typeof global.ensureComBridgeRunning === "function") {

      return global.ensureComBridgeRunning();

    }

    return fetchOk(BRIDGE_HEALTH);

  };

})(window);



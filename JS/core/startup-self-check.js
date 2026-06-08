(function initGcsStartupSelfCheck(global) {
  const BRIDGE_HEALTH = "http://127.0.0.1:8765/health";
  const MAX_ATTEMPTS = 6;
  const RETRY_MS = 1200;
  const FETCH_TIMEOUT_MS = 1600;
  const TILE_FETCH_TIMEOUT_MS = 3500;

  function hasFetch() {
    return typeof global.fetch === "function";
  }

  function withTimeout(promise, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const timer = global.setTimeout(function () {
        reject(new Error("timeout"));
      }, timeoutMs);
      Promise.resolve(promise)
        .then(function (value) {
          global.clearTimeout(timer);
          resolve(value);
        })
        .catch(function (err) {
          global.clearTimeout(timer);
          reject(err);
        });
    });
  }

  async function fetchJson(url, timeoutMs) {
    if (!hasFetch()) {
      throw new Error("fetch unavailable");
    }
    const resp = await withTimeout(
      fetch(url, { cache: "no-store", mode: "cors" }),
      timeoutMs || FETCH_TIMEOUT_MS
    );
    if (!resp.ok) {
      throw new Error("http " + resp.status);
    }
    return resp.json().catch(function () {
      return {};
    });
  }

  function buildChecks() {
    const checks = [
      { id: "bridge", label: "COM bridge 8765", url: BRIDGE_HEALTH, required: true },
    ];
    if (global.__gcsRuntimeNative) {
      checks.push({
        id: "ui",
        label: "UI 8766",
        required: false,
        syntheticOk: true,
        detail: "OK (current page)",
      });
    } else {
      checks.push({
        id: "ui",
        label: "UI 8766",
        url: "http://127.0.0.1:8766/__gcs/ping",
        required: !global.__gcsLiveServerDev,
      });
    }
    if (!global.__gcsRuntimeNative) {
      checks.push({
        id: "launcher",
        label: "Launcher 8767",
        url: "http://127.0.0.1:8767/ping",
        required: false,
      });
    }
    checks.push({
      id: "tiles",
      label: "Tiles 8768",
      url: "http://127.0.0.1:8768/health",
      required: false,
    });
    return checks;
  }

  async function runChecks() {
    const checks = buildChecks();
    const result = [];
    for (const check of checks) {
      if (check.syntheticOk) {
        result.push({
          id: check.id,
          label: check.label,
          ok: true,
          required: !!check.required,
          detail: check.detail || "OK",
        });
        continue;
      }
      try {
        const timeoutMs = check.id === "tiles" ? TILE_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;
        const data = await fetchJson(check.url, timeoutMs);
        result.push({
          id: check.id,
          label: check.label,
          ok: !!(data && data.ok),
          required: !!check.required,
          data: data || null,
        });
      } catch (err) {
        result.push({
          id: check.id,
          label: check.label,
          ok: false,
          required: !!check.required,
          error: err && err.message ? err.message : "unreachable",
        });
      }
    }
    return result;
  }

  function ensureBanner() {
    let el = document.getElementById("gcs-startup-self-check");
    if (el) {
      return el;
    }
    el = document.createElement("div");
    el.id = "gcs-startup-self-check";
    el.className = "gcs-startup-check gcs-startup-check--pending";
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  function lineHtml(item) {
    const cls = item.ok ? "gcs-startup-check__ok" : "gcs-startup-check__bad";
    const detail = item.ok ? (item.detail || "OK") : (item.error || "Not ready");
    const opt = item.required ? "" : " (可选)";
    return (
      '<span class="gcs-startup-check__item ' +
      cls +
      '">' +
      item.label +
      opt +
      ": " +
      detail +
      "</span>"
    );
  }

  function logSummary(text) {
    if (typeof global.log === "function") {
      global.log(text, "startup-self-check");
    }
  }

  function requiredOk(items) {
    return items.every(function (item) {
      return !item.required || item.ok;
    });
  }

  function renderBanner(items, attempt, finalState) {
    const el = ensureBanner();
    const coreOk = requiredOk(items);
    const allOk = items.every(function (item) {
      return item.ok;
    });
    const title = coreOk
      ? allOk
        ? "启动自检正常"
        : "核心服务已就绪"
      : "启动自检异常";
    const hint = coreOk
      ? allOk
        ? "服务已就绪，可以直接使用。"
        : "COM 桥与飞控通信可用。8768 地图瓦片未启动时不影响 DroneCAN / MAVLink。"
      : "请稍候几秒；若 COM bridge 8765 仍失败，请从桌面 GCS 图标重新打开。";

    el.className =
      "gcs-startup-check " +
      (coreOk ? "gcs-startup-check--ok" : "gcs-startup-check--bad");
    if (!finalState && !coreOk) {
      el.className += " gcs-startup-check--pending";
    }

    el.innerHTML =
      '<div class="gcs-startup-check__title">' +
      title +
      (coreOk && allOk ? "" : " · 第 " + attempt + "/" + MAX_ATTEMPTS + " 次检查") +
      "</div>" +
      '<div class="gcs-startup-check__grid">' +
      items.map(lineHtml).join("") +
      "</div>" +
      '<div class="gcs-startup-check__hint">' +
      hint +
      "</div>";
    el.hidden = false;

    if (coreOk && (allOk || finalState)) {
      global.setTimeout(function () {
        el.hidden = true;
      }, allOk ? 5000 : 9000);
    }
  }

  async function bootstrapChecks() {
    if (!hasFetch()) {
      return;
    }
    const boot = global.__gcsBootstrapPromise;
    if (boot && typeof boot.then === "function") {
      try {
        await boot;
      } catch (_) {
        /* ignore */
      }
    }

    let lastItems = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      lastItems = await runChecks();
      const coreOk = requiredOk(lastItems);
      const allOk = lastItems.every(function (item) {
        return item.ok;
      });
      const finalState = attempt === MAX_ATTEMPTS || allOk;
      if (coreOk || attempt >= 2 || finalState) {
        renderBanner(lastItems, attempt, finalState);
      }
      if (allOk) {
        logSummary(
          "启动自检通过: " +
            lastItems
              .map(function (item) {
                return item.label + "=" + (item.ok ? "OK" : "SKIP");
              })
              .join(", ")
        );
        return;
      }
      if (coreOk && attempt < MAX_ATTEMPTS) {
        await new Promise(function (resolve) {
          global.setTimeout(resolve, RETRY_MS);
        });
        continue;
      }
      if (coreOk) {
        logSummary(
          "启动自检核心通过 (COM bridge OK): " +
            lastItems
              .map(function (item) {
                return item.label + "=" + (item.ok ? "OK" : (item.error || "SKIP"));
              })
              .join(", ")
        );
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(function (resolve) {
          global.setTimeout(resolve, RETRY_MS);
        });
      }
    }

    logSummary(
      "启动自检失败: " +
        lastItems
          .map(function (item) {
            return item.label + "=" + (item.ok ? "OK" : (item.error || "FAIL"));
          })
          .join(", ")
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapChecks, {
      once: true,
    });
  } else {
    bootstrapChecks();
  }
})(window);

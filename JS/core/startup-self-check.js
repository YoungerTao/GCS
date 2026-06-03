(function initGcsStartupSelfCheck(global) {
  const CHECKS = [
    { id: "ui", label: "UI 8766", url: "http://127.0.0.1:8766/__gcs/ping" },
    { id: "launcher", label: "Launcher 8767", url: "http://127.0.0.1:8767/ping" },
    { id: "tiles", label: "Tiles 8768", url: "http://127.0.0.1:8768/health" }
  ];
  const MAX_ATTEMPTS = 10;
  const RETRY_MS = 1500;
  const FETCH_TIMEOUT_MS = 1800;

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

  async function fetchJson(url) {
    const resp = await withTimeout(
      fetch(url, { cache: "no-store", mode: "cors" }),
      FETCH_TIMEOUT_MS
    );
    if (!resp.ok) {
      throw new Error("http " + resp.status);
    }
    return resp.json().catch(function () {
      return {};
    });
  }

  async function runChecks() {
    const result = [];
    for (const check of CHECKS) {
      try {
        const data = await fetchJson(check.url);
        result.push({
          id: check.id,
          label: check.label,
          ok: !!(data && data.ok),
          data: data || null
        });
      } catch (err) {
        result.push({
          id: check.id,
          label: check.label,
          ok: false,
          error: err && err.message ? err.message : "unreachable"
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
    const detail = item.ok ? "OK" : (item.error || "Not ready");
    return (
      '<span class="gcs-startup-check__item ' +
      cls +
      '">' +
      item.label +
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

  function renderBanner(items, attempt, finalState) {
    const el = ensureBanner();
    const allOk = items.every(function (item) {
      return item.ok;
    });
    const title = allOk ? "启动自检正常" : "启动自检异常";
    const hint = allOk
      ? "服务已就绪，可以直接使用。"
      : "请稍候几秒；若仍失败，请检查桌面快捷方式、.venv 和 8768 瓦片服务。";
    el.className =
      "gcs-startup-check " +
      (allOk ? "gcs-startup-check--ok" : "gcs-startup-check--bad");
    if (!finalState && !allOk) {
      el.className += " gcs-startup-check--pending";
    }
    el.innerHTML =
      '<div class="gcs-startup-check__title">' +
      title +
      " · 第 " +
      attempt +
      "/" +
      MAX_ATTEMPTS +
      " 次检查</div>" +
      '<div class="gcs-startup-check__grid">' +
      items.map(lineHtml).join("") +
      "</div>" +
      '<div class="gcs-startup-check__hint">' +
      hint +
      "</div>";
    el.hidden = false;
    if (allOk && finalState) {
      global.setTimeout(function () {
        el.hidden = true;
      }, 7000);
    }
  }

  async function bootstrapChecks() {
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
      const finalState =
        attempt === MAX_ATTEMPTS ||
        lastItems.every(function (item) {
          return item.ok;
        });
      renderBanner(lastItems, attempt, finalState);
      if (
        lastItems.every(function (item) {
          return item.ok;
        })
      ) {
        logSummary(
          "启动自检通过: " +
            lastItems
              .map(function (item) {
                return item.label + "=OK";
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
      once: true
    });
  } else {
    bootstrapChecks();
  }
})(window);

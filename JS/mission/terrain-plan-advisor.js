/**
 * Optional LLM advisor for terrain survey plans (suggestions only, no waypoint output).
 */
(function () {
  const STORAGE_KEY = "gcs.terrainAdvisor";
  const DEFAULT_MODEL = "gpt-4o-mini";

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : { enabled: false };
    } catch (_) {
      return { enabled: false };
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg || {}));
    } catch (_) {
      /* ignore */
    }
  }

  function buildPrompt(summary) {
    return (
      "你是航测任务规划顾问。根据以下结构化摘要，用中文给出简短建议（提高 AGL、切块、改机型、预取地形等）。" +
      "不要输出航点坐标或 JSON，仅自然语言建议，3-6 条要点。\n\n" +
      JSON.stringify(summary, null, 2)
    );
  }

  function analyzePlan(summary) {
    const cfg = loadConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      return Promise.resolve({
        ok: false,
        text: "未启用 LLM 顾问。可在 localStorage 配置 gcs.terrainAdvisor（enabled + apiKey）。"
      });
    }
    const baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = cfg.model || DEFAULT_MODEL;
    return fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.3,
        messages: [
          { role: "system", content: "你是专业无人机航测规划顾问，回答简洁务实。" },
          { role: "user", content: buildPrompt(summary) }
        ]
      })
    })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) {
            throw new Error((body && body.error && body.error.message) || "LLM 请求失败");
          }
          const text =
            body &&
            body.choices &&
            body.choices[0] &&
            body.choices[0].message &&
            body.choices[0].message.content;
          return { ok: true, text: text || "（无回复）" };
        });
      })
      .catch(function (err) {
        return { ok: false, text: err.message || "LLM 顾问失败" };
      });
  }

  window.TerrainPlanAdvisor = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    analyzePlan: analyzePlan
  };
})();

(function () {
  const BASE_FENCE_WRITE_ORDER = [
    "FENCE_ENABLE",
    "FENCE_TYPE",
    "FENCE_RADIUS",
    "FENCE_ALT_MAX",
    "FENCE_ACTION",
  ];

  /** @type {Array<{ bit: number, mask: number, id: string, label: string }>} */
  const FS_OPTIONS_BITS = [
    { bit: 0, mask: 1 << 0, id: "rc_auto", label: "RC 失联时在 Auto 继续任务" },
    { bit: 1, mask: 1 << 1, id: "gcs_auto", label: "GCS 失联时在 Auto 继续任务" },
    { bit: 2, mask: 1 << 2, id: "rc_guided", label: "RC 失联时在 Guided 继续" },
    { bit: 3, mask: 1 << 3, id: "land_cont", label: "任意失效保护时若正在降落则继续" },
    { bit: 4, mask: 1 << 4, id: "gcs_pilot", label: "GCS 失联时在手动模式继续" },
    { bit: 5, mask: 1 << 5, id: "gripper", label: "失效保护时释放夹具" },
  ];

  const FS_OPTIONS_KNOWN_MASK = FS_OPTIONS_BITS.reduce((acc, b) => acc | b.mask, 0);

  /** @type {Record<string, RtlFieldDef[]>} */
  const FS_DETECT_FIELDS_BY_KIND = {
    copter: [
      {
        elKey: "fsThrValue",
        paramNames: ["FS_THR_VALUE"],
        label: "油门失联阈值",
        paramLabel: "FS_THR_VALUE",
        unit: "PWM",
        type: "number",
        min: 910,
        max: 1100,
        step: 1,
        default: 975,
        hint: "油门通道 PWM 低于此值视为油门失联（通常远低于正常最低油门）。",
      },
      {
        elKey: "rcFsTimeout",
        paramNames: ["RC_FS_TIMEOUT"],
        label: "RC 失联超时",
        paramLabel: "RC_FS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 0.1,
        max: 10,
        step: 0.1,
        default: 1,
        hint: "RC 信号丢失后触发故障保护的等待时间。",
      },
      {
        elKey: "fsGcsTimeout",
        paramNames: ["FS_GCS_TIMEOUT"],
        label: "GCS 失联超时",
        paramLabel: "FS_GCS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 2,
        max: 120,
        step: 1,
        default: 5,
        hint: "未收到 GCS 心跳后触发 GCS 故障保护的时间。",
      },
    ],
    plane: [
      {
        elKey: "thrFsValue",
        paramNames: ["THR_FS_VALUE"],
        label: "油门失联阈值",
        paramLabel: "THR_FS_VALUE",
        unit: "PWM",
        type: "number",
        min: 925,
        max: 2200,
        step: 1,
        default: 950,
        hint: "油门输入低于此 PWM 可立即触发短时故障保护。",
      },
      {
        elKey: "fsShortActn",
        paramNames: ["FS_SHORT_ACTN"],
        label: "短时故障保护动作",
        paramLabel: "FS_SHORT_ACTN",
        type: "select",
        default: 0,
        options: [
          { value: 0, label: "CIRCLE（或保持）" },
          { value: 1, label: "CIRCLE" },
          { value: 2, label: "FBWA 零油门" },
          { value: 4, label: "FBWB" },
        ],
        hint: "RC 丢失或油门过低时立即触发的动作（固定翼模式）。",
      },
      {
        elKey: "fsLongTimeout",
        paramNames: ["FS_LONG_TIMEOUT"],
        label: "长时故障保护超时",
        paramLabel: "FS_LONG_TIMEOUT",
        unit: "s",
        type: "number",
        min: 1,
        max: 300,
        step: 1,
        default: 5,
        hint: "故障保护条件持续达到此时间后触发 FS_LONG_ACTN。",
      },
      {
        elKey: "fsLongActn",
        paramNames: ["FS_LONG_ACTN"],
        label: "长时故障保护动作",
        paramLabel: "FS_LONG_ACTN",
        type: "select",
        default: 0,
        options: [
          { value: 0, label: "RTL" },
          { value: 1, label: "RTL（自动模式继续等）" },
          { value: 2, label: "FBWA" },
          { value: 3, label: "降落伞" },
          { value: 4, label: "AUTO 当前航点" },
          { value: 5, label: "AUTOLAND / RTL" },
        ],
        hint: "超时后的长时故障保护动作。",
      },
    ],
    vtol: [
      {
        elKey: "thrFsValue",
        paramNames: ["THR_FS_VALUE", "FS_THR_VALUE"],
        label: "油门失联阈值",
        paramLabel: "THR_FS_VALUE",
        unit: "PWM",
        type: "number",
        min: 925,
        max: 2200,
        step: 1,
        default: 950,
        hint: "QuadPlane 固定翼段常用 THR_FS_VALUE。",
      },
      {
        elKey: "fsShortActn",
        paramNames: ["FS_SHORT_ACTN"],
        label: "短时故障保护动作",
        paramLabel: "FS_SHORT_ACTN",
        type: "select",
        default: 0,
        options: [
          { value: 0, label: "CIRCLE（或保持）" },
          { value: 1, label: "CIRCLE" },
          { value: 2, label: "FBWA 零油门" },
          { value: 4, label: "FBWB" },
        ],
      },
      {
        elKey: "fsLongTimeout",
        paramNames: ["FS_LONG_TIMEOUT"],
        label: "长时故障保护超时",
        paramLabel: "FS_LONG_TIMEOUT",
        unit: "s",
        type: "number",
        min: 1,
        max: 300,
        step: 1,
        default: 5,
      },
      {
        elKey: "fsLongActn",
        paramNames: ["FS_LONG_ACTN"],
        label: "长时故障保护动作",
        paramLabel: "FS_LONG_ACTN",
        type: "select",
        default: 0,
        options: [
          { value: 0, label: "RTL" },
          { value: 1, label: "RTL" },
          { value: 2, label: "FBWA" },
          { value: 3, label: "降落伞" },
          { value: 4, label: "AUTO 当前航点" },
          { value: 5, label: "AUTOLAND / RTL" },
        ],
      },
      {
        elKey: "rcFsTimeout",
        paramNames: ["RC_FS_TIMEOUT"],
        label: "RC 失联超时（垂起）",
        paramLabel: "RC_FS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 0.1,
        max: 10,
        step: 0.1,
        default: 1,
        hint: "垂起模式下 RC 丢失判定（若固件支持）。",
      },
      {
        elKey: "fsGcsTimeout",
        paramNames: ["FS_GCS_TIMEOUT"],
        label: "GCS 失联超时",
        paramLabel: "FS_GCS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 2,
        max: 120,
        step: 1,
        default: 5,
      },
    ],
    unknown: [
      {
        elKey: "fsThrValue",
        paramNames: ["FS_THR_VALUE", "THR_FS_VALUE"],
        label: "油门失联阈值",
        paramLabel: "FS_THR_VALUE / THR_FS_VALUE",
        unit: "PWM",
        type: "number",
        min: 910,
        max: 2200,
        step: 1,
        default: 975,
      },
      {
        elKey: "rcFsTimeout",
        paramNames: ["RC_FS_TIMEOUT"],
        label: "RC 失联超时",
        paramLabel: "RC_FS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 0.1,
        max: 10,
        step: 0.1,
        default: 1,
      },
      {
        elKey: "fsGcsTimeout",
        paramNames: ["FS_GCS_TIMEOUT"],
        label: "GCS 失联超时",
        paramLabel: "FS_GCS_TIMEOUT",
        unit: "s",
        type: "number",
        min: 2,
        max: 120,
        step: 1,
        default: 5,
      },
      {
        elKey: "fsLongTimeout",
        paramNames: ["FS_LONG_TIMEOUT"],
        label: "长时故障保护超时",
        paramLabel: "FS_LONG_TIMEOUT",
        unit: "s",
        type: "number",
        min: 1,
        max: 300,
        step: 1,
        default: 5,
        hint: "固定翼固件；短时故障保护在 RC/油门丢失时立即触发。",
      },
    ],
  };

  /** @type {Array<{ bit: number, mask: number, id: string, label: string, planeOnly?: boolean, hintKeys?: string[] }>} */
  const ARMING_SKIPCHK_BITS = [
    { bit: 1, mask: 1 << 1, id: "baro", label: "气压计", hintKeys: ["baro"] },
    { bit: 2, mask: 1 << 2, id: "compass", label: "罗盘", hintKeys: ["compass", "mag"] },
    { bit: 3, mask: 1 << 3, id: "gps", label: "GPS 锁定", hintKeys: ["gps"] },
    { bit: 4, mask: 1 << 4, id: "ins", label: "惯性传感器 (INS)", hintKeys: ["ins", "accel", "gyro"] },
    { bit: 5, mask: 1 << 5, id: "parameters", label: "参数", hintKeys: ["param"] },
    { bit: 6, mask: 1 << 6, id: "rc", label: "RC 通道", hintKeys: ["rc", "radio", "throttle"] },
    { bit: 7, mask: 1 << 7, id: "voltage", label: "板载电压", hintKeys: ["voltage", "board"] },
    { bit: 8, mask: 1 << 8, id: "battery", label: "电池", hintKeys: ["battery", "batt"] },
    { bit: 9, mask: 1 << 9, id: "airspeed", label: "空速", planeOnly: true, hintKeys: ["airspeed", "aspd"] },
    { bit: 10, mask: 1 << 10, id: "logging", label: "日志", hintKeys: ["log", "sd"] },
    { bit: 11, mask: 1 << 11, id: "safety_switch", label: "硬件安全开关", hintKeys: ["safety switch", "switch"] },
    { bit: 12, mask: 1 << 12, id: "gps_config", label: "GPS 配置", hintKeys: ["gps config", "configuring"] },
    { bit: 13, mask: 1 << 13, id: "system", label: "系统", hintKeys: ["system", "storage", "loop"] },
    { bit: 14, mask: 1 << 14, id: "mission", label: "任务", hintKeys: ["mission"] },
    { bit: 15, mask: 1 << 15, id: "rangefinder", label: "测距仪", hintKeys: ["rangefinder", "range"] },
    { bit: 16, mask: 1 << 16, id: "camera", label: "相机", hintKeys: ["camera", "mount"] },
    { bit: 17, mask: 1 << 17, id: "aux_auth", label: "辅助授权", hintKeys: ["aux", "author"] },
    { bit: 18, mask: 1 << 18, id: "vision", label: "视觉里程计", hintKeys: ["vision", "visodom", "odom"] },
    { bit: 19, mask: 1 << 19, id: "fft", label: "FFT", hintKeys: ["fft"] },
  ];

  const ARMING_KNOWN_MASK = ARMING_SKIPCHK_BITS.reduce((acc, b) => acc | b.mask, 0);

  const KIND_LABELS = {
    copter: "多旋翼 (Copter)",
    plane: "固定翼 (Plane)",
    vtol: "垂起 (QuadPlane / VTOL)",
    unknown: "未识别",
  };

  /** @type {Record<string, RtlFieldDef[]>} */
  const RTL_FIELDS_BY_KIND = {
    copter: [
      {
        elKey: "rtlAlt",
        paramNames: ["RTL_ALT_M", "RTL_ALT"],
        label: "返航高度",
        paramLabel: "RTL_ALT_M",
        unit: "m",
        type: "number",
        min: 0,
        max: 3000,
        step: 1,
        default: 15,
        hint: "返航前相对 Home 的最低高度；若当前更高则保持当前高度。",
      },
      {
        elKey: "rtlClimbMin",
        paramNames: ["RTL_CLIMB_MIN_M", "RTL_CLIMB_MIN"],
        label: "最小爬升",
        paramLabel: "RTL_CLIMB_MIN_M",
        unit: "m",
        type: "number",
        min: 0,
        max: 30,
        step: 1,
        default: 10,
        hint: "RTL 初始爬升段上升高度。",
      },
      {
        elKey: "rtlConeSlope",
        paramNames: ["RTL_CONE_SLOPE"],
        label: "锥体斜率",
        paramLabel: "RTL_CONE_SLOPE",
        unit: "",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        default: 3,
        hint: "Home 上方圆锥限制最大爬升；0=禁用，1=浅，3=陡峭。",
      },
      {
        elKey: "rtlLoitTime",
        paramNames: ["RTL_LOIT_TIME"],
        label: "到家等待",
        paramLabel: "RTL_LOIT_TIME",
        unit: "s",
        type: "number",
        min: 0,
        max: 60,
        step: 1,
        default: 0,
        hint: "在 Home 上方盘旋后再下降（固件单位为 ms，界面以秒显示）。",
        uiScale: 0.001,
      },
    ],
    plane: [
      {
        elKey: "rtlAltitude",
        paramNames: ["RTL_ALTITUDE"],
        label: "返航高度",
        paramLabel: "RTL_ALTITUDE",
        unit: "m",
        type: "number",
        min: -1,
        max: 500,
        step: 1,
        default: 100,
        hint: "RTL 目标高度；-1 表示保持当前高度。",
      },
      {
        elKey: "rtlClimbMin",
        paramNames: ["RTL_CLIMB_MIN"],
        label: "最小爬升",
        paramLabel: "RTL_CLIMB_MIN",
        unit: "m",
        type: "number",
        min: 0,
        max: 30,
        step: 1,
        default: 10,
        hint: "RTL 初始爬升高度；此阶段横滚受 LEVEL_ROLL_LIMIT 限制。",
      },
      {
        elKey: "rtlRadius",
        paramNames: ["RTL_RADIUS"],
        label: "徘徊半径",
        paramLabel: "RTL_RADIUS",
        unit: "m",
        type: "number",
        min: -32767,
        max: 32767,
        step: 10,
        default: 0,
        hint: "RTL 盘旋半径；0 使用 WP_LOITER_RAD；负=逆时针，正=顺时针。",
      },
      {
        elKey: "rtlAutoland",
        paramNames: ["RTL_AUTOLAND"],
        label: "RTL 自动着陆",
        paramLabel: "RTL_AUTOLAND",
        type: "select",
        default: 0,
        options: [
          { value: 0, label: "禁用" },
          { value: 1, label: "先飞 Home 再 DO_LAND_START 着陆" },
          { value: 2, label: "直接进入着陆序列" },
          { value: 3, label: "仅用于复飞绕行" },
          { value: 4, label: "经 DO_RETURN_PATH_START 进入着陆" },
        ],
        hint: "需任务中含 DO_LAND_START / DO_RETURN_PATH_START 等标记。",
      },
    ],
    vtol: [
      {
        elKey: "qRtlMode",
        paramNames: ["Q_RTL_MODE"],
        label: "VTOL RTL 模式",
        paramLabel: "Q_RTL_MODE",
        type: "select",
        default: 1,
        options: [
          { value: 0, label: "禁用（仅固定翼 RTL）" },
          { value: 1, label: "近 Home 切换 QRTL" },
          { value: 2, label: "VTOL 进近" },
          { value: 3, label: "始终 QRTL" },
        ],
        hint: "控制 RTL 是否/如何切换为垂起返航与着陆。",
      },
      {
        elKey: "qRtlAlt",
        paramNames: ["Q_RTL_ALT"],
        label: "QRTL 返航高度",
        paramLabel: "Q_RTL_ALT",
        unit: "m",
        type: "number",
        min: 1,
        max: 200,
        step: 1,
        default: 50,
        hint: "QRTL 模式初始目标高度。",
      },
      {
        elKey: "qRtlAltMin",
        paramNames: ["Q_RTL_ALT_MIN"],
        label: "QRTL 最低爬升",
        paramLabel: "Q_RTL_ALT_MIN",
        unit: "m",
        type: "number",
        min: 1,
        max: 200,
        step: 1,
        default: 30,
        hint: "垂起电机工作时的最低返航爬升高度。",
      },
      {
        elKey: "rtlAltitude",
        paramNames: ["RTL_ALTITUDE"],
        label: "固定翼返航高度",
        paramLabel: "RTL_ALTITUDE",
        unit: "m",
        type: "number",
        min: -1,
        max: 500,
        step: 1,
        default: 100,
        hint: "固定翼段 RTL 高度；-1=保持当前高度。",
      },
      {
        elKey: "rtlClimbMin",
        paramNames: ["RTL_CLIMB_MIN"],
        label: "最小爬升",
        paramLabel: "RTL_CLIMB_MIN",
        unit: "m",
        type: "number",
        min: 0,
        max: 30,
        step: 1,
        default: 10,
      },
      {
        elKey: "rtlRadius",
        paramNames: ["RTL_RADIUS"],
        label: "徘徊 / 过渡半径",
        paramLabel: "RTL_RADIUS",
        unit: "m",
        type: "number",
        min: -32767,
        max: 32767,
        step: 10,
        default: 0,
        hint: "近 Home 切换 QRTL 的距离参考；亦影响 FW→VTOL 过渡最小半径。",
      },
    ],
    unknown: [
      {
        elKey: "rtlAlt",
        paramNames: ["RTL_ALTITUDE", "RTL_ALT_M", "RTL_ALT"],
        label: "返航高度",
        paramLabel: "RTL_ALTITUDE / RTL_ALT_M",
        unit: "m",
        type: "number",
        min: -1,
        max: 3000,
        step: 1,
        default: 100,
      },
      {
        elKey: "rtlClimbMin",
        paramNames: ["RTL_CLIMB_MIN", "RTL_CLIMB_MIN_M"],
        label: "最小爬升",
        paramLabel: "RTL_CLIMB_MIN",
        unit: "m",
        type: "number",
        min: 0,
        max: 30,
        step: 1,
        default: 10,
      },
      {
        elKey: "rtlConeSlope",
        paramNames: ["RTL_CONE_SLOPE"],
        label: "锥体斜率",
        paramLabel: "RTL_CONE_SLOPE",
        type: "number",
        min: 0,
        max: 10,
        step: 0.1,
        default: 3,
        hint: "仅多旋翼固件有效。",
      },
      {
        elKey: "rtlLoitTime",
        paramNames: ["RTL_LOIT_TIME"],
        label: "到家等待",
        paramLabel: "RTL_LOIT_TIME",
        unit: "s",
        type: "number",
        min: 0,
        max: 60,
        step: 1,
        default: 0,
        uiScale: 0.001,
      },
    ],
  };

  const els = {};
  let mounted = false;
  let lastPrearmText = "";
  let lastHydrateAt = 0;
  let prevPrearmHook = null;
  let geofenceVizApi = null;

  /** @type {{ kind: string, hasFrame: boolean, hasQ: boolean, fwText: string }} */
  let rtlProfile = { kind: "unknown", hasFrame: false, hasQ: false, fwText: "" };
  let rtlRenderedKind = "";
  /** @type {Array<{ def: RtlFieldDef, resolvedParam: string }>} */
  let rtlBindings = [];
  let lastProfileCheckAt = 0;
  let armingRenderedKind = "";
  let armingPreservedHighBits = 0;
  /** @type {Array<typeof ARMING_SKIPCHK_BITS[number]>} */
  let armingVisibleBits = [];
  let fsDetectRenderedKind = "";
  /** @type {Array<{ def: RtlFieldDef, resolvedParam: string }>} */
  let fsDetectBindings = [];
  let fsOptionsPreservedHighBits = 0;

  function q(id) {
    return document.getElementById(id);
  }

  function getParam(name, fallback = null) {
    if (!(window.params instanceof Map)) return fallback;
    if (!window.params.has(name)) return fallback;
    const n = Number(window.params.get(name));
    return Number.isFinite(n) ? n : fallback;
  }

  function resolveParamName(paramNames) {
    if (!(window.params instanceof Map)) return paramNames[0];
    for (const name of paramNames) {
      if (window.params.has(name)) return name;
    }
    return paramNames[0];
  }

  function getVehicleProfile() {
    if (typeof window.gcsDetectFirmwareProfile === "function") {
      return window.gcsDetectFirmwareProfile();
    }
    return { kind: "unknown", hasFrame: false, hasQ: false, fwText: "" };
  }

  function fsThrParamName() {
    if (window.params instanceof Map) {
      if (window.params.has("FS_THR_ENABLE")) return "FS_THR_ENABLE";
      if (window.params.has("THR_FAILSAFE")) return "THR_FAILSAFE";
    }
    const kind = getVehicleProfile().kind;
    return kind === "plane" || kind === "vtol" ? "THR_FAILSAFE" : "FS_THR_ENABLE";
  }

  function fsGcsParamName() {
    if (window.params instanceof Map) {
      if (window.params.has("FS_GCS_ENABLE")) return "FS_GCS_ENABLE";
      if (window.params.has("FS_GCS_ENABL")) return "FS_GCS_ENABL";
    }
    const kind = getVehicleProfile().kind;
    return kind === "plane" || kind === "vtol" ? "FS_GCS_ENABL" : "FS_GCS_ENABLE";
  }

  function updateFsActionParamTags() {
    if (els.fsThrEnableTag) els.fsThrEnableTag.textContent = fsThrParamName();
    if (els.fsGcsEnableTag) els.fsGcsEnableTag.textContent = fsGcsParamName();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function canWrite() {
    return typeof window.sendParamSet === "function" && window._gcsConnState === "connected";
  }

  function disableForm(disabled) {
    Object.values(els).forEach((node) => {
      if (!node || typeof node.disabled !== "boolean") return;
      if (node.id?.startsWith("safety-arming-bit-")) return;
      node.disabled = disabled;
    });
    if (els.rtlFormRoot) {
      els.rtlFormRoot.querySelectorAll("input, select").forEach((node) => {
        node.disabled = disabled;
      });
    }
    if (els.armingCheckGrid) {
      els.armingCheckGrid.querySelectorAll("input[type=checkbox]").forEach((node) => {
        if (node.id === "safety-arming-skip-all") return;
        node.disabled = disabled || (els.armingSkipAll?.checked === true);
      });
    }
    if (els.armingSkipAll) els.armingSkipAll.disabled = disabled;
    if (els.fsDetectFormRoot) {
      els.fsDetectFormRoot.querySelectorAll("input, select").forEach((node) => {
        node.disabled = disabled;
      });
    }
    if (els.fsOptionsGrid) {
      els.fsOptionsGrid.querySelectorAll("input[type=checkbox]").forEach((node) => {
        node.disabled = disabled;
      });
    }
  }

  function setStatus(msg, isBad = false) {
    if (!els.writeStatus) return;
    els.writeStatus.textContent = msg || "";
    els.writeStatus.classList.toggle("danger", !!isBad);
    els.writeStatus.classList.toggle("ok", !isBad && !!msg);
  }

  function valueOf(el, fallback = 0) {
    if (!el) return fallback;
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function setValue(id, n) {
    const el = els[id];
    if (!el || !Number.isFinite(n)) return;
    el.value = String(n);
  }

  function paramValueToUi(def, raw) {
    if (!Number.isFinite(raw)) return def.default;
    if (def.uiScale) return raw * def.uiScale;
    return raw;
  }

  function paramValueFromUi(def, uiVal) {
    if (!Number.isFinite(uiVal)) return def.default;
    if (def.uiScale) return Math.round(uiVal / def.uiScale);
    return uiVal;
  }

  function clearRtlElementRefs() {
    rtlBindings.forEach(({ def }) => {
      if (def.elKey && els[def.elKey]) delete els[def.elKey];
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderFieldHtml(def, index, idPrefix = "safety-rtl-f") {
    const domId = `${idPrefix}-${index}`;
    const unitSuffix = def.unit ? ` (${def.unit})` : "";
    const labelText = `${def.label} ${def.paramLabel}${unitSuffix}`;
    if (def.type === "select" && def.options?.length) {
      const opts = def.options
        .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
        .join("");
      return `
        <label>${escapeHtml(labelText)}
          <select id="${domId}" data-rtl-param="${escapeHtml(def.paramNames[0])}">${opts}</select>
        </label>
      `;
    }
    const min = def.min != null ? ` min="${def.min}"` : "";
    const max = def.max != null ? ` max="${def.max}"` : "";
    const step = def.step != null ? ` step="${def.step}"` : "";
    return `
      <label>${escapeHtml(labelText)}
        <input id="${domId}" type="number"${min}${max}${step} data-rtl-param="${escapeHtml(def.paramNames[0])}">
      </label>
    `;
  }

  function updateRtlTypeBanner(profile) {
    if (!els.rtlTypeBanner) return;
    const kind = profile?.kind || "unknown";
    if (kind === "unknown") {
      els.rtlTypeBanner.hidden = false;
      els.rtlTypeBanner.className = "rtl-type-banner rtl-type-banner-warn";
      els.rtlTypeBanner.textContent =
        "无法自动识别机型，以下显示通用 RTL 参数字段。请连接飞控或完成机型设置后刷新。";
      return;
    }
    els.rtlTypeBanner.hidden = false;
    els.rtlTypeBanner.className = "rtl-type-banner";
    let text = `当前机型：${KIND_LABELS[kind] || kind}`;
    if (profile.hasQ && kind === "vtol") text += " · 已检测到 Q_FRAME 参数";
    els.rtlTypeBanner.textContent = text;
  }

  function renderRtlCard(profile, force = false) {
    if (!els.rtlFormRoot) return;
    const kind = profile?.kind || "unknown";
    if (!force && rtlRenderedKind === kind) return;

    clearRtlElementRefs();
    rtlBindings = [];

    const fields = RTL_FIELDS_BY_KIND[kind] || RTL_FIELDS_BY_KIND.unknown;
    const hints = [];
    const labelsHtml = fields.map((def, i) => renderFieldHtml(def, i)).join("");
    els.rtlFormRoot.innerHTML = labelsHtml;
    els.rtlFormRoot.dataset.rtlKind = kind;

    fields.forEach((def, index) => {
      const domId = `safety-rtl-f-${index}`;
      const el = q(domId);
      if (!el) return;
      els[def.elKey] = el;
      const resolvedParam = resolveParamName(def.paramNames);
      rtlBindings.push({ def, resolvedParam });
      if (def.hint) hints.push(def.hint);
    });

    if (hints.length) {
      const hintEl = document.createElement("p");
      hintEl.className = "rtl-field-hint muted";
      hintEl.textContent = hints.join(" ");
      els.rtlFormRoot.appendChild(hintEl);
    }

    rtlRenderedKind = kind;
    rtlProfile = profile;
    updateRtlTypeBanner(profile);
  }

  function ensureRtlCard(forceRender = false) {
    const profile = getVehicleProfile();
    const kind = profile.kind || "unknown";
    if (forceRender || rtlRenderedKind !== kind) {
      renderRtlCard(profile, true);
    } else {
      rtlProfile = profile;
      updateRtlTypeBanner(profile);
    }
    return profile;
  }

  function clearFsDetectElementRefs() {
    fsDetectBindings.forEach(({ def }) => {
      if (def.elKey && els[def.elKey]) delete els[def.elKey];
    });
  }

  function updateFsDetectBanner(profile) {
    if (!els.fsDetectBanner) return;
    const kind = profile?.kind || "unknown";
    if (kind === "unknown") {
      els.fsDetectBanner.hidden = false;
      els.fsDetectBanner.className = "rtl-type-banner rtl-type-banner-warn";
      els.fsDetectBanner.textContent =
        "无法自动识别机型，以下显示通用失联判定字段。连接飞控后将按 Copter/Plane 切换。";
      return;
    }
    els.fsDetectBanner.hidden = false;
    els.fsDetectBanner.className = "rtl-type-banner";
    let text = `当前机型：${KIND_LABELS[kind] || kind}`;
    if (kind === "plane" || kind === "vtol") {
      text += " · 短时故障保护在 RC/油门丢失时立即触发";
    } else {
      text += " · 由油门 PWM、接收机有效位与超时共同判定";
    }
    els.fsDetectBanner.textContent = text;
  }

  function renderLinkFsDetectForm(profile, force = false) {
    if (!els.fsDetectFormRoot) return;
    const kind = profile?.kind || "unknown";
    if (!force && fsDetectRenderedKind === kind) return;

    clearFsDetectElementRefs();
    fsDetectBindings = [];

    const fields = FS_DETECT_FIELDS_BY_KIND[kind] || FS_DETECT_FIELDS_BY_KIND.unknown;
    const hints = [];
    const labelsHtml = fields.map((def, i) => renderFieldHtml(def, i, "safety-fs-detect-f")).join("");
    els.fsDetectFormRoot.innerHTML = labelsHtml;
    els.fsDetectFormRoot.dataset.fsKind = kind;

    fields.forEach((def, index) => {
      const domId = `safety-fs-detect-f-${index}`;
      const el = q(domId);
      if (!el) return;
      els[def.elKey] = el;
      const resolvedParam = resolveParamName(def.paramNames);
      fsDetectBindings.push({ def, resolvedParam });
      if (def.hint) hints.push(def.hint);
    });

    if (hints.length) {
      const hintEl = document.createElement("p");
      hintEl.className = "rtl-field-hint muted";
      hintEl.textContent = hints.join(" ");
      els.fsDetectFormRoot.appendChild(hintEl);
    }

    fsDetectRenderedKind = kind;
    updateFsDetectBanner(profile);
    updateFsActionParamTags();
  }

  function ensureLinkFsDetectCard(forceRender = false) {
    const profile = getVehicleProfile();
    const kind = profile.kind || "unknown";
    if (forceRender || fsDetectRenderedKind !== kind) {
      renderLinkFsDetectForm(profile, true);
    } else {
      updateFsDetectBanner(profile);
      updateFsActionParamTags();
    }
    return profile;
  }

  function hydrateLinkFsDetectFromParams() {
    fsDetectBindings.forEach(({ def, resolvedParam }) => {
      const el = els[def.elKey];
      if (!el) return;
      const name = resolveParamName(def.paramNames);
      const binding = fsDetectBindings.find((b) => b.def === def);
      if (binding) binding.resolvedParam = name;
      const raw = getParam(name, def.default);
      const uiVal = paramValueToUi(def, raw);
      if (def.type === "select") {
        el.value = String(Math.round(uiVal));
      } else {
        el.value = String(uiVal);
      }
    });
  }

  function collectLinkFsDetectDraft() {
    const draft = {};
    fsDetectBindings.forEach(({ def, resolvedParam }) => {
      const el = els[def.elKey];
      if (!el) return;
      const uiVal = def.type === "select"
        ? Math.round(valueOf(el, def.default))
        : valueOf(el, def.default);
      draft[resolvedParam] = paramValueFromUi(def, uiVal);
    });
    return draft;
  }

  function renderFsOptionsGrid() {
    if (!els.fsOptionsGrid) return;
    const rows = FS_OPTIONS_BITS.map((bit) => `
      <label class="safety-fs-options-bit" data-fs-opt-bit="${bit.id}">
        <input type="checkbox" id="safety-fs-opt-${bit.id}" data-mask="${bit.mask}">
        <span>${escapeHtml(bit.label)}</span>
      </label>
    `).join("");
    els.fsOptionsGrid.innerHTML = rows;
    FS_OPTIONS_BITS.forEach((bit) => {
      els[`fsOpt_${bit.id}`] = q(`safety-fs-opt-${bit.id}`);
      const input = els[`fsOpt_${bit.id}`];
      if (!input) return;
      input.addEventListener("change", () => {
        updateFsOptionsReadout();
      });
    });
  }

  function updateFsOptionsReadout(mask) {
    if (!els.fsOptionsReadout) return;
    const m = mask != null ? Math.round(mask) : collectFsOptionsMask();
    els.fsOptionsReadout.textContent = `FS_OPTIONS = ${m}`;
  }

  function hydrateFsOptionsBits() {
    const raw = Math.round(getParam("FS_OPTIONS", 0));
    fsOptionsPreservedHighBits = raw & ~FS_OPTIONS_KNOWN_MASK;
    FS_OPTIONS_BITS.forEach((bit) => {
      const input = els[`fsOpt_${bit.id}`];
      if (input) input.checked = (raw & bit.mask) !== 0;
    });
    updateFsOptionsReadout(raw);
  }

  function collectFsOptionsMask() {
    let mask = fsOptionsPreservedHighBits;
    FS_OPTIONS_BITS.forEach((bit) => {
      const input = els[`fsOpt_${bit.id}`];
      if (input?.checked) mask |= bit.mask;
    });
    return mask >>> 0;
  }

  function armingSkipParamName() {
    if (window.params instanceof Map) {
      if (window.params.has("ARMING_SKIPCHK")) return "ARMING_SKIPCHK";
      if (window.params.has("ARMING_CHECK")) return "ARMING_CHECK";
    }
    return "ARMING_SKIPCHK";
  }

  function legacyCheckToSkipMask(oldCheck) {
    const old = Math.round(Number(oldCheck));
    if (!Number.isFinite(old)) return 0;
    if (old === 0) return -1;
    if (old === 1) return 0;
    return ((~old) >>> 0) & ARMING_KNOWN_MASK;
  }

  function skipMaskToLegacyCheck(skip) {
    const s = Math.round(Number(skip));
    if (s === -1) return 0;
    if (s === 0) return 1;
    return ((~s) >>> 0) & ARMING_KNOWN_MASK;
  }

  function readSkipMaskFromParams() {
    const skipName = armingSkipParamName();
    if (skipName === "ARMING_SKIPCHK") {
      const v = getParam("ARMING_SKIPCHK", 0);
      return Number.isFinite(v) ? Math.round(v) : 0;
    }
    return legacyCheckToSkipMask(getParam("ARMING_CHECK", 1));
  }

  function skipMaskForDraft(skip) {
    const paramName = armingSkipParamName();
    const s = Math.round(Number(skip));
    if (paramName === "ARMING_CHECK") return skipMaskToLegacyCheck(s);
    return s;
  }

  function armingBitsForKind(kind) {
    const showAirspeed = kind === "plane" || kind === "vtol";
    return ARMING_SKIPCHK_BITS.filter((b) => !b.planeOnly || showAirspeed);
  }

  function clearArmingCheckboxRefs() {
    armingVisibleBits.forEach((bit) => {
      const key = `armingBit_${bit.id}`;
      if (els[key]) delete els[key];
    });
  }

  function prearmHintMatchesBit(lowText, bit) {
    if (!bit.hintKeys?.length) return false;
    return bit.hintKeys.some((k) => lowText.includes(k));
  }

  function renderArmingCheckGrid(profile, force = false) {
    if (!els.armingCheckGrid) return;
    const kind = profile?.kind || "unknown";
    if (!force && armingRenderedKind === kind) return;

    clearArmingCheckboxRefs();
    armingVisibleBits = armingBitsForKind(kind);
    const lowPrearm = (lastPrearmText || "").toLowerCase();

    const rows = armingVisibleBits.map((bit) => {
      const hintClass = prearmHintMatchesBit(lowPrearm, bit) ? " safety-arming-bit-hint" : "";
      return `
        <label class="safety-arming-bit${hintClass}" data-arming-bit="${bit.id}">
          <input type="checkbox" id="safety-arming-bit-${bit.id}" data-mask="${bit.mask}">
          <span>${escapeHtml(bit.label)}</span>
        </label>
      `;
    }).join("");

    els.armingCheckGrid.innerHTML = rows;
    armingVisibleBits.forEach((bit) => {
      els[`armingBit_${bit.id}`] = q(`safety-arming-bit-${bit.id}`);
    });
    armingRenderedKind = kind;

    armingVisibleBits.forEach((bit) => {
      const input = els[`armingBit_${bit.id}`];
      if (!input) return;
      input.addEventListener("change", () => {
        if (els.armingSkipAll?.checked && input.checked) {
          els.armingSkipAll.checked = false;
        }
        updateArmingMaskReadout();
        updateArmingSkipBanner();
      });
    });
  }

  function ensureArmingCard(forceRender = false) {
    const profile = getVehicleProfile();
    const kind = profile.kind || "unknown";
    if (forceRender || armingRenderedKind !== kind) {
      renderArmingCheckGrid(profile, true);
    }
    return profile;
  }

  function updateArmingSkipBanner(skip) {
    if (!els.armingSkipBanner) return;
    const s = skip != null ? skip : collectArmingSkipMask();
    const skipAll = s === -1;
    els.armingSkipBanner.hidden = !skipAll;
    if (els.armingCheckGrid) {
      els.armingCheckGrid.classList.toggle("is-skip-all", skipAll);
    }
    const disableBits = skipAll;
    armingVisibleBits.forEach((bit) => {
      const input = els[`armingBit_${bit.id}`];
      if (input) input.disabled = disableBits;
    });
  }

  function updateArmingMaskReadout(skip) {
    if (!els.armingMaskReadout) return;
    const paramName = armingSkipParamName();
    const s = skip != null ? Math.round(skip) : collectArmingSkipMask();
    const draftVal = skipMaskForDraft(s);
    els.armingMaskReadout.textContent = `${paramName} = ${draftVal}`;
  }

  function hydrateArmingSkipChecks() {
    ensureArmingCard(false);
    const rawSkip = readSkipMaskFromParams();
    const skip = Math.round(rawSkip);
    armingPreservedHighBits = skip === -1 ? 0 : (skip & ~ARMING_KNOWN_MASK);

    if (els.armingSkipAll) {
      els.armingSkipAll.checked = skip === -1;
    }

    armingVisibleBits.forEach((bit) => {
      const input = els[`armingBit_${bit.id}`];
      if (!input) return;
      if (skip === -1) {
        input.checked = false;
      } else {
        input.checked = (skip & bit.mask) === 0;
      }
    });

    updateArmingSkipBanner(skip);
    updateArmingMaskReadout(skip);
  }

  function collectArmingSkipMask() {
    if (els.armingSkipAll?.checked) return -1;

    let skip = armingPreservedHighBits;
    armingVisibleBits.forEach((bit) => {
      const input = els[`armingBit_${bit.id}`];
      if (!input?.checked) skip |= bit.mask;
    });
    return skip >>> 0;
  }

  function isAllKnownChecksSkipped(skip) {
    const s = Math.round(Number(skip));
    if (s === -1) return true;
    return (s & ARMING_KNOWN_MASK) === ARMING_KNOWN_MASK;
  }

  function hydrateRtlFromParams() {
    rtlBindings.forEach(({ def, resolvedParam }) => {
      const el = els[def.elKey];
      if (!el) return;
      const name = resolveParamName(def.paramNames);
      const binding = rtlBindings.find((b) => b.def === def);
      if (binding) binding.resolvedParam = name;
      const raw = getParam(name, def.default);
      const uiVal = paramValueToUi(def, raw);
      if (def.type === "select") {
        el.value = String(Math.round(uiVal));
      } else {
        el.value = String(uiVal);
      }
    });
  }

  function collectRtlDraft() {
    const draft = {};
    rtlBindings.forEach(({ def, resolvedParam }) => {
      const el = els[def.elKey];
      if (!el) return;
      const uiVal = def.type === "select"
        ? Math.round(valueOf(el, def.default))
        : valueOf(el, def.default);
      draft[resolvedParam] = paramValueFromUi(def, uiVal);
    });
    return draft;
  }

  function buildWriteOrder(draft) {
    const rtlKeys = rtlBindings
      .map((b) => b.resolvedParam)
      .filter((k) => Object.prototype.hasOwnProperty.call(draft, k));
    const detectKeys = fsDetectBindings
      .map((b) => b.resolvedParam)
      .filter((k) => Object.prototype.hasOwnProperty.call(draft, k));
    const thrKey = fsThrParamName();
    const gcsKey = fsGcsParamName();
    const armingParam = armingSkipParamName();
    const fsTail = [];
    if (Object.prototype.hasOwnProperty.call(draft, thrKey)) fsTail.push(thrKey);
    detectKeys.forEach((k) => {
      if (k !== thrKey && k !== gcsKey && !fsTail.includes(k)) fsTail.push(k);
    });
    if (Object.prototype.hasOwnProperty.call(draft, gcsKey)) fsTail.push(gcsKey);
    if (Object.prototype.hasOwnProperty.call(draft, "FS_OPTIONS")) fsTail.push("FS_OPTIONS");
    if (Object.prototype.hasOwnProperty.call(draft, armingParam)) fsTail.push(armingParam);
    return [...BASE_FENCE_WRITE_ORDER, ...rtlKeys, ...fsTail];
  }

  function currentDraft() {
    const skip = collectArmingSkipMask();
    const armingParam = armingSkipParamName();
    const thrKey = fsThrParamName();
    const gcsKey = fsGcsParamName();
    const draft = {
      FENCE_ENABLE: Math.round(valueOf(els.fenceEnable, 0)),
      FENCE_TYPE: Math.round(valueOf(els.fenceType, 1)),
      FENCE_RADIUS: valueOf(els.fenceRadius, 1000),
      FENCE_ALT_MAX: valueOf(els.fenceAltMax, 120),
      FENCE_ACTION: Math.round(valueOf(els.fenceAction, 1)),
      FS_OPTIONS: collectFsOptionsMask(),
    };
    draft[thrKey] = Math.round(valueOf(els.fsThrEnable, 1));
    draft[gcsKey] = Math.round(valueOf(els.fsGcsEnable, 1));
    draft[armingParam] = skipMaskForDraft(skip);
    return Object.assign(draft, collectRtlDraft(), collectLinkFsDetectDraft());
  }

  function updateTopChips() {
    const fenceEnabled = Math.round(valueOf(els.fenceEnable, 0)) === 1;
    if (els.fenceChip) {
      els.fenceChip.textContent = `Fence: ${fenceEnabled ? "开启" : "关闭"}`;
      els.fenceChip.className = `safety-chip ${fenceEnabled ? "safety-chip-ok" : "safety-chip-warn"}`;
    }

    if (els.prearmChip) {
      const txt = lastPrearmText || "暂无异常";
      const bad = /prearm:|pre-arm|arming denied/i.test(txt);
      els.prearmChip.textContent = `Pre-arm: ${bad ? "异常" : "正常"}`;
      els.prearmChip.className = `safety-chip ${bad ? "safety-chip-warn" : "safety-chip-ok"}`;
    }
  }

  function updateArmingBitHints() {
    if (!els.armingCheckGrid) return;
    const low = (lastPrearmText || "").toLowerCase();
    armingVisibleBits.forEach((bit) => {
      const label = els.armingCheckGrid.querySelector(`[data-arming-bit="${bit.id}"]`);
      if (label) {
        label.classList.toggle("safety-arming-bit-hint", prearmHintMatchesBit(low, bit));
      }
    });
  }

  function updatePrearmSummary() {
    if (!els.prearmSummary) return;
    const txt = lastPrearmText || "尚未收到 Pre-arm 错误消息。";
    els.prearmSummary.textContent = txt;
    updateArmingBitHints();
    updateTopChips();
  }

  function updateGeofencePreview() {
    const draft = currentDraft();
    const enabled = draft.FENCE_ENABLE === 1;
    const isCircular = draft.FENCE_TYPE === 1 || draft.FENCE_TYPE === 3;

    if (els.geofenceOverlay) {
      if (!isCircular) {
        els.geofenceOverlay.textContent = "仅圆形围栏支持 3D 预览";
        els.geofenceOverlay.classList.add("show");
      } else {
        els.geofenceOverlay.classList.remove("show");
      }
    }

    if (!geofenceVizApi) return;

    if (typeof geofenceVizApi.resize === "function") {
      geofenceVizApi.resize();
    }

    geofenceVizApi.update({
      radius: draft.FENCE_RADIUS,
      height: draft.FENCE_ALT_MAX,
      enabled,
      type: draft.FENCE_TYPE,
    });
  }

  function hydrateFromParams(force = false) {
    if (!(window.params instanceof Map) || window.params.size === 0) return;
    if (!force && Date.now() - lastHydrateAt < 200) return;

    ensureRtlCard(force);
    ensureLinkFsDetectCard(force);
    ensureArmingCard(force);

    setValue("fenceEnable", getParam("FENCE_ENABLE", 0));
    setValue("fenceType", getParam("FENCE_TYPE", 3));
    setValue("fenceRadius", getParam("FENCE_RADIUS", 1000));
    setValue("fenceAltMax", getParam("FENCE_ALT_MAX", 120));
    setValue("fenceAction", getParam("FENCE_ACTION", 1));
    hydrateRtlFromParams();
    updateFsActionParamTags();
    setValue("fsThrEnable", getParam(fsThrParamName(), 1));
    setValue("fsGcsEnable", getParam(fsGcsParamName(), 1));
    hydrateLinkFsDetectFromParams();
    hydrateFsOptionsBits();
    hydrateArmingSkipChecks();
    updateTopChips();
    lastHydrateAt = Date.now();
  }

  function guardRiskyChanges(draft) {
    const oldFence = getParam("FENCE_ENABLE", 0);
    const thrKey = fsThrParamName();
    const oldThrFs = getParam(thrKey, getParam("FS_THR_ENABLE", getParam("THR_FAILSAFE", 1)));
    const risks = [];
    if (oldFence === 1 && draft.FENCE_ENABLE === 0) risks.push("将关闭 Geofence");
    if (oldThrFs !== 0 && draft[thrKey] === 0) risks.push("将关闭遥控失联保护");
    const gcsKey = fsGcsParamName();
    const oldGcsFs = getParam(gcsKey, getParam("FS_GCS_ENABLE", 1));
    if (oldGcsFs !== 0 && draft[gcsKey] === 0) risks.push("将关闭 GCS 失联保护");
    const armingParam = armingSkipParamName();
    const armingVal = draft[armingParam];
    if (armingParam === "ARMING_SKIPCHK") {
      if (armingVal === -1 || isAllKnownChecksSkipped(armingVal)) {
        risks.push("将跳过全部解锁前检查（仅保留强制项）");
      }
    } else if (armingVal === 0) {
      risks.push("将跳过全部解锁前检查（仅保留强制项）");
    }
    if (!risks.length) return true;
    return window.confirm(`检测到高风险修改:\n- ${risks.join("\n- ")}\n\n确认继续写入飞控吗？`);
  }

  async function writeSafetyParams() {
    if (!canWrite()) {
      setStatus("写入失败：未连接飞控或 sendParamSet 不可用。", true);
      return;
    }
    const draft = currentDraft();
    if (!guardRiskyChanges(draft)) {
      setStatus("已取消写入。");
      return;
    }

    const writeOrder = buildWriteOrder(draft);
    setStatus("正在写入安全参数…");
    let sent = 0;
    const failed = [];
    /* eslint-disable no-await-in-loop */
    for (const key of writeOrder) {
      if (!Object.prototype.hasOwnProperty.call(draft, key)) continue;
      const ok = await window.sendParamSet(key, draft[key]);
      if (ok) {
        sent += 1;
        if (window.params instanceof Map) window.params.set(key, draft[key]);
      } else {
        failed.push(key);
      }
      await sleep(40);
    }
    /* eslint-enable no-await-in-loop */

    if (sent === 0) {
      setStatus("写入失败：飞控未响应。", true);
      return;
    }
    const msg = failed.length
      ? `已写入 ${sent} 项，失败 ${failed.length} 项（${failed.join(", ")}）`
      : `已写入 ${sent} 项安全参数。`;
    setStatus(msg, failed.length > 0);
    if (typeof window.log === "function") window.log(`🛡️ ${msg}`, "safety-param-write");
    hydrateFromParams(true);
  }

  function onVehicleContextMaybeChanged(force = false) {
    const now = Date.now();
    if (!force && now - lastProfileCheckAt < 800) return;
    lastProfileCheckAt = now;
    const prevKind = rtlRenderedKind || rtlProfile.kind;
    const prevArmingKind = armingRenderedKind || rtlProfile.kind;
    const prevFsDetectKind = fsDetectRenderedKind || rtlProfile.kind;
    const profile = getVehicleProfile();
    ensureRtlCard(force);
    ensureLinkFsDetectCard(force);
    ensureArmingCard(force);
    if (force || profile.kind !== prevKind) {
      hydrateRtlFromParams();
      hydrateLinkFsDetectFromParams();
      hydrateArmingSkipChecks();
      setValue("fsThrEnable", getParam(fsThrParamName(), 1));
      setValue("fsGcsEnable", getParam(fsGcsParamName(), 1));
    } else if (force || profile.kind !== prevFsDetectKind) {
      hydrateLinkFsDetectFromParams();
      setValue("fsThrEnable", getParam(fsThrParamName(), 1));
      setValue("fsGcsEnable", getParam(fsGcsParamName(), 1));
    } else if (force || profile.kind !== prevArmingKind) {
      hydrateArmingSkipChecks();
    }
  }

  function bindActions() {
    els.writeBtn?.addEventListener("click", writeSafetyParams);
    els.reloadBtn?.addEventListener("click", () => {
      hydrateFromParams(true);
      setStatus("已从参数表重载。");
    });
    els.fenceEnable?.addEventListener("change", updateTopChips);

    const fencePreviewFields = [els.fenceRadius, els.fenceAltMax, els.fenceType, els.fenceEnable];
    fencePreviewFields.forEach((el) => {
      if (!el) return;
      el.addEventListener("input", updateGeofencePreview);
      el.addEventListener("change", updateGeofencePreview);
    });

    els.armingSkipAll?.addEventListener("change", () => {
      if (els.armingSkipAll.checked) {
        armingVisibleBits.forEach((bit) => {
          const input = els[`armingBit_${bit.id}`];
          if (input) input.checked = false;
        });
      }
      updateArmingSkipBanner();
      updateArmingMaskReadout();
      disableForm(window._gcsConnState !== "connected");
    });
  }

  function bindPrearmHook() {
    prevPrearmHook = typeof window.gcsOnPrearmStatustext === "function"
      ? window.gcsOnPrearmStatustext
      : null;
    window.gcsOnPrearmStatustext = function onPrearmFromSafety(text) {
      if (prevPrearmHook) {
        try { prevPrearmHook(text); } catch (_) { /* ignore */ }
      }
      const raw = String(text || "");
      if (!raw) return;
      const low = raw.toLowerCase();
      if (!low.includes("prearm:") && !low.includes("pre-arm") && !low.includes("arming denied")) return;
      lastPrearmText = raw;
      updatePrearmSummary();
    };
  }

  function tick() {
    if (!document.getElementById("setup-panel-safety")) return;
    const connected = window._gcsConnState === "connected";
    disableForm(!connected);
    updateTopChips();
  }

  function mount() {
    if (mounted) return;
    if (!document.getElementById("setup-panel-safety")) return;

    els.fenceEnable = q("safety-fence-enable");
    els.fenceType = q("safety-fence-type");
    els.fenceRadius = q("safety-fence-radius");
    els.fenceAltMax = q("safety-fence-altmax");
    els.fenceAction = q("safety-fence-action");
    els.rtlFormRoot = q("safety-rtl-form");
    els.rtlTypeBanner = q("safety-rtl-type-banner");
    els.fsThrEnable = q("safety-fs-thr-enable");
    els.fsThrEnableTag = q("safety-fs-thr-enable-tag");
    els.fsGcsEnable = q("safety-fs-gcs-enable");
    els.fsGcsEnableTag = q("safety-fs-gcs-enable-tag");
    els.fsOptionsGrid = q("safety-fs-options-grid");
    els.fsOptionsReadout = q("safety-fs-options-readout");
    els.fsDetectFormRoot = q("safety-fs-detect-form");
    els.fsDetectBanner = q("safety-fs-detect-banner");
    renderFsOptionsGrid();
    renderLinkFsDetectForm(getVehicleProfile(), true);
    els.armingCheckGrid = q("safety-arming-check-grid");
    els.armingSkipBanner = q("safety-arming-skip-banner");
    els.armingMaskReadout = q("safety-arming-mask-readout");
    els.armingSkipAll = q("safety-arming-skip-all");
    els.prearmSummary = q("safety-prearm-summary");

    renderArmingCheckGrid(getVehicleProfile(), true);
    els.writeBtn = q("safety-write-params-btn");
    els.reloadBtn = q("safety-reload-btn");
    els.writeStatus = q("safety-write-status");
    els.prearmChip = q("safety-prearm-chip");
    els.fenceChip = q("safety-fence-chip");
    els.geofenceCanvas = q("safety-geofence-viz");
    els.geofenceOverlay = q("safety-geofence-overlay");

    renderRtlCard(getVehicleProfile(), true);

    bindActions();
    bindPrearmHook();
    hydrateFromParams(true);
    updatePrearmSummary();
    tick();

    if (els.geofenceCanvas && window.THREE && window.GeofenceVizThree) {
      geofenceVizApi = window.GeofenceVizThree.create(els.geofenceCanvas);
      if (geofenceVizApi) {
        updateGeofencePreview();
        const host = els.geofenceCanvas.parentElement || els.geofenceCanvas;
        if (typeof ResizeObserver !== "undefined") {
          const ro = new ResizeObserver(() => {
            if (geofenceVizApi && typeof geofenceVizApi.resize === "function") {
              geofenceVizApi.resize();
            }
          });
          ro.observe(host);
        }
      }
    }

    document.addEventListener("gcs-connection", () => {
      if (window._gcsConnState === "connected") {
        setStatus("飞控已连接，可编辑安全参数。");
      } else {
        setStatus("飞控未连接，安全页进入只读。", true);
      }
      onVehicleContextMaybeChanged(true);
      tick();
    });

    document.addEventListener("gcs-sensor-overview-changed", () => hydrateFromParams(true));

    document.addEventListener("gcs-heartbeat", () => onVehicleContextMaybeChanged(false));
    document.addEventListener("gcs-airframe-params-changed", () => onVehicleContextMaybeChanged(true));

    window.addEventListener("gcs:setup-panel-changed", (ev) => {
      if (ev?.detail?.panel === "safety") {
        onVehicleContextMaybeChanged(true);
        hydrateFromParams(true);
        if (geofenceVizApi && typeof geofenceVizApi.resize === "function") {
          requestAnimationFrame(() => {
            if (geofenceVizApi) geofenceVizApi.resize();
            if (typeof updateGeofencePreview === "function") updateGeofencePreview();
          });
        }
      }
    });

    setInterval(tick, 1000);
    mounted = true;
  }

  window.addEventListener("DOMContentLoaded", mount);
})();

(function initAirframeSetupWizard() {
  const FRAME_TYPE = {
    CONVENTIONAL: "CONVENTIONAL",
    FLYING_WING: "FLYING_WING",
    VTOL: "VTOL",
  };

  const VTOL_TYPE = {
    QUADPLANE: "QUADPLANE",
    TAILSITTER: "TAILSITTER",
    TILTROTOR: "TILTROTOR",
  };

  const ROOT_ID = "af-wizard-root";

  const FRAME_TYPE_CARDS = [
    {
      id: FRAME_TYPE.CONVENTIONAL,
      title: "Conventional",
      subtitle: "常规固定翼",
      accent: "#4da3ff",
      badge: "标准布局",
      description: "进入控制面与舵机通道配置流程，并生成 SERVOx_FUNCTION 参数。",
      artSrc: "assets/airframe/conventional-plane.png",
      artAlt: "常规固定翼示意图",
    },
    {
      id: FRAME_TYPE.FLYING_WING,
      title: "Flying Wing",
      subtitle: "飞翼 / 三角翼",
      accent: "#35c47a",
      badge: "Elevon",
      description: "当前先保留为直接预览模式，预览参数仅写入 Q_ENABLE = 0。",
      artSrc: "assets/airframe/flying-wing.png",
      artAlt: "飞翼 / 三角翼示意图",
    },
    {
      id: FRAME_TYPE.VTOL,
      title: "VTOL",
      subtitle: "垂起固定翼",
      accent: "#ff9f43",
      badge: "多步骤",
      description: "进入 VTOL 子类型与电机配置流程，生成 Q_FRAME / Q_TILT / Q_TAILSIT 参数。",
      artSrc: "assets/airframe/vtol-quadplane.png",
      artAlt: "垂起固定翼示意图",
    },
    {
      key: "landing_gear",
      title: "起落架 Landing Gear",
      required: false,
      icon: "LG",
      options: [
        { value: "none", label: "无起落架" },
        { value: "single", label: "单起落架" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "landing-gear", label: "起落架", func: 29, comment: "起落架" }],
      },
    },
    {
      key: "landing_gear",
      title: "起落架 Landing Gear",
      required: false,
      icon: "LG",
      options: [
        { value: "none", label: "无起落架" },
        { value: "single", label: "单起落架" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "landing-gear", label: "起落架", func: 29, comment: "起落架" }],
      },
    },
  ];

  const VTOL_TYPE_CARDS = [
    {
      id: VTOL_TYPE.QUADPLANE,
      title: "QuadPlane",
      subtitle: "附加升力电机垂起",
      accent: "#7c6cff",
      description: "机身水平，额外旋翼负责垂直起降。",
    },
    {
      id: VTOL_TYPE.TAILSITTER,
      title: "Tailsitter",
      subtitle: "尾座式",
      accent: "#ff7b54",
      description: "机身竖立起降，整体倾转进入巡航。",
    },
    {
      id: VTOL_TYPE.TILTROTOR,
      title: "TiltRotor",
      subtitle: "倾转旋翼",
      accent: "#ff5d73",
      description: "旋翼倾转过渡，机身保持接近水平。",
    },
  ];

  const Q_FRAME_CLASS_OPTIONS = [
    { id: 1, title: "Quad x4", subtitle: "四电机", motors: 4, accent: "#4da3ff" },
    { id: 2, title: "Hexa x6", subtitle: "六电机", motors: 6, accent: "#35c47a" },
    { id: 3, title: "Octa x8", subtitle: "八电机", motors: 8, accent: "#ffb347" },
    { id: 4, title: "OctaQuad", subtitle: "共轴八电机", motors: 8, accent: "#8f7cff" },
    { id: 5, title: "Y6", subtitle: "Y6", motors: 6, accent: "#ff7b54" },
    { id: 7, title: "Tri x3", subtitle: "三电机", motors: 3, accent: "#35b6b4" },
  ];

  const Q_FRAME_TYPE_OPTIONS = {
    1: [
      { id: 0, title: "Plus", subtitle: "十字布局" },
      { id: 1, title: "X", subtitle: "X 布局" },
      { id: 2, title: "V", subtitle: "V 布局" },
      { id: 3, title: "H", subtitle: "H 布局" },
      { id: 6, title: "Reversed X", subtitle: "反 X 布局" },
    ],
    2: [
      { id: 0, title: "Plus", subtitle: "十字布局" },
      { id: 1, title: "X", subtitle: "X 布局" },
      { id: 2, title: "V", subtitle: "V 布局" },
      { id: 3, title: "H", subtitle: "H 布局" },
      { id: 6, title: "Reversed X", subtitle: "反 X 布局" },
    ],
    3: [
      { id: 0, title: "Plus", subtitle: "十字布局" },
      { id: 1, title: "X", subtitle: "X 布局" },
      { id: 2, title: "V", subtitle: "V 布局" },
      { id: 3, title: "H", subtitle: "H 布局" },
      { id: 6, title: "Reversed X", subtitle: "反 X 布局" },
    ],
    4: [
      { id: 1, title: "X", subtitle: "标准共轴 X" },
      { id: 6, title: "Reversed X", subtitle: "反 X 共轴" },
    ],
    5: [
      { id: 10, title: "Y6B", subtitle: "Y6B (10)" },
      { id: 11, title: "FireFly", subtitle: "FireFly (11)" },
    ],
    7: [
      { id: 0, title: "Plus", subtitle: "三轴 Plus" },
      { id: 1, title: "X", subtitle: "三轴 X" },
    ],
  };

  const TAILSITTER_CONTROL_OPTIONS = [
    {
      id: 1,
      title: "有控制面",
      subtitle: "Q_TAILSIT_ENABLE = 1",
      accent: "#4da3ff",
      description: "副翼 / 升降舵参与姿态控制。",
    },
    {
      id: 2,
      title: "纯电机控制",
      subtitle: "Q_TAILSIT_ENABLE = 2",
      accent: "#ff7b54",
      description: "无控制面，仅依靠电机差速控制。",
    },
  ];

  const CONVENTIONAL_DEFAULTS = {
    aileron: "none",
    elevator: "single",
    rudder: "none",
    throttle: "single",
    flap: "none",
    spoiler: "none",
    servos: {
      "elevator-single": "SERVO1",
      "throttle-single": "SERVO2",
    },
  };

  const FLYING_WING_DEFAULTS = {
    elevon: "dual",
    throttle: "single",
    rudder: "none",
    landing_gear: "none",
    mixing_gain: 0.5,
    mixing_offset: 0,
    servos: {},
  };

  const CONVENTIONAL_SECTIONS = [
    {
      key: "aileron",
      title: "副翼 Aileron",
      required: false,
      icon: "AI",
      options: [
        { value: "none", label: "无副翼" },
        { value: "single", label: "单副翼" },
        { value: "dual", label: "双副翼" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "aileron-single", label: "副翼", func: 4, comment: "副翼" }],
        dual: [
          { key: "aileron-left", label: "左副翼", func: 4, comment: "左副翼" },
          { key: "aileron-right", label: "右副翼", func: 3, comment: "右副翼" },
        ],
      },
    },
    {
      key: "elevator",
      title: "升降舵 Elevator",
      required: true,
      icon: "EL",
      options: [
        { value: "single", label: "单升降舵" },
        { value: "dual", label: "双平尾" },
      ],
      rowsByOption: {
        single: [{ key: "elevator-single", label: "升降舵", func: 19, comment: "升降舵" }],
        dual: [
          { key: "elevator-left", label: "左升降舵 / 平尾", func: 19, comment: "左升降舵" },
          { key: "elevator-right", label: "右升降舵 / 平尾", func: 21, comment: "右升降舵" },
        ],
      },
    },
    {
      key: "rudder",
      title: "方向舵 Rudder",
      required: false,
      icon: "RU",
      options: [
        { value: "none", label: "无方向舵" },
        { value: "single", label: "单垂尾" },
        { value: "dual", label: "双垂尾" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "rudder-single", label: "方向舵", func: 21, comment: "方向舵" }],
        dual: [
          { key: "rudder-left", label: "左垂尾", func: 21, comment: "左垂尾" },
          { key: "rudder-right", label: "右垂尾", func: 22, comment: "右垂尾" },
        ],
      },
    },
    {
      key: "throttle",
      title: "油门 Throttle",
      required: true,
      icon: "TH",
      options: [
        { value: "single", label: "单电机" },
        { value: "dual", label: "双电机" },
      ],
      rowsByOption: {
        single: [{ key: "throttle-single", label: "电机", func: 70, comment: "电机" }],
        dual: [
          { key: "throttle-left", label: "左电机", func: 70, comment: "左电机" },
          { key: "throttle-right", label: "右电机", func: 73, comment: "右电机" },
        ],
      },
    },
    {
      key: "flap",
      title: "襟翼 Flap",
      required: false,
      icon: "FL",
      options: [
        { value: "none", label: "无襟翼" },
        { value: "single", label: "单襟翼" },
        { value: "dual", label: "双襟翼" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "flap-single", label: "襟翼", func: 2, comment: "襟翼" }],
        dual: [
          { key: "flap-left", label: "左襟翼", func: 2, comment: "左襟翼" },
          { key: "flap-right", label: "右襟翼", func: 5, comment: "右襟翼" },
        ],
      },
    },
    {
      key: "spoiler",
      title: "扰流板 Spoiler",
      required: false,
      icon: "SP",
      options: [
        { value: "none", label: "无" },
        { value: "single", label: "有扰流板" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "spoiler-single", label: "扰流板", func: 40, comment: "扰流板" }],
      },
    },
  ];

  const FLYING_WING_SECTIONS = [
    {
      key: "elevon",
      title: "Elevon 混控面",
      required: true,
      icon: "EV",
      options: [{ value: "dual", label: "双 Elevon" }],
      rowsByOption: {
        dual: [
          { key: "elevon-left", label: "左 Elevon", func: 77, comment: "左 Elevon" },
          { key: "elevon-right", label: "右 Elevon", func: 78, comment: "右 Elevon" },
        ],
      },
    },
    {
      key: "throttle",
      title: "油门 Throttle",
      required: true,
      icon: "TH",
      options: [
        { value: "single", label: "单电机" },
        { value: "dual", label: "双电机" },
      ],
      rowsByOption: {
        single: [{ key: "throttle-single", label: "电机", func: 70, comment: "电机" }],
        dual: [
          { key: "throttle-left", label: "左电机", func: 73, comment: "左电机" },
          { key: "throttle-right", label: "右电机", func: 74, comment: "右电机" },
        ],
      },
    },
    {
      key: "rudder",
      title: "方向舵 Rudder",
      required: false,
      icon: "RU",
      options: [
        { value: "none", label: "无方向舵" },
        { value: "single", label: "单方向舵" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "rudder-single", label: "方向舵", func: 21, comment: "方向舵" }],
      },
    },
    {
      key: "landing_gear",
      title: "起落架 Landing Gear",
      required: false,
      icon: "LG",
      options: [
        { value: "none", label: "无起落架" },
        { value: "single", label: "单起落架" },
      ],
      rowsByOption: {
        none: [],
        single: [{ key: "landing-gear", label: "起落架", func: 29, comment: "起落架" }],
      },
    },
  ];

  const SERVO_OPTIONS = Array.from({ length: 16 }, (_, index) => `SERVO${index + 1}`);

  const state = {
    step: 1,
    frame_type: null,
    vtol_type: null,
    q_frame_class: null,
    q_frame_type: null,
    q_tailsit_enable: null,
    q_tilt_enable: null,
    q_tilt_mask: null,
    fc_connected: false,
    writing: false,
    writeProgress: [],
    lastWriteFailed: false,
    conventional: createConventionalState(),
    flyingWing: createFlyingWingState(),
    conventionalDirty: false,
    conventionalSyncSignature: "",
    flyingWingDirty: false,
    flyingWingSyncSignature: "",
    servoMenuOpen: false,
    pendingExternalRender: false,
  };

  function createConventionalState() {
    return {
      aileron: CONVENTIONAL_DEFAULTS.aileron,
      elevator: CONVENTIONAL_DEFAULTS.elevator,
      rudder: CONVENTIONAL_DEFAULTS.rudder,
      throttle: CONVENTIONAL_DEFAULTS.throttle,
      flap: CONVENTIONAL_DEFAULTS.flap,
      spoiler: CONVENTIONAL_DEFAULTS.spoiler,
      servos: { ...CONVENTIONAL_DEFAULTS.servos },
    };
  }

  function createFlyingWingState() {
    return {
      elevon: FLYING_WING_DEFAULTS.elevon,
      throttle: FLYING_WING_DEFAULTS.throttle,
      rudder: FLYING_WING_DEFAULTS.rudder,
      landing_gear: FLYING_WING_DEFAULTS.landing_gear,
      mixing_gain: FLYING_WING_DEFAULTS.mixing_gain,
      mixing_offset: FLYING_WING_DEFAULTS.mixing_offset,
      servos: { ...FLYING_WING_DEFAULTS.servos },
    };
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function flushDeferredRender() {
    if (!state.pendingExternalRender || state.servoMenuOpen || state.writing) return;
    state.pendingExternalRender = false;
    render();
  }

  function refreshConnectionBadge() {
    const shell = root();
    if (!shell) return;
    const conn = shell.querySelector(".afw-conn");
    if (!conn) return;
    state.fc_connected = isConnected();
    conn.className = `afw-conn ${state.fc_connected ? "online" : "offline"}`;
    conn.textContent = state.fc_connected ? "椋炴帶鍦ㄧ嚎" : "椋炴帶绂荤嚎";
  }

  function requestExternalRender() {
    if (state.writing) return;
    if (state.servoMenuOpen) {
      state.pendingExternalRender = true;
      return;
    }
    render();
  }

  function requestHeartbeatRefresh() {
    if (state.writing) return;
    if (state.frame_type === FRAME_TYPE.FLYING_WING && state.step === 2) {
      refreshConnectionBadge();
      return;
    }
    requestExternalRender();
  }

  function refreshConnectionBadge() {
    const shell = root();
    if (!shell) return;
    const conn = shell.querySelector(".afw-conn");
    if (!conn) return;
    state.fc_connected = isConnected();
    conn.className = `afw-conn ${state.fc_connected ? "online" : "offline"}`;
    conn.textContent = state.fc_connected ? "\u98de\u63a7\u5728\u7ebf" : "\u98de\u63a7\u79bb\u7ebf";
  }

  function isConnected() {
    return (window._gcsConnState || "").toLowerCase() === "connected";
  }

  function logMessage(text, key) {
    if (typeof window.log === "function") window.log(text, key || "airframe-wizard");
  }

  function resetVtolSelections() {
    state.vtol_type = null;
    state.q_frame_class = null;
    state.q_frame_type = null;
    state.q_tailsit_enable = null;
    state.q_tilt_enable = null;
    state.q_tilt_mask = null;
  }

  function resetMotorSelections() {
    state.q_frame_class = null;
    state.q_frame_type = null;
    state.q_tailsit_enable = null;
    state.q_tilt_enable = null;
    state.q_tilt_mask = null;
  }

  function resetForFrameType(frameType) {
    if (frameType === FRAME_TYPE.CONVENTIONAL) {
      state.conventional = createConventionalState();
      state.flyingWing = createFlyingWingState();
      resetVtolSelections();
    } else if (frameType === FRAME_TYPE.FLYING_WING) {
      resetVtolSelections();
      state.conventional = createConventionalState();
      state.flyingWing = createFlyingWingState();
    } else if (frameType === FRAME_TYPE.VTOL) {
      state.conventional = createConventionalState();
      state.flyingWing = createFlyingWingState();
      resetVtolSelections();
    }
  }

  function getClassOption(id) {
    return Q_FRAME_CLASS_OPTIONS.find((item) => item.id === id) || null;
  }

  function getFrameTypeOptions(classId) {
    return Q_FRAME_TYPE_OPTIONS[classId] || [];
  }

  function currentMotorCount() {
    const klass = getClassOption(state.q_frame_class);
    return klass ? klass.motors : 0;
  }

  function getParamMap() {
    return window.params instanceof Map ? window.params : null;
  }

  function servoSort(a, b) {
    return Number(a.replace("SERVO", "")) - Number(b.replace("SERVO", ""));
  }

  function conventionalSignatureFromParams() {
    const pmap = getParamMap();
    if (!pmap) return "";
    const pairs = [];
    pmap.forEach((value, key) => {
      if (/^SERVO\d+_FUNCTION$/.test(key)) {
        pairs.push(`${key}=${Number(value)}`);
      }
    });
    pairs.sort();
    return pairs.join("|");
  }

  function consumeServo(funcMap, funcValue) {
    const list = funcMap.get(funcValue) || [];
    if (!list.length) return null;
    return list.shift() || null;
  }

  function syncConventionalFromFlightController(force) {
    const signature = conventionalSignatureFromParams();
    if (!force && state.conventionalDirty) return;
    if (!force && signature && signature === state.conventionalSyncSignature) return;

    const next = createConventionalState();
    const pmap = getParamMap();
    if (!pmap) {
      state.conventional = next;
      state.conventionalDirty = false;
      state.conventionalSyncSignature = "";
      return;
    }

    const funcMap = new Map();
    pmap.forEach((rawValue, key) => {
      const match = key.match(/^SERVO(\d+)_FUNCTION$/);
      if (!match) return;
      const value = Math.round(Number(rawValue));
      if (!Number.isFinite(value)) return;
      const servoName = `SERVO${match[1]}`;
      if (!funcMap.has(value)) funcMap.set(value, []);
      funcMap.get(value).push(servoName);
    });
    funcMap.forEach((list) => list.sort(servoSort));

    const aileronLeft = consumeServo(funcMap, 4);
    const aileronRight = consumeServo(funcMap, 3);
    if (aileronLeft && aileronRight) {
      next.aileron = "dual";
      next.servos["aileron-left"] = aileronLeft;
      next.servos["aileron-right"] = aileronRight;
    } else if (aileronLeft) {
      next.aileron = "single";
      next.servos["aileron-single"] = aileronLeft;
    }

    const throttleSingle = consumeServo(funcMap, 70);
    const throttleRight = consumeServo(funcMap, 73);
    if (throttleSingle && throttleRight) {
      next.throttle = "dual";
      next.servos["throttle-left"] = throttleSingle;
      next.servos["throttle-right"] = throttleRight;
    } else if (throttleSingle) {
      next.throttle = "single";
      next.servos["throttle-single"] = throttleSingle;
    }

    const flapLeft = consumeServo(funcMap, 2);
    const flapRight = consumeServo(funcMap, 5);
    if (flapLeft && flapRight) {
      next.flap = "dual";
      next.servos["flap-left"] = flapLeft;
      next.servos["flap-right"] = flapRight;
    } else if (flapLeft) {
      next.flap = "single";
      next.servos["flap-single"] = flapLeft;
    }

    const spoilerSingle = consumeServo(funcMap, 40);
    if (spoilerSingle) {
      next.spoiler = "single";
      next.servos["spoiler-single"] = spoilerSingle;
    }

    const elevatorMain = consumeServo(funcMap, 19);
    const func21List = funcMap.get(21) || [];
    const func22List = funcMap.get(22) || [];

    if (elevatorMain && func21List.length >= 2) {
      next.elevator = "dual";
      next.servos["elevator-left"] = elevatorMain;
      next.servos["elevator-right"] = func21List.shift();
      next.rudder = "single";
      next.servos["rudder-single"] = func21List.shift();
    } else if (elevatorMain && func21List.length === 1 && func22List.length === 0) {
      next.elevator = "single";
      next.servos["elevator-single"] = elevatorMain;
      next.rudder = "single";
      next.servos["rudder-single"] = func21List.shift();
    } else if (elevatorMain && func21List.length >= 1 && func22List.length >= 1) {
      next.elevator = "single";
      next.servos["elevator-single"] = elevatorMain;
      next.rudder = "dual";
      next.servos["rudder-left"] = func21List.shift();
      next.servos["rudder-right"] = func22List.shift();
    } else if (elevatorMain) {
      next.elevator = "single";
      next.servos["elevator-single"] = elevatorMain;
    }

    if (!elevatorMain && func21List.length >= 1 && func22List.length >= 1) {
      next.rudder = "dual";
      next.servos["rudder-left"] = func21List.shift();
      next.servos["rudder-right"] = func22List.shift();
    } else if (!elevatorMain && func21List.length >= 1) {
      next.rudder = "single";
      next.servos["rudder-single"] = func21List.shift();
    }

    state.conventional = next;
    state.conventionalDirty = false;
    state.conventionalSyncSignature = signature;
  }

  function syncFlyingWingFromFlightController(force) {
    const signature = conventionalSignatureFromParams();
    if (!force && state.flyingWingDirty) return;
    if (!force && signature && signature === state.flyingWingSyncSignature) return;

    const next = createFlyingWingState();
    const pmap = getParamMap();
    if (!pmap) {
      state.flyingWing = next;
      state.flyingWingDirty = false;
      state.flyingWingSyncSignature = "";
      return;
    }

    const funcMap = new Map();
    pmap.forEach((rawValue, key) => {
      const match = key.match(/^SERVO(\d+)_FUNCTION$/);
      if (!match) return;
      const value = Math.round(Number(rawValue));
      if (!Number.isFinite(value)) return;
      const servoName = `SERVO${match[1]}`;
      if (!funcMap.has(value)) funcMap.set(value, []);
      funcMap.get(value).push(servoName);
    });
    funcMap.forEach((list) => list.sort(servoSort));

    const elevonLeft = consumeServo(funcMap, 77);
    const elevonRight = consumeServo(funcMap, 78);
    if (elevonLeft) next.servos["elevon-left"] = elevonLeft;
    if (elevonRight) next.servos["elevon-right"] = elevonRight;

    const throttleSingle = consumeServo(funcMap, 70);
    const throttleLeft = consumeServo(funcMap, 73);
    const throttleRight = consumeServo(funcMap, 74);
    if (throttleLeft && throttleRight) {
      next.throttle = "dual";
      next.servos["throttle-left"] = throttleLeft;
      next.servos["throttle-right"] = throttleRight;
      delete next.servos["throttle-single"];
    } else if (throttleSingle) {
      next.throttle = "single";
      next.servos["throttle-single"] = throttleSingle;
      delete next.servos["throttle-left"];
      delete next.servos["throttle-right"];
    }

    const rudderSingle = consumeServo(funcMap, 21);
    if (rudderSingle) {
      next.rudder = "single";
      next.servos["rudder-single"] = rudderSingle;
    } else {
      delete next.servos["rudder-single"];
    }

    const landingGear = consumeServo(funcMap, 29);
    if (landingGear) {
      next.landing_gear = "single";
      next.servos["landing-gear"] = landingGear;
    } else {
      delete next.servos["landing-gear"];
    }

    const mixingGain = Number(pmap.get("MIXING_GAIN"));
    if (Number.isFinite(mixingGain)) next.mixing_gain = mixingGain;
    const mixingOffset = Number(pmap.get("MIXING_OFFSET"));
    if (Number.isFinite(mixingOffset)) next.mixing_offset = Math.round(mixingOffset);

    state.flyingWing = next;
    state.flyingWingDirty = false;
    state.flyingWingSyncSignature = signature;
  }

  function getConventionalSection(sectionKey) {
    return CONVENTIONAL_SECTIONS.find((section) => section.key === sectionKey) || null;
  }

  function getConventionalRows(sectionKey, optionValue) {
    const section = getConventionalSection(sectionKey);
    if (!section) return [];
    return section.rowsByOption[optionValue] || [];
  }

  function setFrameType(frameType) {
    const previousFrameType = state.frame_type;
    if (state.frame_type !== frameType) {
      state.frame_type = frameType;
      resetForFrameType(frameType);
    }
    if (frameType === FRAME_TYPE.CONVENTIONAL && previousFrameType !== FRAME_TYPE.CONVENTIONAL) {
      syncConventionalFromFlightController(true);
    }
    if (frameType === FRAME_TYPE.FLYING_WING && previousFrameType !== FRAME_TYPE.FLYING_WING) {
      syncFlyingWingFromFlightController(true);
    }
    if (frameType === FRAME_TYPE.CONVENTIONAL || frameType === FRAME_TYPE.FLYING_WING || frameType === FRAME_TYPE.VTOL) {
      state.step = 2;
    } else {
      state.step = 3;
    }
    render();
  }

  function setVtolType(vtolType) {
    if (state.vtol_type !== vtolType) {
      state.vtol_type = vtolType;
      resetMotorSelections();
    }
    if (vtolType === VTOL_TYPE.TAILSITTER) {
      state.q_frame_class = 10;
    }
    render();
  }

  function setQFrameClass(classId) {
    state.q_frame_class = classId;
    const frameTypes = getFrameTypeOptions(classId);
    if (!frameTypes.some((item) => item.id === state.q_frame_type)) {
      state.q_frame_type = frameTypes.length ? frameTypes[0].id : null;
    }
    if (state.vtol_type === VTOL_TYPE.TILTROTOR) {
      state.q_tilt_mask = null;
      state.q_tilt_enable = null;
    }
    render();
  }

  function setQFrameType(typeId) {
    state.q_frame_type = typeId;
    render();
  }

  function setTailsitterControl(value) {
    state.q_tailsit_enable = value;
    render();
  }

  function toggleTiltMotor(index) {
    const current = state.q_tilt_mask == null ? 0 : state.q_tilt_mask;
    const bit = 1 << index;
    const next = current ^ bit;
    state.q_tilt_mask = next;
    state.q_tilt_enable = next > 0 ? 1 : null;
    render();
  }

  function setConventionalOption(sectionKey, optionValue) {
    const previousRows = getConventionalRows(sectionKey, state.conventional[sectionKey]);
    previousRows.forEach((row) => {
      delete state.conventional.servos[row.key];
    });

    state.conventional[sectionKey] = optionValue;
    const nextRows = getConventionalRows(sectionKey, optionValue);

    nextRows.forEach((row, index) => {
      const fallback = SERVO_OPTIONS.find((servo) => !Object.values(state.conventional.servos).includes(servo)) || SERVO_OPTIONS[index] || "SERVO1";
      state.conventional.servos[row.key] = fallback;
    });

    state.conventionalDirty = true;
    render();
  }

  function setConventionalServo(rowKey, servoName) {
    state.conventional.servos[rowKey] = servoName;
    state.conventionalDirty = true;
    render();
  }

  function frameTypeLabel(value) {
    const card = FRAME_TYPE_CARDS.find((item) => item.id === value);
    return card ? card.subtitle : "未选择";
  }

  function vtolTypeLabel(value) {
    const card = VTOL_TYPE_CARDS.find((item) => item.id === value);
    return card ? card.title : "未选择";
  }

  function tailsitterLabel(value) {
    const row = TAILSITTER_CONTROL_OPTIONS.find((item) => item.id === value);
    return row ? row.title : "未选择";
  }

  function qFrameTypeLabel() {
    const row = getFrameTypeOptions(state.q_frame_class).find((item) => item.id === state.q_frame_type);
    return row ? row.title : "未选择";
  }

  function buildPathParts() {
    const parts = [];
    if (state.frame_type) parts.push(frameTypeLabel(state.frame_type));
    if (state.frame_type === FRAME_TYPE.CONVENTIONAL) parts.push("控制面配置");
    if (state.frame_type === FRAME_TYPE.FLYING_WING) parts.push("飞翼配置");
    if (state.vtol_type) parts.push(vtolTypeLabel(state.vtol_type));
    if (state.vtol_type === VTOL_TYPE.TAILSITTER && state.q_tailsit_enable != null) {
      parts.push(tailsitterLabel(state.q_tailsit_enable));
    }
    if (state.q_frame_class != null && state.vtol_type !== VTOL_TYPE.TAILSITTER) {
      const klass = getClassOption(state.q_frame_class);
      parts.push(klass ? klass.title : `Q_FRAME_CLASS=${state.q_frame_class}`);
    }
    if (state.q_frame_type != null && state.vtol_type !== VTOL_TYPE.TAILSITTER) {
      parts.push(qFrameTypeLabel());
    }
    return parts;
  }

  function getConventionalConflictList() {
    const servoOwners = new Map();
    CONVENTIONAL_SECTIONS.forEach((section) => {
      const rows = getConventionalRows(section.key, state.conventional[section.key]);
      rows.forEach((row) => {
        const servo = state.conventional.servos[row.key];
        if (!servo) return;
        if (!servoOwners.has(servo)) servoOwners.set(servo, []);
        servoOwners.get(servo).push(row.comment);
      });
    });

    return [...servoOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([servo, owners]) => ({ servo, owners }));
  }

  function isConventionalConfigured() {
    return Boolean(state.conventional.elevator && state.conventional.throttle);
  }

  function getFlyingWingSection(sectionKey) {
    return FLYING_WING_SECTIONS.find((section) => section.key === sectionKey) || null;
  }

  function getFlyingWingRows(sectionKey, optionValue) {
    const section = getFlyingWingSection(sectionKey);
    if (!section) return [];
    return section.rowsByOption[optionValue] || [];
  }

  function setFlyingWingOption(sectionKey, optionValue) {
    const previousRows = getFlyingWingRows(sectionKey, state.flyingWing[sectionKey]);
    previousRows.forEach((row) => {
      delete state.flyingWing.servos[row.key];
    });

    state.flyingWing[sectionKey] = optionValue;
    const nextRows = getFlyingWingRows(sectionKey, optionValue);
    nextRows.forEach((row, index) => {
      const fallback =
        SERVO_OPTIONS.find((servo) => !Object.values(state.flyingWing.servos).includes(servo)) ||
        SERVO_OPTIONS[index] ||
        "SERVO1";
      state.flyingWing.servos[row.key] = fallback;
    });
    state.flyingWingDirty = true;
    render();
  }

  function setFlyingWingServo(rowKey, servoName) {
    if (!servoName) {
      delete state.flyingWing.servos[rowKey];
    } else {
      state.flyingWing.servos[rowKey] = servoName;
    }
    state.flyingWingDirty = true;
    render();
  }

  function setFlyingWingMixingValue(key, rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return;
    if (key === "mixing_gain") {
      state.flyingWing.mixing_gain = Math.min(1.2, Math.max(0.5, numeric));
    } else if (key === "mixing_offset") {
      state.flyingWing.mixing_offset = Math.min(1000, Math.max(-1000, Math.round(numeric)));
    }
    state.flyingWingDirty = true;
    render();
  }

  function getFlyingWingConflictList() {
    const servoOwners = new Map();
    FLYING_WING_SECTIONS.forEach((section) => {
      const rows = getFlyingWingRows(section.key, state.flyingWing[section.key]);
      rows.forEach((row) => {
        const servo = state.flyingWing.servos[row.key];
        if (!servo) return;
        if (!servoOwners.has(servo)) servoOwners.set(servo, []);
        servoOwners.get(servo).push(row.comment);
      });
    });

    return [...servoOwners.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([servo, owners]) => ({ servo, owners }));
  }

  function isFlyingWingConfigured() {
    return Boolean(
      state.flyingWing.servos["elevon-left"] &&
      state.flyingWing.servos["elevon-right"] &&
      (state.flyingWing.throttle === "dual"
        ? state.flyingWing.servos["throttle-left"] && state.flyingWing.servos["throttle-right"]
        : state.flyingWing.servos["throttle-single"])
    );
  }

  function isStepComplete(step) {
    if (step === 1) return !!state.frame_type;
    if (step === 2) {
      if (state.frame_type === FRAME_TYPE.CONVENTIONAL) return isConventionalConfigured();
      if (state.frame_type === FRAME_TYPE.FLYING_WING) return isFlyingWingConfigured();
      if (state.frame_type !== FRAME_TYPE.VTOL) return true;
      if (!state.vtol_type) return false;
      if (state.vtol_type === VTOL_TYPE.TAILSITTER) return state.q_tailsit_enable != null;
      if (state.q_frame_class == null || state.q_frame_type == null) return false;
      if (state.vtol_type === VTOL_TYPE.TILTROTOR) return !!state.q_tilt_mask;
      return true;
    }
    if (step === 3) return isStepComplete(2);
    if (step === 4) return isStepComplete(3);
    return false;
  }

  function canEnterStep(step) {
    if (step === 1) return true;
    if (step === 2) {
      return (
        state.frame_type === FRAME_TYPE.CONVENTIONAL ||
        state.frame_type === FRAME_TYPE.FLYING_WING ||
        state.frame_type === FRAME_TYPE.VTOL
      );
    }
    if (step === 3) {
      if (!state.frame_type) return false;
      return isStepComplete(2);
    }
    if (step === 4) return isStepComplete(3);
    return false;
  }

  function generateConventionalParams() {
    const params = { Q_ENABLE: 0 };
    CONVENTIONAL_SECTIONS.forEach((section) => {
      const rows = getConventionalRows(section.key, state.conventional[section.key]);
      rows.forEach((row) => {
        const servo = state.conventional.servos[row.key];
        if (servo) {
          params[`${servo}_FUNCTION`] = row.func;
        }
      });
    });
    return params;
  }

  function generateParams() {
    if (state.frame_type === FRAME_TYPE.CONVENTIONAL) {
      return generateConventionalParams();
    }

    const params = {};

    if (state.frame_type === FRAME_TYPE.FLYING_WING) {
      params.Q_ENABLE = 0;
      params.MIXING_GAIN = Number(state.flyingWing.mixing_gain);
      params.MIXING_OFFSET = Number(state.flyingWing.mixing_offset);
      FLYING_WING_SECTIONS.forEach((section) => {
        const rows = getFlyingWingRows(section.key, state.flyingWing[section.key]);
        rows.forEach((row) => {
          const servo = state.flyingWing.servos[row.key];
          if (servo) {
            params[`${servo}_FUNCTION`] = row.func;
          }
        });
      });
      return params;
    }

    if (state.frame_type === FRAME_TYPE.VTOL) {
      params.Q_ENABLE = 1;

      if (state.vtol_type === VTOL_TYPE.QUADPLANE) {
        params.Q_FRAME_CLASS = state.q_frame_class;
        params.Q_FRAME_TYPE = state.q_frame_type;
      } else if (state.vtol_type === VTOL_TYPE.TAILSITTER) {
        params.Q_FRAME_CLASS = 10;
        params.Q_TAILSIT_ENABLE = state.q_tailsit_enable;
      } else if (state.vtol_type === VTOL_TYPE.TILTROTOR) {
        params.Q_FRAME_CLASS = state.q_frame_class;
        params.Q_FRAME_TYPE = state.q_frame_type;
        params.Q_TILT_ENABLE = 1;
        params.Q_TILT_MASK = state.q_tilt_mask;
      }
    }

    return params;
  }

  function stepTitle() {
    if (state.step === 1) return "选择机型大类";
    if (state.step === 2 && state.frame_type === FRAME_TYPE.FLYING_WING) return "飞翼 / 三角翼 — 控制面配置";
    if (state.step === 1) return "选择机型大类";
    if (state.step === 2 && state.frame_type === FRAME_TYPE.CONVENTIONAL) return "常规固定翼 — 控制面配置";
    if (state.step === 2 && !state.vtol_type) return "选择 VTOL 子类型";
    if (state.step === 2 && state.vtol_type === VTOL_TYPE.TAILSITTER) return "选择 Tailsitter 控制方式";
    if (state.step === 2) return "选择电机配置";
    if (state.step === 3) return "参数预览";
    return "写入飞控";
  }

  function stepHint() {
    if (state.step === 1) return "常规固定翼、飞翼都会进入控制面配置；VTOL 会进入第二步。";
    if (state.step === 2 && state.frame_type === FRAME_TYPE.FLYING_WING) return "配置左右 Elevon、油门与可选方向舵，并按飞翼需求调整 MIXING_GAIN / MIXING_OFFSET。";
    if (state.step === 1) return "常规固定翼会进入控制面配置；Flying Wing 当前保留直接预览；VTOL 会进入第二步。";
    if (state.step === 2 && state.frame_type === FRAME_TYPE.CONVENTIONAL) return "为每个控制面选择类型并分配 SERVO1 ~ SERVO16，底部会实时检查通道冲突。";
    if (state.step === 2 && !state.vtol_type) return "TailSitter 会进入控制方式选择；QuadPlane 和 TiltRotor 需要继续配置 Q_FRAME。";
    if (state.step === 2 && state.vtol_type === VTOL_TYPE.TAILSITTER) return "TailSitter 会自动锁定 Q_FRAME_CLASS = 10。";
    if (state.step === 2 && state.vtol_type === VTOL_TYPE.TILTROTOR) return "请先选择 Q_FRAME_CLASS / Q_FRAME_TYPE，再勾选参与倾转的电机。";
    if (state.step === 2) return "请先选择 Q_FRAME_CLASS，再选择 Q_FRAME_TYPE。";
    if (state.step === 3) return "参数会根据当前机体和配置实时生成，确认无误后可进入写入。";
    return "写入参数后需要重启飞控。";
  }

  function renderFrameTypeArt(frameId) {
    const card = FRAME_TYPE_CARDS.find((item) => item.id === frameId);
    if (card?.artSrc) {
      return `<img class="afw-card-art-img" src="${card.artSrc}" alt="${card.artAlt || ""}" loading="lazy" decoding="async">`;
    }
    return "";
  }

  function stepMarkup() {
    const labels = ["Step1", "Step2", "Step3", "Step4"];
    return [1, 2, 3, 4]
      .map((stepNum, index) => {
        const active = state.step === stepNum;
        const done = stepNum < state.step && canEnterStep(stepNum);
        return `
          <button type="button" class="afw-step ${active ? "active" : ""} ${done ? "done" : ""}" data-step-jump="${stepNum}" ${canEnterStep(stepNum) ? "" : "disabled"}>
            <span class="afw-step-no">${stepNum}</span>
            <span class="afw-step-label">${labels[index]}</span>
          </button>
        `;
      })
      .join('<span class="afw-step-arrow">→</span>');
  }

  function renderFrameCards() {
    return FRAME_TYPE_CARDS.map((item) => `
      <button type="button" class="afw-card afw-main-card ${state.frame_type === item.id ? "selected" : ""}" data-frame-type="${item.id}" style="--afw-accent:${item.accent}">
        <div class="afw-card-layout">
          <div class="afw-card-copy">
            <span class="afw-card-icon">${item.title.slice(0, 2).toUpperCase()}</span>
            <strong class="afw-card-title-zh">${item.subtitle}</strong>
            <span class="afw-card-title-en">${item.title}</span>
            <span class="afw-card-badge">${item.badge}</span>
          </div>
          <div class="afw-card-art">${renderFrameTypeArt(item.id)}</div>
        </div>
        <p>${item.description}</p>
      </button>
    `).join("");
  }

  function renderVtolTypeCards() {
    return VTOL_TYPE_CARDS.map((item) => `
      <button type="button" class="afw-card afw-sub-card ${state.vtol_type === item.id ? "selected" : ""}" data-vtol-type="${item.id}" style="--afw-accent:${item.accent}">
        <span class="afw-card-icon">${item.title.slice(0, 2).toUpperCase()}</span>
        <strong>${item.title}</strong>
        <span class="afw-card-subtitle">${item.subtitle}</span>
        <p>${item.description}</p>
      </button>
    `).join("");
  }

  function renderFrameClassCards() {
    return Q_FRAME_CLASS_OPTIONS.map((item) => `
      <button type="button" class="afw-card afw-mini-card ${state.q_frame_class === item.id ? "selected" : ""}" data-q-frame-class="${item.id}" style="--afw-accent:${item.accent}">
        <strong>${item.title}</strong>
        <span class="afw-card-subtitle">${item.subtitle}</span>
        <span class="afw-card-foot">Q_FRAME_CLASS = ${item.id}</span>
      </button>
    `).join("");
  }

  function renderFrameTypeCards() {
    const options = getFrameTypeOptions(state.q_frame_class);
    if (!options.length) return '<div class="afw-empty">请先选择 Q_FRAME_CLASS。</div>';
    return options.map((item) => `
      <button type="button" class="afw-chip ${state.q_frame_type === item.id ? "selected" : ""}" data-q-frame-type="${item.id}">
        <strong>${item.title}</strong>
        <span>${item.subtitle}</span>
      </button>
    `).join("");
  }

  function renderTiltMotorGrid() {
    const count = currentMotorCount();
    if (!count) return '<div class="afw-empty">请先选择 Q_FRAME_CLASS。</div>';
    return Array.from({ length: count }, (_, index) => {
      const checked = !!((state.q_tilt_mask || 0) & (1 << index));
      return `
        <button type="button" class="afw-motor-toggle ${checked ? "selected" : ""}" data-tilt-motor="${index}">
          <span class="afw-motor-no">M${index + 1}</span>
          <span>${checked ? "已选中" : "点击选择"}</span>
        </button>
      `;
    }).join("");
  }

  function renderTailsitterCards() {
    return TAILSITTER_CONTROL_OPTIONS.map((item) => `
      <button type="button" class="afw-card afw-sub-card ${state.q_tailsit_enable === item.id ? "selected" : ""}" data-tailsit-mode="${item.id}" style="--afw-accent:${item.accent}">
        <strong>${item.title}</strong>
        <span class="afw-card-subtitle">${item.subtitle}</span>
        <p>${item.description}</p>
      </button>
    `).join("");
  }

  function renderConventionalServoRow(row) {
    const selectedServo = state.conventional.servos[row.key] || "";
    return `
      <div class="afw-servo-row">
        <span class="afw-servo-label">${row.label}</span>
        <select class="afw-servo-select" data-servo-key="${row.key}">
          ${SERVO_OPTIONS.map((servo) => `<option value="${servo}" ${selectedServo === servo ? "selected" : ""}>${servo}</option>`).join("")}
        </select>
        <span class="afw-func-badge">function=${row.func}</span>
      </div>
    `;
  }

  function renderConventionalSection(section) {
    const optionValue = state.conventional[section.key];
    const activeRows = getConventionalRows(section.key, optionValue);
    const configured = section.required || optionValue !== "none";
    const showRows = activeRows.length > 0;

    return `
      <section class="afw-surface-section ${configured ? "is-configured" : ""}">
        <div class="afw-surface-head">
          <div class="afw-surface-title">
            <span class="afw-surface-icon">${section.icon}</span>
            <strong>${section.title}</strong>
          </div>
          <div class="afw-surface-badges">
            <span class="afw-badge ${section.required ? "is-required" : "is-optional"}">${section.required ? "必选" : "可选"}</span>
            ${configured ? '<span class="afw-badge is-done">✓ 已配置</span>' : ""}
          </div>
        </div>
        <div class="afw-choice-row">
          ${section.options.map((option) => `
            <button type="button" class="afw-choice-btn ${optionValue === option.value ? "selected" : ""}" data-surface-option="${section.key}:${option.value}">
              ${optionValue === option.value ? "✓ " : ""}${option.label}
            </button>
          `).join("")}
        </div>
        ${showRows ? `
          <div class="afw-surface-divider"></div>
          <div class="afw-servo-list">
            ${activeRows.map(renderConventionalServoRow).join("")}
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderConventionalConflictBar() {
    const conflicts = getConventionalConflictList();
    if (!conflicts.length) return "";
    return `
      <div class="afw-conflict-bar">
        ${conflicts.map((conflict) => `⚠ 通道冲突：${conflict.servo} 被 ${conflict.owners.join(" 和 ")} 同时使用`).join("<br>")}
      </div>
    `;
  }

  function renderConventionalParamPreview() {
    const params = generateConventionalParams();
    const entries = Object.entries(params).sort(([a], [b]) => {
      if (a === "Q_ENABLE") return -1;
      if (b === "Q_ENABLE") return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    if (!entries.length) return "等待配置...";
    return entries
      .map(([key, value]) => {
        const row = findConventionalRowByServoKey(key.replace("_FUNCTION", ""));
        const comment = row ? row.comment : "";
        return `${key} = ${value}${comment ? `  # ${comment}` : ""}`;
      })
      .join("\n");
  }

  function findConventionalRowByServoKey(servoName) {
    for (const section of CONVENTIONAL_SECTIONS) {
      const rows = Object.values(section.rowsByOption).flat();
      for (const row of rows) {
        if (state.conventional.servos[row.key] === servoName) return row;
      }
    }
    return null;
  }

  function renderConventionalConfig() {
    return `
      <div class="afw-conventional-shell">
        <div class="afw-surface-list">
          ${CONVENTIONAL_SECTIONS.map(renderConventionalSection).join("")}
        </div>
        <div class="afw-conventional-side">
          ${renderConventionalConflictBar()}
          <div class="afw-conventional-preview">
            <strong>参数预览栏</strong>
            <pre>${renderConventionalParamPreview()}</pre>
          </div>
        </div>
      </div>
      <div class="afw-breadcrumb-row afw-breadcrumb-row-wide">
        <span>${buildPathParts().join(" > ") || "常规固定翼 > 控制面配置"}</span>
        <button type="button" class="afw-primary-btn afw-inline-next" id="afw-conventional-next-btn">下一步：参数预览</button>
      </div>
    `;
  }

  function renderFlyingWingServoRow(row) {
    const selectedServo = state.flyingWing.servos[row.key] || "";
    return `
      <div class="afw-servo-row">
        <span class="afw-servo-label">${row.label}</span>
        <select class="afw-servo-select" data-flying-servo-key="${row.key}">
          <option value="" ${selectedServo ? "" : "selected"}>NONE</option>
          ${SERVO_OPTIONS.map((servo) => `<option value="${servo}" ${selectedServo === servo ? "selected" : ""}>${servo}</option>`).join("")}
        </select>
        <span class="afw-func-badge">function=${row.func}</span>
      </div>
    `;
  }

  function renderFlyingWingSection(section) {
    const optionValue = state.flyingWing[section.key];
    const activeRows = getFlyingWingRows(section.key, optionValue);
    const configured = activeRows.length > 0 && activeRows.every((row) => !!state.flyingWing.servos[row.key]);

    return `
      <section class="afw-surface-section ${configured ? "is-configured" : ""}">
        <div class="afw-surface-head">
          <div class="afw-surface-title">
            <span class="afw-surface-icon">${section.icon}</span>
            <strong>${section.title}</strong>
          </div>
          <div class="afw-surface-badges">
            <span class="afw-badge ${section.required ? "is-required" : "is-optional"}">${section.required ? "必选" : "可选"}</span>
            ${configured ? '<span class="afw-badge is-done">已配置</span>' : ""}
          </div>
        </div>
        ${section.options.length > 1 ? `
          <div class="afw-choice-row">
            ${section.options.map((option) => `
              <button type="button" class="afw-choice-btn ${optionValue === option.value ? "selected" : ""}" data-flying-option="${section.key}:${option.value}">
                ${optionValue === option.value ? "✓" : ""}${option.label}
              </button>
            `).join("")}
          </div>
        ` : ""}
        <div class="afw-surface-divider"></div>
        <div class="afw-servo-list">
          ${activeRows.map(renderFlyingWingServoRow).join("")}
        </div>
      </section>
    `;
  }

  function renderFlyingWingMixingCard() {
    return `
      <section class="afw-conventional-preview afw-flying-mix-card">
        <strong>飞翼混控</strong>
        <div class="afw-wing-mix-grid">
          <label class="afw-wing-mix-field">
            <span>MIXING_GAIN</span>
            <input type="number" step="0.01" min="0.5" max="1.2" value="${Number(state.flyingWing.mixing_gain).toFixed(2)}" data-flying-mix="mixing_gain">
          </label>
          <label class="afw-wing-mix-field">
            <span>MIXING_OFFSET</span>
            <input type="number" step="1" min="-1000" max="1000" value="${Math.round(Number(state.flyingWing.mixing_offset) || 0)}" data-flying-mix="mixing_offset">
          </label>
        </div>
        <p class="afw-wing-mix-help">默认推荐 MIXING_GAIN=0.50、MIXING_OFFSET=0；需要更灵敏副翼时再微调。</p>
      </section>
    `;
  }

  function renderFlyingWingParamPreview() {
    const params = generateParams();
    const entries = Object.entries(params).sort(([a], [b]) => {
      if (a === "Q_ENABLE") return -1;
      if (b === "Q_ENABLE") return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    if (!entries.length) return "等待配置...";
    return entries.map(([key, value]) => `${key} = ${value}`).join("\n");
  }

  function renderFlyingWingConfig() {
    const conflicts = getFlyingWingConflictList();
    const canProceed = isStepComplete(2);
    return `
      <div class="afw-conventional-shell afw-flying-shell">
        <div class="afw-surface-list">
          ${FLYING_WING_SECTIONS.map(renderFlyingWingSection).join("")}
        </div>
        <div class="afw-conventional-side">
          ${conflicts.length ? `
            <div class="afw-conflict-bar">
              ${conflicts.map((conflict) => `通道冲突：${conflict.servo} 被 ${conflict.owners.join(" 和 ")} 同时使用`).join("<br>")}
            </div>
          ` : ""}
          ${renderFlyingWingMixingCard()}
          <div class="afw-conventional-preview">
            <strong>参数预览稿</strong>
            <pre>${renderFlyingWingParamPreview()}</pre>
          </div>
        </div>
      </div>
      <div class="afw-breadcrumb-row afw-breadcrumb-row-wide">
        <span>${buildPathParts().join(" > ") || "飞翼 / 三角翼 > 飞翼配置"}</span>
        <button type="button" class="afw-primary-btn afw-inline-next" id="afw-flying-wing-next-btn">下一步：参数预览</button>
      </div>
    `;
  }

  function renderPreviewRows() {
    const params = generateParams();
    return Object.entries(params)
      .sort(([a], [b]) => {
        if (a === "Q_ENABLE") return -1;
        if (b === "Q_ENABLE") return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      })
      .map(([key, value]) => `
        <div class="afw-param-row">
          <span>${key}</span>
          <strong>${value == null ? "-" : value}</strong>
        </div>
      `)
      .join("");
  }

  function renderPreview() {
    const path = buildPathParts();
    return `
      <section class="afw-preview card-dark">
        <div class="afw-breadcrumb">${path.length ? path.join(" > ") : "尚未完成选择"}</div>
        <div class="afw-param-table">${renderPreviewRows()}</div>
        <div class="afw-preview-actions">
          <button type="button" class="afw-primary-btn" id="afw-preview-write-btn" ${state.fc_connected ? "" : 'disabled title="请先连接飞控"'}>
            写入飞控
          </button>
        </div>
      </section>
    `;
  }

  function renderWriteProgress() {
    if (!state.writeProgress.length) {
      return '<div class="afw-empty">确认后会在这里逐条显示写入进度。</div>';
    }
    return state.writeProgress.map((item) => `
      <div class="afw-progress-row ${item.kind}">
        <span>${item.icon}</span>
        <span>${item.text}</span>
      </div>
    `).join("");
  }

  function renderWriteStep() {
    return `
      <section class="afw-write-shell card-dark">
        <div class="afw-write-head">
          <div>
            <strong>写入状态</strong>
            <p>${state.lastWriteFailed ? "上次写入失败，可点击“重试写入”。" : "将按预览参数逐条写入，并在最后请求飞控重启。"}</p>
          </div>
          <button type="button" class="afw-primary-btn" id="afw-write-btn" ${!state.fc_connected || state.writing ? "disabled" : ""}>
            ${state.lastWriteFailed ? "重试写入" : "开始写入"}
          </button>
        </div>
        <div class="afw-progress">${renderWriteProgress()}</div>
      </section>
    `;
  }

  function renderStepContent() {
    if (state.step === 1) return `<div class="afw-grid afw-grid-3">${renderFrameCards()}</div>`;

    if (state.step === 2 && state.frame_type === FRAME_TYPE.CONVENTIONAL) {
      return renderConventionalConfig();
    }

    if (state.step === 2 && state.frame_type === FRAME_TYPE.FLYING_WING) {
      return renderFlyingWingConfig();
    }

    if (state.step === 2 && !state.vtol_type) {
      return `<div class="afw-grid afw-grid-3">${renderVtolTypeCards()}</div>`;
    }

    if (state.step === 2 && state.vtol_type === VTOL_TYPE.TAILSITTER) {
      return `
        <div class="afw-inline-banner">TailSitter 自动锁定 Q_FRAME_CLASS = 10。</div>
        <div class="afw-grid afw-grid-2">${renderTailsitterCards()}</div>
      `;
    }

    if (state.step === 2) {
      return `
        <div class="afw-config-shell">
          <section class="afw-config-block">
            <h4>Q_FRAME_CLASS（电机数量）</h4>
            <div class="afw-grid afw-grid-3">${renderFrameClassCards()}</div>
          </section>
          <section class="afw-config-block">
            <h4>Q_FRAME_TYPE（电机布局）</h4>
            <div class="afw-chip-grid">${renderFrameTypeCards()}</div>
          </section>
          ${state.vtol_type === VTOL_TYPE.TILTROTOR ? `
            <section class="afw-config-block">
              <h4>Q_TILT_MASK（倾转电机选择）</h4>
              <div class="afw-motor-grid">${renderTiltMotorGrid()}</div>
              <div class="afw-mask-readout">当前 bitmask: <strong>${state.q_tilt_mask == null ? 0 : state.q_tilt_mask}</strong></div>
            </section>
          ` : ""}
        </div>
      `;
    }

    if (state.step === 3) return renderPreview();

    return renderWriteStep();
  }

  function navigationState() {
    let canGoPrev = state.step > 1;
    if (state.writing) canGoPrev = false;
    if (state.step === 1) {
      return { canGoPrev, canGoNext: !!state.frame_type, nextLabel: "进入 Step 2" };
    }
    if (state.step === 2 && state.frame_type === FRAME_TYPE.FLYING_WING) {
      return { canGoPrev, canGoNext: false, nextLabel: "进入预览" };
    }
    canGoPrev = state.step > 1;
    let canGoNext = false;
    let nextLabel = "下一步";

    if (state.step === 1) {
      canGoNext = !!state.frame_type;
      nextLabel = "进入 Step 2";
      nextLabel = state.frame_type === FRAME_TYPE.FLYING_WING ? "进入预览" : "进入 Step 2";
    } else if (state.step === 2) {
      canGoNext = isStepComplete(2) && state.frame_type !== FRAME_TYPE.CONVENTIONAL;
      if (state.frame_type === FRAME_TYPE.FLYING_WING) {
        canGoNext = false;
      }
      nextLabel = "进入预览";
      nextLabel = "进入预览";
    }

    if (state.writing) canGoPrev = false;

    return { canGoPrev, canGoNext, nextLabel };
  }

  function renderShell() {
    const nav = navigationState();
    return `
      <div class="afw-page">
        <div class="afw-topbar">
          <div class="afw-steps">${stepMarkup()}</div>
        </div>
        <div class="afw-content">
          <div class="afw-head">
            <div>
              <h3>${stepTitle()}</h3>
              <p>${stepHint()}</p>
            </div>
            <div class="afw-conn ${state.fc_connected ? "online" : "offline"}">${state.fc_connected ? "飞控在线" : "飞控离线"}</div>
          </div>
          <div class="afw-body">${renderStepContent()}</div>
        </div>
        <div class="afw-footer">
          <button type="button" class="afw-secondary-btn" id="afw-prev-btn" ${nav.canGoPrev ? "" : "disabled"}>上一步</button>
          <button type="button" class="afw-primary-btn" id="afw-next-btn" ${nav.canGoNext ? "" : "disabled"}>${nav.nextLabel}</button>
        </div>
      </div>
    `;
  }

  function updateOverview() {
    const el = document.getElementById("ov-airframe-type");
    if (!el) return;
    const path = buildPathParts();
    if (!state.frame_type) {
      el.textContent = "未配置";
      el.className = "muted";
      el.title = "";
      return;
    }
    el.textContent = path.length ? path.join(" > ") : frameTypeLabel(state.frame_type);
    el.className = isStepComplete(3) ? "ok" : "warn";
    el.title = JSON.stringify(generateParams());
  }

  function gotoNextStep() {
    if (state.step === 1 && state.frame_type === FRAME_TYPE.FLYING_WING) {
      state.step = 2;
      render();
      return;
    }
    if (state.step === 1 && state.frame_type) {
      state.step = 2;
    } else if (state.step === 2 && isStepComplete(2)) {
      state.step = 3;
    }
    render();
  }

  function gotoPrevStep() {
    if (state.step === 3 && state.frame_type === FRAME_TYPE.FLYING_WING) {
      state.step = 2;
      render();
      return;
    }
    if (state.step === 4) {
      state.step = 3;
    } else if (state.step === 3) {
      state.step = 2;
    } else if (state.step === 2) {
      state.step = 1;
    }
    render();
  }

  function openWriteStep() {
    if (!isStepComplete(3)) return;
    state.step = 4;
    render();
  }

  async function sendParam(name, value) {
    if (typeof window.sendParamSet !== "function") throw new Error("sendParamSet 不可用");
    const ok = await window.sendParamSet(name, value);
    if (!ok) throw new Error(`写入失败：${name}`);
  }

  function updateProgressLast(icon, text, kind) {
    state.writeProgress[state.writeProgress.length - 1] = { icon, text, kind };
    render();
  }

  function pushProgress(icon, text, kind) {
    state.writeProgress.push({ icon, text, kind });
    render();
  }

  async function writeConfig() {
    if (state.writing) return;
    if (!state.fc_connected) {
      pushProgress("!", "请先连接飞控", "warn");
      return;
    }

    const params = generateParams();
    const entries = Object.entries(params).filter(([, value]) => value != null);
    if (!entries.length) {
      pushProgress("!", "当前没有可写入参数", "warn");
      return;
    }

    if (!window.confirm("写入参数后需要重启飞控，是否继续？")) return;

    state.writing = true;
    state.lastWriteFailed = false;
    state.writeProgress = [];
    render();

    try {
      pushProgress("OK", "连接飞控", "ok");
      for (const [name, value] of entries) {
        pushProgress("..", `写入 ${name} = ${value} ...`, "pending");
        await sendParam(name, value);
        updateProgressLast("OK", `写入 ${name} = ${value}`, "ok");
      }

      if (typeof window.sendCommandLong === "function") {
        pushProgress("..", "重启飞控", "pending");
        await window.sendCommandLong(246, 1, 0, 0, 0, 0, 0, 0);
        updateProgressLast("OK", "重启飞控", "ok");
      }

      pushProgress("OK", "配置完成", "ok");
      logMessage(`机体参数已写入: ${entries.map(([k, v]) => `${k}=${v}`).join(", ")}`, "af-write");
      if (state.frame_type === FRAME_TYPE.CONVENTIONAL) {
        state.conventionalDirty = false;
        state.conventionalSyncSignature = conventionalSignatureFromParams();
      } else if (state.frame_type === FRAME_TYPE.FLYING_WING) {
        state.flyingWingDirty = false;
        state.flyingWingSyncSignature = conventionalSignatureFromParams();
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      state.lastWriteFailed = true;
      pushProgress("XX", message, "error");
      logMessage(`机体参数写入失败: ${message}`, "af-write");
    } finally {
      state.writing = false;
      render();
    }
  }

  function attachEvents() {
    const shell = root();
    if (!shell) return;

    shell.querySelectorAll("[data-frame-type]").forEach((node) => {
      node.addEventListener("click", () => setFrameType(node.getAttribute("data-frame-type")));
    });

    shell.querySelectorAll("[data-vtol-type]").forEach((node) => {
      node.addEventListener("click", () => setVtolType(node.getAttribute("data-vtol-type")));
    });

    shell.querySelectorAll("[data-q-frame-class]").forEach((node) => {
      node.addEventListener("click", () => setQFrameClass(Number(node.getAttribute("data-q-frame-class"))));
    });

    shell.querySelectorAll("[data-q-frame-type]").forEach((node) => {
      node.addEventListener("click", () => setQFrameType(Number(node.getAttribute("data-q-frame-type"))));
    });

    shell.querySelectorAll("[data-tailsit-mode]").forEach((node) => {
      node.addEventListener("click", () => setTailsitterControl(Number(node.getAttribute("data-tailsit-mode"))));
    });

    shell.querySelectorAll("[data-tilt-motor]").forEach((node) => {
      node.addEventListener("click", () => toggleTiltMotor(Number(node.getAttribute("data-tilt-motor"))));
    });

    shell.querySelectorAll("[data-surface-option]").forEach((node) => {
      node.addEventListener("click", () => {
        const [sectionKey, optionValue] = node.getAttribute("data-surface-option").split(":");
        setConventionalOption(sectionKey, optionValue);
      });
    });

    shell.querySelectorAll("[data-flying-option]").forEach((node) => {
      node.addEventListener("click", () => {
        const [sectionKey, optionValue] = node.getAttribute("data-flying-option").split(":");
        setFlyingWingOption(sectionKey, optionValue);
      });
    });

    shell.querySelectorAll("[data-servo-key]").forEach((node) => {
      node.addEventListener("focus", () => {
        state.servoMenuOpen = true;
      });
      node.addEventListener("blur", () => {
        state.servoMenuOpen = false;
        window.setTimeout(() => flushDeferredRender(), 0);
      });
      node.addEventListener("change", () => {
        state.servoMenuOpen = false;
        setConventionalServo(node.getAttribute("data-servo-key"), node.value);
        window.setTimeout(() => flushDeferredRender(), 0);
      });
    });

    shell.querySelectorAll("[data-flying-servo-key]").forEach((node) => {
      node.addEventListener("focus", () => {
        state.servoMenuOpen = true;
      });
      node.addEventListener("blur", () => {
        state.servoMenuOpen = false;
        window.setTimeout(() => flushDeferredRender(), 0);
      });
      node.addEventListener("change", () => {
        state.servoMenuOpen = false;
        setFlyingWingServo(node.getAttribute("data-flying-servo-key"), node.value);
        window.setTimeout(() => flushDeferredRender(), 0);
      });
    });

    shell.querySelectorAll("[data-flying-mix]").forEach((node) => {
      node.addEventListener("change", () => {
        setFlyingWingMixingValue(node.getAttribute("data-flying-mix"), node.value);
      });
    });

    shell.querySelectorAll("[data-step-jump]").forEach((node) => {
      node.addEventListener("click", () => {
        const step = Number(node.getAttribute("data-step-jump"));
        if (canEnterStep(step)) {
          state.step = step;
          render();
        }
      });
    });

    shell.querySelector("#afw-prev-btn")?.addEventListener("click", gotoPrevStep);
    shell.querySelector("#afw-next-btn")?.addEventListener("click", gotoNextStep);
    shell.querySelector("#afw-conventional-next-btn")?.addEventListener("click", gotoNextStep);
    shell.querySelector("#afw-flying-wing-next-btn")?.addEventListener("click", () => {
      if (!isStepComplete(2)) {
        window.alert("请先为飞翼必选控制面分配舵机，再进入参数预览。");
        return;
      }
      gotoNextStep();
    });
    shell.querySelector("#afw-preview-write-btn")?.addEventListener("click", openWriteStep);
    shell.querySelector("#afw-write-btn")?.addEventListener("click", writeConfig);
  }

  function enhanceFlyingWingMixHelp() {
    const shell = root();
    if (!shell || state.frame_type !== FRAME_TYPE.FLYING_WING || state.step !== 2) return;
    const help = shell.querySelector(".afw-wing-mix-help");
    if (!help || help.nextElementSibling?.classList.contains("afw-wing-mix-explain")) return;
    help.insertAdjacentHTML("afterend", `
      <div class="afw-wing-mix-explain">
        <p><strong>MIXING_GAIN</strong>：控制 Elevon 对俯仰与横滚混控的总体响应强度。数值越大，综合动作越灵敏；如果飞机反应偏肉可以小幅增加，若动作过猛或容易抖动就回调。</p>
        <p><strong>MIXING_OFFSET</strong>：给左右 Elevon 增加一个基准偏移量，用来修正中立位不齐、机械安装偏差，或巡航时需要轻微持续压舵的情况。通常保持 0，仅在确认机械微调不方便时再使用。</p>
      </div>
    `);
  }

  function render() {
    const shell = root();
    if (!shell) return;
    const body = shell.querySelector(".afw-body");
    const preservedScrollTop = body ? body.scrollTop : 0;
    state.fc_connected = isConnected();
    if (state.frame_type === FRAME_TYPE.CONVENTIONAL) {
      syncConventionalFromFlightController(false);
    }
    if (state.frame_type === FRAME_TYPE.FLYING_WING) {
      syncFlyingWingFromFlightController(false);
    }
    shell.innerHTML = renderShell();
    const nextBody = shell.querySelector(".afw-body");
    if (nextBody) nextBody.scrollTop = preservedScrollTop;
    enhanceFlyingWingMixHelp();
    attachEvents();
    updateOverview();
  }

  function bindGlobalEvents() {
    document.addEventListener("gcs-heartbeat", () => {
      requestHeartbeatRefresh();
    });

    document.addEventListener("gcs-airframe-params-changed", () => {
      requestExternalRender();
    });

    document.querySelectorAll(".ov-nav-item[data-setup-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.getAttribute("data-setup-panel") === "airframe") render();
      });
    });
  }

  function mount() {
    if (!root()) return;
    bindGlobalEvents();
    syncConventionalFromFlightController(true);
    render();
  }

  window.addEventListener("DOMContentLoaded", mount);
})();

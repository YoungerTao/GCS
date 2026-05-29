// draggable splitters: left pane width (v) and HUD height (h)
(function () {
  const STORAGE_KEY = 'leftPaneWidthPx';
  const STORAGE_KEY_HUD = 'hudHeightPx';
  const MIN_PX = 260;
  const MIN_HUD = 160;
  const MAX_RATIO = 0.75;
  const RESERVED_PADDING = 20; // flight-data-layout vertical padding (10px * 2)

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setLeftPanePx(px) {
    document.documentElement.style.setProperty('--left-pane', `${px}px`);
    try { localStorage.setItem(STORAGE_KEY, String(px)); } catch (_) {}
  }

  function setHudHeightPx(px) {
    document.documentElement.style.setProperty('--hud-height', `${px}px`);
    try { localStorage.setItem(STORAGE_KEY_HUD, String(px)); } catch (_) {}
  }

  function getPaneHeights() {
    const topBar = document.querySelector('.top-bar');
    const topH = topBar ? topBar.getBoundingClientRect().height : 0;
    return { topH };
  }

  function getLogMinPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--log-min').trim();
    const px = parseInt(v, 10);
    return Number.isFinite(px) && px > 0 ? px : 220;
  }

  function getColHeight() {
    const { topH } = getPaneHeights();
    return window.innerHeight - topH - RESERVED_PADDING;
  }

  function getRowBounds() {
    const row = document.querySelector('.flight-data-layout') || document.body;
    const r = row.getBoundingClientRect();
    return { left: r.left, width: r.width };
  }

  function getLeftPanePx() {
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--left-pane').trim();
    const px = parseInt(cur, 10);
    return Number.isFinite(px) ? px : 400;
  }

  function getHudHeightPx() {
    const cur = getComputedStyle(document.documentElement).getPropertyValue('--hud-height').trim();
    const px = parseInt(cur, 10);
    return Number.isFinite(px) ? px : MIN_HUD;
  }

  function getHudMaxPx() {
    const colHeight = getColHeight();
    const logMin = getLogMinPx();
    return Math.max(MIN_HUD, colHeight - logMin);
  }

  function clampHud(px) {
    return clamp(px, MIN_HUD, getHudMaxPx());
  }

  function invalidateMap() {
    try {
      if (window.mapInstance && typeof window.mapInstance.invalidateSize === 'function') {
        window.mapInstance.invalidateSize();
      }
    } catch (_) {}
  }

  function defaultHudHeightPx() {
    const colHeight = getColHeight();
    const logMin = getLogMinPx();
    const leftPx = getLeftPanePx();
    return clampHud(Math.min(leftPx, colHeight - logMin));
  }

  function layoutDefaults() {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY_HUD), 10);
      if (Number.isFinite(saved) && saved > 0) {
        setHudHeightPx(clampHud(saved));
        return;
      }
    } catch (_) {}
    setHudHeightPx(defaultHudHeightPx());
  }

  function reclampAll() {
    const { width } = getRowBounds();
    const maxPx = Math.floor(width * MAX_RATIO);
    setLeftPanePx(clamp(getLeftPanePx(), MIN_PX, maxPx));
    setHudHeightPx(clampHud(getHudHeightPx()));
  }

  function init() {
    const vSplitters = Array.from(document.querySelectorAll('.v-splitter[data-splitter="main"]'));
    const hSplitters = Array.from(document.querySelectorAll('.h-splitter[data-splitter="hud-log"]'));
    if (!vSplitters.length && !hSplitters.length) return;

    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (Number.isFinite(saved) && saved > 0) setLeftPanePx(saved);
    } catch (_) {}

    layoutDefaults();

    let draggingV = false;
    let draggingH = false;
    let raf = 0;

    function scheduleInvalidate() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        reclampAll();
        invalidateMap();
      });
    }

    function onMoveV(clientX) {
      const { left, width } = getRowBounds();
      const maxPx = Math.floor(width * MAX_RATIO);
      const desired = Math.round(clientX - left);
      setLeftPanePx(clamp(desired, MIN_PX, maxPx));
      scheduleInvalidate();
    }

    function onMoveH(clientY) {
      const leftCol = document.querySelector('.flight-data-left');
      if (!leftCol) return;
      const top = leftCol.getBoundingClientRect().top;
      setHudHeightPx(clampHud(Math.round(clientY - top)));
      scheduleInvalidate();
    }

    function endDragV() {
      if (!draggingV) return;
      draggingV = false;
      document.body.classList.remove('resizing');
      invalidateMap();
    }

    function endDragH() {
      if (!draggingH) return;
      draggingH = false;
      document.body.classList.remove('resizing-h');
      invalidateMap();
    }

    vSplitters.forEach((s) => {
      s.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        draggingV = true;
        document.body.classList.add('resizing');
        try { ev.target.setPointerCapture(ev.pointerId); } catch (_) {}
        onMoveV(ev.clientX);
      });
      s.addEventListener('pointermove', (ev) => {
        if (!draggingV) return;
        onMoveV(ev.clientX);
      });
      s.addEventListener('pointerup', endDragV);
      s.addEventListener('pointercancel', endDragV);
      s.addEventListener('dblclick', () => {
        const { width } = getRowBounds();
        setLeftPanePx(Math.round(width * 0.35));
        scheduleInvalidate();
      });
    });

    hSplitters.forEach((s) => {
      s.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        draggingH = true;
        document.body.classList.add('resizing-h');
        try { ev.target.setPointerCapture(ev.pointerId); } catch (_) {}
        onMoveH(ev.clientY);
      });
      s.addEventListener('pointermove', (ev) => {
        if (!draggingH) return;
        onMoveH(ev.clientY);
      });
      s.addEventListener('pointerup', endDragH);
      s.addEventListener('pointercancel', endDragH);
      s.addEventListener('dblclick', () => {
        setHudHeightPx(defaultHudHeightPx());
        invalidateMap();
      });
    });

    window.addEventListener('resize', () => {
      reclampAll();
      invalidateMap();
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();

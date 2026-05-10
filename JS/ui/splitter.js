// draggable splitter for left pane width (HUD/log column)
(function () {
  const STORAGE_KEY = 'leftPaneWidthPx';
  const MIN_PX = 260;
  const MAX_RATIO = 0.75; // don't let left pane exceed 75% of row width

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setLeftPanePx(px) {
    document.documentElement.style.setProperty('--left-pane', `${px}px`);
    try { localStorage.setItem(STORAGE_KEY, String(px)); } catch (_) {}
  }

  function getPaneHeights() {
    const topBar = document.querySelector('.top-bar');
    const topH = topBar ? topBar.getBoundingClientRect().height : 0;
    return { topH };
  }

  function getBottomMinPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bottom-min').trim();
    const px = parseInt(v, 10);
    return Number.isFinite(px) && px > 0 ? px : 220;
  }

  function setMainPaneHeightPx(px) {
    document.documentElement.style.setProperty('--main-pane-h', `${px}px`);
  }

  function getRowBounds() {
    const row = document.querySelector('.main-area') || document.body;
    const r = row.getBoundingClientRect();
    return { left: r.left, width: r.width };
  }

  function invalidateMap() {
    try {
      if (window.mapInstance && typeof window.mapInstance.invalidateSize === 'function') {
        window.mapInstance.invalidateSize();
      }
    } catch (_) {}
  }

  function init() {
    const splitters = Array.from(document.querySelectorAll('.v-splitter'));
    if (!splitters.length) return;

    // restore persisted width (use px to avoid clamp() parsing differences)
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (Number.isFinite(saved) && saved > 0) setLeftPanePx(saved);
    } catch (_) {}

    let dragging = false;
    let raf = 0;

    function layoutSquare() {
      // Make main-area height match left-pane width (square HUD),
      // but never exceed remaining viewport height.
      const cur = getComputedStyle(document.documentElement).getPropertyValue('--left-pane').trim();
      const leftPx = parseInt(cur, 10);
      if (!Number.isFinite(leftPx)) return;

      const { topH } = getPaneHeights();
      const bottomMin = getBottomMinPx();
      // Reserve space for paddings: main-area (20px vertical) + bottom-area (20px vertical)
      const reservedPadding = 40;
      const available = window.innerHeight - topH - bottomMin - reservedPadding;
      const mainH = clamp(leftPx, 200, Math.floor(available));
      setMainPaneHeightPx(mainH);
    }

    function scheduleInvalidate() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        layoutSquare();
        invalidateMap();
      });
    }

    function onMove(clientX) {
      const { left, width } = getRowBounds();
      const maxPx = Math.floor(width * MAX_RATIO);
      const desired = Math.round(clientX - left);
      const px = clamp(desired, MIN_PX, maxPx);
      setLeftPanePx(px);
      scheduleInvalidate();
    }

    function startDrag(ev) {
      dragging = true;
      document.body.classList.add('resizing');
      try { ev.target.setPointerCapture(ev.pointerId); } catch (_) {}
      onMove(ev.clientX);
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('resizing');
      invalidateMap();
    }

    splitters.forEach((s) => {
      s.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0) return;
        startDrag(ev);
      });
      s.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        onMove(ev.clientX);
      });
      s.addEventListener('pointerup', endDrag);
      s.addEventListener('pointercancel', endDrag);
      s.addEventListener('dblclick', () => {
        // reset to default ratio-ish
        const { width } = getRowBounds();
        setLeftPanePx(Math.round(width * 0.35));
        layoutSquare();
        invalidateMap();
      });
    });

    window.addEventListener('resize', () => {
      // keep within bounds after resize
      const cur = getComputedStyle(document.documentElement).getPropertyValue('--left-pane').trim();
      const px = parseInt(cur, 10);
      if (!Number.isFinite(px)) return;
      const { width } = getRowBounds();
      const maxPx = Math.floor(width * MAX_RATIO);
      setLeftPanePx(clamp(px, MIN_PX, maxPx));
      layoutSquare();
      invalidateMap();
    });

    // initial layout pass
    layoutSquare();
  }

  window.addEventListener('DOMContentLoaded', init);
})();


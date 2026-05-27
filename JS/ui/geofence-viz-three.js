/**
 * 安全页 Geofence 3D 预览（圆柱体）
 * 轻量、实时响应半径与高度变更。仅用于参数编辑时的直观演示。
 */
(function initGeofenceVizThree() {
  const DEFAULT_CLEAR_COLOR = 0x0a0f1c; // 匹配整体暗色主题

  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {{ update: function, resize: function, dispose: function } | null}
   */
  function create(canvas) {
    const THREE = window.THREE;
    if (!THREE || !canvas) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(DEFAULT_CLEAR_COLOR, 1);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(46, 1, 0.2, 2000);

    // 光照（参考 accel-calib-three 的风格，简化为关键+补光）
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.15);
    keyLight.position.set(2.8, 5.5, 3.2);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xa8c5ff, 0.38);
    fillLight.position.set(-4.0, 2.2, -2.8);
    scene.add(fillLight);

    // 地面（随半径缩放）
    const groundGeom = new THREE.CircleGeometry(1, 72);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a253f,
      roughness: 0.88,
      metalness: 0.06,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    scene.add(ground);

    // 地面边缘高亮环
    const ringGeom = new THREE.RingGeometry(0.96, 1.0, 72);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);

    // 高度轴（竖直线 + 顶部小球）
    const axisGroup = new THREE.Group();
    const axisMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 });
    const axisPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)];
    const axisGeom = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisLine = new THREE.Line(axisGeom, axisMat);
    axisGroup.add(axisLine);

    const tipGeom = new THREE.SphereGeometry(0.035, 16, 12);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd });
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.y = 1;
    axisGroup.add(tip);

    scene.add(axisGroup);

    // 中心标记（Home / 无人机位置）
    const centerGroup = new THREE.Group();
    const centerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6, metalness: 0.2 })
    );
    centerBase.position.y = 0.02;
    centerGroup.add(centerBase);

    const centerPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.18, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, metalness: 0.3 })
    );
    centerPole.position.y = 0.13;
    centerGroup.add(centerPole);

    const centerTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4, metalness: 0.25 })
    );
    centerTop.position.y = 0.26;
    centerGroup.add(centerTop);

    scene.add(centerGroup);

    // 高度标尺组（左侧垂直刻度 + 数字标签）
    const rulerGroup = new THREE.Group();
    scene.add(rulerGroup);

    /** 创建高度数字标签 sprite（复用 accel-calib-three 的 CanvasTexture 模式） */
    function makeHeightLabel(text, colorHex) {
      const s = 128;
      const cvs = document.createElement("canvas");
      cvs.width = s;
      cvs.height = s;
      const ctx = cvs.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, s, s);
      ctx.font = "bold 48px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colorHex;
      ctx.fillText(text, s / 2, s / 2);

      const tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(18, 18, 1);
      return { sprite: spr, texture: tex, material: mat };
    }

    // 当前围栏圆柱（动态重建）
    let fenceMesh = null;
    let fenceMat = null;
    let currentRadius = 100;
    let currentHeight = 120;

    // 禁用状态提示（简单平面文字）
    let disabledSprite = null;

    /** 清空并重建高度标尺（左侧垂直刻度 + 数字标签） */
    function updateHeightScale(h, r) {
      // 清理旧内容
      while (rulerGroup.children.length) {
        const child = rulerGroup.children[0];
        rulerGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        if (child.material && child.material.map) child.material.map.dispose();
      }

      if (!h || h <= 0) return;

      const offsetX = -(r + 12); // 圆柱左侧偏移
      const lineMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.85 });

      // 垂直主线
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(offsetX, 0, 0),
        new THREE.Vector3(offsetX, h, 0),
      ]);
      const vLine = new THREE.Line(lineGeom, lineMat);
      rulerGroup.add(vLine);

      // 刻度 + 标签（0 / 25% / 50% / 75% / 100%）
      const fractions = [0, 0.25, 0.5, 0.75, 1.0];
      fractions.forEach((f) => {
        const y = h * f;
        const tickLen = 5;

        // 小横刻度
        const tickGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(offsetX, y, 0),
          new THREE.Vector3(offsetX - tickLen, y, 0),
        ]);
        const tick = new THREE.Line(tickGeom, lineMat);
        rulerGroup.add(tick);

        // 数字标签
        const val = Math.round(h * f);
        const label = makeHeightLabel(`${val} m`, "#93c5fd");
        if (label) {
          label.sprite.position.set(offsetX - tickLen - 8, y, 0);
          rulerGroup.add(label.sprite);
        }
      });
    }

    function removeFenceMesh() {
      if (fenceMesh) {
        scene.remove(fenceMesh);
        if (fenceMesh.geometry) fenceMesh.geometry.dispose();
        fenceMesh = null;
      }
    }

    // 禁用提示已迁移到 HTML overlay，此处保留空实现以兼容旧调用
    function removeDisabledSprite() {
      if (disabledSprite) {
        scene.remove(disabledSprite);
        if (disabledSprite.material && disabledSprite.material.map) disabledSprite.material.map.dispose();
        if (disabledSprite.material) disabledSprite.material.dispose();
        disabledSprite = null;
      }
    }

    function createDisabledSprite(text) {
      // 不再使用 3D sprite，函数保留但不执行（由外部 HTML overlay 接管）
      return null;
    }

    /**
     * 实时更新围栏参数
     * @param {{radius:number, height:number, enabled:boolean, type:number}} params
     */
    function update(params = {}) {
      const radius = Number.isFinite(params.radius) ? Math.max(5, params.radius) : 100;
      const height = Number.isFinite(params.height) ? Math.max(5, params.height) : 120;
      const enabled = params.enabled !== false;
      const type = params.type != null ? Number(params.type) : 3;

      currentRadius = radius;
      currentHeight = height;

      const isCircular = type === 1 || type === 3;
      const shouldShow = enabled && isCircular;

      removeDisabledSprite();

      if (!shouldShow) {
        removeFenceMesh();
        // 清空高度标尺
        updateHeightScale(0, radius);

        // 地面保持小尺寸
        ground.scale.setScalar(Math.max(30, radius * 0.6));
        ring.scale.setScalar(Math.max(30, radius * 0.6));

        // 禁用提示已改由外部 HTML overlay 控制，此处不再创建 3D sprite
        // （保留函数以防其他地方需要，但不再调用）
        fitCamera(radius, height);
        renderer.render(scene, camera);
        return;
      }

      // 重建圆柱
      removeFenceMesh();

      fenceMat = fenceMat || new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x052e16,
        roughness: 0.6,
        metalness: 0.12,
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide,
      });

      const geom = new THREE.CylinderGeometry(radius, radius, height, 52, 1, false);
      fenceMesh = new THREE.Mesh(geom, fenceMat);
      fenceMesh.position.y = height / 2;
      scene.add(fenceMesh);

      // 地面与环按半径缩放
      const groundScale = radius * 1.28;
      ground.scale.setScalar(groundScale);
      ring.scale.setScalar(groundScale);

      // 高度轴缩放
      axisLine.scale.y = height;
      tip.position.y = height;

      // 中心标记保持在地面
      centerGroup.position.y = 0;

      // 重建高度标尺
      updateHeightScale(height, radius);

      fitCamera(radius, height);
      renderer.render(scene, camera);
    }

    function fitCamera(radius, height) {
      const r = Math.max(radius, 20);
      const h = Math.max(height, 20);

      // 目标点上移到圆柱中上部，确保高高度时顶部仍有足够可视空间
      const targetY = h * 0.58;
      const target = new THREE.Vector3(0, targetY, 0);

      const halfFovY = (camera.fov * Math.PI) / 360;
      const aspect = camera.aspect || 1.6;
      const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);

      // 高度权重更高 + 更保守的 margin，防止 200m+ 圆柱被裁剪
      const fitR = Math.max(r * 1.35, h * 0.72);
      const distY = fitR / Math.tan(halfFovY);
      const distX = fitR / Math.tan(halfFovX);
      const dist = Math.max(distY, distX) * 0.78;

      // 当高度远大于半径时，视角更俯视，避免顶部被裁
      const isTall = h > r * 2.5;
      const dirY = isTall ? 0.85 : 0.72;
      const dir = new THREE.Vector3(-0.9, dirY, -0.95).normalize();

      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target.x, targetY * 0.92, target.z);
      camera.updateProjectionMatrix();
    }

    function resize() {
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      if (w < 2 || h < 2) return;

      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // 重新拟合（使用当前半径高度）
      fitCamera(currentRadius, currentHeight);
      renderer.render(scene, camera);
    }

    function dispose() {
      try {
        removeFenceMesh();
        removeDisabledSprite();

        // 清空高度标尺（含 sprite 纹理）
        while (rulerGroup.children.length) {
          const child = rulerGroup.children[0];
          rulerGroup.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
        }

        if (fenceMat) fenceMat.dispose();
        groundGeom.dispose();
        groundMat.dispose();
        ringGeom.dispose();
        ringMat.dispose();
        axisGeom.dispose();
        axisMat.dispose();
        tipGeom.dispose();
        tipMat.dispose();
        centerBase.geometry.dispose();
        centerBase.material.dispose();
        centerPole.geometry.dispose();
        centerPole.material.dispose();
        centerTop.geometry.dispose();
        centerTop.material.dispose();

        renderer.dispose();
      } catch (_) {
        /* ignore */
      }
    }

    // 初始相机位置（会被 fitCamera 覆盖）
    camera.position.set(140, 95, 140);
    camera.lookAt(0, 35, 0);

    // 首次 resize + 初始空状态
    resize();
    update({ radius: 100, height: 120, enabled: true, type: 3 });

    return { update, resize, dispose };
  }

  window.GeofenceVizThree = { create };
})();
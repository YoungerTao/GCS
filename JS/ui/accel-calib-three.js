/**
 * 加速度计校准页：Three.js WebGL 渲染固定翼示意模型。
 * 世界系 Y 上、地面在 XZ；机体红/绿/蓝为模型顶点轴，与 IMU 的 MAVLink FRD 解耦（摆放以 accel-calibration.js 的 target 为准）。
 */
(function initAccelCalibThree() {
  /** @type {Array<{ metalness: number, roughness: number, transparent?: boolean, opacity?: number, envMapIntensity?: number }>} */
  const MAT = [
    { metalness: 0.06, roughness: 0.78 },
    { metalness: 0.14, roughness: 0.52 },
    { metalness: 0.92, roughness: 0.22, envMapIntensity: 1.0 },
    { metalness: 0.12, roughness: 0.62 },
    { metalness: 0.42, roughness: 0.38 },
    { metalness: 0.18, roughness: 0.06, transparent: false, opacity: 1.0 },
    { metalness: 0.02, roughness: 0.96 },
    { metalness: 0.82, roughness: 0.26, envMapIntensity: 1.0 },
    { metalness: 0.22, roughness: 0.74 },
    { metalness: 0.72, roughness: 0.35, envMapIntensity: 0.85 },
  ];

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ verts: Float32Array, faces: Array<{a:number,b:number,c:number,cr:number,cg:number,cb:number,m?:number}>, noseI: number, tailI: number }} model
   */
  function create(canvas, model) {
    const THREE = window.THREE;
    if (!THREE || !canvas || !model || !model.verts || !model.faces) return null;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    if (renderer.toneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 500);
    const cameraLookTarget = new THREE.Vector3(0, 0.45, 0);
    const cameraViewDir = new THREE.Vector3(-1, 1.14, -1).normalize();

    const attitudeRoot = new THREE.Group();
    attitudeRoot.position.set(0, 0, 0);
    scene.add(attitudeRoot);

    const visualOffset = new THREE.Group();
    // 动画展示模式下保持与世界坐标同轴，不额外做轴系旋转映射。
    visualOffset.rotation.x = 0;
    attitudeRoot.add(visualOffset);

    const modelContainer = new THREE.Group();
    visualOffset.add(modelContainer);

    const verts = model.verts;
    const sourceBox = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let i = 0; i < verts.length; i += 3) {
      p.set(verts[i], verts[i + 1], verts[i + 2]);
      sourceBox.expandByPoint(p);
    }
    const cx = (sourceBox.min.x + sourceBox.max.x) / 2;
    const cy = (sourceBox.min.y + sourceBox.max.y) / 2;
    const cz = (sourceBox.min.z + sourceBox.max.z) / 2;

    /** @type {Map<number, { positions: number[], colors: number[] }>} */
    const byM = new Map();
    for (let fi = 0; fi < model.faces.length; fi++) {
      const f = model.faces[fi];
      const m = f.m !== undefined ? f.m : 0;
      let bucket = byM.get(m);
      if (!bucket) {
        bucket = { positions: [], colors: [] };
        byM.set(m, bucket);
      }
      for (const idx of [f.a, f.b, f.c]) {
        bucket.positions.push(verts[idx * 3] - cx, verts[idx * 3 + 1] - cy, verts[idx * 3 + 2] - cz);
        bucket.colors.push(f.cr / 255, f.cg / 255, f.cb / 255);
      }
    }

    const geoms = [];
    const mats = [];
    byM.forEach((bucket, mId) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(bucket.positions), 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(bucket.colors), 3));
      g.computeVertexNormals();
      const mp = MAT[mId] || MAT[0];
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: mp.metalness,
        roughness: mp.roughness,
        flatShading: false,
        transparent: !!mp.transparent,
        opacity: mp.opacity !== undefined ? mp.opacity : 1,
        envMapIntensity: mp.envMapIntensity !== undefined ? mp.envMapIntensity : 0.35,
        depthWrite: mp.transparent ? false : true,
      });
      modelContainer.add(new THREE.Mesh(g, mat));
      geoms.push(g);
      mats.push(mat);
    });

    const n = model.noseI;
    const t = model.tailI;
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(verts[t * 3] - cx, verts[t * 3 + 1] - cy, verts[t * 3 + 2] - cz),
      new THREE.Vector3(verts[n * 3] - cx, verts[n * 3 + 1] - cy, verts[n * 3 + 2] - cz),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981 });
    modelContainer.add(new THREE.Line(lineGeom, lineMat));

    const dx = (sourceBox.max.x - sourceBox.min.x) / 2;
    const dy = (sourceBox.max.y - sourceBox.min.y) / 2;
    const dz = (sourceBox.max.z - sourceBox.min.z) / 2;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    // 统一放大模型与圆盘（两者比例保持不变）。
    const targetR = 2.925;
    const modelScale = targetR / r;
    modelContainer.scale.setScalar(modelScale);
    // 基准姿态翻转：由“肚子朝上”改为“肚子朝下”。
    modelContainer.rotation.set(Math.PI / 2, 0, 0);

    attitudeRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelContainer);
    const center = box.getCenter(new THREE.Vector3());
    modelContainer.position.set(-center.x, -box.min.y, -center.z);
    attitudeRoot.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(modelContainer);
    const groundedTop = finalBox.max.y;
    const bodyCenterWorld = finalBox.getCenter(new THREE.Vector3());
    const bodyCenterLocal = modelContainer.worldToLocal(bodyCenterWorld.clone());

    // 飞机本体坐标系（从机体中心发出）：X红 / Y绿 / Z蓝。
    const bodyAxesLen = targetR * 1.25;
    const bodyXAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(bodyAxesLen, 0, 0),
    ]);
    const bodyYAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, bodyAxesLen, 0),
    ]);
    const bodyZAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, bodyAxesLen),
    ]);
    const bodyXAxisMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 1.0, depthTest: false });
    const bodyYAxisMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 1.0, depthTest: false });
    const bodyZAxisMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 1.0, depthTest: false });
    const bodyXAxisLine = new THREE.Line(bodyXAxisGeom, bodyXAxisMat);
    const bodyYAxisLine = new THREE.Line(bodyYAxisGeom, bodyYAxisMat);
    const bodyZAxisLine = new THREE.Line(bodyZAxisGeom, bodyZAxisMat);
    bodyXAxisLine.position.copy(bodyCenterLocal);
    bodyYAxisLine.position.copy(bodyCenterLocal);
    bodyZAxisLine.position.copy(bodyCenterLocal);
    bodyXAxisLine.renderOrder = 1000;
    bodyYAxisLine.renderOrder = 1000;
    bodyZAxisLine.renderOrder = 1000;
    modelContainer.add(bodyXAxisLine);
    modelContainer.add(bodyYAxisLine);
    modelContainer.add(bodyZAxisLine);

    const groundRadius = targetR * 1.2;
    const groundY = -0.03;
    const groundGeom = new THREE.CircleGeometry(groundRadius, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      emissive: 0x60a5fa,
      emissiveIntensity: 0.22,
      roughness: 0.84,
      metalness: 0.08,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, groundY, 0);
    scene.add(ground);

    const ringGeom = new THREE.RingGeometry(groundRadius * 0.86, groundRadius * 0.98, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, groundY + 0.001, 0);
    scene.add(ring);

    const axisLen = groundRadius * 1.72;
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLen / 2, 0, 0),
      new THREE.Vector3(axisLen / 2, 0, 0),
    ]);
    /** 地面 XZ 平面上的世界 Z 轴线（竖直为世界 Y，不在圆盘上画） */
    const worldZOnGroundGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLen / 2),
      new THREE.Vector3(0, 0, axisLen / 2),
    ]);
    const xAxisMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 });
    const worldZOnGroundMat = new THREE.LineBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.9 });
    const xAxisLine = new THREE.Line(xAxisGeom, xAxisMat);
    const worldZOnGroundLine = new THREE.Line(worldZOnGroundGeom, worldZOnGroundMat);
    xAxisLine.position.y = groundY + 0.002;
    worldZOnGroundLine.position.y = groundY + 0.002;
    scene.add(xAxisLine);
    scene.add(worldZOnGroundLine);

    function makeAxisLabel(text, colorHex) {
      const s = 96;
      const cvs = document.createElement("canvas");
      cvs.width = s;
      cvs.height = s;
      const ctx = cvs.getContext("2d");
      if (!ctx) return null;
      ctx.clearRect(0, 0, s, s);
      ctx.font = "bold 56px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = colorHex;
      ctx.shadowColor = colorHex;
      ctx.shadowBlur = 12;
      ctx.fillText(text, s / 2, s / 2 + 2);
      const tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(0.28, 0.28, 1);
      return { sprite: spr, texture: tex, material: mat };
    }

    const xLabel = makeAxisLabel("X", "#93c5fd");
    const worldZLabel = makeAxisLabel("Z", "#6ee7b7");
    const bodyXLabel = makeAxisLabel("X", "#ef4444");
    const bodyYLabel = makeAxisLabel("Y", "#22c55e");
    const bodyZLabel = makeAxisLabel("Z", "#3b82f6");
    if (xLabel) {
      xLabel.sprite.position.set(axisLen / 2 + 0.16, groundY + 0.04, 0);
      scene.add(xLabel.sprite);
    }
    if (worldZLabel) {
      worldZLabel.sprite.position.set(0, groundY + 0.04, axisLen / 2 + 0.16);
      scene.add(worldZLabel.sprite);
    }
    if (bodyXLabel) {
      bodyXLabel.sprite.position.set(bodyCenterLocal.x + bodyAxesLen + 0.14, bodyCenterLocal.y + 0.04, bodyCenterLocal.z);
      bodyXLabel.sprite.renderOrder = 1001;
      modelContainer.add(bodyXLabel.sprite);
    }
    if (bodyYLabel) {
      bodyYLabel.sprite.position.set(bodyCenterLocal.x, bodyCenterLocal.y + bodyAxesLen + 0.14, bodyCenterLocal.z);
      bodyYLabel.sprite.renderOrder = 1001;
      modelContainer.add(bodyYLabel.sprite);
    }
    if (bodyZLabel) {
      bodyZLabel.sprite.position.set(bodyCenterLocal.x, bodyCenterLocal.y + 0.04, bodyCenterLocal.z + bodyAxesLen + 0.14);
      bodyZLabel.sprite.renderOrder = 1001;
      modelContainer.add(bodyZLabel.sprite);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.38));
    const key = new THREE.DirectionalLight(0xfff8f0, 1.05);
    key.position.set(2.6, 4.2, 2.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.42);
    fill.position.set(-3.0, 1.4, -1.6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe8d0, 0.28);
    rim.position.set(-0.5, -2.2, 3.2);
    scene.add(rim);

    const qBuf = new THREE.Quaternion();

    function resize() {
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      if (w < 2 || h < 2) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 视口自适配：放大圆盘的同时保证其完整落在容器内，并留安全边距。
      const halfFovY = (camera.fov * Math.PI) / 360;
      const halfFovX = Math.atan(Math.tan(halfFovY) * camera.aspect);
      const fitRadius = groundRadius * 1.02;
      const distByY = fitRadius / Math.tan(halfFovY);
      const distByX = fitRadius / Math.tan(halfFovX);
      const safeFill = 0.82;
      const fitDist = Math.max(distByY, distByX) / safeFill;
      camera.position.copy(cameraLookTarget).addScaledVector(cameraViewDir, fitDist);
      camera.lookAt(cameraLookTarget);
      camera.updateProjectionMatrix();
    }

    function setQuaternion(q) {
      if (!q) return;
      qBuf.set(q.x, q.y, q.z, q.w);
      attitudeRoot.setRotationFromQuaternion(qBuf);
    }

    function render(q) {
      setQuaternion(q);
      renderer.render(scene, camera);
    }

    function dispose() {
      try {
        for (const g of geoms) g.dispose();
        for (const m of mats) m.dispose();
        groundGeom.dispose();
        groundMat.dispose();
        ringGeom.dispose();
        ringMat.dispose();
        xAxisGeom.dispose();
        worldZOnGroundGeom.dispose();
        xAxisMat.dispose();
        worldZOnGroundMat.dispose();
        bodyXAxisGeom.dispose();
        bodyYAxisGeom.dispose();
        bodyZAxisGeom.dispose();
        bodyXAxisMat.dispose();
        bodyYAxisMat.dispose();
        bodyZAxisMat.dispose();
        if (xLabel) {
          xLabel.texture.dispose();
          xLabel.material.dispose();
        }
        if (worldZLabel) {
          worldZLabel.texture.dispose();
          worldZLabel.material.dispose();
        }
        if (bodyXLabel) {
          bodyXLabel.texture.dispose();
          bodyXLabel.material.dispose();
        }
        if (bodyYLabel) {
          bodyYLabel.texture.dispose();
          bodyYLabel.material.dispose();
        }
        if (bodyZLabel) {
          bodyZLabel.texture.dispose();
          bodyZLabel.material.dispose();
        }
        lineGeom.dispose();
        lineMat.dispose();
        renderer.dispose();
      } catch (e) {
        /* ignore */
      }
    }

    resize();
    return { render, resize, setQuaternion, dispose };
  }

  window.AccelCalibThree = { create };
})();
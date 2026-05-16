/* Quick Grid Module - 提供可配置的遥测参数网格视图
   使用 localStorage 键: quickGridConfig
   依赖全局: window.telemetry (实时更新)
*/
(function(){
  const TELEMETRY_ALIASES = {
    altitude: ['alt'],
    alt: ['altitude'],
    groundspeed: ['ground_speed'],
    airspeed: ['air_speed'],
    climbrate: ['climb_rate', 'verticalspeed', 'verticalspeed2'],
    disttohome: ['DistToHome', 'dist_to_home', 'dist_to_wp', 'wp_dist'],
    distto_wp: ['wp_dist'],
    wp_dist: ['dist_to_wp'],
    lng: ['lon'],
    lon: ['lng']
  };

  const LABELS_ZH = {
    alt: '高度',
    altitude: '高度',
    groundspeed: '地速',
    airspeed: '空速',
    battery_voltage: '电压',
    battery_remaining: '电量',
    roll: '横滚',
    pitch: '俯仰',
    yaw: '航向',
    climbrate: '爬升率',
    climb_rate: '爬升率',
    disttohome: '距家',
    dist_to_home: '距家',
    dist_to_wp: '航点距离',
    wp_dist: '航点距离',
    lat: '纬度',
    lng: '经度',
    lon: '经度',
    gps_fix_type: 'GPS状态',
    armed: '解锁',
    flight_mode: '模式',
    current: '电流',
    esc1_temp: '电调温度',
    esc1_curr: '电调电流',
    esc1_volt: '电调电压',
    rpm1: '转速'
  };

  const ANGLE_KEYS = new Set([
    'roll',
    'pitch',
    'yaw',
    'ahrs2_roll',
    'ahrs2_pitch',
    'ahrs2_yaw',
    'nav_roll',
    'nav_pitch',
    'nav_bearing',
    'groundcourse',
    'groundcourse2'
  ]);

  const PARAM_LIST = [
  "accelsq", "accelsq2", "accelsq3", "ahrs2_alt", "ahrs2_lat", "ahrs2_lng", "ahrs2_pitch", "ahrs2_roll", "ahrs2_yaw",
  "airspeed", "airspeed1_temp", "airspeed2_temp", "alt", "alt_error", "altasl", "altasl2", "altd100", "altd1000", "altofftohome",
  "AOA", "armed", "aspd_error", "aspratio", "ax", "ax2", "ax3", "ay", "ay2", "ay3", "az", "az2", "az3",
  "AZTCMAV", "battery_cell1", "battery_cell10", "battery_cell11", "battery_cell12", "battery_cell13", "battery_cell14", "battery_cell15", "battery_cell16", "battery_cell17", "battery_cell18", "battery_cell19",
  "battery_remaining", "battery_remaining2", "battery_remaining3", "battery_remaining4", "battery_remaining5", "battery_remaining6", "battery_remaining7", "battery_remaining8", "battery_remaining9",
  "battery_temp", "battery_temp2", "battery_temp3", "battery_temp4", "battery_temp5", "battery_temp6", "battery_temp7", "battery_temp8", "battery_temp9",
  "battery_usedmah", "battery_usedmah2", "battery_usedmah3", "battery_usedmah4", "battery_usedmah5", "battery_usedmah6", "battery_usedmah7", "battery_usedmah8", "battery_usedmah9",
  "battery_voltage", "battery_voltage2", "battery_voltage3", "battery_voltage4", "battery_voltage5", "battery_voltage6", "battery_voltage7", "battery_voltage8", "battery_voltage9",
  "boardvoltage", "brklevel", "campointa", "campointb", "campointc", "capabilities", "ch1in", "ch1out", "ch2in", "ch2out", "ch3in", "ch3out", "ch4in", "ch4out", "ch5in", "ch5out", "ch6in", "ch6out", "ch7in", "ch7out", "ch8in", "ch8out", "ch9in", "ch9out", "ch10in", "ch10out", "ch11in", "ch11out", "ch12in", "ch12out", "ch13in", "ch13out", "ch14in", "ch14out", "ch15in", "ch15out", "ch16in", "ch16out", "ch30out", "ch31out", "ch32out",
  "chpercent", "climbrate", "connected", "crit_AOA", "current", "current2", "current3", "current4", "current5", "current6", "current7", "current8", "current9",
  "DistFromMovingBase", "DistRSSIRemain", "DistToHome", "distTraveled", "efi_baro", "efi_exhaustemp", "efi_fuelconsumed", "efi_fuelpressure", "efi_headtemp", "efi_intaketemp", "efi_load", "efi_rpm", "ekfcompg", "ekfposhor", "ekfposvert", "ekfstatus", "ekfvel", "ELTCMAV", "errors_count1", "errors_count2", "errors_count3", "errors_count4",
  "esc1_curr", "esc1_rpm", "esc1_temp", "esc1_volt", "esc2_curr", "esc2_rpm", "esc2_temp", "esc2_volt", "esc3_curr", "esc3_rpm", "esc3_temp", "esc3_volt", "esc4_curr", "esc4_rpm", "esc4_temp", "esc4_volt", "esc5_curr", "esc5_rpm", "esc5_temp", "esc5_volt", "esc6_curr", "esc6_rpm", "esc6_temp", "esc6_volt", "esc7_curr", "esc7_rpm", "esc7_temp", "esc7_volt",
  "failsafe", "fenceb_count", "fenceb_status", "fenceb_type", "fixedp", "freemem", "gen_current", "gen_maint_time", "gen_runtime", "gen_speed", "gen_status", "gen_voltage",
  "GeoFenceDist", "gimballat", "gimballng", "glide_ratio", "gpsh_acc", "gpsh_acc2", "gpshdg", "gpshddopC", "gpsstatus", "gpsv_acc", "gpsv_acc2", "gpsvel_acc", "gpsvel_acc2", "gpsvxy", "gpsvxy2",
  "groundcourse", "groundcourse2", "groundspeed", "groundspeed2", "gx", "gx2", "gx3", "gy", "gy2", "gy3", "gyrosq", "gyrosq2", "gyrosq3", "gz", "gz2", "gz3",
  "HomeAlt", "horizondist", "hwvoltage", "hygrohum1", "hygrohum2", "hygrotemp1", "hygrotemp2", "i2cerrors", "imu1_temp", "imu2_temp", "imu3_temp",
  "landed", "landed_state", "lat", "lat2", "linkqualityrcs", "lng", "lng2", "load", "local_snrdb", "lowairspeed", "lowgroundspeed", "magfield", "magfield2", "magfield3",
  "messageHighSeverity", "mx", "mx2", "mx3", "my", "my2", "my3", "mz", "mz2", "mz3",
  "nav_bearing", "nav_pitch", "nav_roll", "noise", "opt_m_x", "opt_m_y", "opt_qua", "opt_x", "opt_y", "packetdropremote", "pidachieved", "pidaxis", "pidd", "piddesired", "piddiff", "pidI", "pidP", "pidPDMod", "pidRate", "pitch", "posd", "pose", "posn", "prearm_status", "press_abs", "press_abs2", "press_temp", "press_temp2",
  "QH", "radius", "rangefinder1", "rangefinder10", "rangefinder2", "rangefinder3", "rangefinder4", "rangefinder5", "rangefinder6", "rangefinder7", "rangefinder8", "rangefinder9",
  "rateattitude", "rategps_no_fix", "rateposition", "raterc", "ratesensors", "ratestatus", "remnoise", "remotessnrdb", "roll", "rpm1", "rpm2", "rssi", "rxerrors", "rxrrsi", "safetyactive", "satcount", "satcount2", "satcountB",
  "servovoltage", "sonarange", "sonarvoltage", "speedup", "SSA", "target_bearing", "target_speed", "targetalt", "targetalt100", "ter_alt", "ter_ault", "ter_load", "ter_pend", "ter_space", "terrainactive", "timeInAir", "timeSinceArm", "timeSinceImu", "timeSinceLast", "toh", "tot", "turnrate", "txbuffer", "uid", "verticalspeed", "verticalspeed2", "vibeclip0", "vibeclip1", "vibeclip2", "vibex", "vibey", "vibez", "vlen", "voltageflag", "vtol_state", "vx", "vy", "vz", "watts", "wind_dir", "wind_vel", "wp_dist", "wpno", "xpd_adb_tx_sys_fail", "xpd_airborne_status", "xpd_board_temperature", "xpd_esi080_tx_enabled", "xpd_gps_no_fix", "xpd_gps_unavail", "xpd_ident_active", "xpd_interrogated_since_last", "xpd_maint_req", "xpd_mode_A_squawk_code", "xpd_mode_C_enabled", "xpd_mode_S_enabled", "xpd_nacp", "xpd_nic", "xpd_status_pending", "xpd_status_unavail", "xpd_x_bit_status", "xtrack_error",
  "yaw"
  ];

  const STORAGE_KEY = 'quickGridConfig';
  const DEFAULT_CELLS = [
    "alt",
    "groundspeed",
    "airspeed",
    "battery_voltage",
    "roll",
    "pitch",
    "yaw",
    "climbrate",
    "distToHome"
  ];

  class QuickGrid{
    constructor(){
      this.palette = [
        ['#0b3d91','#092a6b'],
        ['#2b2d42','#1b1c2b'],
        ['#3a6ea5','#274b6d'],
        ['#2a9d8f','#1f6f63'],
        ['#8e44ad','#5e2e86'],
        ['#f39c12','#b36b0a'],
        ['#e74c3c','#a82920'],
        ['#16a085','#0e6a56']
      ];
      this.container = document.getElementById('quick-grid');
      this.modal = document.getElementById('param-modal');
      this.pmList = document.getElementById('pm-list');
      this.pmSearch = document.getElementById('pm-search');
      this.pmClose = document.getElementById('pm-close');
      this.pmClear = document.getElementById('pm-clear');

      // 默认配置：若 localStorage 没有配置则使用 DEFAULT_CELLS（3x3）
      const stored = this.loadConfig();
      if(stored && typeof stored.rows === 'number' && typeof stored.cols === 'number' && Array.isArray(stored.cells)){
        this.config = stored;
      } else {
        const rows = 3, cols = 3, total = rows * cols;
        const cells = [];
        for(let i=0;i<total;i++) cells.push(DEFAULT_CELLS[i] || null);
        this.config = { rows: rows, cols: cols, cells: cells };
      }
      // 确保 cells 长度与 rows*cols 一致，并为缺失项填充 DEFAULT_CELLS（以防旧配置为空数组或部分为空）
      this.resizeCells(this.config.rows || 3, this.config.cols || 3);
      for(let i=0;i < (this.config.rows * this.config.cols); i++){
        if(!this.config.cells[i] && DEFAULT_CELLS[i]){
          this.config.cells[i] = DEFAULT_CELLS[i];
        }
      }
      // 保存可能的默认填充值
      this.saveConfig();
      this.editingIndex = null;

      this.pmClose.addEventListener('click',()=>this.hideModal());
      this.pmClear.addEventListener('click',()=>this.clearCellFromModal());
      this.pmSearch.addEventListener('input',()=>this.renderPmList());
      this.initContextMenu();

      // 确保 window.telemetry 存在这些默认键（保留大小写）；不覆盖已有值
      try{
        window.telemetry = window.telemetry || {};
        for(const k of this.config.cells){
          if(k && !(k in window.telemetry)){
            window.telemetry[k] = undefined;
          }
        }
      }catch(e){console.warn('telemetry init failed',e)}
      // helper: hex -> rgba
      this.hexToRgba = function(hex, a){
        if(!hex) return 'rgba(0,0,0,'+a+')';
        const h = hex.replace('#','');
        const bigint = parseInt(h,16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r},${g},${b},${a})`;
      };

      // helper: 根据参数名决定使用哪个调色板条目（实现自动配色）
      this.determinePaletteIndexForKey = function(key, idx){
        if(!key) return idx % this.palette.length;
        const k = key.toLowerCase();
        if(k.includes('volt') || k.includes('battery')) return 6; // red/orange
        if(k.includes('temp') || k.includes('temperature')) return 5; // warm
        if(k.includes('speed') || k.includes('groundspeed') || k.includes('airspeed') || k.includes('vx')||k.includes('vy')||k.includes('vz')||k.includes('rpm')) return 0; // blue
        if(k.includes('alt') || k.includes('height') || k.includes('homealt') || k.endsWith('_alt')) return 4; // purple
        if(k.includes('curr') || k==='current') return 5; // warm
        if(k.includes('roll')||k.includes('pitch')||k.includes('yaw')) return 2; // teal-ish
        return idx % this.palette.length;
      };

      this.renderGrid();
      this.startUpdater();
    }

    loadConfig(){
      try{const v=localStorage.getItem(STORAGE_KEY);return v?JSON.parse(v):null}catch(e){return null}
    }
    saveConfig(){localStorage.setItem(STORAGE_KEY,JSON.stringify(this.config))}

    applyLayout(r, c){
      r = Math.max(1,Math.min(8,parseInt(r,10)||3));
      c = Math.max(1,Math.min(8,parseInt(c,10)||3));
      this.resizeCells(r,c);
      this.config.rows=r;this.config.cols=c;this.saveConfig();
      this.renderGrid();
    }

    resetLayout(){
      this.config = { rows: 3, cols: 3, cells: DEFAULT_CELLS.slice(0, 9) };
      this.saveConfig();
      this.renderGrid();
    }

    initContextMenu(){
      this.ctxMenu = document.createElement('div');
      this.ctxMenu.className = 'quick-ctx hidden';
      this.ctxMenu.innerHTML = `
        <div class="qcm-row">
          <label>行 <input class="qcm-rows" type="number" min="1" max="8"></label>
          <label>列 <input class="qcm-cols" type="number" min="1" max="8"></label>
        </div>
        <div class="qcm-actions">
          <button class="qcm-apply" type="button">应用</button>
          <button class="qcm-reset" type="button">重置</button>
          <button class="qcm-close" type="button">关闭</button>
        </div>
      `;
      document.body.appendChild(this.ctxMenu);

      this.ctxRows = this.ctxMenu.querySelector('.qcm-rows');
      this.ctxCols = this.ctxMenu.querySelector('.qcm-cols');
      this.ctxMenu.querySelector('.qcm-apply').addEventListener('click', () => {
        this.applyLayout(this.ctxRows.value, this.ctxCols.value);
        this.hideContextMenu();
      });
      this.ctxMenu.querySelector('.qcm-reset').addEventListener('click', () => {
        this.resetLayout();
        this.hideContextMenu();
      });
      this.ctxMenu.querySelector('.qcm-close').addEventListener('click', () => this.hideContextMenu());

      document.addEventListener('pointerdown', (ev) => {
        if (!this.ctxMenu || this.ctxMenu.classList.contains('hidden')) return;
        if (this.ctxMenu.contains(ev.target)) return;
        this.hideContextMenu();
      });
      window.addEventListener('resize', () => this.hideContextMenu());
      window.addEventListener('scroll', () => this.hideContextMenu(), { passive: true });
    }

    showContextMenu(pageX, pageY){
      if(!this.ctxMenu) return;
      this.ctxRows.value = this.config.rows || 3;
      this.ctxCols.value = this.config.cols || 3;

      this.ctxMenu.classList.remove('hidden');
      // position with viewport clamp
      const margin = 8;
      const rect = this.ctxMenu.getBoundingClientRect();
      const maxX = window.scrollX + window.innerWidth - rect.width - margin;
      const maxY = window.scrollY + window.innerHeight - rect.height - margin;
      const x = Math.min(pageX, maxX);
      const y = Math.min(pageY, maxY);
      this.ctxMenu.style.left = `${Math.max(window.scrollX + margin, x)}px`;
      this.ctxMenu.style.top = `${Math.max(window.scrollY + margin, y)}px`;
    }

    hideContextMenu(){
      if(!this.ctxMenu) return;
      this.ctxMenu.classList.add('hidden');
    }

    resizeCells(r,c){
      const total=r*c;const cells=this.config.cells||[];
      if(cells.length>total) cells.length=total;
      while(cells.length<total) cells.push(null);
      this.config.cells=cells;
    }

    renderGrid(){
      const r=this.config.rows||3;const c=this.config.cols||3;
      this.resizeCells(r,c);
      this.container.style.gridTemplateColumns = `repeat(${c}, 1fr)`;
      this.container.style.gridTemplateRows = `repeat(${r}, 1fr)`;
      this.container.innerHTML='';
      this.config.cells.forEach((param,idx)=>{
        const cell = document.createElement('div');
        cell.className='quick-cell';
        cell.dataset.index=idx;
        // 只保留一个显示位置：参数名（.cell-top）位于数值之上，居中显示
        cell.innerHTML = `<div class="cell-top"></div><div class="cell-value">--</div><div class="cell-unit"></div>`;
        // set per-cell background from palette (gradient)
        const paletteIndex = this.determinePaletteIndexForKey(param, idx);
        const p = this.palette[paletteIndex % this.palette.length];
        if(p){
          const g1 = this.hexToRgba(p[0], 0.10);
          const g2 = this.hexToRgba(p[1], 0.28);
          cell.style.background = `linear-gradient(180deg, ${g1}, ${g2})`;
          cell.style.borderColor = this.hexToRgba(p[1], 0.35);
        }
        cell.querySelector('.cell-top').textContent = param ? param : '';
        cell.addEventListener('click',()=>this.openModal(idx));
        cell.addEventListener('dblclick',()=>this.clearCell(idx));
        cell.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.showContextMenu(ev.pageX, ev.pageY);
        });
        this.container.appendChild(cell);
      });
      this.saveConfig();
    }

    openModal(index){
      this.editingIndex = index;
      this.modal.classList.remove('hidden');
      this.pmSearch.value='';
      this.renderPmList();
      setTimeout(()=>this.pmSearch.focus(),50);
    }
    hideModal(){this.editingIndex=null;this.modal.classList.add('hidden')}

    renderPmList(){
      const q = (this.pmSearch.value||'').toLowerCase();
      const items = PARAM_LIST.filter(p=>p.toLowerCase().includes(q));
      this.pmList.innerHTML='';
      items.forEach(p=>{
        const el=document.createElement('div');el.className='pm-item';el.textContent=p;el.addEventListener('click',()=>this.assignParam(p));this.pmList.appendChild(el);
      });
    }

    assignParam(param){
      if(this.editingIndex==null) return;
      this.config.cells[this.editingIndex]=param;
      this.saveConfig();
      this.renderGrid();
      // debug: print current telemetry lookup for assigned key
      try{
        const k = param;
        let foundVal;
        if(window.telemetry){
          if(k in window.telemetry) foundVal = window.telemetry[k];
          else {
            const f = Object.keys(window.telemetry).find(x=>x.toLowerCase()===String(k).toLowerCase());
            if(f) foundVal = window.telemetry[f];
          }
        }
        console.debug('[quick-grid] assigned',k,'=>',foundVal);
      }catch(e){}
      this.hideModal();
    }

    clearCell(index){
      this.config.cells[index]=null; this.saveConfig(); this.renderGrid();
    }
    clearCellFromModal(){ if(this.editingIndex!=null){this.clearCell(this.editingIndex);this.hideModal()}}

    resolveTelemetryValue(key, lowerKeyToActual){
      if(!window.telemetry || !key) return undefined;
      const tel = window.telemetry;
      const candidates = [key];
      const aliasKey = String(key).toLowerCase();
      const aliases = TELEMETRY_ALIASES[aliasKey] || [];
      candidates.push(...aliases);

      for(const candidate of candidates){
        if(candidate in tel) return tel[candidate];
        const candLower = String(candidate).toLowerCase();
        if (lowerKeyToActual && lowerKeyToActual.has(candLower)) {
          return tel[lowerKeyToActual.get(candLower)];
        }
        const found = Object.keys(tel).find(k => k.toLowerCase() === candLower);
        if(found) return tel[found];
      }
      return undefined;
    }

    getDisplayLabel(key){
      if(!key) return '';
      const normalized = String(key).toLowerCase();
      return LABELS_ZH[normalized] || key;
    }

    isAngleKey(key){
      return ANGLE_KEYS.has(String(key).toLowerCase());
    }

    normalizeHeadingDegrees(value){
      return ((value % 360) + 360) % 360;
    }

    toDisplayValue(key, value){
      if(typeof value !== 'number' || !isFinite(value)) return value;
      if(this.isAngleKey(key)){
        const deg = value * 180 / Math.PI;
        return String(key).toLowerCase().includes('yaw') || String(key).toLowerCase().includes('bearing') || String(key).toLowerCase().includes('course')
          ? this.normalizeHeadingDegrees(deg)
          : deg;
      }
      return value;
    }

    formatValueWithUnit(key, value){
      const displayValue = this.toDisplayValue(key, value);
      const unit = this.getUnitForKey(key);
      if(typeof displayValue === 'number' && isFinite(displayValue)){
        const decimals = unit === 'm' || unit === 'V' || unit === 'A' || unit === 'm/s' ? 2 : 2;
        return unit ? `${Number(displayValue).toFixed(decimals)} ${unit}` : Number(displayValue).toFixed(decimals);
      }
      if(typeof displayValue !== 'undefined' && displayValue !== null){
        return unit ? `${String(displayValue)} ${unit}` : String(displayValue);
      }
      return '--';
    }

    startUpdater(){
      this.refreshTelemetryCells = () => {
        if (!this.container) return;
        const tel = window.telemetry;
        let lowerKeyToActual = null;
        if (tel && typeof tel === 'object') {
          lowerKeyToActual = new Map();
          for (const k of Object.keys(tel)) lowerKeyToActual.set(String(k).toLowerCase(), k);
        }
        const cells = Array.from(this.container.children);
        cells.forEach(cell=>{
          const idx = parseInt(cell.dataset.index,10);
          const key = this.config.cells[idx];
          const top = cell.querySelector('.cell-top');
          const valEl = cell.querySelector('.cell-value');
          const unitEl = cell.querySelector('.cell-unit');
          if(!key){
            top.textContent = '';
            valEl.textContent = '--';
            unitEl.textContent = '';
            cell.classList.remove('status-low','status-warn','status-ok');
            return;
          }
          top.textContent = this.getDisplayLabel(key);
          let v = this.resolveTelemetryValue(key, lowerKeyToActual);
          if(typeof v === 'string' && v.trim() !== '' && !isNaN(parseFloat(v))){
            v = parseFloat(v);
          }
          valEl.textContent = this.formatValueWithUnit(key, v);
          unitEl.textContent = '';
          const cls = this.determineStatusClass(key,v);
          cell.classList.remove('status-low','status-warn','status-ok');
          if(cls) cell.classList.add(cls);
        });
      };
      this.refreshTelemetryCells();
    }

    determineStatusClass(key,v){
      if(typeof v!=='number' || !isFinite(v)) return 'status-ok';
      const k = key.toLowerCase();
      if(k.includes('volt')||k.includes('battery')||k.includes('boardvoltage')||k.includes('servovoltage')){
        if(v<=11) return 'status-low';
        if(v<=11.8) return 'status-warn';
        return 'status-ok';
      }
      if(k.includes('temp')||k.includes('temperature')){
        if(v>=80) return 'status-low';
        if(v>=60) return 'status-warn';
        return 'status-ok';
      }
      return 'status-ok';
    }

    getUnitForKey(key){
      const k = key.toLowerCase();
      if(this.isAngleKey(k)) return '°';
      if(k==='alt' || k.endsWith('_alt') || k.includes('altasl') || k.includes('homealt') || k.includes('dist')) return 'm';
      if(k.includes('speed')||k.includes('groundspeed')||k.includes('airspeed')||k.includes('target_speed')) return 'm/s';
      if(k.includes('volt')) return 'V';
      if(k.includes('temp')) return '℃';
      if(k.includes('curr')||k==='current') return 'A';
      if(k.includes('rpm')) return 'rpm';
      return '';
    }
  }

  // 初始化并尝试恢复配置
  document.addEventListener('DOMContentLoaded', ()=>{
    try{
      window.quickGrid = new QuickGrid();
      window.refreshQuickGrid = function () {
        if (window.quickGrid && typeof window.quickGrid.refreshTelemetryCells === "function") {
          window.quickGrid.refreshTelemetryCells();
        }
      };
    }catch(e){console.error('QuickGrid init failed',e)}
  });

})();

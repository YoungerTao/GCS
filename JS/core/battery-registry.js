/**
 * 电池监测槽位：与 ArduPilot BATTx_MONITOR / BATTERY_STATUS.id 对齐
 */
(function initBatteryRegistry() {
  const BATT_MONITOR_KEYS = [
    "BATT_MONITOR", "BATT2_MONITOR", "BATT3_MONITOR", "BATT4_MONITOR", "BATT5_MONITOR",
    "BATT6_MONITOR", "BATT7_MONITOR", "BATT8_MONITOR", "BATT9_MONITOR",
  ];

  const BATT_MONITOR_TYPES = {
    0: "Disabled",
    3: "Analog Voltage Only",
    4: "Analog Voltage and Current",
    5: "Solo",
    6: "Bebop",
    7: "SMBus-Generic",
    8: "DroneCAN-BatteryInfo",
    9: "ESC",
    10: "Sum Of Selected Monitors",
    11: "FuelFlow",
    12: "FuelLevelPWM",
    13: "SMBUS-SUI3",
    14: "SMBUS-SUI6",
    15: "NeoDesign",
    16: "SMBus-Maxell",
    17: "Generator-Elec",
    18: "Generator-Fuel",
    19: "Rotoye",
    20: "MPPT",
    21: "INA2XX (INA226 INA228 INA238 INA231 INA260)",
    22: "LTC2946",
    23: "Torqeedo",
    24: "FuelLevelAnalog",
    25: "Synthetic Current and Analog Voltage",
    26: "INA239_SPI",
    27: "EFI",
    28: "AD7091R5",
    29: "Scripting",
    30: "INA3221",
    31: "Analog Current Only",
    32: "TIBQ76952-I2C (Periph only)",
  };

  const MONITOR_UI = {
    0: { short: "Disabled", ui: "disabled" },
    3: { short: "AnalogVolt", ui: "analog" },
    4: { short: "AnalogVoltCurr", ui: "analog" },
    5: { short: "Solo", ui: "solo" },
    6: { short: "Bebop", ui: "bebop" },
    7: { short: "SMBus", ui: "smbus" },
    8: { short: "DroneCAN", ui: "dronecan_bms" },
    9: { short: "ESC", ui: "esc" },
    21: { short: "INA2XX", ui: "ina2xx" },
    22: { short: "LTC2946", ui: "ltc2946" },
    25: { short: "AnalogSynth", ui: "analog" },
    29: { short: "Scripting", ui: "scripting" },
    30: { short: "INA3221", ui: "ina3221" },
    31: { short: "AnalogCurr", ui: "analog" },
  };

  function getp(params, key) {
    if (!(params instanceof Map) || !params.has(key)) return null;
    const v = Number(params.get(key));
    return Number.isFinite(v) ? v : null;
  }

  function battSlotIndexFromMonitorKey(monitorKey) {
    if (monitorKey === "BATT_MONITOR") return 0;
    const m = String(monitorKey).match(/^BATT(\d+)_MONITOR$/);
    return m ? parseInt(m[1], 10) - 1 : -1;
  }

  function battMonitorKeyFromSlot(slotIndex) {
    return slotIndex === 0 ? "BATT_MONITOR" : `BATT${slotIndex + 1}_MONITOR`;
  }

  function battParamPrefixFromSlot(slotIndex) {
    return slotIndex === 0 ? "BATT" : `BATT${slotIndex + 1}`;
  }

  function serialParamKey(prefix) {
    return `${prefix}_SERIAL_NUM`;
  }

  function monitorMeta(monitorType) {
    const t = Math.round(monitorType || 0);
    return MONITOR_UI[t] || { short: `TYPE_${t}`, ui: "monitor" };
  }

  function normalizeBatteryTempC(tempCdeg) {
    if (!Number.isFinite(tempCdeg)) return undefined;
    if (tempCdeg === 32767 || tempCdeg === -32768) return undefined;
    const c = tempCdeg / 100;
    if (c > 120 || c < -50) return undefined;
    return c;
  }

  /**
   * BMS数据合理性判定与降级策略
   * @param {number} totalVoltage - 总电压（V）
   * @param {number[]} cellVoltages - 电芯电压数组（V）
   * @param {number} reportedCells - BMS上报的串数
   * @param {number} monitorType - 监测类型
   * @returns {{isValid: boolean, estimatedCells: number, correctedCells: number[], reason: string, isEstimated: boolean}}
   */
  function validateAndCorrectBatteryData(totalVoltage, cellVoltages, reportedCells, monitorType) {
    // 1. 基础检查
    if (!totalVoltage || totalVoltage < 1) {
      return { 
        isValid: false, 
        estimatedCells: 0, 
        correctedCells: [], 
        reason: "总电压无效",
        isEstimated: false 
      };
    }

    // 2. 估算合理串数范围
    const estMin = Math.ceil(totalVoltage / 4.45);  // 高压锂电上限
    const estMax = Math.floor(totalVoltage / 2.5);  // 放空保护下限
    const estMost = Math.round(totalVoltage / 3.7); // 标称电压估算

    // 3. 验证电芯数据
    let isValid = true;
    let reasons = [];

    // 3.1 单芯电压物理极限检查
    if (cellVoltages && cellVoltages.length > 0) {
      for (let cell of cellVoltages) {
        if (cell > 4.45) {
          isValid = false;
          reasons.push(`单芯电压${cell.toFixed(2)}V超过物理上限4.45V`);
        }
        if (cell < 2.5 && cell > 0.1) {
          isValid = false;
          reasons.push(`单芯电压${cell.toFixed(2)}V低于保护下限2.5V`);
        }
      }

      // 3.2 串数一致性检查
      if (reportedCells && (reportedCells < estMin || reportedCells > estMax)) {
        isValid = false;
        reasons.push(`上报${reportedCells}S不在合理范围${estMin}-${estMax}S`);
      }

      // 3.3 电芯和与总压偏差检查
      const cellSum = cellVoltages.reduce((a, b) => a + b, 0);
      if (Math.abs(cellSum - totalVoltage) > 0.3) {
        isValid = false;
        reasons.push(`电芯和${cellSum.toFixed(2)}V与总压${totalVoltage.toFixed(2)}V偏差过大`);
      }

      // 3.4 电芯均衡性检查（真实电池不可能完全一致）
      if (cellVoltages.length > 1) {
        const allSame = cellVoltages.every(v => Math.abs(v - cellVoltages[0]) < 0.001);
        if (allSame) {
          isValid = false;
          reasons.push(`所有${cellVoltages.length}个电芯电压完全相同，疑似伪数据`);
        }
      }
    }

    // 4. 生成结果
    if (isValid && cellVoltages && cellVoltages.length > 0) {
      return {
        isValid: true,
        estimatedCells: cellVoltages.length,
        correctedCells: cellVoltages,
        reason: "BMS数据可信",
        isEstimated: false
      };
    }

    // 降级策略：使用总压估算电芯电压
    const correctedCells = Array(estMost).fill(totalVoltage / estMost);
    return {
      isValid: false,
      estimatedCells: estMost,
      correctedCells: correctedCells,
      reason: reasons.length > 0 ? reasons.join("; ") : "无电芯数据",
      isEstimated: true
    };
  }

  function batteryUiType(monitorType, cellVoltages, voltage) {
    const t = Math.round(monitorType || 0);
    if (voltage > 100) return "tethered";
    const meta = monitorMeta(t);
    if (meta.ui !== "monitor") return meta.ui;
    if (cellVoltages && cellVoltages.length) return "smart_bms";
    return "monitor";
  }

  /**
   * 判断 BATTERY_STATUS 是否代表该槽位真实在线（避免无 BMS 时误用主路电压）
   */
  function assessBatteryTelemetryConnected(
    slotIndex,
    monitorType,
    cellVoltages,
    voltage,
    current,
    remaining,
    temperature
  ) {
    const t = Math.round(monitorType || 0);
    const cells = cellVoltages || [];
    if (t === 0) return false;
    if (cells.length > 0 && voltage > 0.5) return true;
    if (t === 8) {
      if (cells.length > 0) return true;
      if (Number.isFinite(temperature) && voltage > 0.5) return true;
      if (remaining >= 0 && remaining <= 100 && voltage > 0.5) return true;
      return false;
    }
    if (voltage <= 0.5) return false;
    if (t === 3 || t === 4 || t === 25 || t === 31) return true;
    if (Number.isFinite(temperature)) return true;
    if (current > 0.02) return true;
    if (remaining >= 0 && remaining <= 100) return true;
    return slotIndex === 0;
  }

  function listEnabledBatterySlots(params) {
    const p = params instanceof Map ? params : window.params;
    if (!(p instanceof Map)) return [];
    const out = [];
    for (const monitorKey of BATT_MONITOR_KEYS) {
      const slotIndex = battSlotIndexFromMonitorKey(monitorKey);
      if (slotIndex < 0) continue;
      const monitorType = getp(p, monitorKey);
      if (monitorType == null || Math.round(monitorType) === 0) continue;
      const prefix = battParamPrefixFromSlot(slotIndex);
      const meta = monitorMeta(monitorType);
      const serial = getp(p, serialParamKey(prefix));
      out.push({
        slotIndex,
        monitorKey,
        prefix,
        monitorType: Math.round(monitorType),
        typeShort: meta.short,
        typeUi: meta.ui,
        serialNum: serial != null ? Math.round(serial) : null,
      });
    }
    return out;
  }

  function failsafeControlSuffix(slotIndex) {
    return slotIndex === 0 ? "" : `-${slotIndex + 1}`;
  }

  /**
   * 合并参数槽位 + MAVLink 遥测，供电源页 / 概览使用
   */
  function buildBatteryMonitorView(params) {
    const slots = listEnabledBatterySlots(params);
    const map = window.powerInstances instanceof Map ? window.powerInstances : new Map();

    if (!slots.length) {
      if (typeof window.battery_voltage === "number" && window.battery_voltage > 0) {
        const monitorType = getp(window.params, "BATT_MONITOR");
        return [{
          id: 0,
          slotIndex: 0,
          name: "Battery 1",
          prefix: "BATT",
          monitorKey: "BATT_MONITOR",
          monitorType: monitorType != null ? Math.round(monitorType) : 0,
          type: batteryUiType(monitorType, [], window.battery_voltage),
          typeShort: monitorMeta(monitorType).short,
          connected: true,
          voltage: window.battery_voltage,
          current: 0,
          cells: (() => {
            const v = window.battery_voltage;
            if (!v || v <= 0) return 1;
            const MIN_CELL_V = 2.7;
            const MAX_CELL_V = 4.45;
            let s = Math.max(1, Math.round(v / 3.7));
            const per = v / s;
            if (per < MIN_CELL_V) s = Math.max(1, Math.floor(v / MIN_CELL_V));
            else if (per > MAX_CELL_V) s = Math.max(1, Math.ceil(v / MAX_CELL_V));
            return s;
          })(),
          cellVoltages: [],
        }];
      }
      return [];
    }

    return slots.map((slot) => {
      const telem = map.get(slot.slotIndex);
      const online = !!(
        telem &&
        telem.connected !== false &&
        Number.isFinite(telem.voltage) &&
        telem.voltage > 0.1
      );

      if (online) {
        return {
          ...slot,
          id: slot.slotIndex,
          name: `Battery ${slot.slotIndex + 1}`,
          connected: true,
          type: telem.type || slot.typeUi,
          voltage: telem.voltage,
          current: telem.current ?? 0,
          cells: telem.cells ?? 0,
          cellVoltages: telem.cellVoltages || [],
          temperature: telem.temperature,
          remaining: telem.remaining,
          updatedAt: telem.updatedAt,
        };
      }

      return {
        ...slot,
        id: slot.slotIndex,
        name: `Battery ${slot.slotIndex + 1}`,
        connected: false,
        type: slot.typeUi,
        voltage: 0,
        current: 0,
        cells: 0,
        cellVoltages: [],
        temperature: undefined,
        remaining: undefined,
      };
    });
  }

  function countOnlineBatteries(view) {
    return (view || []).filter((v) => v.connected).length;
  }

  window.battMonitorKeyFromSlot = battMonitorKeyFromSlot;
  window.battSlotIndexFromMonitorKey = battSlotIndexFromMonitorKey;
  window.battParamPrefixFromSlot = battParamPrefixFromSlot;
  window.listEnabledBatterySlots = listEnabledBatterySlots;
  window.buildBatteryMonitorView = buildBatteryMonitorView;
  window.countOnlineBatteries = countOnlineBatteries;
  window.normalizeBatteryTempC = normalizeBatteryTempC;
  window.batteryUiType = batteryUiType;
  window.assessBatteryTelemetryConnected = assessBatteryTelemetryConnected;
  window.battFailsafeControlSuffix = failsafeControlSuffix;
  window.BATT_MONITOR_TYPES = BATT_MONITOR_TYPES;
  window.validateAndCorrectBatteryData = validateAndCorrectBatteryData;
})();

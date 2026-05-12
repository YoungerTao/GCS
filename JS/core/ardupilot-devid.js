/**
 * ArduPilot 设备 ID 解码（与 Tools/scripts/decode_devid.py 一致）
 * COMPASS_DEV_ID / INS_ACC*_ID / BARO*_DEVID 等均为 uint32 打包字段。
 */
(function () {
  const BUS = {
    1: "I2C",
    2: "SPI",
    3: "DroneCAN",
    4: "SITL",
    5: "MSP",
    6: "SERIAL",
  };

  const COMPASS = {
    0x01: "DEVTYPE_HMC5883_OLD",
    0x07: "DEVTYPE_HMC5883",
    0x02: "DEVTYPE_LSM303D",
    0x04: "DEVTYPE_AK8963",
    0x05: "DEVTYPE_BMM150",
    0x06: "DEVTYPE_LSM9DS1",
    0x08: "DEVTYPE_LIS3MDL",
    0x09: "DEVTYPE_AK0991x",
    0x0a: "DEVTYPE_IST8310",
    0x0b: "DEVTYPE_ICM20948",
    0x0c: "DEVTYPE_MMC3416",
    0x0d: "DEVTYPE_QMC5883L",
    0x0e: "DEVTYPE_MAG3110",
    0x0f: "DEVTYPE_SITL",
    0x10: "DEVTYPE_IST8308",
    0x11: "DEVTYPE_RM3100_OLD",
    0x12: "DEVTYPE_RM3100",
    0x13: "DEVTYPE_MMC5883",
    0x14: "DEVTYPE_AK09918",
    0x15: "DEVTYPE_AK09915",
    0x16: "DEVTYPE_QMC5883P",
    0x17: "DEVTYPE_BMM350",
    0x18: "DEVTYPE_IIS2MDC",
    0x19: "DEVTYPE_LIS2MDL",
  };

  const IMU = {
    0x09: "DEVTYPE_BMI160",
    0x10: "DEVTYPE_L3G4200D",
    0x11: "DEVTYPE_ACC_LSM303D",
    0x12: "DEVTYPE_ACC_BMA180",
    0x13: "DEVTYPE_ACC_MPU6000",
    0x16: "DEVTYPE_ACC_MPU9250",
    0x17: "DEVTYPE_ACC_IIS328DQ",
    0x21: "DEVTYPE_GYR_MPU6000",
    0x22: "DEVTYPE_GYR_L3GD20",
    0x24: "DEVTYPE_GYR_MPU9250",
    0x25: "DEVTYPE_GYR_I3G4250D",
    0x26: "DEVTYPE_GYR_LSM9DS1",
    0x27: "DEVTYPE_INS_ICM20789",
    0x28: "DEVTYPE_INS_ICM20689",
    0x29: "DEVTYPE_INS_BMI055",
    0x2a: "DEVTYPE_SITL",
    0x2b: "DEVTYPE_INS_BMI088",
    0x2c: "DEVTYPE_INS_ICM20948",
    0x2d: "DEVTYPE_INS_ICM20648",
    0x2e: "DEVTYPE_INS_ICM20649",
    0x2f: "DEVTYPE_INS_ICM20602",
    0x30: "DEVTYPE_INS_ICM20601",
    0x31: "DEVTYPE_INS_ADIS1647x",
    0x32: "DEVTYPE_INS_SERIAL",
    0x33: "DEVTYPE_INS_ICM40609",
    0x34: "DEVTYPE_INS_ICM42688",
    0x35: "DEVTYPE_INS_ICM42605",
    0x36: "DEVTYPE_INS_ICM40605",
    0x37: "DEVTYPE_INS_IIM42652",
    0x38: "DEVTYPE_INS_BMI270",
    0x39: "DEVTYPE_INS_BMI085",
    0x3a: "DEVTYPE_INS_ICM42670",
    0x3b: "DEVTYPE_INS_ICM45686",
    0x3c: "DEVTYPE_INS_SCHA63T",
    0x3d: "DEVTYPE_INS_IIM42653",
    0x3e: "DEVTYPE_INS_LSM6DSV",
    0x3f: "DEVTYPE_INS_ASM330",
    0x40: "DEVTYPE_INS_ADIS16607",
  };

  const BARO = {
    0x01: "DEVTYPE_BARO_SITL",
    0x02: "DEVTYPE_BARO_BMP085",
    0x03: "DEVTYPE_BARO_BMP280",
    0x04: "DEVTYPE_BARO_BMP388",
    0x05: "DEVTYPE_BARO_DPS280",
    0x06: "DEVTYPE_BARO_DPS310",
    0x07: "DEVTYPE_BARO_FBM320",
    0x08: "DEVTYPE_BARO_ICM20789",
    0x09: "DEVTYPE_BARO_KELLERLD",
    0x0a: "DEVTYPE_BARO_LPS2XH",
    0x0b: "DEVTYPE_BARO_MS5611",
    0x0c: "DEVTYPE_BARO_SPL06",
    0x0d: "DEVTYPE_BARO_DRONECAN",
    0x0e: "DEVTYPE_BARO_MSP",
    0x0f: "DEVTYPE_BARO_ICP101XX",
    0x10: "DEVTYPE_BARO_ICP201XX",
    0x11: "DEVTYPE_BARO_MS5607",
    0x12: "DEVTYPE_BARO_MS5837_30BA",
    0x13: "DEVTYPE_BARO_MS5637",
    0x14: "DEVTYPE_BARO_BMP390",
    0x15: "DEVTYPE_BARO_BMP581",
    0x16: "DEVTYPE_BARO_SPA06",
    0x17: "DEVTYPE_BARO_AUAV",
    0x18: "DEVTYPE_BARO_MS5837_02BA",
  };

  function tableFor(kind) {
    if (kind === "compass") return COMPASS;
    if (kind === "imu") return IMU;
    if (kind === "baro") return BARO;
    return {};
  }

  /** 与 decode_devid 习惯一致：总线实例号直接用于显示（如 SPI1口、I2C0口） */
  function portZh(busType, bus) {
    const b = bus & 0x1f;
    switch (busType) {
      case 1: return `I2C${b}口`;
      case 2: return `SPI${b}口`;
      case 3: return "DroneCAN";
      case 4: return "SITL";
      case 5: return `MSP${b}`;
      case 6: return `串口${b}`;
      default: return `总线${busType}·${b}`;
    }
  }

  function humanModel(devName) {
    if (!devName || devName === "UNKNOWN") return "未知器件";
    let s = devName
      .replace(/^DEVTYPE_INS_/i, "")
      .replace(/^DEVTYPE_ACC_/i, "")
      .replace(/^DEVTYPE_GYR_/i, "")
      .replace(/^DEVTYPE_BARO_/i, "")
      .replace(/^DEVTYPE_/i, "")
      .replace(/_/g, "");
    if (s === "RM3100OLD") s = "RM3100";
    return s;
  }

  /**
   * @param {"compass"|"imu"|"baro"} kind
   * @param {number} devid uint32
   */
  function decodeArduPilotDevId(kind, devid) {
    const u = devid >>> 0;
    const hex = `0x${u.toString(16).toUpperCase().padStart(8, "0")}`;
    const busType = u & 0x07;
    const bus = (u >> 3) & 0x1f;
    const address = (u >> 8) & 0xff;
    const devtype = u >>> 16;
    const tbl = tableFor(kind);
    const rawName = tbl[devtype] || "UNKNOWN";
    const busLabel = BUS[busType] || `BUS_${busType}`;
    let extra = "";
    if (busType === 3) {
      const sid = devtype > 0 ? devtype - 1 : 0;
      extra = ` · DroneCAN sensor_id ${sid} (0x${sid.toString(16)})`;
    }
    return {
      hex,
      busType,
      busLabel,
      bus,
      address,
      devtype,
      rawName,
      model: humanModel(rawName),
      portZh: portZh(busType, bus),
      busDetail: `${busLabel} · 总线号 ${bus} · 地址 0x${address.toString(16).padStart(2, "0")}${extra}`,
    };
  }

  window.decodeArduPilotDevId = decodeArduPilotDevId;
}());

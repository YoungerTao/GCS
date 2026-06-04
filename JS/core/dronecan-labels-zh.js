/**
 * DroneCAN / UAVCAN 消息中文名（Inspector 显示：NotifyState · 通知状态）
 */
(function initDronecanLabelsZh(global) {
  /** 优先用完整 DSDL 名，避免多个 Status 冲突 */
  const byFullName = {
    "ardupilot.indication.NotifyState": "通知状态",
    "ardupilot.indication.SafetyState": "安全开关状态",
    "ardupilot.indication.Button": "按键事件",
    "ardupilot.gnss.Heading": "GNSS 航向",
    "ardupilot.gnss.Status": "GNSS 状态",
    "ardupilot.gnss.MovingBaselineData": "移动基线数据",
    "ardupilot.gnss.RelPosHeading": "相对位置航向",
    "ardupilot.equipment.power.BatteryInfoAux": "电池信息(扩展)",
    "com.hobbywing.esc.GetEscID": "获取电调ID",
    "ardupilot.equipment.trafficmonitor.TrafficReport": "交通监视报告",
    "uavcan.protocol.NodeStatus": "节点运行状态",
    "uavcan.protocol.GetNodeInfo": "获取节点信息",
    "uavcan.protocol.GetDataTypeInfo": "获取数据类型信息",
    "uavcan.protocol.GetTransportStats": "传输统计",
    "uavcan.protocol.dynamic_node_id.Allocation": "动态节点 ID 分配",
    "uavcan.protocol.dynamic_node_id.server.Discovery": "节点 ID 服务发现",
    "uavcan.protocol.debug.LogMessage": "调试日志",
    "uavcan.protocol.debug.KeyValue": "调试键值",
    "uavcan.protocol.param.GetSet": "参数读写",
    "uavcan.protocol.file.BeginFirmwareUpdate": "开始固件升级",
    "uavcan.equipment.safety.ArmingStatus": "解锁/预武装状态",
    "uavcan.equipment.indication.LightsCommand": "灯光指令",
    "uavcan.equipment.indication.BeepCommand": "蜂鸣指令",
    "uavcan.equipment.power.BatteryInfo": "电池信息",
    "uavcan.equipment.power.CircuitStatus": "电路状态",
    "uavcan.equipment.power.PrimaryPowerSupplyStatus": "主电源状态",
    "uavcan.equipment.gnss.Fix2": "GNSS 定位",
    "uavcan.equipment.gnss.Fix": "GNSS 定位(旧)",
    "uavcan.equipment.gnss.Auxiliary": "GNSS 辅助",
    "uavcan.equipment.gnss.RTCMStream": "RTCM 差分流",
    "uavcan.equipment.ahrs.Solution": "AHRS 解算",
    "uavcan.equipment.ahrs.RawIMU": "原始 IMU",
    "uavcan.equipment.esc.RawCommand": "电调原始指令",
    "uavcan.equipment.esc.RPMCommand": "电调转速指令",
    "uavcan.equipment.esc.Status": "电调状态",
    "uavcan.equipment.actuator.Status": "执行器状态",
    "uavcan.equipment.actuator.ArrayCommand": "执行器阵列指令",
    "uavcan.equipment.range_sensor.Measurement": "测距",
    "uavcan.equipment.device.Temperature": "设备温度",
    "uavcan.navigation.GlobalNavigationSolution": "全局导航解",
    "uavcan.tunnel.Broadcast": "隧道广播",
    "uavcan.tunnel.Call": "隧道调用",
    "dronecan.sensors.hygrometer.Hygrometer": "湿度计",
    "com.hex.equipment.flow.Measurement": "流量测量",
    "raw.can.Frame": "原始 CAN 帧",
  };

  const byShortName = {
    NotifyState: "通知状态",
    SafetyState: "安全开关状态",
    ArmingStatus: "解锁状态",
    LightsCommand: "灯光指令",
    BeepCommand: "蜂鸣指令",
    NodeStatus: "节点状态",
    GetNodeInfo: "获取节点信息",
    GetDataTypeInfo: "获取类型信息",
    Allocation: "节点 ID 分配",
    BatteryInfo: "电池信息",
    BatteryInfoAux: "电池信息(扩展)",
    GetEscID: "获取电调ID",
    LogMessage: "日志消息",
    GetSet: "参数读写",
    Discovery: "服务发现",
    Indication: "枚举指示",
    RawFrame: "原始帧",
    GlobalNavigationSolution: "全局导航",
    TrueAirspeed: "真空速",
    IndicatedAirspeed: "指示空速",
    StaticPressure: "静压",
    StaticTemperature: "静温",
    RawIMU: "原始 IMU",
    Fix2: "GNSS 定位",
    Heading: "航向",
    TrafficReport: "交通报告",
    Measurement: "测量值",
    Temperature: "温度",
    Button: "按键",
    Panic: "紧急停机",
    RestartNode: "重启节点",
    BeginFirmwareUpdate: "固件升级",
    KeyValue: "键值调试",
    Broadcast: "广播",
    Call: "调用",
    Hygrometer: "湿度",
    FuelTankStatus: "油箱状态",
    AngularCommand: "云台角指令",
    GEOPOICommand: "地理兴趣点指令",
    RawCommand: "原始指令",
    RPMCommand: "转速指令",
    ArrayCommand: "阵列指令",
    Command: "指令",
    Read: "读文件",
    Write: "写文件",
    Delete: "删除文件",
    GetInfo: "获取信息",
    ExecuteOpcode: "执行操作码",
    Begin: "开始枚举",
    AppendEntries: "追加条目",
    RequestVote: "请求投票",
    GlobalTimeSync: "全局时间同步",
    GetTransportStats: "传输统计",
    AccessCommandShell: "访问命令行",
    PrimaryPowerSupplyStatus: "主电源",
    CircuitStatus: "电路状态",
    AngleOfAttack: "迎角",
    Sideslip: "侧滑角",
    RawAirData: "原始大气数据",
    Auxiliary: "辅助数据",
    RTCMStream: "RTCM 流",
    RelPosHeading: "相对航向",
    MovingBaselineData: "移动基线",
    Solution: "解算结果",
    MagneticFieldStrength: "磁场强度",
    MagneticFieldStrength2: "磁场强度2",
    Vendor: "厂商消息",
    Type: "未知类型",
  };

  const categoryZh = {
    ArduPilot: "飞控",
    Equipment: "设备",
    Protocol: "协议",
    Power: "电源",
    Service: "服务",
    Raw: "原始",
    Status: "状态",
    Allocation: "分配",
    Standard: "标准",
    Unknown: "未知",
    Vendor: "厂商",
    Navigation: "导航",
  };

  function lookup(shortName, fullName) {
    const full = String(fullName || "").trim();
    const short = String(shortName || "").trim();
    if (full && byFullName[full]) return byFullName[full];
    if (short && byShortName[short]) return byShortName[short];
    return "";
  }

  function categoryLabel(category) {
    const key = String(category || "").trim();
    return categoryZh[key] || "";
  }

  /** Inspector 树/标题：NotifyState · 通知状态 */
  function formatShortName(shortName, fullName, labelZh) {
    const short = String(shortName || "").trim() || "—";
    const zh = String(labelZh || "").trim() || lookup(shortName, fullName);
    return zh ? `${short} · ${zh}` : short;
  }

  function formatCategory(category) {
    const key = String(category || "").trim();
    const zh = categoryLabel(key);
    return zh ? `${key} · ${zh}` : key;
  }

  function bilingual(en, zh) {
    const e = String(en ?? "").trim();
    const z = String(zh ?? "").trim();
    if (!e) return z || "—";
    return z ? `${e} · ${z}` : e;
  }

  /** Inspector 面板字段名（左侧 dt / 表头） */
  const ui = {
    "Standard data type": "标准数据类型",
    "Transfer layer": "传输层",
    "Decoded fields": "解码字段",
    "Payload (transport stripped)": "载荷（已去传输层）",
    "Standard type": "标准类型",
    "Short name": "短名",
    "Default data type ID": "默认数据类型 ID",
    Category: "分类",
    "CAN ID": "CAN 标识",
    Priority: "优先级",
    "Source node": "源节点",
    "Transfer type": "传输类型",
    DLC: "数据长度码",
    "Frame data": "帧数据",
    "Tail byte": "尾字节",
    "Transfer ID": "传输序号",
    "SOF / EOF": "帧起止标志",
    Field: "字段",
    Value: "数值",
    Hex: "十六进制",
    "Broadcast message": "广播消息",
    "Service request": "服务请求",
    "Service response": "服务响应",
    "Selected Message": "已选消息",
    "from node": "来自节点",
    "Default ID": "默认 ID",
    "Select a CAN ID under Message Groups or Recent Frames to decode its payload.":
      "请在「消息分组」或「最近帧」中选择 CAN ID 以解码载荷",
    "No field decoder for data type": "尚无该数据类型的字段解码器",
    "yet. See raw payload below.": "请查看下方原始载荷",
  };

  const fieldNames = {
    payload_bytes: "载荷字节数",
    payload_hex: "载荷十六进制",
    partial_payload_hex: "未收齐载荷",
    transfer_mode: "传输方式",
    decode_hint: "解码提示",
    decode: "解码说明",
    latitude: "纬度",
    longitude: "经度",
    height_ellipsoid: "椭球高",
    height_msl: "海拔高",
    velocity_north: "北向速度",
    velocity_east: "东向速度",
    velocity_down: "地向速度",
    fix_status: "定位状态",
    sats_used: "使用卫星数",
    sats_visible: "可见卫星数",
    gdop: "几何精度因子",
    hdop: "水平精度因子",
    vdop: "垂直精度因子",
    pdop: "位置精度因子",
    healthy: "健康",
    error_codes: "错误码",
    status_flags: "状态标志",
    gnss_time_standard: "GNSS 时间基准",
    num_leap_seconds: "闰秒数",
    mode: "定位模式",
    sub_mode: "子模式",
    "timestamp.usec": "时间戳(微秒)",
    state_of_charge_pct: "电量(%)",
    battery_id: "电池编号",
    status_flags: "状态标志",
    "voltage_cell[0]": "电芯电压[0]",
    "voltage_cell[1]": "电芯电压[1]",
    cycle_count: "循环次数",
    over_discharge_count: "过放次数",
    uptime_sec: "运行时间(秒)",
    health: "健康状态",
    mode: "工作模式",
    sub_mode: "子模式",
    vendor_specific_status_code: "厂商状态码",
    esc_node_id: "电调节点ID",
    throttle_channel: "油门通道",
    query_option: "查询选项",
  };

  function uiLabel(key) {
    const k = String(key || "").trim();
    return bilingual(k, ui[k]);
  }

  function fieldLabel(name) {
    const n = String(name || "").trim();
    if (!n) return "—";
    if (fieldNames[n]) return bilingual(n, fieldNames[n]);
    return n;
  }

  function transferTypeLabel(isService, isRequest) {
    if (isService) {
      return isRequest ? uiLabel("Service request") : uiLabel("Service response");
    }
    return uiLabel("Broadcast message");
  }

  global.DRONECAN_LABELS_ZH = {
    lookup,
    categoryLabel,
    formatShortName,
    formatCategory,
    bilingual,
    uiLabel,
    fieldLabel,
    transferTypeLabel,
    byFullName,
    byShortName,
    categoryZh,
    ui,
    fieldNames,
  };
})(typeof window !== "undefined" ? window : globalThis);

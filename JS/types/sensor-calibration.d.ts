/**
 * Shared types for IMU / compass calibration and DroneCAN diagnostics UI.
 * Runtime: `accel-calibration.js`, `compass-calibration.js`, `sensor-calibration.js` (子导航壳),
 * `dronecan-setup.js` (vanilla IIFE).
 */

export type CalibState = "idle" | "orienting" | "measuring" | "success" | "failed";

export type AccelAxisKey = "level" | "left" | "right" | "up" | "down" | "back";

export type AxisFaceStatus = "pending" | "active" | "completed";

export interface AxisStatus {
  axis: AccelAxisKey;
  status: AxisFaceStatus;
  progress: number;
}

export type CanNodeStatus = "online" | "offline" | "error";

export interface CanNode {
  nodeId: number;
  status: CanNodeStatus;
  name: string;
  hardwareVersion: string;
  dsdlData: Record<string, string | number>;
}

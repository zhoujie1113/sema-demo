import * as THREE from "three";
import { L } from "../world/layout";

export type MissionState = "idle" | "driving" | "arrived" | "done" | "free";

export interface MissionEvents {
  onCheckpoint?: (index: number) => void;
  onArrive?: () => void;
  onLeaveBay?: () => void;
  onDone?: (timeMs: number) => void;
  onAccept?: () => void;
}

export class Mission {
  state: MissionState = "idle";
  elapsed = 0;
  passed = 0;
  state2 = 0; // 调试用占位
  private readonly bayVec = new THREE.Vector2(L.bay.x, L.bay.z);
  private wasInsideBay = false;

  constructor(private events: MissionEvents) {}

  get target(): THREE.Vector2 | null {
    if (this.state === "driving") {
      const cp = L.checkpoints[this.passed];
      if (cp) return new THREE.Vector2(cp.x, cp.z);
      return this.bayVec;
    }
    if (this.state === "arrived") return this.bayVec;
    return null;
  }

  get objective(): string {
    if (this.state === "idle") return "按 E 确认送件任务";
    if (this.state === "driving") {
      const cp = L.checkpoints[this.passed];
      if (cp) return `前往 ${cp.label}`;
      return "驶入海边交付区，停进车位";
    }
    if (this.state === "arrived") return "已停稳 · 按 E 交付货物";
    if (this.state === "done") return "任务完成";
    return "自由驾驶";
  }

  get statusLabel() {
    switch (this.state) {
      case "idle": return "待出发";
      case "driving": return "运送中";
      case "arrived": return "等待交付";
      case "done": return "已完成";
      default: return "自由驾驶";
    }
  }

  get total() {
    return L.checkpoints.length;
  }

  accept() {
    if (this.state !== "idle") return;
    this.state = "driving";
    this.elapsed = 0;
    this.passed = 0;
    this.events.onAccept?.();
  }

  /** 交付判定：必须停稳并主动按 E */
  tryDeliver(speedKmh: number) {
    if (this.state !== "arrived") return false;
    if (speedKmh > 4) return false;
    this.state = "done";
    this.events.onDone?.(this.elapsed);
    return true;
  }

  reset() {
    this.state = "idle";
    this.elapsed = 0;
    this.passed = 0;
    this.wasInsideBay = false;
  }

  enterFreeDrive() {
    this.state = "free";
  }

  update(dt: number, pos: THREE.Vector2, speedKmh: number) {
    if (this.state === "driving" || this.state === "arrived") this.elapsed += dt * 1000;

    if (this.state === "driving") {
      const cp = L.checkpoints[this.passed];
      if (cp && Math.abs(pos.x - cp.x) < 4 && Math.abs(pos.y) < 12) {
        this.passed++;
        this.events.onCheckpoint?.(this.passed - 1);
        if (this.passed >= L.checkpoints.length) {
          // 继续驶向交付区
        }
      }
      const inBay = Math.abs(pos.x - L.bay.x) < 3.6 && Math.abs(pos.y - L.bay.z) < 5.4;
      if (this.passed >= L.checkpoints.length && inBay && speedKmh < 3) {
        this.state = "arrived";
        this.wasInsideBay = true;
        this.events.onArrive?.();
      }
    } else if (this.state === "arrived") {
      const d = pos.distanceTo(this.bayVec);
      if (d > 8 || speedKmh > 8) {
        this.state = "driving";
        this.wasInsideBay = false;
        this.events.onLeaveBay?.();
      }
    }
  }

  get timeMs() {
    return this.elapsed;
  }

  get insideBay() {
    return this.wasInsideBay;
  }
}

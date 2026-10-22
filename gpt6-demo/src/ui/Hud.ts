import * as THREE from "three";
import { L } from "../world/layout";
import { formatTime } from "../util";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private state = $("m-state");
  private timer = $("m-timer");
  private title = $("m-title");
  private obj = $("m-obj");
  private steps = $("m-steps");
  private speed = $("speed");
  private gear = $("gear");
  private hint = $("hint");
  private toastEl = $("toast");
  private card = $("mission-card");
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private toastTimer = 0;
  private radius: number;
  private stepEls: HTMLElement[] = [];
  private lastStepKey = "";

  constructor() {
    this.canvas = $("minimap") as unknown as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.radius = this.canvas.width / 2;
  }

  show(visible: boolean) {
    $("hud").hidden = !visible;
  }

  setTimer(ms: number) {
    this.timer.textContent = formatTime(ms);
  }

  updateMission(opts: {
    status: string;
    stateClass: string;
    title: string;
    objective: string;
    passed: number;
    total: number;
  }) {
    this.state.textContent = opts.status;
    this.state.className = `pill ${opts.stateClass}`;
    this.title.textContent = opts.title;
    this.obj.textContent = opts.objective;

    const key = `${opts.passed}/${opts.total}`;
    if (key !== this.lastStepKey) {
      this.lastStepKey = key;
      this.steps.innerHTML = "";
      this.stepEls = [];
      for (let i = 0; i < opts.total; i++) {
        const el = document.createElement("i");
        el.className = "step";
        this.steps.appendChild(el);
        this.stepEls.push(el);
      }
    }
    this.stepEls.forEach((el, i) => {
      el.className = "step" + (i < opts.passed ? " pass" : i === opts.passed ? " on" : "");
    });
    this.card.classList.toggle("done", opts.passed >= opts.total);
  }

  setSpeed(kmh: number, gear: number) {
    const v = Math.round(kmh);
    if (this.speed.textContent !== String(v)) this.speed.textContent = String(v);
    const g = gear === 0 ? "R" : v < 2 ? "N" : String(gear);
    if (this.gear.textContent !== g) this.gear.textContent = g;
  }

  setHint(text: string | null) {
    if (!text) {
      this.hint.hidden = true;
      return;
    }
    if (this.hint.hidden || this.hint.textContent !== text) {
      this.hint.hidden = false;
      this.hint.innerHTML = text;
    }
  }

  toast(text: string, bad = false) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.toggle("bad", bad);
    this.toastTimer = 2.4;
  }

  setMuted(muted: boolean) {
    $("sound-btn").classList.toggle("muted", muted);
  }

  tick(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /*                              小地图                                 */
  /* ------------------------------------------------------------------ */
  drawMap(carX: number, carZ: number, heading: number, target: THREE.Vector2 | null, passed: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const R = W / 2;
    const scale = R / 62; // 视野半径 ~62m
    ctx.clearRect(0, 0, W, W);

    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();

    const bg = ctx.createRadialGradient(R, R, 10, R, R, R);
    bg.addColorStop(0, "#14232a");
    bg.addColorStop(1, "#0a1216");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, W);

    const a = -Math.PI / 2 - heading;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(a);
    ctx.scale(scale, scale);
    ctx.translate(-carX, -carZ);

    // 海
    ctx.fillStyle = "#123039";
    ctx.fillRect(carX - 400, 13, 800, 300);
    // 沙滩
    ctx.fillStyle = "#4a4030";
    ctx.fillRect(carX - 400, 12.6, 800, 26.4);
    // 道路
    ctx.fillStyle = "#23262a";
    ctx.fillRect(L.road.minX, -9, L.road.maxX - L.road.minX, 18);
    // 人行道
    ctx.fillStyle = "#2d3033";
    ctx.fillRect(L.road.minX, 9, L.road.maxX - L.road.minX, 3.6);
    ctx.fillRect(L.road.minX, -12.6, L.road.maxX - L.road.minX, 3.6);
    // 停车场 / 交付区
    ctx.fillStyle = "#282b2e";
    ctx.fillRect(L.lot.minX, L.lot.minZ, L.lot.maxX - L.lot.minX, L.lot.maxZ - L.lot.minZ);
    ctx.fillRect(L.delivery.minX, 9, L.delivery.maxX - L.delivery.minX, L.delivery.maxZ - 9);
    // 建筑街区
    ctx.fillStyle = "#1a1d20";
    ctx.fillRect(L.motel.minX, L.motel.minZ, L.motel.maxX - L.motel.minX, L.motel.maxZ - L.motel.minZ);
    ctx.fillRect(-112, -46, 92, 10);
    ctx.fillRect(8, -31, 700, 17);
    // 道路中线
    ctx.strokeStyle = "rgba(224,178,90,0.5)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(L.road.minX, 0);
    ctx.lineTo(L.road.maxX, 0);
    ctx.stroke();
    // 海岸线
    ctx.strokeStyle = "rgba(120,200,210,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(carX - 400, 12.6);
    ctx.lineTo(carX + 400, 12.6);
    ctx.stroke();
    ctx.restore();

    // 目标点 / 检查点
    const drawMarker = (wx: number, wz: number, color: string, kind: "cp" | "goal" | "done") => {
      const dx = wx - carX;
      const dz = wz - carZ;
      const u = dx * Math.cos(a) - dz * Math.sin(a);
      const v = dx * Math.sin(a) + dz * Math.cos(a);
      let px = R + u * scale;
      let py = R + v * scale;
      const dist = Math.hypot(px - R, py - R);
      const edge = R - 14;
      let clamped = false;
      if (dist > edge) {
        px = R + ((px - R) / dist) * edge;
        py = R + ((py - R) / dist) * edge;
        clamped = true;
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = clamped ? 0.85 : 1;
      if (kind === "goal") {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-5, -5, 10, 10);
      } else if (kind === "cp") {
        ctx.beginPath();
        ctx.arc(0, 0, clamped ? 5 : 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (clamped) {
        // 边缘箭头
        const ang = Math.atan2(py - R, px - R);
        ctx.rotate(ang + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(4, -5);
        ctx.lineTo(-4, -5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    };

    L.checkpoints.forEach((cp, i) => {
      drawMarker(cp.x, cp.z, i < passed ? "#4ee2a8" : i === passed ? "#35e0c4" : "rgba(90,120,125,0.7)", i < passed ? "done" : "cp");
    });
    drawMarker(L.bay.x, L.bay.z, "#ffc46a", "goal");

    // 目标方向指示线
    if (target) {
      const dx = target.x - carX;
      const dz = target.y - carZ;
      const u = dx * Math.cos(a) - dz * Math.sin(a);
      const v = dx * Math.sin(a) + dz * Math.cos(a);
      const ang = Math.atan2(v, u);
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(ang);
      ctx.fillStyle = "rgba(255,196,106,0.16)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.9, -0.24, 0.24);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 玩家箭头
    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.restore();

    // 外圈
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

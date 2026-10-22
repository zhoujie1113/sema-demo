import * as THREE from "three";
import { CarParts, createCar, tintCar } from "./CarModel";
import { CollisionWorld } from "./CollisionWorld";
import { clamp, damp } from "../util";

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
}

export interface VehicleState {
  speed: number;
  kmh: number;
  rpm: number;
  gear: number;
  lateral: number;
  slipping: boolean;
}

const HALF_W = 0.99;
const HALF_L = 2.24;
const WHEELBASE = 2.74;
const MAX_SPEED = 47;
const MAX_REVERSE = 11;

export class Vehicle {
  readonly parts: CarParts;
  readonly root: THREE.Group;
  pos = new THREE.Vector2();
  heading = 0;
  velocity = new THREE.Vector2();
  steer = 0;
  speed = 0;
  rpm = 900;
  gear = 1;
  bodyRoll = 0;
  bodyPitch = 0;
  wheelSpin = 0;
  braking = false;
  hitCount = 0;
  lastHitStrength = 0;
  private prevForwardSpeed = 0;
  private spinTimer = 0;

  constructor() {
    this.parts = createCar();
    this.root = this.parts.root;
  }

  get forward() {
    return new THREE.Vector2(Math.cos(this.heading), Math.sin(this.heading));
  }

  get right() {
    return new THREE.Vector2(-Math.sin(this.heading), Math.cos(this.heading));
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  setPose(x: number, z: number, heading: number) {
    this.pos.set(x, z);
    this.heading = heading;
    this.velocity.set(0, 0);
    this.speed = 0;
    this.steer = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.syncTransform();
  }

  static makeParked(color: number, plate: string) {
    const parts = createCar(0x9aa3a8, plate);
    tintCar(parts, color);
    parts.headlights.forEach((l) => (l.visible = false));
    parts.brakeLights.forEach((m) => (m.emissiveIntensity = 0.15));
    return parts;
  }

  step(dt: number, input: DriveInput, world: CollisionWorld) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h, input, world);
    this.updateVisual(dt, input);
  }

  private integrate(dt: number, input: DriveInput, world: CollisionWorld) {
    const f = this.forward;
    const r = this.right;
    let vf = this.velocity.dot(f);
    let vl = this.velocity.dot(r);
    const speedAbs = Math.abs(vf);

    // 转向：速度越高，可用转角越小
    const maxSteer = 0.62 - 0.47 * clamp(speedAbs / 38, 0, 1);
    const target = input.steer * maxSteer;
    this.steer = damp(this.steer, target, input.steer === 0 ? 6.5 : 9, dt);

    // 纵向动力
    let accel = 0;
    this.braking = false;
    if (input.throttle > 0) {
      const power = 11.4 * (1 - clamp(vf / MAX_SPEED, 0, 1) ** 1.4);
      accel += input.throttle * power;
    }
    if (input.brake > 0) {
      if (vf > 0.4) {
        accel -= input.brake * 20;
        this.braking = true;
      } else {
        accel -= input.brake * 7.5 * (1 - clamp(-vf / MAX_REVERSE, 0, 1));
      }
    }
    if (input.handbrake) {
      accel -= Math.sign(vf) * Math.min(speedAbs * 2.2, 14);
    }

    // 阻力
    accel -= Math.sign(vf) * (0.9 + 0.0072 * vf * vf);

    vf += accel * dt;
    if (Math.abs(vf) < 0.06) vf = 0;
    vf = clamp(vf, -MAX_REVERSE, MAX_SPEED);

    // 横向抓地：手刹时快速滑移
    const grip = input.handbrake ? 1.9 : 8.5;
    vl *= Math.exp(-grip * dt);
    if (Math.abs(vl) < 0.02) vl = 0;

    // 偏航
    const yawRate = (vf / WHEELBASE) * Math.tan(this.steer);
    this.heading += yawRate * dt;

    // 侧向滑动时轻微损失前向速度
    if (Math.abs(vl) > 3) vf -= Math.sign(vf) * Math.abs(vl) * 0.035 * dt;

    this.velocity.copy(f).multiplyScalar(vf).addScaledVector(r, vl);
    this.pos.x += this.velocity.x * dt;
    this.pos.y += this.velocity.y * dt;

    // 碰撞
    const probe = { x: this.pos.x, z: this.pos.y };
    const hit = world.resolve(probe, this.heading, HALF_W, HALF_L);
    this.pos.set(probe.x, probe.z);
    if (hit) {
      const vn = this.velocity.x * hit.nx + this.velocity.y * hit.nz;
      if (vn < 0) {
        const impact = -vn;
        this.velocity.x -= hit.nx * vn * 1.35;
        this.velocity.y -= hit.nz * vn * 1.35;
        // 摩擦
        this.velocity.multiplyScalar(0.82);
        if (impact > 2) {
          this.hitCount++;
          this.lastHitStrength = Math.max(this.lastHitStrength, impact);
          this.spinTimer = 0.35;
        }
      }
    }
    this.speed = this.velocity.dot(this.forward);
  }

  private updateVisual(dt: number, input: DriveInput) {
    const f = this.forward;
    const r = this.right;
    const vf = this.velocity.dot(f);
    const vl = this.velocity.dot(r);
    const accel = (vf - this.prevForwardSpeed) / Math.max(dt, 1e-4);
    this.prevForwardSpeed = vf;

    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = -this.heading;

    // 车身姿态
    this.bodyPitch = damp(this.bodyPitch, clamp(-accel * 0.0045, -0.035, 0.035), 8, dt);
    this.bodyRoll = damp(this.bodyRoll, clamp(-vl * 0.012 - this.steer * clamp(vf, -20, 20) * 0.0032, -0.05, 0.05), 7, dt);
    this.parts.body.rotation.z = this.bodyPitch;
    this.parts.body.rotation.x = this.bodyRoll;
    this.parts.body.position.y = damp(this.parts.body.position.y, Math.abs(vl) > 5 ? -0.01 : 0, 8, dt);

    // 车轮
    this.wheelSpin -= (vf / 0.365) * dt;
    for (const w of this.parts.wheels) {
      const spin = w.userData.spin as THREE.Group;
      spin.rotation.z = this.wheelSpin;
      if (w.userData.front) w.rotation.y = this.steer;
    }

    // 刹车灯
    const brakeGlow = this.braking || input.handbrake ? 6.5 : 1.7;
    for (const m of this.parts.brakeLights) {
      m.emissiveIntensity = damp(m.emissiveIntensity, brakeGlow, 14, dt);
    }

    // 挡位 / 转速
    const kmh = Math.abs(vf) * 3.6;
    const thresholds = [0, 38, 70, 102, 134, 166];
    let gear = 1;
    for (let i = 0; i < thresholds.length; i++) if (kmh >= thresholds[i]) gear = i + 1;
    this.gear = vf < -1 ? 0 : gear;
    const lo = thresholds[gear - 1] ?? 0;
    const hi = thresholds[gear] ?? 180;
    const band = clamp((kmh - lo) / Math.max(1, hi - lo), 0, 1);
    this.rpm = damp(this.rpm, 900 + band * 5400 + input.throttle * 350, 9, dt);

    this.spinTimer = Math.max(0, this.spinTimer - dt);
    this.lastHitStrength = Math.max(0, this.lastHitStrength - dt * 6);
  }

  syncTransform() {
    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = -this.heading;
  }

  /** 用于相机抖动的碰撞强度 */
  get shake() {
    return this.lastHitStrength;
  }
}

import * as THREE from "three";
import { Vehicle } from "./Vehicle";
import { CollisionWorld } from "./CollisionWorld";
import { clamp, damp } from "../util";

export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private shake = 0;
  private baseFov = 62;
  private yaw = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  snap(v: Vehicle) {
    const back = new THREE.Vector2(-Math.cos(v.heading), -Math.sin(v.heading));
    this.yaw = v.heading;
    this.pos.set(v.pos.x + back.x * 7.4, 2.9, v.pos.y + back.y * 7.4);
    this.look.set(v.pos.x, 1.15, v.pos.y);
    this.apply();
  }

  update(dt: number, v: Vehicle, world: CollisionWorld, reversed = false) {
    const speed = Math.abs(v.speed);
    const dist = 6.9 + clamp(speed * 0.075, 0, 2.4) + (reversed ? 1.6 : 0);
    const height = 2.55 + clamp(speed * 0.012, 0, 0.5);

    // 相机朝向略微滞后于车身
    const targetYaw = v.heading + (reversed ? Math.PI : 0);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * (1 - Math.exp(-6.5 * dt));

    const bx = -Math.cos(this.yaw) * dist;
    const bz = -Math.sin(this.yaw) * dist;
    let desiredX = v.pos.x + bx;
    let desiredZ = v.pos.y + bz;
    let desiredY = height;

    // 避免相机被建筑挡住：沿视线采样，遇到障碍就拉近
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = v.pos.x + (desiredX - v.pos.x) * t;
      const sz = v.pos.y + (desiredZ - v.pos.y) * t;
      if (world.pointBlocked(sx, sz, 0.6)) {
        desiredX = v.pos.x + (desiredX - v.pos.x) * Math.max(0.25, t - 0.2);
        desiredZ = v.pos.y + (desiredZ - v.pos.y) * Math.max(0.25, t - 0.2);
        desiredY += 0.7;
        break;
      }
    }

    const lam = 7.5;
    this.pos.x = damp(this.pos.x, desiredX, lam, dt);
    this.pos.z = damp(this.pos.z, desiredZ, lam, dt);
    this.pos.y = damp(this.pos.y, desiredY, 6, dt);

    const ahead = new THREE.Vector2(Math.cos(this.yaw), Math.sin(this.yaw)).multiplyScalar(7 + speed * 0.16);
    this.look.x = damp(this.look.x, v.pos.x + ahead.x, 9, dt);
    this.look.z = damp(this.look.z, v.pos.y + ahead.y, 9, dt);
    this.look.y = damp(this.look.y, 1.2, 6, dt);

    this.shake = Math.max(this.shake, v.shake * 0.05);
    this.shake = Math.max(0, this.shake - dt * 0.4);

    const fov = this.baseFov + clamp(speed * 0.28, 0, 12);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 3, dt);
      this.camera.updateProjectionMatrix();
    }
    this.apply();
  }

  private apply() {
    const t = performance.now() * 0.001;
    const sx = Math.sin(t * 47) * this.shake;
    const sy = Math.cos(t * 39) * this.shake;
    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.camera.lookAt(this.look);
    this.camera.rotation.z += Math.sin(t * 31) * this.shake * 0.06;
  }
}

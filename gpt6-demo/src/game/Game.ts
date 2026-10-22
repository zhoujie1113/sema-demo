import * as THREE from "three";
import { Vehicle } from "./Vehicle";
import { Input } from "./Input";
import { ChaseCamera } from "./ChaseCamera";
import { Mission } from "./Mission";
import { World } from "../world/World";
import { Hud } from "../ui/Hud";
import { AudioBus } from "../audio/AudioBus";
import { L } from "../world/layout";
import { formatTime, nearestPointOnSegments } from "../util";

type Mode = "ready" | "playing" | "paused" | "result" | "free";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Game {
  readonly input = new Input();
  readonly cameraRig: ChaseCamera;
  readonly mission: Mission;
  mode: Mode = "ready";
  private topSpeed = 0;
  private lastHitCount = 0;
  private elapsedTotal = 0;
  private fade = $("fade");

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private world: World,
    private car: Vehicle,
    private hud: Hud,
    private audio: AudioBus
  ) {
    this.cameraRig = new ChaseCamera(camera);
    this.mission = new Mission({
      onAccept: () => {
        this.hud.toast("送件任务已接单 · 计时开始");
        this.audio.blip(760, 0.12, 0.09);
      },
      onCheckpoint: (i) => {
        const cp = this.world.checkpoints[i];
        if (cp) cp.passed = true;
        this.hud.toast(`检查点 ${i + 1}/${this.mission.total} 通过`);
        this.audio.blip(880, 0.14, 0.1);
      },
      onArrive: () => {
        this.hud.toast("已抵达交付区 · 停稳后按 E 交付");
        this.audio.blip(620, 0.16, 0.09);
      },
      onLeaveBay: () => {
        this.hud.toast("车辆离开交付区，请重新停稳", true);
      },
      onDone: () => {
        this.finish();
      },
    });
    this.bindUi();
  }

  private bindUi() {
    $("sound-btn").addEventListener("click", () => {
      this.audio.init();
      this.hud.setMuted(this.audio.toggleMute());
    });
    $("resume-btn").addEventListener("click", () => this.resume());
    $("pause-restart").addEventListener("click", () => this.restart());
    $("pause-help").addEventListener("click", () => {
      const box = $("pause-helpbox");
      box.hidden = !box.hidden;
    });
    $("res-again").addEventListener("click", () => this.restart());
    $("res-free").addEventListener("click", () => this.freeDrive());
  }

  startPlaying() {
    this.mode = "playing";
    this.hud.show(true);
    this.mission.reset();
    this.car.setPose(L.start.x, L.start.z, L.start.heading);
    this.cameraRig.snap(this.car);
    this.hud.setHint("<kbd>E</kbd>确认送件任务");
  }

  private setPaused(p: boolean) {
    if (p) {
      this.mode = "paused";
      $("pause").hidden = false;
      $("pause-sub").textContent = `计时 ${formatTime(this.mission.timeMs)} · 音效已同步暂停`;
      this.audio.suspend();
    } else {
      this.mode = "playing";
      $("pause").hidden = true;
      this.audio.resume();
    }
  }

  resume() {
    this.setPaused(false);
  }

  restart() {
    // 复位车辆 / 检查点 / 计时 / 任务状态
    this.fade.classList.add("on");
    window.setTimeout(() => {
      $("pause").hidden = true;
      $("result").hidden = true;
      this.world.checkpoints.forEach((cp) => (cp.passed = false));
      this.mission.reset();
      this.car.setPose(L.start.x, L.start.z, L.start.heading);
      this.car.hitCount = 0;
      this.topSpeed = 0;
      this.lastHitCount = 0;
      this.cameraRig.snap(this.car);
      this.mode = "playing";
      this.audio.resume();
      this.hud.show(true);
      this.hud.setHint("<kbd>E</kbd>确认送件任务");
      this.hud.toast("已回到旅馆停车场");
      this.fade.classList.remove("on");
    }, 260);
  }

  private finish() {
    this.mode = "result";
    $("res-time").textContent = formatMs(this.mission.timeMs);
    $("res-cp").textContent = `${this.mission.total} / ${this.mission.total}`;
    $("res-hit").textContent = String(this.car.hitCount);
    $("res-top").textContent = `${Math.round(this.topSpeed)} km/h`;
    $("result").hidden = false;
    this.audio.blip(920, 0.18, 0.1);
    window.setTimeout(() => this.audio.blip(1240, 0.22, 0.09), 130);
  }

  private freeDrive() {
    $("result").hidden = true;
    this.mission.enterFreeDrive();
    this.mode = "free";
    this.hud.toast("自由驾驶 · 按 Esc 暂停");
  }

  update(dt: number) {
    // 全局按键
    if (this.input.pressed("Escape")) {
      if (this.mode === "playing" || this.mode === "free") this.setPaused(true);
      else if (this.mode === "paused") this.resume();
    }

    if (this.mode === "result" || this.mode === "paused" || this.mode === "ready") {
      this.hud.tick(dt);
      this.input.endFrame();
      return;
    }

    const drive = this.input.drive;
    this.car.step(dt, drive, this.world.col);

    // 任务推进
    this.mission.update(dt, this.car.pos, this.car.kmh);
    this.topSpeed = Math.max(this.topSpeed, this.car.kmh);

    if (this.input.pressed("KeyE")) {
      if (this.mission.state === "idle") {
        this.mission.accept();
      } else if (this.mission.state === "arrived") {
        if (this.mission.tryDeliver(this.car.kmh)) {
          // finish() 内部处理
        } else {
          this.hud.toast("请先停稳车辆再交付", true);
        }
      }
    }

    // 复位
    if (this.input.pressed("KeyR")) {
      const p = nearestPointOnSegments(this.car.pos.x, this.car.pos.y, L.route);
      this.car.setPose(p.x, p.z, p.heading);
      this.cameraRig.snap(this.car);
      this.hud.toast("车辆已复位到最近的安全位置");
      this.audio.blip(520, 0.1, 0.07);
    }

    // 碰撞反馈
    if (this.car.hitCount > this.lastHitCount) {
      this.lastHitCount = this.car.hitCount;
      this.audio.thud(this.car.shake);
    }

    // 相机 / 世界
    this.cameraRig.update(dt, this.car, this.world.col);
    this.world.update(
      dt,
      this.elapsedTotal,
      new THREE.Vector3(this.car.pos.x, 0, this.car.pos.y),
      this.camera.position
    );
    this.elapsedTotal += dt;

    // HUD
    this.hud.setTimer(this.mission.timeMs);
    this.hud.setSpeed(this.car.kmh, this.car.gear);

    if (this.mode === "free") {
      this.hud.updateMission({
        status: "自由驾驶",
        stateClass: "done",
        title: "落日海岸 · 自由驾驶",
        objective: "已送达。随意逛逛，Esc 暂停",
        passed: this.mission.total,
        total: this.mission.total,
      });
      this.hud.setHint(null);
    } else {
      this.hud.updateMission({
        status: this.mission.statusLabel,
        stateClass:
          this.mission.state === "driving"
            ? "live"
            : this.mission.state === "arrived"
            ? "wait"
            : this.mission.state === "done"
            ? "done"
            : "",
        title: this.mission.state === "idle" ? "落日旅馆 · 停车场" : "送件任务 · 海滨大街",
        objective: this.mission.objective,
        passed: this.mission.passed + (this.mission.state === "done" ? 1 : 0),
        total: this.mission.total + 1,
      });

      if (this.mission.state === "idle") this.hud.setHint("<kbd>E</kbd>确认送件任务");
      else if (this.mission.state === "arrived") this.hud.setHint("<kbd>E</kbd>交付货物");
      else this.hud.setHint(null);
    }

    this.hud.drawMap(
      this.car.pos.x,
      this.car.pos.y,
      this.car.heading,
      this.mission.target,
      this.mission.passed
    );

    this.audio.update({
      rpm: this.car.rpm,
      throttle: drive.throttle,
      speed: Math.abs(this.car.speed),
      slip: Math.abs(this.car.speed) > 8 && drive.handbrake ? 1 : 0,
    });

    this.hud.tick(dt);
    this.input.endFrame();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function formatMs(ms: number) {
  return formatTime(ms);
}

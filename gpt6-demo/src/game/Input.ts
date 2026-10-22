import { DriveInput } from "./Vehicle";

export class Input {
  private down = new Set<string>();
  private justDown = new Set<string>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)
      ) {
        e.preventDefault();
      }
      if (!this.down.has(e.code)) this.justDown.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => this.down.clear());
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  pressed(code: string) {
    if (this.justDown.has(code)) {
      this.justDown.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.justDown.clear();
  }

  get drive(): DriveInput {
    const up = this.down.has("KeyW") || this.down.has("ArrowUp");
    const dn = this.down.has("KeyS") || this.down.has("ArrowDown");
    const lf = this.down.has("KeyA") || this.down.has("ArrowLeft");
    const rt = this.down.has("KeyD") || this.down.has("ArrowRight");
    const hb = this.down.has("Space");
    // 起步时轻踩油门，模拟踏板行程
    return {
      throttle: up ? 1 : 0,
      brake: dn ? 1 : 0,
      steer: (rt ? 1 : 0) - (lf ? 1 : 0),
      handbrake: hb,
    };
  }
}

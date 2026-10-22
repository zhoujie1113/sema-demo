export interface Obstacle {
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** 绕 y 轴旋转（弧度），0 表示与坐标轴对齐 */
  rot: number;
  tag: string;
}

export interface Hit {
  nx: number;
  nz: number;
  depth: number;
  obstacle: Obstacle;
}

const CELL = 24;

/** 静态障碍物 + 均匀网格，用来做 OBB / OBB 分离轴检测 */
export class CollisionWorld {
  private obstacles: Obstacle[] = [];
  private grid = new Map<string, Obstacle[]>();

  addBox(x: number, z: number, hw: number, hd: number, rot = 0, tag = "wall") {
    const o: Obstacle = { x, z, hw, hd, rot, tag };
    this.obstacles.push(o);
    const r = Math.hypot(hw, hd);
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = `${ix},${iz}`;
        let arr = this.grid.get(key);
        if (!arr) this.grid.set(key, (arr = []));
        arr.push(o);
      }
    }
  }

  addRange(x0: number, x1: number, z0: number, z1: number, tag = "wall") {
    this.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, tag);
  }

  get count() {
    return this.obstacles.length;
  }

  /** 点是否落在障碍物内（相机避让用） */
  pointBlocked(x: number, z: number, pad = 0): boolean {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const arr = this.grid.get(key);
    if (!arr) return false;
    for (const o of arr) {
      const dx = x - o.x;
      const dz = z - o.z;
      const c = Math.cos(o.rot);
      const s = Math.sin(o.rot);
      const lx = dx * c + dz * s;
      const lz = -dx * s + dz * c;
      if (Math.abs(lx) <= o.hw + pad && Math.abs(lz) <= o.hd + pad) return true;
    }
    return false;
  }

  /** 返回第一个/最深的接触，并把位置推出障碍物 */
  resolve(pos: { x: number; z: number }, heading: number, halfW: number, halfD: number): Hit | null {
    const key = `${Math.floor(pos.x / CELL)},${Math.floor(pos.z / CELL)}`;
    const near = this.grid.get(key);
    const candidates = near ?? this.obstacles;
    let best: Hit | null = null;

    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    // 车辆局部右向量
    const ax = -sin;
    const az = cos;
    const bx = cos;
    const bz = sin;

    for (const o of candidates) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const oc = Math.cos(o.rot);
      const os = Math.sin(o.rot);
      // 障碍物：hw 沿 (cos, sin)，hd 沿 (-sin, cos)
      const oax = oc;
      const oaz = os;
      const obx = -os;
      const obz = oc;

      // 四个分离轴：双方各自的轴
      const axes: [number, number][] = [
        [ax, az],
        [bx, bz],
        [oax, oaz],
        [obx, obz],
      ];
      let minOverlap = Infinity;
      let bestAxis: [number, number] = [0, 0];

      // 只在包围圆相交时精算
      if (dx * dx + dz * dz > (halfD + Math.hypot(o.hw, o.hd)) ** 2) continue;

      for (const [nx, nz] of axes) {
        const dist = dx * nx + dz * nz;
        const rA = halfW * Math.abs(ax * nx + az * nz) + halfD * Math.abs(bx * nx + bz * nz);
        const rB = o.hw * Math.abs(oax * nx + oaz * nz) + o.hd * Math.abs(obx * nx + obz * nz);
        const overlap = rA + rB - Math.abs(dist);
        if (overlap <= 0) {
          minOverlap = -1;
          break;
        }
        if (overlap < minOverlap) {
          minOverlap = overlap;
          const s = dist < 0 ? -1 : 1;
          bestAxis = [nx * s, nz * s];
        }
      }
      if (minOverlap <= 0) continue;

      const depth = minOverlap;
      if (!best || depth > best.depth) {
        best = { nx: bestAxis[0], nz: bestAxis[1], depth, obstacle: o };
      }
      pos.x += bestAxis[0] * depth;
      pos.z += bestAxis[1] * depth;
    }
    return best;
  }
}

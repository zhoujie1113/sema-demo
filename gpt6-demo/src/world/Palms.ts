import * as THREE from "three";
import { Materials } from "./Materials";
import { merge } from "./Geo";
import { mulberry32 } from "../util";

function trunkGeometry(height: number, lean: number, rnd: () => number) {
  const g = new THREE.CylinderGeometry(0.15, 0.26, height, 9, 8, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + height / 2) / height;
    const bend = Math.sin(t * 1.25) * lean + t * t * 0.35 * lean;
    const wob = Math.sin(t * 9 + rnd() * 0.01) * 0.02;
    p.setX(i, p.getX(i) + bend + wob);
    p.setY(i, y + height / 2);
    // 底部略微加粗
    const s = 1 + (1 - t) * 0.18;
    p.setX(i, (p.getX(i) - bend - wob) * s + bend + wob);
    p.setZ(i, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

function frondGeometry(len: number, width: number, droop: number, tilt: number, yaw: number) {
  const g = new THREE.PlaneGeometry(len, width, 10, 1);
  g.translate(len / 2, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const t = x / len;
    // 叶轴下坠 + 侧向翻卷
    p.setZ(i, -droop * t * t * len + Math.abs(p.getY(i)) * 0.25 * t);
  }
  g.rotateX(-Math.PI / 2);
  g.rotateZ(tilt);
  g.rotateY(yaw);
  g.computeVertexNormals();
  return g;
}

function palmGeometry(seed: number) {
  const rnd = mulberry32(seed);
  const height = 6.4 + rnd() * 4.2;
  const lean = (rnd() - 0.5) * 1.6;
  const trunk = trunkGeometry(height, lean, rnd);

  const crownX = Math.sin(1.25) * lean + 0.35 * lean;
  const top = new THREE.Vector3(crownX, height, 0);

  const fronds: THREE.BufferGeometry[] = [];
  const count = 13 + Math.floor(rnd() * 5);
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * Math.PI * 2 + rnd() * 0.22;
    const len = 2.7 + rnd() * 1.3;
    const tilt = 0.32 - rnd() * 0.34;
    let f = frondGeometry(len, 0.86 + rnd() * 0.3, 0.34 + rnd() * 0.2, tilt, yaw);
    f.translate(top.x, top.y + 0.06, top.z);
    fronds.push(f);
  }
  // 顶部椰子 / 叶鞘
  const crown = new THREE.SphereGeometry(0.34, 8, 6);
  crown.scale(1, 0.7, 1);
  crown.translate(top.x, top.y + 0.1, top.z);

  const merged = merge([trunk, crown, ...fronds]);
  // 分两个材质组：树干 / 叶片
  merged.clearGroups();
  const trunkCount = trunk.index ? trunk.index.count : trunk.attributes.position.count;
  const crownCount = crown.index ? crown.index.count : crown.attributes.position.count;
  let start = 0;
  merged.addGroup(start, trunkCount, 0);
  start += trunkCount;
  merged.addGroup(start, crownCount, 0);
  start += crownCount;
  for (const f of fronds) {
    const cnt = f.index ? f.index.count : f.attributes.position.count;
    merged.addGroup(start, cnt, 1);
    start += cnt;
  }
  return merged;
}

export interface PalmSpot {
  x: number;
  z: number;
  scale?: number;
  y?: number;
}

export function buildPalms(mats: Materials, spots: PalmSpot[]) {
  const group = new THREE.Group();
  group.name = "palms";
  const variants = [palmGeometry(3), palmGeometry(17), palmGeometry(41)];
  const buckets: PalmSpot[][] = [[], [], []];
  spots.forEach((s, i) => buckets[i % 3].push(s));

  const rnd = mulberry32(99);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();

  buckets.forEach((spotsForVariant, vi) => {
    if (!spotsForVariant.length) return;
    const inst = new THREE.InstancedMesh(variants[vi], [mats.bark(), mats.frond()], spotsForVariant.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    spotsForVariant.forEach((spot, i) => {
      pos.set(spot.x, spot.y ?? -1.35, spot.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      const sc = spot.scale ?? 0.9 + rnd() * 0.35;
      s.set(sc, sc, sc);
      m.compose(pos, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });

  return group;
}

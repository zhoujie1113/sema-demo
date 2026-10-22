import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Materials } from "./Materials";
import { CollisionWorld } from "../game/CollisionWorld";
import { mulberry32 } from "../util";
import { Vehicle } from "../game/Vehicle";
import { instanceFromTemplate, makeMatrices, mergeByMaterial } from "./Geo";

export type ModelMap = Record<string, THREE.Object3D>;

export const MODEL_LIST = [
  { key: "lamp", path: "./assets/models/street_lamp_01/street_lamp_01_2k.gltf" },
  { key: "hydrant", path: "./assets/models/fire_hydrant/fire_hydrant_2k.gltf" },
  { key: "bin", path: "./assets/models/metal_trash_can/metal_trash_can_2k.gltf" },
  { key: "barrier", path: "./assets/models/concrete_road_barrier/concrete_road_barrier_2k.gltf" },
  { key: "fence", path: "./assets/models/modular_chainlink_fence/modular_chainlink_fence_2k.gltf" },
  { key: "aircon", path: "./assets/models/exterior_aircon_unit/exterior_aircon_unit_2k.gltf" },
  { key: "tyre", path: "./assets/models/old_tyre/old_tyre_2k.gltf" },
  { key: "chair", path: "./assets/models/plastic_monobloc_chair_01/plastic_monobloc_chair_01_2k.gltf" },
  { key: "plant", path: "./assets/models/potted_plant_01/potted_plant_01_2k.gltf" },
  { key: "crate", path: "./assets/models/wooden_crate_01/wooden_crate_01_2k.gltf" },
  { key: "coveredCar", path: "./assets/models/covered_car/covered_car_2k.gltf" },
];

export async function loadModels(manager: THREE.LoadingManager): Promise<ModelMap> {
  const loader = new GLTFLoader(manager);
  const out: ModelMap = {};
  await Promise.all(
    MODEL_LIST.map(async (m) => {
      const gltf = await loader.loadAsync(m.path);
      out[m.key] = gltf.scene;
    })
  );
  return out;
}

/** 归一化模型：按目标尺寸缩放，底面贴地、水平居中，返回可直接实例化的模板 */
function normalize(obj: THREE.Object3D, targetSize: number, axis: "y" | "x" = "y") {
  const holder = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const raw = axis === "y" ? size.y : size.x;
  const s = targetSize / (raw || 1);
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (box2.min.x + box2.max.x) / 2;
  obj.position.z -= (box2.min.z + box2.max.z) / 2;
  obj.position.y -= box2.min.y;
  holder.add(obj);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return holder;
}

interface Spot {
  x: number;
  z: number;
  rot: number;
  scale?: number;
  y?: number;
}

export function buildProps(mats: Materials, col: CollisionWorld, models: ModelMap) {
  const group = new THREE.Group();
  group.name = "props";
  const rnd = mulberry32(77);

  const templates: Record<string, THREE.Object3D> = {
    lamp: normalize(models.lamp, 7.4),
    bin: normalize(models.bin, 0.95),
    hydrant: normalize(models.hydrant, 0.82),
    aircon: normalize(models.aircon, 0.85),
    tyre: normalize(models.tyre, 0.72),
    crate: normalize(models.crate, 0.75),
    chair: normalize(models.chair, 0.86),
    plant: normalize(models.plant, 1.0),
    fence: normalize(models.fence, 3.0, "x"),
    barrier: normalize(models.barrier, 0.95),
  };

  const addInstanced = (key: string, spots: Spot[]) => {
    if (!spots.length) return;
    group.add(instanceFromTemplate(templates[key], makeMatrices(spots)));
  };

  /* ---------- 路灯 ---------- */
  const lamps: Spot[] = [];
  for (let x = -90; x <= 810; x += 34) {
    lamps.push({ x, z: 10.9, rot: Math.PI });
    col.addBox(x, 10.9, 0.22, 0.22, 0, "lamp");
  }
  for (let x = -78; x <= 810; x += 34) {
    lamps.push({ x, z: -10.4, rot: 0 });
    col.addBox(x, -10.4, 0.22, 0.22, 0, "lamp");
  }
  addInstanced("lamp", lamps);

  /* ---------- 垃圾桶 / 消防栓 ---------- */
  addInstanced(
    "bin",
    [-16, 40, 120, 200, 260, 330, 400, 500, 600, 700].map((x) => ({
      x: x + rnd() * 2,
      z: 10.6,
      rot: rnd() * 6.28,
    }))
  );
  addInstanced(
    "hydrant",
    [-13, 168, 352, 548].map((x) => ({ x, z: 10.5, rot: rnd() * 6.28 }))
      .concat([70, 240, 430, 620].map((x) => ({ x, z: -10.1, rot: rnd() * 6.28 })))
  );

  /* ---------- 空调外机 ---------- */
  const aircons: Spot[] = [];
  for (let x = -106; x < -24; x += 9.2) aircons.push({ x, z: -35.4, rot: 0, y: 4.15 });
  for (const x of [20, 66, 130, 186, 230, 320, 366, 416, 526, 566, 622]) {
    aircons.push({ x, z: -13.35, rot: 0, y: 4.9 + rnd() * 1.2 });
  }
  addInstanced("aircon", aircons);

  /* ---------- 轮胎 / 木箱 / 椅子 / 盆栽 ---------- */
  addInstanced(
    "tyre",
    Array.from({ length: 6 }, (_, i) => ({
      x: -92 + rnd() * 12,
      z: -34.4 + rnd() * 2.6,
      rot: rnd() * 6.28,
      y: 0.02 + i * 0.16,
    }))
  );
  addInstanced("crate", [
    { x: -44, z: -34.6, rot: 0.4 },
    { x: -42.4, z: -34.2, rot: 1.1 },
    { x: -43.2, z: -34.4, rot: 0.2, y: 0.75 },
    { x: -70, z: -33.8, rot: 2.2 },
  ]);
  addInstanced(
    "chair",
    [-70, -64.5, -58].map((x) => ({ x, z: -33.4, rot: -0.4 + rnd() * 0.8 }))
  );
  addInstanced(
    "plant",
    [-36.5, -23.5, 116, 146, 176, 512, 556].map((x) => ({ x, z: -13.25, rot: rnd() * 6.28 }))
  );

  /* ---------- 围栏（空地上的广告位） ---------- */
  const fences: Spot[] = [];
  for (let x = 432; x <= 506; x += 3) fences.push({ x, z: -14.2, rot: 0 });
  addInstanced("fence", fences);
  col.addRange(430, 508, -14.4, -14, "fence");

  /* ---------- 交付区护栏 ---------- */
  const barriers: Spot[] = [];
  for (const x of [690, 700, 710]) barriers.push({ x, z: 33.5, rot: 0 });
  for (let i = 0; i < 4; i++) barriers.push({ x: 712 + i * 9, z: 33.5, rot: 0 });
  addInstanced("barrier", barriers);
  col.addRange(686, 760, 33.2, 33.9, "barrier");

  /* ---------- 盖着车衣的老车 ---------- */
  const covered = normalize(models.coveredCar, 1.55);
  group.add(instanceFromTemplate(covered, makeMatrices([{ x: -88, z: -20.5, rot: 0.1 }])));
  col.addBox(-88, -20.5, 1.2, 2.4, 0.1, "covered-car");

  /* ---------- 停放车辆（合并 + 实例化 + 实例染色） ---------- */
  const parked: Spot[] = [
    { x: -76, z: -16.6, rot: Math.PI / 2 },
    { x: -66, z: -16.6, rot: Math.PI / 2 },
    { x: -84, z: -16.6, rot: Math.PI / 2 },
    { x: 88, z: 7.2, rot: 0 },
    { x: 214, z: 7.2, rot: 0 },
    { x: 356, z: 7.2, rot: 0 },
    { x: 728, z: 30.5, rot: Math.PI / 2 },
    { x: 764, z: 30.5, rot: Math.PI / 2 },
  ];
  const parkedColors = [0x8c9298, 0x2e3b4a, 0xa8a096, 0x6d3f34, 0x39493f, 0x8e8e8a, 0x2a3338, 0x7d4a3a];
  const parkedTemplate = mergeByMaterial(Vehicle.makeParked(0xffffff, "SC 000").root);
  group.add(instanceFromTemplate(parkedTemplate, makeMatrices(parked), parkedColors));
  for (const p of parked) col.addBox(p.x, p.z, 1.05, 2.3, -p.rot, "parked-car");

  /* ---------- 停车挡块 ---------- */
  const stopMat = mats.plain(0xd6d0c2, 0.9);
  const stopGeo = new THREE.BoxGeometry(1.8, 0.12, 0.24);
  const stops = new THREE.InstancedMesh(stopGeo, stopMat, 20);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) {
    m.makeTranslation(-92 + i * 2.75, 0.06, -34.2);
    stops.setMatrixAt(i, m);
  }
  stops.castShadow = true;
  group.add(stops);

  /* ---------- 沙滩杂物 ---------- */
  const beach: Spot[] = [];
  for (let i = 0; i < 14; i++) {
    const x = -60 + rnd() * 700;
    if (x > 680 && x < 810) continue;
    const z = 16 + rnd() * 16;
    const y = -1.45 + ((z - 12.6) / 26.4) * 0.86;
    beach.push({ x, z, rot: rnd() * 6.28, scale: 0.8 + rnd() * 0.4, y });
  }
  addInstanced("crate", beach.filter((_, i) => i % 2 === 0));

  /* ---------- 入口指示牌 ---------- */
  const entryMat = new THREE.MeshStandardMaterial({
    map: entrySignTexture(),
    roughness: 0.6,
    emissive: 0xffffff,
    emissiveIntensity: 0.3,
  });
  entryMat.emissiveMap = entryMat.map;
  const entrySign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.5), entryMat);
  entrySign.position.set(680, 3.1, 11.6);
  entrySign.rotation.y = -Math.PI / 2;
  group.add(entrySign);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), mats.plain(0x7d8388, 0.6, 0.5));
  post.position.set(680, 1.6, 11.6);
  group.add(post);

  return group;
}

function entrySignTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 172;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1b2a2c";
  ctx.fillRect(0, 0, 512, 172);
  ctx.strokeStyle = "#ffcf7a";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 156);
  ctx.fillStyle = "#ffe9c8";
  ctx.textAlign = "center";
  ctx.font = "700 54px PingFang SC, Noto Sans SC, sans-serif";
  ctx.fillText("海边交付点 · 靠右驶入", 256, 78);
  ctx.font = "600 30px Arial, sans-serif";
  ctx.fillStyle = "#8fd9d0";
  ctx.fillText("DELIVERY PARKING", 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

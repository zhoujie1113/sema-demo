import * as THREE from "three";
import { Materials } from "./Materials";
import { CollisionWorld } from "../game/CollisionWorld";
import { L } from "./layout";
import { PartBuilder } from "./PartBuilder";
import { canvasTexture, mulberry32, signTexture } from "../util";

export interface TexBank {
  motelSign: THREE.Texture;
  posterSurf: THREE.Texture;
  posterDiner: THREE.Texture;
}

const BRAND_CN = "PingFang SC, Noto Sans SC, sans-serif";

function signMaterial(
  lines: { text: string; size: number; color: string; spacing?: number }[],
  opts: { w?: number; h?: number; bg?: string; glow?: string; border?: string },
  emissive = 0.9
) {
  const tex = signTexture(lines, opts);
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: emissive,
    roughness: 0.55,
    metalness: 0.05,
  });
}

/** 条纹遮阳棚贴图 */
function awningTexture(c1: string, c2: string) {
  return canvasTexture(256, 128, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fillRect((i * 256) / 8, 0, 256 / 8, 128);
    }
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * 256, Math.random() * 128, 2, 12);
  }, { aniso: 4 });
}

export function buildMotel(mats: Materials, col: CollisionWorld, tex: TexBank) {
  const b = new PartBuilder();
  const wall = mats.wall("blue_plaster_weathered", 92, 7, 0xffffff, 3);
  const wallSide = mats.wall("concrete_wall_005", 32, 7, 0xd9d2c6, 3);
  const frame = mats.plain(0x3a3f44, 0.6, 0.4);
  const doorMat = mats.plain(0x6b4433, 0.72);
  const railing = mats.plain(0x8e9499, 0.5, 0.55);
  const trim = mats.plain(0xe8e2d6, 0.8);
  const lampGlow = mats.glow(0xffc98a, 2.4);

  const front = L.motel.maxZ + 0.001; // -36

  /* -------- 主体两层 -------- */
  b.box(wall, 92, 6.9, 9.8, -66, 3.45, -40.9);
  // 屋顶女儿墙
  b.box(trim, 92.4, 0.45, 0.3, -66, 7.05, front);
  b.box(trim, 92.4, 0.45, 0.3, -66, 7.05, -45.6);
  b.box(trim, 0.3, 0.45, 9.8, -111.9, 7.05, -40.9);
  b.box(trim, 0.3, 0.45, 9.8, -20.1, 7.05, -40.9);

  // 二层走道 + 栏杆
  b.box(trim, 92, 0.22, 1.9, -66, 3.32, -34.05);
  for (let x = -111; x <= -21; x += 2.2) {
    b.box(railing, 0.06, 1.0, 0.06, x, 3.95, -34.85);
  }
  for (const y of [4.42, 4.05]) {
    b.box(railing, 92, 0.06, 0.07, -66, y, -34.85);
  }

  // 房间门 / 窗
  for (let x = -108; x <= -46; x += 4.6) {
    for (const y of [0, 3.45]) {
      b.box(doorMat, 0.95, 2.05, 0.1, x, y + 1.05, front + 0.02);
      b.box(trim, 1.1, 2.2, 0.06, x, y + 1.1, front - 0.01);
      b.box(mats.glass, 1.5, 1.0, 0.08, x + 2.0, y + 1.65, front + 0.02);
      b.box(frame, 1.66, 0.08, 0.12, x + 2.0, y + 2.18, front + 0.03);
      b.box(frame, 1.66, 0.08, 0.12, x + 2.0, y + 1.12, front + 0.03);
      // 门灯
      b.box(lampGlow, 0.16, 0.22, 0.12, x + 0.85, y + 2.35, front + 0.06);
    }
  }

  /* -------- 接待处 / 办公室 -------- */
  b.box(mats.wall("clay_plaster", 14, 5, 0xf2e3c9, 3), 12, 5.4, 2.4, -30, 2.7, -34.9);
  b.plane(mats.glassLit, 8.2, 2.4, -30, 1.75, -33.68, 0);
  b.box(frame, 8.6, 0.16, 0.2, -30, 3.02, -33.66);
  b.box(frame, 8.6, 0.16, 0.2, -30, 0.5, -33.66);
  for (let i = -2; i <= 2; i++) b.box(frame, 0.14, 2.6, 0.2, -30 + i * 2.05, 1.76, -33.66);
  b.box(mats.plain(0x1c2024, 0.8), 9.4, 0.28, 2.2, -30, 3.22, -33.3);
  // 门廊立柱
  for (const x of [-34.2, -25.8]) b.box(trim, 0.28, 3.2, 0.28, x, 1.6, -32.6);

  const officeSign = signMaterial(
    [
      { text: "接 待 处", size: 96, color: "#ffe6c2", spacing: 10 },
      { text: "OFFICE", size: 44, color: "#ffb877", spacing: 8 },
    ],
    { w: 512, h: 256, bg: "#1a1512", glow: "#ffb060" },
    0.85
  );
  b.plane(officeSign, 3.6, 1.8, -30, 3.95, -33.5);

  /* -------- 外挂楼梯 -------- */
  const stairX = -23.2;
  b.box(mats.plain(0x777d82, 0.8, 0.3), 2.1, 0.24, 4.4, stairX, 3.34, -32.2);
  for (let i = 0; i < 12; i++) {
    b.box(mats.plain(0x8a9096, 0.8, 0.3), 1.4, 0.18, 0.4, stairX, 0.16 + i * 0.28, -34.6 + i * 0.36);
  }
  b.box(railing, 0.06, 1.0, 0.06, stairX + 0.6, 4.2, -30.2);
  b.box(railing, 0.06, 1.0, 0.06, stairX + 0.6, 2.7, -32.2);
  b.box(railing, 0.06, 1.0, 0.06, stairX + 0.6, 1.2, -34.2);

  /* -------- 屋顶杂物 -------- */
  const rnd = mulberry32(12);
  for (let i = 0; i < 7; i++) {
    const x = -104 + i * 12 + rnd() * 4;
    b.box(mats.plain(0xb9b3a6, 0.85), 1.4, 0.8, 1.2, x, 7.5, -43 + rnd() * 2);
  }
  b.cyl(mats.plain(0xd8d2c4, 0.8), 1.1, 1.1, 2.2, -78, 8.2, -42, 0, 0, 12);
  b.box(mats.wall("corrugated_iron_02", 4, 3, 0xffffff, 2), 4, 2.6, 3, -52, 8.2, -42);

  /* -------- 西侧副楼 -------- */
  b.box(wallSide, 11.6, 6.9, 32, -106, 3.45, -30);
  b.box(trim, 11.9, 0.45, 32.3, -106, 7.05, -30);
  for (let z = -40; z <= -20; z += 4.6) {
    b.box(mats.glass, 0.08, 1.0, 1.5, -100.15, 1.65, z);
    b.box(mats.glass, 0.08, 1.0, 1.5, -100.15, 5.05, z);
  }

  /* -------- 车棚 / 冰柜 / 自动售货机 -------- */
  b.box(mats.plain(0xd8d2c4, 0.9), 7.4, 0.16, 4.2, -84, 3.0, -31.5);
  for (const x of [-87.3, -80.7]) {
    b.box(mats.plain(0x8c9196, 0.7), 0.16, 3.0, 0.16, x, 1.5, -29.6);
    b.box(mats.plain(0x8c9196, 0.7), 0.16, 3.0, 0.16, x, 1.5, -33.4);
  }
  // 自动售货机
  b.box(mats.plain(0x2c4a52, 0.6, 0.4), 1.1, 1.9, 0.85, -35.5, 0.95, -34.2);
  b.plane(mats.glow(0x9fe8ff, 1.5), 0.9, 1.1, -35.5, 1.25, -33.76, 0);
  // 制冰机
  b.box(mats.plain(0xe4e0d6, 0.7), 1.3, 1.4, 0.9, -38.2, 0.7, -34.3);
  b.plane(mats.glow(0xffe2a8, 0.9), 0.6, 0.9, -38.2, 0.85, -33.84, 0);

  /* -------- 招牌（生成图 + 手绘文字） -------- */
  const signBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 6.2),
    new THREE.MeshStandardMaterial({
      map: tex.motelSign,
      emissive: 0xffffff,
      emissiveMap: tex.motelSign,
      emissiveIntensity: 0.85,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
  );
  signBoard.position.set(-20.6, 6.6, -14.6);
  signBoard.rotation.y = -Math.PI / 2 - 0.22;
  signBoard.castShadow = true;

  const signText = new THREE.Mesh(
    new THREE.PlaneGeometry(3.9, 1.15),
    signMaterial(
      [
        { text: "落 日 旅 馆", size: 120, color: "#ffe3ba", spacing: 14 },
        { text: "SUNSET MOTEL", size: 46, color: "#ff9a55", spacing: 6 },
      ],
      { w: 512, h: 190, bg: "rgba(12,12,14,0.82)", glow: "#ff8b4a" },
      1.1
    )
  );
  (signText.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  signText.position.set(-20.6, 7.4, -14.55);
  signText.rotation.y = -Math.PI / 2 - 0.22;

  const signTextBack = signText.clone();
  signTextBack.position.set(-20.6, 7.4, -14.65);
  signTextBack.rotation.y = Math.PI - Math.PI / 2 - 0.22;

  const signPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 3.6, 10),
    mats.plain(0x5f656a, 0.6, 0.6)
  );
  signPole.position.set(-20.6, 1.8, -15.1);
  signPole.castShadow = true;

  const group = new THREE.Group();
  group.name = "motel";
  group.add(b.build("motel-parts"), signBoard, signText, signTextBack, signPole);

  // 招牌底部灯
  const signLight = new THREE.PointLight(0xff9a55, 30, 22, 2);
  signLight.position.set(-20.6, 5.4, -13.2);
  group.add(signLight);

  col.addRange(L.motel.minX, L.motel.maxX, L.motel.minZ, L.motel.maxZ, "motel");
  col.addRange(L.motelWing.minX, L.motelWing.maxX, L.motelWing.minZ, L.motelWing.maxZ, "motel-wing");
  col.addBox(-20.6, -15.1, 0.3, 0.3, 0, "sign-pole");
  col.addRange(-34, -25.8, -35.4, -32.4, "office");

  return group;
}

/* ==================================================================== */
/*                          沿街店铺 / 建筑                              */
/* ==================================================================== */

interface ShopSpec {
  x: number;
  w: number;
  floors: number;
  floorH?: number;
  depth?: number;
  folder: string;
  color: number;
  sign: string;
  signSub?: string;
  signColor?: string;
  glow?: string;
  awning?: [string, string];
  poster?: "surf" | "diner";
  neon?: boolean;
}

const SHOPS: ShopSpec[] = [
  { x: 24, w: 30, floors: 2, folder: "blue_plaster_weathered", color: 0xb8ccc6, sign: "落日冲浪", signSub: "SUNSET SURF", signColor: "#ffe6c2", glow: "#4de0c4", awning: ["#1e6f74", "#e8e2d6"], poster: "surf" },
  { x: 60, w: 26, floors: 1, folder: "clay_plaster", color: 0xf0e0c6, sign: "自助洗衣", signSub: "LAUNDRY 24H", awning: ["#c85a3c", "#f2ead8"], glow: "#ffb060" },
  { x: 92, w: 20, floors: 1, folder: "concrete_wall_005", color: 0xdad4c8, sign: "杂货铺", signSub: "MINI MART", neon: false },
  { x: 130, w: 44, floors: 1, floorH: 5.6, folder: "concrete_wall_005", color: 0xded7c9, sign: "24H 便利店", signSub: "BEACH STORE", signColor: "#fff3da", glow: "#8fe3ff", awning: ["#1a6b7a", "#dfe9e6"], poster: "diner" },
  { x: 180, w: 28, floors: 2, folder: "clay_plaster", color: 0xf2d8b4, sign: "海岸餐厅", signSub: "COAST DINER", glow: "#ff7a3c", neon: true, awning: ["#b8342a", "#f0e6d2"] },
  { x: 222, w: 22, floors: 2, folder: "blue_plaster_weathered", color: 0xc9bfc6, sign: "海风酒吧", signSub: "SEA BREEZE", glow: "#ff4f9a", neon: true },
  { x: 268, w: 32, floors: 3, folder: "concrete_wall_005", color: 0xd2cabc, sign: "海滩公寓", signSub: "APARTMENTS" },
  { x: 316, w: 24, floors: 1, folder: "corrugated_iron_02", color: 0xb9c4c6, sign: "冲浪板租赁", signSub: "SURF RENTAL", awning: ["#0f5d63", "#e7e0ce"] },
  { x: 358, w: 26, floors: 1, folder: "clay_plaster", color: 0xf7e7cd, sign: "椰子冰淇淋", signSub: "ICE CREAM", glow: "#ffd166", neon: true },
  { x: 410, w: 34, floors: 2, folder: "blue_plaster_weathered", color: 0xe0e6dd, sign: "海滨旅馆", signSub: "BEACH INN", glow: "#ffb060" },
  { x: 520, w: 26, floors: 1, folder: "concrete_wall_005", color: 0xd8d0c2, sign: "海鲜市场", signSub: "FISH MARKET", awning: ["#2a6b5a", "#efe7d5"] },
  { x: 560, w: 28, floors: 1, folder: "clay_plaster", color: 0xeadcc4, sign: "海滩商店", signSub: "BEACH SHOP" },
  { x: 616, w: 34, floors: 2, folder: "corrugated_iron_02", color: 0xbcc6c8, sign: "渔船仓库", signSub: "HARBOR DEPOT" },
  { x: 668, w: 28, floors: 1, folder: "concrete_wall_005", color: 0xe2dbcd, sign: "停车服务处", signSub: "PARKING OFFICE" },
];

export function buildShops(mats: Materials, col: CollisionWorld, tex: TexBank) {
  const group = new THREE.Group();
  group.name = "shops";
  const frontZ = -14;
  const rnd = mulberry32(5);

  for (const s of SHOPS) {
    const floorH = s.floorH ?? 3.6;
    const h = s.floors * floorH + 0.9;
    const depth = s.depth ?? 17;
    const cz = frontZ - depth / 2;
    const b = new PartBuilder();
    const wall = mats.wall(s.folder, s.w, h, s.color, 3);
    const trim = mats.plain(0xdcd5c7, 0.85);
    const frame = mats.plain(0x30353a, 0.6, 0.4);

    b.box(wall, s.w, h, depth, s.x, h / 2, cz);
    // 屋顶压顶
    b.box(trim, s.w + 0.5, 0.5, depth + 0.5, s.x, h + 0.12, cz);
    b.box(trim, s.w + 0.2, 0.3, 0.3, s.x, h - 0.15, frontZ + 0.02);

    // 底层橱窗
    const glassW = s.w - 5;
    b.box(mats.plain(0x241f1a, 0.8), glassW + 0.6, 3.0, 0.3, s.x, 1.6, frontZ + 0.05);
    b.plane(mats.glassLit, glassW, 2.2, s.x, 1.75, frontZ + 0.22);
    b.box(frame, glassW + 0.9, 0.18, 0.24, s.x, 0.6, frontZ + 0.24);
    b.box(frame, glassW + 0.9, 0.2, 0.24, s.x, 2.95, frontZ + 0.24);
    for (let i = -2; i <= 2; i++) {
      b.box(frame, 0.14, 2.4, 0.24, s.x + i * (glassW / 4.6), 1.78, frontZ + 0.24);
    }
    // 门
    b.box(frame, 1.0, 2.2, 0.2, s.x + glassW / 2 - 1.2, 1.2, frontZ + 0.3);

    // 招牌底板 + 文字
    const signY = 3.95;
    b.box(mats.plain(0x1d2023, 0.9), s.w * 0.86, 1.15, 0.35, s.x, signY, frontZ + 0.12);
    const signMat = signMaterial(
      [
        { text: s.sign, size: 104, color: s.signColor ?? "#ffe9c8", spacing: 8 },
        ...(s.signSub
          ? [{ text: s.signSub, size: 40, color: s.glow ?? "#ffb060", spacing: 5 }]
          : []),
      ],
      { w: 512, h: 200, bg: "#14171a", glow: s.glow ?? "#ff9a55", border: "rgba(255,255,255,0.08)" },
      s.neon ? 1.35 : 0.8
    );
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.84, 1.05), signMat);
    signMesh.position.set(s.x, signY, frontZ + 0.31);

    // 遮阳棚
    if (s.awning) {
      const aw = new THREE.Mesh(
        new THREE.BoxGeometry(s.w * 0.8, 0.1, 2.0),
        new THREE.MeshStandardMaterial({ map: awningTexture(s.awning[0], s.awning[1]), roughness: 0.85 })
      );
      aw.position.set(s.x, 3.18, frontZ + 1.05);
      aw.rotation.x = -0.22;
      aw.castShadow = true;
      group.add(aw);
      const valance = new THREE.Mesh(
        new THREE.BoxGeometry(s.w * 0.8, 0.28, 0.06),
        new THREE.MeshStandardMaterial({ map: awningTexture(s.awning[0], s.awning[1]), roughness: 0.85 })
      );
      valance.position.set(s.x, 2.92, frontZ + 2.02);
      group.add(valance);
    }

    // 上层窗户
    for (let f = 1; f < s.floors; f++) {
      const y = f * floorH + 1.7;
      const n = Math.max(2, Math.floor(s.w / 4.2));
      for (let i = 0; i < n; i++) {
        const x = s.x - s.w / 2 + 2.6 + (i * (s.w - 5.2)) / Math.max(1, n - 1);
        b.box(mats.glass, 1.5, 1.35, 0.1, x, y, frontZ + 0.04);
        b.box(frame, 1.72, 0.1, 0.18, x, y + 0.72, frontZ + 0.08);
        b.box(frame, 1.72, 0.1, 0.18, x, y - 0.72, frontZ + 0.08);
        b.box(frame, 0.1, 1.5, 0.18, x - 0.79, y, frontZ + 0.08);
        b.box(frame, 0.1, 1.5, 0.18, x + 0.79, y, frontZ + 0.08);
      }
      // 阳台（部分楼层）
      if (f === 1 && s.floors >= 2) {
        b.box(trim, s.w * 0.7, 0.16, 1.3, s.x, floorH + 0.5, frontZ + 0.65);
        b.box(frame, s.w * 0.7, 0.06, 0.06, s.x, floorH + 1.4, frontZ + 1.28);
        for (let i = 0; i < 8; i++) {
          b.box(frame, 0.05, 0.85, 0.05, s.x - s.w * 0.33 + (i * s.w * 0.66) / 7, floorH + 0.95, frontZ + 1.28);
        }
      }
    }

    // 屋顶设备：空调外机 + 排气管
    for (let i = 0; i < Math.max(1, Math.round(s.w / 12)); i++) {
      b.box(mats.plain(0xb9b2a4, 0.8), 1.1, 0.85, 0.9, s.x - s.w / 3 + i * 3.4, h + 0.55, cz - rnd() * 4);
    }
    b.cyl(mats.plain(0x8d9298, 0.6, 0.4), 0.1, 0.1, 2.4, s.x + s.w / 2 - 1.5, h + 1.2, cz - 2, 0, 0, 6);
    // 落水管
    b.cyl(mats.plain(0x8d9298, 0.6, 0.3), 0.08, 0.08, h, s.x + s.w / 2 - 0.3, h / 2, frontZ - 0.15, 0, 0, 6);

    group.add(b.build("shop-" + s.x));

    // 海报
    if (s.poster) {
      const posterTex = s.poster === "surf" ? tex.posterSurf : tex.posterDiner;
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 3.0),
        new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.7 })
      );
      poster.position.set(s.x - s.w * 0.3, 2.2, frontZ + 0.26);
      group.add(poster);
    }

    group.add(signMesh);
    col.addRange(s.x - s.w / 2, s.x + s.w / 2, cz - depth / 2, frontZ, "shop");

    // 面向停车场的侧墙：贴一张冲浪店海报，避免大块空墙
    if (s.poster === "surf") {
      const mural = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 7.2),
        new THREE.MeshStandardMaterial({ map: tex.posterSurf, roughness: 0.75 })
      );
      mural.position.set(s.x - s.w / 2 - 0.03, 3.7, cz);
      mural.rotation.y = -Math.PI / 2;
      group.add(mural);
    }
  }

  return group;
}

/* ==================================================================== */
/*                              广告牌                                  */
/* ==================================================================== */

export function buildBillboard(
  x: number,
  z: number,
  w: number,
  h: number,
  texture: THREE.Texture,
  rotY = Math.PI,
  mats: Materials
) {
  const g = new THREE.Group();
  const steel = mats.plain(0x4a5055, 0.55, 0.6);
  for (const dx of [-w / 3, w / 3]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 8.4, 10), steel);
    pole.position.set(x + dx, 4.2, z);
    pole.castShadow = true;
    g.add(pole);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.24), steel);
  frame.position.set(x, 9.2, z);
  frame.rotation.y = rotY;
  frame.castShadow = true;
  g.add(frame);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.16 })
  );
  face.position.set(x, 9.2, z);
  face.rotation.y = rotY;
  g.add(face);

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.8, 0.7),
    signMaterial(
      [{ text: "落日海岸 · 海滩商店", size: 78, color: "#fff0d8", spacing: 6 }],
      { w: 512, h: 96, bg: "rgba(10,10,12,0.88)" },
      0.7
    )
  );
  sign.position.set(x, 9.2 + h / 2 + 0.5, z + (rotY === Math.PI ? -0.02 : 0.02));
  sign.rotation.y = rotY;
  g.add(sign);

  // 顶部射灯
  for (const dx of [-w / 3, w / 3]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), steel);
    arm.position.set(x + dx, 9.2 + h / 2 + 0.9, z + 1.0);
    arm.rotation.x = 1.1;
    g.add(arm);
  }
  return g;
}

/* ==================================================================== */
/*                          远景 / 背景建筑                              */
/* ==================================================================== */

export function buildBackdrop(mats: Materials) {
  const b = new PartBuilder();
  const rnd = mulberry32(31);
  const mat = mats.plain(0x6d6b6b, 0.95);
  const mat2 = mats.plain(0x7b7a78, 0.95);
  for (let i = 0; i < 26; i++) {
    const x = -120 + i * 38 + rnd() * 12;
    const h = 8 + rnd() * 16;
    const w = 16 + rnd() * 22;
    b.box(i % 2 ? mat : mat2, w, h, 14, x, h / 2, -62 - rnd() * 20);
  }
  const g = new THREE.Group();
  g.name = "backdrop";
  g.add(b.build("backdrop-boxes"));
  return g;
}

import * as THREE from "three";
import { Materials } from "./Materials";
import { CollisionWorld } from "../game/CollisionWorld";
import { L } from "./layout";
import { boxGeo, markings, merge, planeGeo } from "./Geo";
import { canvasTexture } from "../util";

const ROAD_LEN = L.road.maxX - L.road.minX;
const ROAD_CX = (L.road.minX + L.road.maxX) / 2;

export function buildStreet(mats: Materials, col: CollisionWorld): THREE.Group {
  const g = new THREE.Group();
  g.name = "street";

  /* ---------------- 路面 ---------------- */
  const road = new THREE.Mesh(planeGeo(ROAD_LEN, 18, ROAD_CX, 0, 0), mats.road);
  road.receiveShadow = true;
  g.add(road);

  const lotW = L.lot.maxX - L.lot.minX;
  const lotD = L.lot.maxZ - L.lot.minZ;
  const lot = new THREE.Mesh(
    planeGeo(lotW, lotD, (L.lot.minX + L.lot.maxX) / 2, (L.lot.minZ + L.lot.maxZ) / 2, 0.004),
    mats.lot
  );
  lot.receiveShadow = true;
  g.add(lot);

  const drive = new THREE.Mesh(planeGeo(16, 24, -16, -1.2, 0.006), mats.lot);
  drive.receiveShadow = true;
  g.add(drive);

  const deck = new THREE.Mesh(planeGeo(120, 29, 746, 23.5, 0.004), mats.lot);
  deck.receiveShadow = true;
  g.add(deck);

  /* ---------------- 人行道 ---------------- */
  const sidewalk = (x0: number, x1: number, z0: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const body = new THREE.Mesh(boxGeo(w, 0.17, d, cx, 0.085, cz), mats.concrete);
    body.receiveShadow = true;
    body.castShadow = true;
    g.add(body);
    const top = new THREE.Mesh(
      planeGeo(w, d, cx, cz, 0.172),
      mats.surface("concrete_pavers_02", [Math.max(2, Math.round(w / 3)), Math.max(1, Math.round(d / 3))], {
        roughness: 0.88,
      })
    );
    top.receiveShadow = true;
    g.add(top);
  };

  // 内陆一侧（停车场出入口留缺口）
  sidewalk(L.road.minX, -24, -L.walkEdge, -9);
  sidewalk(-8, L.road.maxX, -L.walkEdge, -9);
  // 海边一侧（交付区留出坡道）
  sidewalk(L.road.minX, 686, 9, L.walkEdge);
  sidewalk(806, L.road.maxX, 9, L.walkEdge);

  /* ---------------- 标线 ---------------- */
  const yellow: [number, number, number, number][] = [
    [ROAD_CX, -0.16, ROAD_LEN, 0.12],
    [ROAD_CX, 0.16, ROAD_LEN, 0.12],
  ];
  const white: [number, number, number, number][] = [
    [ROAD_CX, -7.5, ROAD_LEN, 0.1],
    [ROAD_CX, 7.5, ROAD_LEN, 0.1],
  ];
  // 斑马线
  for (let i = 0; i < 10; i++) {
    white.push([200, -8.1 + i * 1.8, 3.2, 0.62]);
  }
  // 停止线
  white.push([196.4, 4.55, 0.5, 8.4]);
  // 停车场车位线
  for (let i = 0; i < 22; i++) {
    white.push([-92 + i * 2.75, -31.6, 0.12, 4.9]);
  }
  // 交付区车位线
  for (let i = 0; i < 5; i++) {
    white.push([730 + i * 7.4, 25, 0.14, 8.6]);
  }
  // 交付区入口导向
  for (let i = 0; i < 4; i++) {
    white.push([700 + i * 4, 14, 1.2, 0.3]);
  }

  const yellowMesh = new THREE.Mesh(markings(yellow), mats.yellowLine);
  yellowMesh.receiveShadow = true;
  g.add(yellowMesh);
  const whiteMesh = new THREE.Mesh(markings(white), mats.whiteLine);
  whiteMesh.receiveShadow = true;
  g.add(whiteMesh);

  /* ---------------- 交付车位地贴 ---------------- */
  const decalTex = canvasTexture(512, 680, (ctx) => {
    ctx.clearRect(0, 0, 512, 680);
    ctx.strokeStyle = "rgba(255,190,70,0.95)";
    ctx.lineWidth = 14;
    ctx.strokeRect(18, 18, 476, 644);
    ctx.fillStyle = "rgba(255,190,70,0.95)";
    ctx.textAlign = "center";
    ctx.font = "700 92px PingFang SC, Noto Sans SC, sans-serif";
    ctx.fillText("海边交付", 256, 300);
    ctx.font = "700 58px Arial, sans-serif";
    ctx.fillText("DELIVERY", 256, 390);
    ctx.font = "600 40px Arial, sans-serif";
    ctx.fillText("▼", 256, 500);
  });
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 9.6),
    new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false, opacity: 0.92 })
  );
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.PI;
  decal.position.set(L.bay.x, 0.016, L.bay.z);
  decal.renderOrder = 2;
  g.add(decal);

  /* ---------------- 海堤 / 护栏 / 海滩 ---------------- */
  // 海堤挡墙
  const wallGeo = merge([
    boxGeo(790, 1.9, 0.7, 291, -0.75, 12.95),
    boxGeo(18, 1.9, 0.7, 815, -0.75, 12.95),
  ]);
  const wall = new THREE.Mesh(wallGeo, mats.concrete);
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  // 护栏：立柱 + 双横杆
  const postGeo = new THREE.BoxGeometry(0.1, 1.05, 0.1);
  const railGeo = new THREE.BoxGeometry(1, 0.07, 0.07);
  const postMat = mats.plain(0x8d949b, 0.55, 0.6);
  const railMat = mats.plain(0xa8afb6, 0.45, 0.7);
  const addRailRun = (x0: number, x1: number, z: number) => {
    const n = Math.max(1, Math.floor((x1 - x0) / 2.6));
    const posts = new THREE.InstancedMesh(postGeo, postMat, n + 1);
    const m = new THREE.Matrix4();
    for (let i = 0; i <= n; i++) {
      m.makeTranslation(x0 + (i * (x1 - x0)) / n, 0.62, z);
      posts.setMatrixAt(i, m);
    }
    posts.castShadow = true;
    posts.instanceMatrix.needsUpdate = true;
    g.add(posts);
    for (const y of [1.1, 0.72]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.scale.x = x1 - x0;
      rail.position.set((x0 + x1) / 2, y, z);
      rail.castShadow = true;
      g.add(rail);
    }
    col.addRange(x0, x1, z - 0.25, z + 0.25, "railing");
  };
  addRailRun(-104, 686, 12.2);
  addRailRun(806, 824, 12.2);

  // 海滩沙地（向海略降）
  const sandGeo = new THREE.PlaneGeometry(1100, 34, 1, 12);
  sandGeo.rotateX(-Math.PI / 2);
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) + 29.5;
    const t = (z - 12.6) / 26.4;
    pos.setY(i, -1.45 + Math.max(0, t) * 0.86);
    pos.setZ(i, z);
  }
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, mats.sand);
  sand.position.x = 400;
  sand.receiveShadow = true;
  g.add(sand);

  // 岸线泡沫
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 3.2),
    new THREE.MeshBasicMaterial({
      color: 0xf4e3cf,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(400, L.oceanY + 0.02, 38.6);
  g.add(foam);

  /* ---------------- 交付区平台边缘 ---------------- */
  const deckWallGeo = merge([
    boxGeo(120, 1.6, 0.6, 746, -0.8, 38.2),
    boxGeo(0.6, 1.6, 29, 686.3, -0.8, 23.5),
    boxGeo(0.6, 1.6, 29, 805.7, -0.8, 23.5),
  ]);
  const deckWall = new THREE.Mesh(deckWallGeo, mats.concrete);
  deckWall.receiveShadow = true;
  deckWall.castShadow = true;
  g.add(deckWall);

  // 平台靠海侧的矮墙
  const parapet = new THREE.Mesh(boxGeo(120, 0.95, 0.45, 746, 0.47, 37.4), mats.concrete);
  parapet.castShadow = true;
  parapet.receiveShadow = true;
  g.add(parapet);
  col.addRange(686, 806, 37.1, 37.7, "parapet");

  /* ---------------- 路障 / 边界 ---------------- */
  const barrierMat = mats.plain(0xd8d4c8, 0.8);
  const stripeMat = mats.plain(0xd6482f, 0.7);
  for (const bx of [L.road.minX + 2, L.road.maxX - 2]) {
    for (let i = -1; i <= 1; i++) {
      const b = new THREE.Mesh(boxGeo(1.6, 0.85, 1.4, bx, 0.43, i * 6.1), barrierMat);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
      const s = new THREE.Mesh(boxGeo(1.62, 0.18, 1.42, bx, 0.62, i * 6.1), stripeMat);
      g.add(s);
    }
    col.addRange(bx - 1, bx + 1, -9, 9, "barrier");
  }

  /* ---------------- 电线杆与电缆 ---------------- */
  const poleMat2 = mats.plain(0x5b4a3c, 0.95);
  const armMat = mats.plain(0x6b5747, 0.9);
  const poleGeo = new THREE.CylinderGeometry(0.13, 0.17, 8.6, 8);
  const armGeo = new THREE.BoxGeometry(2.4, 0.1, 0.12);
  const poleXs: number[] = [];
  for (let x = -70; x <= 800; x += 46) poleXs.push(x);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat2, poleXs.length);
  const arms = new THREE.InstancedMesh(armGeo, armMat, poleXs.length);
  const pm = new THREE.Matrix4();
  poleXs.forEach((x, i) => {
    pm.makeTranslation(x, 4.3, -11.9);
    poles.setMatrixAt(i, pm);
    pm.makeTranslation(x, 7.9, -11.9);
    arms.setMatrixAt(i, pm);
    col.addBox(x, -11.9, 0.2, 0.2, 0, "pole");
  });
  poles.castShadow = true;
  arms.castShadow = true;
  g.add(poles, arms);

  const wirePts: THREE.Vector3[] = [];
  for (let i = 0; i < poleXs.length - 1; i++) {
    for (const dz of [-0.95, 0, 0.95]) {
      const x0 = poleXs[i];
      const x1 = poleXs[i + 1];
      const steps = 8;
      for (let sIdx = 0; sIdx < steps; sIdx++) {
        const t0 = sIdx / steps;
        const t1 = (sIdx + 1) / steps;
        for (const t of [t0, t1]) {
          const sag = Math.sin(t * Math.PI) * 0.55;
          wirePts.push(new THREE.Vector3(x0 + (x1 - x0) * t, 7.85 - sag, -11.9 + dz));
        }
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
  g.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1c, transparent: true, opacity: 0.75 })));

  // 停车场围栏（西侧 + 北侧缺口）
  const fenceMat = mats.plain(0x6f7377, 0.7, 0.4);
  const fenceGeo = merge([
    boxGeo(0.12, 1.5, 22.8, L.lot.minX + 0.2, 0.75, -24.6),
    boxGeo(12, 1.5, 0.12, -14, 0.75, L.lot.minZ + 0.2),
  ]);
  const fence = new THREE.Mesh(fenceGeo, fenceMat);
  fence.castShadow = true;
  g.add(fence);
  col.addRange(L.lot.minX, L.lot.minX + 0.4, -36, -13.2, "fence");

  return g;
}

import * as THREE from "three";
import { canvasTexture, signTexture } from "../util";

export interface CarParts {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  brakeLights: THREE.MeshStandardMaterial[];
  headlights: THREE.SpotLight[];
}

interface Station {
  x: number;
  yb: number;
  yt: number;
  hwb: number;
  hwt: number;
  round?: number;
}

/**
 * 沿车长方向放样生成车身曲面。
 * classify 可按面法线把面分到不同材质组（用于座舱玻璃）。
 */
function loft(
  stations: Station[],
  rings = 26,
  classify?: (nx: number, ny: number, nz: number) => number,
  defaultRound = 3.0
): THREE.BufferGeometry {
  const pos: number[] = [];
  const ringsIdx: number[][] = [];
  for (const st of stations) {
    const cy = (st.yb + st.yt) / 2;
    const hh = (st.yt - st.yb) / 2;
    const round = st.round ?? defaultRound;
    const row: number[] = [];
    for (let i = 0; i < rings; i++) {
      const t = (i / rings) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const sc = Math.sign(c) * Math.pow(Math.abs(c), 2 / round);
      const ss = Math.sign(s) * Math.pow(Math.abs(s), 2 / round);
      const k = (ss + 1) / 2;
      const hw = st.hwb + (st.hwt - st.hwb) * k;
      row.push(pos.length / 3);
      pos.push(st.x, cy + hh * ss, hw * sc);
    }
    ringsIdx.push(row);
  }

  const faceIndex: number[][] = [[], []];
  const norm = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();

  const pushFace = (i0: number, i1: number, i2: number) => {
    if (!classify) {
      faceIndex[0].push(i0, i1, i2);
      return;
    }
    va.fromArray(pos, i0 * 3);
    vb.fromArray(pos, i1 * 3);
    vc.fromArray(pos, i2 * 3);
    norm.subVectors(vc, vb).cross(va.clone().sub(vb)).normalize();
    faceIndex[classify(norm.x, norm.y, norm.z)].push(i0, i1, i2);
  };

  for (let s = 0; s < stations.length - 1; s++) {
    for (let i = 0; i < rings; i++) {
      const i0 = ringsIdx[s][i];
      const i1 = ringsIdx[s][(i + 1) % rings];
      const i2 = ringsIdx[s + 1][i];
      const i3 = ringsIdx[s + 1][(i + 1) % rings];
      pushFace(i0, i2, i1);
      pushFace(i1, i2, i3);
    }
  }

  // 前后封口
  for (const end of [0, stations.length - 1]) {
    const st = stations[end];
    const center = pos.length / 3;
    pos.push(st.x, (st.yb + st.yt) / 2, 0);
    const row = ringsIdx[end];
    for (let i = 0; i < rings; i++) {
      const i0 = row[i];
      const i1 = row[(i + 1) % rings];
      if (end === 0) pushFace(center, i0, i1);
      else pushFace(center, i1, i0);
    }
  }

  const index: number[] = [];
  const g = new THREE.BufferGeometry();
  if (classify) {
    let offset = 0;
    faceIndex.forEach((arr, mi) => {
      index.push(...arr);
      if (arr.length) g.addGroup(offset, arr.length, mi);
      offset += arr.length;
    });
  } else {
    index.push(...faceIndex[0]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const PAINT = 0x11665d;
const PAINT_DARK = 0x0a3d36;

export function createCar(paintColor = PAINT, plate = "SC 721"): CarParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: 0.68,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.5,
  });
  paint.userData.paint = true;
  const paintDark = new THREE.MeshPhysicalMaterial({
    color: PAINT_DARK,
    metalness: 0.6,
    roughness: 0.3,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.3,
  });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x121416, roughness: 0.6, metalness: 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcbd0d6, roughness: 0.16, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x081014,
    metalness: 0.82,
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.6,
    side: THREE.DoubleSide,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.3, metalness: 0.95 });
  const rimLip = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.2, metalness: 1 });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x0d1216,
    emissive: 0xdff2ff,
    emissiveIntensity: 3.2,
    roughness: 0.18,
    metalness: 0.5,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x2a0708,
    emissive: 0xff2a1a,
    emissiveIntensity: 1.6,
    roughness: 0.28,
    metalness: 0.2,
  });

  /* ---------------- 车身 ---------------- */
  const bodyGeo = loft([
    { x: -2.23, yb: 0.42, yt: 0.84, hwb: 0.66, hwt: 0.88 },
    { x: -2.17, yb: 0.33, yt: 0.9, hwb: 0.74, hwt: 0.945 },
    { x: -1.95, yb: 0.27, yt: 0.935, hwb: 0.775, hwt: 0.98 },
    { x: -1.55, yb: 0.24, yt: 0.95, hwb: 0.78, hwt: 0.995 },
    { x: -1.05, yb: 0.23, yt: 0.94, hwb: 0.775, hwt: 0.99 },
    { x: -0.45, yb: 0.22, yt: 0.925, hwb: 0.77, hwt: 0.975 },
    { x: 0.15, yb: 0.22, yt: 0.915, hwb: 0.77, hwt: 0.965 },
    { x: 0.85, yb: 0.22, yt: 0.925, hwb: 0.78, hwt: 0.975 },
    { x: 1.35, yb: 0.24, yt: 0.93, hwb: 0.79, hwt: 0.985 },
    { x: 1.75, yb: 0.27, yt: 0.885, hwb: 0.775, hwt: 0.945 },
    { x: 2.0, yb: 0.3, yt: 0.815, hwb: 0.71, hwt: 0.875 },
    { x: 2.15, yb: 0.35, yt: 0.71, hwb: 0.59, hwt: 0.72 },
    { x: 2.21, yb: 0.41, yt: 0.63, hwb: 0.41, hwt: 0.5 },
  ], 30, undefined, 4.6);
  body.add(new THREE.Mesh(bodyGeo, paint));

  /* ---------------- 座舱：车顶喷漆 + 侧窗/前后挡玻璃 ---------------- */
  const cabinGeo = loft([
    { x: -1.42, yb: 0.9, yt: 0.98, hwb: 0.8, hwt: 0.5, round: 4.2 },
    { x: -1.1, yb: 0.9, yt: 1.08, hwb: 0.81, hwt: 0.56, round: 4.2 },
    { x: -0.6, yb: 0.9, yt: 1.21, hwb: 0.81, hwt: 0.58, round: 4.2 },
    { x: 0.0, yb: 0.9, yt: 1.235, hwb: 0.8, hwt: 0.58, round: 4.2 },
    { x: 0.5, yb: 0.9, yt: 1.19, hwb: 0.8, hwt: 0.55, round: 4.2 },
    { x: 0.98, yb: 0.9, yt: 1.02, hwb: 0.79, hwt: 0.45, round: 4.2 },
    { x: 1.2, yb: 0.9, yt: 0.93, hwb: 0.74, hwt: 0.36, round: 4.2 },
  ], 24, (_nx, ny) => (ny > 0.68 || ny < -0.8 ? 0 : 1));
  const cabin = new THREE.Mesh(cabinGeo, [paintDark, glass]);
  body.add(cabin);

  /* ---------------- 轮拱 / 侧裙 / 前铲 ---------------- */
  for (const wx of [1.36, -1.38]) {
    for (const side of [-1, 1]) {
      const flare = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.032, 6, 20, Math.PI * 0.92), paint);
      flare.position.set(wx, 0.36, side * 0.915);
      flare.rotation.z = 0.08;
      body.add(flare);
    }
  }
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.1, 0.09), carbon);
    skirt.position.set(-0.02, 0.16, side * 0.79);
    body.add(skirt);
  }
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 1.66), carbon);
  splitter.position.set(2.08, 0.155, 0);
  body.add(splitter);

  /* ---------------- 前脸 ---------------- */
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 1.06), carbon);
  grille.position.set(2.13, 0.45, 0);
  body.add(grille);
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.36), carbon);
    intake.position.set(2.08, 0.31, side * 0.62);
    body.add(intake);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.38), headMat);
    head.position.set(2.04, 0.67, side * 0.55);
    head.rotation.z = -0.12;
    body.add(head);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.026, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x0a0f12, emissive: 0xcdeeff, emissiveIntensity: 4 })
    );
    strip.position.set(2.11, 0.61, side * 0.56);
    body.add(strip);
  }

  /* ---------------- 尾部 ---------------- */
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 1.3), tailMat);
  tailBar.position.set(-2.19, 0.79, 0);
  body.add(tailBar);
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.24), tailMat);
    tail.position.set(-2.17, 0.7, side * 0.6);
    body.add(tail);
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 1.48), carbon);
  diffuser.position.set(-2.12, 0.19, 0);
  body.add(diffuser);
  for (let i = -2; i <= 2; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.03), carbon);
    fin.position.set(-2.15, 0.13, i * 0.3);
    body.add(fin);
  }
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.13, 12), chrome);
    pipe.position.set(-2.21, 0.26, side * 0.44);
    pipe.rotation.z = Math.PI / 2;
    body.add(pipe);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.36), carbon);
  wing.position.set(-2.03, 1.04, 0);
  wing.rotation.z = 0.1;
  body.add(wing);
  for (const side of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.035), carbon);
    stay.position.set(-2.03, 0.95, side * 0.5);
    body.add(stay);
  }

  /* ---------------- 后视镜 / 门缝 / 车牌 ---------------- */
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.14), carbon);
    stalk.position.set(0.9, 0.96, side * 0.86);
    body.add(stalk);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.07), paintDark);
    mirror.position.set(0.9, 0.97, side * 0.96);
    body.add(mirror);
    const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.3, 0.004), carbon);
    doorLine.position.set(0.46, 0.68, side * 0.93);
    body.add(doorLine);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.02), chrome);
    handle.position.set(0.32, 0.78, side * 0.945);
    body.add(handle);
  }
  const plateTex = signTexture(
    [{ text: plate, size: 92, color: "#22262a", font: "SF Mono, Menlo, monospace", spacing: 6 }],
    { w: 256, h: 96, bg: "#e9e6dc" }
  );
  const plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.14),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 })
  );
  plateMesh.position.set(-2.225, 0.55, 0);
  plateMesh.rotation.y = -Math.PI / 2;
  body.add(plateMesh);

  /* ---------------- 车灯 ---------------- */
  const headlights: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(0xfff0d8, 70, 70, 0.44, 0.6, 1.4);
    light.position.set(2.05, 0.67, side * 0.55);
    light.target.position.set(18, 0.1, side * 1.4);
    body.add(light);
    body.add(light.target);
    headlights.push(light);
  }

  /* ---------------- 车轮 ---------------- */
  const wheels: THREE.Group[] = [];
  const tireGeo = new THREE.CylinderGeometry(0.365, 0.365, 0.29, 26, 1, false);
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.25, 26);
  const lipGeo = new THREE.TorusGeometry(0.248, 0.018, 6, 26);
  const discGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.026, 20);
  const hubGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.27, 12);
  const spokeGeo = new THREE.BoxGeometry(0.036, 0.2, 0.05);

  for (const [wx, wz, front] of [
    [1.36, 0.905, 1],
    [1.36, -0.905, 1],
    [-1.38, 0.905, 0],
    [-1.38, -0.905, 0],
  ] as [number, number, number][]) {
    const group = new THREE.Group();
    group.position.set(wx, 0.365, wz);
    const spin = new THREE.Group();

    const tire = new THREE.Mesh(tireGeo, rubber);
    tire.rotation.x = Math.PI / 2;
    spin.add(tire);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    spin.add(rim);

    for (const sgn of [-1, 1]) {
      const lip = new THREE.Mesh(lipGeo, rimLip);
      lip.position.z = sgn * 0.12;
      spin.add(lip);
    }
    const hub = new THREE.Mesh(hubGeo, rimLip);
    hub.rotation.x = Math.PI / 2;
    spin.add(hub);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(spokeGeo, rimLip);
      const a = (i / 5) * Math.PI * 2;
      spoke.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.125);
      spoke.rotation.z = a;
      spin.add(spoke);
    }
    const disc = new THREE.Mesh(discGeo, chrome);
    disc.rotation.x = Math.PI / 2;
    disc.position.z = -0.02;
    group.add(disc);
    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xd23a1c, roughness: 0.4, metalness: 0.4 })
    );
    caliper.position.set(-0.1, 0.08, -0.02);
    group.add(caliper);

    group.add(spin);
    group.userData.spin = spin;
    group.userData.front = front;
    wheels.push(group);
    body.add(group);
  }

  // 车底软阴影
  const shadowTex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.6)");
    g.addColorStop(0.55, "rgba(0,0,0,0.26)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 5.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  blob.renderOrder = 1;
  root.add(blob);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m !== blob) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { root, body, wheels, brakeLights: [tailMat], headlights };
}

export function tintCar(parts: CarParts, color: number) {
  parts.body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const next = list.map((mat) => {
      if (mat && mat.userData && mat.userData.paint) {
        const cloned = (mat as THREE.MeshPhysicalMaterial).clone();
        cloned.color.setHex(color);
        cloned.userData.paint = true;
        return cloned;
      }
      return mat;
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}

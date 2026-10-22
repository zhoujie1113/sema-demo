import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function planeGeo(w: number, d: number, x: number, z: number, y = 0.012, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function merge(geos: THREE.BufferGeometry[]) {
  const filtered = geos.filter((g) => g);
  if (!filtered.length) return new THREE.BufferGeometry();
  const merged = mergeGeometries(filtered, false);
  filtered.forEach((g) => g.dispose());
  return merged!;
}

/** 生成长条道路标线、停车位线等 */
export function markings(list: [number, number, number, number][], y = 0.012) {
  return merge(list.map(([x, z, w, d]) => planeGeo(w, d, x, z, y)));
}

function ensureUv(geo: THREE.BufferGeometry) {
  if (!geo.getAttribute("uv")) {
    const n = geo.getAttribute("position").count;
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  return geo;
}

/** 把一组网格按材质合并成「每种材质一个 mesh」，用于减少 draw call */
export function mergeByMaterial(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  const push = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    ensureUv(geo);
    const arr = buckets.get(mat);
    if (arr) arr.push(geo);
    else buckets.set(mat, [geo]);
  };

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const base = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (mats.length === 1) {
      push(base, mats[0]);
      return;
    }
    const index = base.getIndex();
    if (!index) {
      push(base, mats[0]);
      return;
    }
    for (const g of base.groups) {
      const sub = new THREE.BufferGeometry();
      for (const name of Object.keys(base.attributes)) {
        sub.setAttribute(name, base.attributes[name]);
      }
      sub.setIndex(Array.from(index.array.slice(g.start, g.start + g.count)));
      push(sub, mats[g.materialIndex ?? 0]);
    }
    base.dispose();
  });

  const group = new THREE.Group();
  for (const [mat, geos] of buckets) {
    const mesh = new THREE.Mesh(merge(geos), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** 用 InstancedMesh 复用同一模板（每材质一次 draw call） */
export function instanceFromTemplate(
  template: THREE.Object3D,
  matrices: THREE.Matrix4[],
  colors?: number[]
) {
  const group = new THREE.Group();
  template.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const visible = mesh.visible;
    if (!visible) return;
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material as THREE.Material, matrices.length);
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    const isPaint = !!(mesh.material as THREE.Material)?.userData?.paint;
    if (colors && isPaint) {
      colors.forEach((c, i) => inst.setColorAt(i, new THREE.Color(c)));
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  return group;
}

/** 由位置/朝向/缩放生成实例矩阵 */
export function makeMatrices(
  spots: { x: number; z: number; rot: number; scale?: number; y?: number }[]
) {
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  return spots.map((s) => {
    q.setFromAxisAngle(up, s.rot);
    const sc = s.scale ?? 1;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(s.x, s.y ?? 0, s.z),
      q,
      new THREE.Vector3(sc, sc, sc)
    );
  });
}

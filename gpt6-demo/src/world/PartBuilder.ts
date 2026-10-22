import * as THREE from "three";
import { merge } from "./Geo";

/** 把同材质的零件合并，减少 draw call */
export class PartBuilder {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, geo: THREE.BufferGeometry) {
    let arr = this.groups.get(mat);
    if (!arr) this.groups.set(mat, (arr = []));
    arr.push(geo);
    return this;
  }

  box(
    mat: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    rotZ = 0
  ) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotZ) g.rotateZ(rotZ);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    return this.add(mat, g);
  }

  plane(
    mat: THREE.Material,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    rotX = 0
  ) {
    const g = new THREE.PlaneGeometry(w, h);
    if (rotX) g.rotateX(rotX);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    return this.add(mat, g);
  }

  cyl(
    mat: THREE.Material,
    rTop: number,
    rBot: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotZ = 0,
    rotX = 0,
    seg = 8
  ) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    if (rotZ) g.rotateZ(rotZ);
    if (rotX) g.rotateX(rotX);
    g.translate(x, y, z);
    return this.add(mat, g);
  }

  build(name = "parts") {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, geos] of this.groups) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.groups.clear();
    return group;
  }
}

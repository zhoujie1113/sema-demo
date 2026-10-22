import * as THREE from "three";
import { Materials } from "./Materials";
import { CollisionWorld } from "../game/CollisionWorld";
import { L } from "./layout";
import { buildStreet } from "./Street";
import { buildBackdrop, buildBillboard, buildMotel, buildShops, TexBank } from "./Buildings";
import { buildPalms, PalmSpot } from "./Palms";
import { buildProps, ModelMap } from "./Props";
import { Ocean } from "./Ocean";
import { Sky } from "./Sky";
import { canvasTexture, signTexture } from "../util";
import { merge } from "./Geo";

export interface Checkpoint {
  index: number;
  x: number;
  z: number;
  label: string;
  passed: boolean;
  gate: THREE.Group;
  curtain: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  lamp: THREE.MeshStandardMaterial;
}

export class World {
  group = new THREE.Group();
  ocean: Ocean;
  checkpoints: Checkpoint[] = [];
  deliveryMarker!: THREE.Group;
  sun: THREE.DirectionalLight;
  sky: Sky;
  sunDir = new THREE.Vector3(0.34, 0.15, 0.93).normalize();
  col: CollisionWorld;

  constructor(
    private scene: THREE.Scene,
    private mats: Materials,
    models: ModelMap,
    tex: TexBank,
    hdri: THREE.Texture,
    envMap: THREE.Texture
  ) {
    this.col = new CollisionWorld();
    const g = this.group;
    g.name = "world";
    scene.add(g);

    /* ---------------- / / )z ---------------- */
    scene.background = new THREE.Color(0x1c3147);
    scene.environment = envMap;
    scene.environmentIntensity = 0.5;
    scene.fog = new THREE.FogExp2(0xf2b189, 0.0015);

    const sunDir = new THREE.Vector3(0.34, 0.15, 0.93).normalize();
    this.sky = new Sky(sunDir);
    scene.add(this.sky.mesh);

    this.sun = new THREE.DirectionalLight(0xffc191, 4.1);
    this.sun.position.copy(sunDir).multiplyScalar(180);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    const s = 62;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const hemi = new THREE.HemisphereLight(0xffd2ae, 0x2f3d46, 0.4);
    scene.add(hemi);

    /* ---------------- 0b+B ---------------- */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 260),
      this.mats.plain(0x6a6660, 0.98)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(360, -0.06, -60);
    ground.receiveShadow = true;
    g.add(ground);

    /* ---------------- ob / zQ / Sw ---------------- */
    g.add(buildStreet(mats, this.col));
    g.add(buildMotel(mats, this.col, tex));
    g.add(buildShops(mats, this.col, tex));
    g.add(buildBackdrop(mats));
    g.add(buildProps(mats, this.col, models));

    g.add(
      buildBillboard(470, -20, 11, 5.4, tex.posterSurf, Math.PI, mats)
    );
    g.add(
      buildBillboard(96, -21, 8.4, 4.2, tex.posterDiner, Math.PI, mats)
    );

    /* ---------------- w ---------------- */
    this.ocean = new Ocean(sunDir);
    g.add(this.ocean.mesh);

    /* ---------------- U ---------------- */
    const spots: PalmSpot[] = [];
    for (let x = -98; x <= 678; x += 13.5) {
      spots.push({ x: x + Math.sin(x * 0.7) * 1.5, z: 10.4, y: 0.17, scale: 0.92 + ((x * 37) % 10) / 40 });
    }
    for (let x = -80; x <= 800; x += 27) {
      if (x > 680 && x < 806) continue;
      spots.push({ x: x + 5, z: 16 + ((x * 13) % 9), y: -1.28, scale: 0.8 });
    }
    for (const p of [
      { x: -38, z: -14.9 },
      { x: -12, z: -15.6 },
      { x: -34, z: -30.5 },
      { x: -52, z: -30.5 },
      { x: 704, z: 12 },
      { x: 796, z: 13 },
      { x: 690, z: 36 },
      { x: 802, z: 36 },
    ]) {
      spots.push({ ...p, y: 0.17, scale: 1.05 });
    }
    g.add(buildPalms(mats, spots));
    for (const sp of spots) this.col.addBox(sp.x, sp.z, 0.3, 0.3, 0, "palm");

    /* ---------------- @e9h6 ---------------- */
    L.checkpoints.forEach((cp, i) => this.addCheckpoint(cp.x, cp.z, cp.label, i));
    this.addDeliveryMarker();
    this.addRoadSigns();
  }

  private addCheckpoint(x: number, z: number, label: string, index: number) {
    const gate = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 });
    const lamp = new THREE.MeshStandardMaterial({
      color: 0x101010,
      emissive: 0x35e0c4,
      emissiveIntensity: 2.4,
      roughness: 0.4,
    });
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(0.34, 5.6, 0.34).translate(0, 2.8, side * 9.6));
      parts.push(new THREE.BoxGeometry(0.42, 0.16, 0.42).translate(0, 5.62, side * 9.6));
    }
    const frame = new THREE.Mesh(merge(parts), postMat);
    frame.castShadow = true;
    frame.position.set(x, 0, z);
    gate.add(frame);

    const beams: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      beams.push(new THREE.BoxGeometry(0.08, 5.2, 0.22).translate(0, 2.6, side * 9.6 - 0.18 * side));
    }
    beams.push(new THREE.BoxGeometry(0.22, 0.12, 19.2).translate(0, 5.4, 0));
    const beamMesh = new THREE.Mesh(merge(beams), lamp);
    beamMesh.position.set(x, 0, z);
    gate.add(beamMesh);

    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(18.6, 5.2),
      new THREE.MeshBasicMaterial({
        color: 0x37e0c4,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    curtain.rotation.y = Math.PI / 2;
    curtain.position.set(x, 2.6, z);
    gate.add(curtain);

    const signTex = signTexture(
      [
        { text: `检查点 ${index + 1}`, size: 96, color: "#d8fff7", spacing: 4 },
        { text: label.split("·")[1] ?? "", size: 52, color: "#7fe9d6", spacing: 3 },
      ],
      { w: 512, h: 190, bg: "#0d1c1e", glow: "#35e0c4", border: "rgba(53,224,196,0.6)" }
    );
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.1),
      new THREE.MeshStandardMaterial({
        map: signTex,
        emissive: 0xffffff,
        emissiveMap: signTex,
        emissiveIntensity: 0.5,
        roughness: 0.5,
      })
    );
    sign.position.set(x - 0.2, 6.4, z - 9.6);
    sign.rotation.y = -Math.PI / 2 + 0.28;
    gate.add(sign);

    this.group.add(gate);
    this.checkpoints.push({ index, x, z, label, passed: false, gate, curtain, mat: postMat, lamp });
  }

  private addDeliveryMarker() {
    const g = new THREE.Group();
    const beamTex = canvasTexture(8, 128, (ctx) => {
      const grad = ctx.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0, "rgba(255,210,140,0.55)");
      grad.addColorStop(0.45, "rgba(255,190,110,0.18)");
      grad.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 128);
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.45, 12, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc46a,
        map: beamTex,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    beam.position.set(L.bay.x, 6, L.bay.z);
    g.add(beam);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffcf80, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(L.bay.x, 0.03, L.bay.z);
    g.add(ring);

    const bayTex = signTexture(
      [
        { text: "交 付 点", size: 100, color: "#fff1d6", spacing: 8 },
        { text: "DELIVERY BAY", size: 40, color: "#ffc46a", spacing: 4 },
      ],
      { w: 512, h: 190, bg: "#1d1710", glow: "#ffb050", border: "rgba(255,196,106,0.55)" }
    );
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.2),
      new THREE.MeshStandardMaterial({
        map: bayTex,
        emissive: 0xffffff,
        emissiveMap: bayTex,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      })
    );
    sign.position.set(L.bay.x - 4.2, 2.7, L.bay.z + 3.2);
    sign.rotation.y = -Math.PI / 2 - 0.3;
    g.add(sign);

    this.deliveryMarker = g;
    this.group.add(g);
  }

  private addRoadSigns() {
    const mk = (cn: string, en: string, color = "#e8e2d4", bg = "#1b3a3e") =>
      new THREE.MeshStandardMaterial({
        map: signTexture(
          [
            { text: cn, size: 92, color, spacing: 4 },
            { text: en, size: 40, color: "#9fe0d4", spacing: 3 },
          ],
          { w: 512, h: 200, bg, border: "rgba(255,255,255,0.35)" }
        ),
        roughness: 0.65,
      });

    const poleMat = this.mats.plain(0x7d8388, 0.6, 0.5);
    const add = (x: number, z: number, rotY: number, mat: THREE.Material, w = 3.4, h = 1.35) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), poleMat);
      pole.position.set(x, 1.6, z);
      this.group.add(pole);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      plane.position.set(x, 3.1, z);
      plane.rotation.y = rotY;
      this.group.add(plane);
      this.col.addBox(x, z, 0.16, 0.16, 0, "sign");
    };

    add(-40, 10.3, 0, mk("海滨大街", "OCEAN BOULEVARD", "#f4ecdc", "#173b3f"), 4.2, 1.55);
    add(250, 10.3, 0, mk("限速 50", "SPEED LIMIT", "#fff3dc", "#7a2220"), 2.6, 1.2);
    add(650, 10.3, 0.35, mk("海边交付点 350m", "DELIVERY AHEAD", "#ffe9c8", "#1f3a2c"), 3.8, 1.4);
    add(430, -10.2, Math.PI, mk("禁止停车", "NO PARKING", "#ffe3e0", "#6d1f1c"), 2.6, 1.2);
    add(840, 0, -Math.PI / 2, mk("道路尽头", "ROAD CLOSED", "#ffe9c8", "#5c2320"), 3.0, 1.3);
  }

  update(dt: number, t: number, carPos: THREE.Vector3, cameraPos: THREE.Vector3) {
    this.ocean.update(t);

    // 阴影相机跟随车辆
    this.sun.position.set(
      carPos.x + this.sunDir.x * 150,
      this.sunDir.y * 150,
      carPos.z + this.sunDir.z * 150
    );
    this.sun.target.position.copy(carPos);
    this.sun.target.updateMatrixWorld();
    this.sky.update(t, cameraPos);

    // 检查点呼吸光
    for (const cp of this.checkpoints) {
      const passed = cp.passed;
      const target = passed ? 0x36d98a : 0x35e0c4;
      cp.lamp.emissive.setHex(target);
      cp.lamp.emissiveIntensity = passed ? 1.6 : 2.0 + Math.sin(t * 3 + cp.index) * 0.6;
      (cp.curtain.material as THREE.MeshBasicMaterial).opacity = passed ? 0.04 : 0.08 + Math.sin(t * 2.2) * 0.03;
      (cp.curtain.material as THREE.MeshBasicMaterial).color.setHex(target);
    }

    // 交付点光柱轻微起伏
    const ring = this.deliveryMarker.children[1] as THREE.Mesh;
    if (ring) {
      const s = 1 + Math.sin(t * 2.4) * 0.05;
      ring.scale.setScalar(s);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(t * 2.4) * 0.18;
    }
  }
}

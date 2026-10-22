import * as THREE from "three";
import { canvasTexture, mulberry32 } from "../util";

type PBR = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

/**
 * 统一管理 Poly Haven (CC0) 贴图与场景材质。
 * 同一个贴图按不同 repeat 需求缓存，避免重复上传显存。
 */
export class Materials {
  private texCache = new Map<string, THREE.Texture>();
  private matCache = new Map<string, THREE.Material>();
  readonly road: THREE.MeshStandardMaterial;
  readonly lot: THREE.MeshStandardMaterial;
  readonly pavers: THREE.MeshStandardMaterial;
  readonly sand: THREE.MeshStandardMaterial;
  readonly concrete: THREE.MeshStandardMaterial;
  readonly metalDark: THREE.MeshStandardMaterial;
  readonly metalRust: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly glassLit: THREE.MeshStandardMaterial;
  readonly whiteLine: THREE.MeshStandardMaterial;
  readonly yellowLine: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;

  constructor(private manager: THREE.LoadingManager, private aniso: number) {
    this.road = this.surface("asphalt_02", [150, 3], { roughness: 0.96, metalness: 0.02 });
    this.lot = this.surface("asphalt_02", [15, 4], { roughness: 0.97, metalness: 0.02, color: 0xb9b2a8 });
    this.pavers = this.surface("concrete_pavers_02", [90, 1.5], { roughness: 0.86 });
    this.sand = this.surface("coast_sand_02", [140, 6], { roughness: 1, color: 0xd9c4a4 });
    this.concrete = this.surface("concrete_wall_005", [6, 2], { roughness: 0.92, color: 0xcfc8bd });
    this.metalRust = this.surface("corrugated_iron_02", [8, 2], { roughness: 0.72, metalness: 0.55 });

    this.metalDark = new THREE.MeshStandardMaterial({
      color: 0x24272b,
      roughness: 0.46,
      metalness: 0.78,
    });
    this.glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a1418,
      roughness: 0.06,
      metalness: 0.55,
      envMapIntensity: 2.1,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
    this.glassLit = new THREE.MeshStandardMaterial({
      color: 0x14201f,
      roughness: 0.22,
      metalness: 0.55,
      emissive: 0xffc98a,
      emissiveIntensity: 0.22,
    });
    this.whiteLine = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.72 });
    this.yellowLine = new THREE.MeshStandardMaterial({ color: 0xd8a53a, roughness: 0.7 });
    this.rubber = new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.86 });
  }

  private texture(folder: string, suffix: string, repeat: [number, number], colorSpace: THREE.ColorSpace) {
    const key = `${folder}/${suffix}/${repeat[0]}/${repeat[1]}`;
    const hit = this.texCache.get(key);
    if (hit) return hit;
    const tex = new THREE.TextureLoader(this.manager).load(
      `./assets/textures/${folder}/${folder}_${suffix}_2k.jpg`
    );
    tex.colorSpace = colorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = this.aniso;
    this.texCache.set(key, tex);
    return tex;
  }

  pbr(folder: string, repeat: [number, number]): PBR {
    return {
      map: this.texture(folder, "diff", repeat, THREE.SRGBColorSpace),
      normalMap: this.texture(folder, "nor_gl", repeat, THREE.NoColorSpace),
      roughnessMap: this.texture(folder, "rough", repeat, THREE.NoColorSpace),
    };
  }

  surface(
    folder: string,
    repeat: [number, number],
    params: THREE.MeshStandardMaterialParameters = {}
  ) {
    const t = this.pbr(folder, repeat);
    return new THREE.MeshStandardMaterial({ ...t, ...params });
  }

  /** 墙面材质：按尺寸推算 repeat，避免拉伸 */
  wall(folder: string, width: number, height: number, color = 0xffffff, tile = 3, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const rx = Math.max(1, Math.round(width / tile));
    const ry = Math.max(1, Math.round(height / tile));
    const key = `wall|${folder}|${rx}|${ry}|${color}|${JSON.stringify(extra)}`;
    const hit = this.matCache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const t = this.pbr(folder, [rx, ry]);
    const mat = new THREE.MeshStandardMaterial({ ...t, color, roughness: 0.9, ...extra });
    this.matCache.set(key, mat);
    return mat;
  }

  /** 昼夜常亮的小灯罩 / 霓虹 */
  glow(color: number, intensity = 2.2) {
    return new THREE.MeshStandardMaterial({
      color: 0x101010,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
      metalness: 0,
    });
  }

  /** 水泥地 / 挡墙用的纯色材质（不用贴图，节省带宽） */
  plain(color: number, roughness = 0.9, metalness = 0) {
    const key = `plain|${color}|${roughness}|${metalness}`;
    const hit = this.matCache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.matCache.set(key, m);
    return m;
  }

  /** 棕榈树皮 */
  bark() {
    const key = "bark";
    const hit = this.matCache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const map = canvasTexture(256, 256, (ctx) => {
      const rnd = mulberry32(7);
      ctx.fillStyle = "#5a4a3a";
      ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 8) {
        ctx.fillStyle = `rgba(30,22,16,${0.35 + rnd() * 0.3})`;
        ctx.fillRect(0, y, 256, 3 + rnd() * 3);
        ctx.fillStyle = `rgba(150,124,96,${0.15 + rnd() * 0.2})`;
        ctx.fillRect(0, y + 5, 256, 2);
      }
      for (let i = 0; i < 240; i++) {
        ctx.fillStyle = `rgba(20,14,10,${rnd() * 0.35})`;
        ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2 + rnd() * 6);
      }
    }, { repeat: [1, 4], aniso: this.aniso });
    const m = new THREE.MeshStandardMaterial({ map, roughness: 0.95, color: 0xffffff });
    this.matCache.set(key, m);
    return m;
  }

  /** 棕榈叶片（alpha 贴图） */
  frond() {
    const key = "frond";
    const hit = this.matCache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const map = canvasTexture(512, 256, (ctx) => {
      ctx.clearRect(0, 0, 512, 256);
      const rnd = mulberry32(21);
      ctx.strokeStyle = "#6d7a3e";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(4, 128);
      ctx.quadraticCurveTo(256, 118, 508, 128);
      ctx.stroke();
      // 羽状小叶
      for (let i = 0; i < 42; i++) {
        const t = i / 41;
        const x = 10 + t * 490;
        const y = 128 + Math.sin(t * Math.PI) * -6;
        const len = 26 + Math.sin(t * Math.PI) * 54 + rnd() * 6;
        for (const dir of [-1, 1]) {
          const hue = 92 + rnd() * 26;
          const light = 26 + rnd() * 16;
          ctx.strokeStyle = `hsl(${hue}, ${34 + rnd() * 16}%, ${light}%)`;
          ctx.lineWidth = 3.2 + rnd() * 2.2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 10, y + dir * len * 0.6, x + 26 + rnd() * 10, y + dir * len);
          ctx.stroke();
        }
      }
      // 叶尖
      ctx.strokeStyle = "#7d8a48";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(500, 128);
      ctx.lineTo(512, 128);
      ctx.stroke();
    }, { aniso: this.aniso });
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({
      map,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.82,
      color: 0xbfd08f,
    });
    this.matCache.set(key, m);
    return m;
  }
}

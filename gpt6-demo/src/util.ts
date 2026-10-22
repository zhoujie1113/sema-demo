import * as THREE from "three";

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a), 0, 1);
/** 与帧率无关的指数平滑 */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

export const DEG = Math.PI / 180;

/** 确定性随机，保证每次刷新场景一致 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(ms: number) {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ds = Math.floor((total % 1000) / 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ds}`;
}

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  opts: { srgb?: boolean; repeat?: [number, number]; aniso?: number } = {}
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.aniso) tex.anisotropy = opts.aniso;
  tex.needsUpdate = true;
  return tex;
}

/** 深色底 + 霓虹描边的招牌文字贴图 */
export function signTexture(
  lines: { text: string; size: number; color: string; font?: string; spacing?: number }[],
  opts: { w?: number; h?: number; bg?: string; glow?: string; border?: string; vertical?: number } = {}
) {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  return canvasTexture(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);
    }
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let y = h * 0.5 - ((lines.length - 1) * 0.22 * h) / 2;
    for (const line of lines) {
      const family = line.font ?? "PingFang SC, Noto Sans SC, sans-serif";
      ctx.font = `700 ${line.size}px ${family}`;
      if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${line.spacing ?? 2}px`;
      if (opts.glow) {
        ctx.shadowColor = opts.glow;
        ctx.shadowBlur = 26;
      }
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, w / 2, y);
      ctx.fillText(line.text, w / 2, y);
      ctx.shadowBlur = 0;
      y += line.size * 1.18;
    }
  });
}

export function setShadow(obj: THREE.Object3D, cast = true, receive = true) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = cast;
    m.receiveShadow = receive;
  });
}

/** 递归释放几何体与贴图 */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
        if (v instanceof THREE.Texture) v.dispose();
      }
      mat.dispose();
    }
  });
}

export function nearestPointOnSegments(
  x: number,
  z: number,
  pts: { x: number; z: number; heading: number }[]
) {
  let best = { x: pts[0].x, z: pts[0].z, heading: pts[0].heading, dist: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (len2 || 1), 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) {
      best = { x: px, z: pz, heading: Math.atan2(dz, dx), dist: d };
    }
  }
  return best;
}

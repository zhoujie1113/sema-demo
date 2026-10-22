import "./style.css";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { Materials } from "./world/Materials";
import { loadModels } from "./world/Props";
import { World } from "./world/World";
import { Vehicle } from "./game/Vehicle";
import { Game } from "./game/Game";
import { Hud } from "./ui/Hud";
import { AudioBus } from "./audio/AudioBus";
import { L } from "./world/layout";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function boot() {
  const canvas = $("scene") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);

  /* ---------------- 资源载入 ---------------- */
  const errors: string[] = [];
  const manager = new THREE.LoadingManager();
  const bar = $("boot-bar");
  const text = $("boot-text");
  const loaded = new Promise<void>((resolve) => {
    manager.onProgress = (_url, done, total) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      bar.style.width = `${Math.max(6, pct)}%`;
      text.textContent = `正在载入素材… ${pct}%`;
    };
    manager.onLoad = () => resolve();
    manager.onError = (url) => errors.push(url);
  });

  const mats = new Materials(manager, renderer.capabilities.getMaxAnisotropy());

  const hdri = await new RGBELoader(manager).loadAsync("./assets/hdri/venice_sunset_2k.hdr");
  hdri.mapping = THREE.EquirectangularReflectionMapping;

  const texLoader = new THREE.TextureLoader(manager);
  const uiTex = (path: string) => {
    const t = texLoader.load(path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const motelSign = uiTex("./assets/ui/motel-sign.jpg");
  const posterSurf = uiTex("./assets/ui/poster-surf.jpg");
  const posterDiner = uiTex("./assets/ui/poster-diner.jpg");
  const keyart = uiTex("./assets/ui/keyart.jpg");

  text.textContent = "正在载入道具模型…";
  const models = await loadModels(manager);

  await loaded;

  if (errors.length) {
    $("boot-err").hidden = false;
    const list = $("boot-err-list");
    list.innerHTML = "";
    for (const e of errors) {
      const li = document.createElement("li");
      li.textContent = e;
      list.appendChild(li);
    }
    $("boot-text").textContent = "资源加载失败";
    $("boot-retry").addEventListener("click", () => window.location.reload());
    return;
  }

  /* ---------------- PMREM 环境反射 ---------------- */
  bar.style.width = "100%";
  text.textContent = "正在生成天空环境光…";
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(hdri).texture;

  /* ---------------- 场景 ---------------- */
  text.textContent = "正在布置海滨街区…";
  const world = new World(scene, mats, models, { motelSign, posterSurf, posterDiner }, hdri, envMap);

  const car = new Vehicle();
  car.setPose(L.start.x, L.start.z, L.start.heading);
  scene.add(car.root);

  // 车头灯照射场景需要车在场景中，这里确保阴影与灯光设置
  car.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.frustumCulled = true;
  });

  const hud = new Hud();
  const audio = new AudioBus();
  const game = new Game(renderer, scene, camera, world, car, hud, audio);
  game.cameraRig.snap(car);

  /* ---------------- 开始页 ---------------- */
  $("start").style.backgroundImage = `url(${JSON.stringify("./assets/ui/keyart.jpg")})`;
  const art = document.querySelector<HTMLElement>(".start-art");
  if (art && keyart) art.style.opacity = "1";

  const startBtn = $("start-btn");
  const startScreen = $("start");
  startBtn.addEventListener("click", () => {
    startScreen.hidden = true;
    audio.init();
    audio.setMuted(false);
    hud.setMuted(false);
    game.startPlaying();
    audio.blip(680, 0.12, 0.08);
    window.setTimeout(() => audio.blip(940, 0.16, 0.07), 120);
  });

  $("boot").hidden = true;
  startScreen.hidden = false;

  /* ---------------- 渲染循环 ---------------- */
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsTimer = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    game.update(dt);
    game.render();
    frames++;
    fpsTimer += dt;
    if (fpsTimer > 1) {
      fpsTimer = 0;
      frames = 0;
    }
  });

  /* ---------------- 自适应 ---------------- */
  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (game.mode === "playing" || game.mode === "free")) {
      game.mode = "paused";
      $("pause").hidden = false;
      audio.suspend();
    }
  });

  // 便于调试
  (window as unknown as Record<string, unknown>).__game = game;
  (window as unknown as Record<string, unknown>).__car = car;
  (window as unknown as Record<string, unknown>).__world = world;
  (window as unknown as Record<string, unknown>).__renderer = renderer;
  (window as unknown as Record<string, unknown>).__THREE = THREE;
  // 调试辅助：后台标签页 rAF 会被限流，可手动步进
  (window as unknown as Record<string, unknown>).__step = (dt = 1 / 60, n = 1) => {
    for (let i = 0; i < n; i++) game.update(dt);
    renderer.render(scene, camera);
  };
  (window as unknown as Record<string, unknown>).__shot = () => renderer.render(scene, camera);
}

boot().catch((err) => {
  console.error(err);
  $("boot-text").textContent = "初始化失败：" + (err?.message ?? err);
  $("boot-err").hidden = false;
  const retry = $("boot-retry");
  retry.hidden = false;
  retry.addEventListener("click", () => window.location.reload());
});

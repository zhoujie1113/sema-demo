# 落日海岸 / Sunset Coast

浏览器实时 3D 驾驶 demo：从汽车旅馆停车场出发，沿落日海岸大街穿过两个检查点，把货送到海边停车区。
写实向海滨街区、第三人称追尾镜头、街机化驾驶手感，全程在浏览器里跑，不需要安装客户端。

- 预览地址（本地）：`http://127.0.0.1:5173/`（开发服务器）或 `http://127.0.0.1:4173/`（生产预览）
- 只有本机可以访问，**尚未部署公网**，不能把上面两个地址当作他人可远程打开的链接
- 桌面 Chrome / Edge + 键盘，推荐 1280×720 以上窗口

---

## 1. 运行

```bash
npm install
npm run dev       # 开发服务器 http://127.0.0.1:5173/
npm run build     # 生产构建到 dist/（已配置 base: "./"，可直接静态托管）
npm run preview   # 预览构建结果 http://127.0.0.1:4173/
```

`dist/` 是纯静态目录，丢到任意静态托管（Nginx / Vercel / Netlify / GitHub Pages）即可公网访问。
所有素材都在 `public/assets/` 内，无外部 CDN 依赖，断网也能运行。

## 2. 操作

| 按键 | 功能 |
| --- | --- |
| `W` / `↑` | 加速 |
| `S` / `↓` | 刹车，停稳后倒车 |
| `A` `D` / `←` `→` | 转向 |
| `Space` | 手刹（后轮抓地力下降，可以甩尾） |
| `R` | 车辆复位到最近的安全位置（路线上） |
| `E` | 确认接单 / 交付货物 |
| `Esc` | 暂停 / 恢复（计时与音效同步暂停） |
| 右下角喇叭 | 静音 / 取消静音 |

## 3. 任务流程

```
待出发 ──E 接单──> 运送中 ──通过 1、2 号检查点──> 驶入车位停稳 ──> 等待交付 ──E──> 已完成
                        ↑                                   │
                        └────────── 驶离车位/加速 ──────────┘
完成后可选择「重新挑战」（重置车辆、检查点、计时、任务状态）或「自由驾驶」
```

- 计时从按 `E` 接单开始，到按 `E` 交付结束；暂停时不计时。
- 交付判定：必须两个检查点都通过、车身位于地面车位框内（|Δx| < 3.6m、|Δz| < 5.4m）、车速 < 3 km/h，并且**主动按 E**。
  高速路过或没停稳都不会完成。
- 小地图为「车头朝上」的实时雷达：道路、海岸线、停车场、检查点、交付点、玩家朝向，目标在视野外时贴边显示箭头。

## 4. 场景

一条约 930m 的连续海滨街道，可往返行驶：

| 区域 | 内容 |
| --- | --- |
| 落日旅馆停车场（起点） | L 形两层汽车旅馆、外挂楼梯、二层走廊与栏杆、每间房门灯、接待处、售货机、制冰机、车棚、盖车衣的旧车、停放车辆、霓虹立柱招牌 |
| 海滨大街 | 双黄线、路缘石、混凝土人行道、路灯、电线杆电缆、斑马线、限速/禁停/交付指示牌、广告牌、停靠车辆 |
| 沿街建筑 | 15 栋店铺/公寓/仓库（冲浪店、洗衣房、杂货铺、24H 便利店、海岸餐厅、酒吧、海滩公寓、冰淇淋店、海鲜市场……），带遮阳棚、招牌、橱窗、空调外机、屋顶设备 |
| 海岸 | 护栏、海堤、沙滩、棕榈树列、程序化海面（波浪 + 菲涅尔反射 + 太阳高光带 + 近岸白沫） |
| 海边交付区 | 加高停车平台、车位线、地面「海边交付 / DELIVERY」标线、光柱、交付牌、挡车器 |

场景边界：建筑、护栏、围墙、路障、路灯/棕榈树干均有碰撞体；海边方向被护栏与挡车器封住，车辆无法驶入海中。

## 5. 技术实现

- **Three.js 0.180 + TypeScript + Vite**，单页无框架。
- 渲染：ACES Filmic 色调映射、PMREM 环境反射、PCFSoft 阴影（阴影相机跟随车辆）、程序化日落天空（渐变 + 太阳 + 云带 + 地平线霞光）、自定义海面 shader。
- 车辆：横截面放样（superellipse loft）生成车身与座舱，按面法线把座舱分成「车漆 / 玻璃」两个材质组；独立轮组（转向 + 滚动）、刹车盘卡钳、灯具、尾翼、扩散器、车底软阴影。车漆为 clearcoat 金属漆，反射来自环境贴图。
- 物理：自行车模型 + 前后轮侧向抓地力衰减（手刹时抓地力下降形成甩尾），固定 120Hz 子步进积分；与静态 OBB 做 SAT 分离轴检测并推出，碰撞按法向反弹并衰减速度。
- 音频：WebAudio 实时合成——引擎（双振荡器 + 低通跟随转速）、风噪、海浪（滤波噪声 + 慢速 LFO），无需音频素材；暂停时挂起 AudioContext。
- 性能：同材质零件合并（每栋建筑 3~6 个 draw call）、GLTF 道具用 InstancedMesh（每个部件一次绘制）、扫描模型减面（gltf-transform simplify，约 28% 面数）、贴图统一压到 1024。

## 6. 素材来源与许可

### 6.1 外部素材（Poly Haven，全部 CC0 公有领域）

来源站点：https://polyhaven.com （CC0，可商用、无需署名；此处仍按要求列明）

| 用途 | 资源 | 类型 |
| --- | --- | --- |
| 环境光照 / 反射 | [Venice Sunset](https://polyhaven.com/a/venice_sunset) | HDRI 2K |
| 沥青路面、停车场、交付区 | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | PBR 贴图 2K |
| 人行道砖 | [Concrete Pavers 02](https://polyhaven.com/a/concrete_pavers_02) | PBR 贴图 |
| 旅馆外墙（蓝绿灰泥） | [Blue Plaster Weathered](https://polyhaven.com/a/blue_plaster_weathered) | PBR 贴图 |
| 混凝土墙面 / 海堤 | [Concrete Wall 005](https://polyhaven.com/a/concrete_wall_005) | PBR 贴图 |
| 沙滩 | [Coast Sand 02](https://polyhaven.com/a/coast_sand_02) | PBR 贴图 |
| 仓库/招牌铁皮 | [Corrugated Iron 02](https://polyhaven.com/a/corrugated_iron_02) | PBR 贴图 |
| 奶油色灰泥墙面 | [Clay Plaster](https://polyhaven.com/a/clay_plaster) | PBR 贴图 |
| 路灯 | [Street Lamp 01](https://polyhaven.com/a/street_lamp_01) | 模型 |
| 消防栓 | [Fire Hydrant](https://polyhaven.com/a/fire_hydrant) | 模型 |
| 金属垃圾桶 | [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) | 模型 |
| 混凝土护栏 | [Concrete Road Barrier](https://polyhaven.com/a/concrete_road_barrier) | 模型 |
| 铁丝网围栏 | [Modular Chainlink Fence](https://polyhaven.com/a/modular_chainlink_fence) | 模型 |
| 空调外机 | [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) | 模型 |
| 旧轮胎 | [Old Tyre](https://polyhaven.com/a/old_tyre) | 模型 |
| 塑料椅 | [Plastic Monobloc Chair 01](https://polyhaven.com/a/plastic_monobloc_chair_01) | 模型 |
| 盆栽 | [Potted Plant 01](https://polyhaven.com/a/potted_plant_01) | 模型 |
| 木箱 | [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01) | 模型 |
| 盖车衣的旧车 | [Covered Car](https://polyhaven.com/a/covered_car) | 模型 |

### 6.2 原创素材

| 素材 | 说明 |
| --- | --- |
| `public/assets/ui/keyart.jpg` | 开始页插画，本项目用图像生成工具原创生成 |
| `public/assets/ui/motel-sign.jpg` | 旅馆霓虹招牌底板，原创生成；招牌文字由 Canvas 实时绘制叠加 |
| `public/assets/ui/poster-surf.jpg` / `poster-diner.jpg` | 冲浪店 / 餐厅广告海报，原创生成，用于店内墙面、侧墙壁画与广告牌 |
| 车身、建筑、道路标线、棕榈树、招牌文字、天空、海面、界面 | 全部由代码程序化生成（无第三方模型/字体依赖） |

### 6.3 开源依赖

- three.js — MIT
- Vite — MIT
- TypeScript — Apache-2.0

### 6.4 候选资源核查结论

任务中提到优先核查的四个 Sketchfab 候选资源，实测结论如下（Sketchfab API：`/v3/models/{uid}` 与 `/v3/models/{uid}/download`）：

| 候选 | 核查结果 |
| --- | --- |
| YD92 · Motel | 模型存在，但下载接口返回 `401 Authentication credentials were not provided`，浏览器访问时站点为未登录状态。未代为登录账号，因此无法取得文件 |
| donnichols · Low-Poly Sports Car Free（CC-BY 4.0，5,042 面） | 同上，免费下载同样要求登录 |
| Next Spring · Realistic Palm Tree Free（CC-BY 4.0，27,152 面） | 同上；另外单棵 27k 面，沿街复用 60+ 棵时面数过高，不适合本场景 |
| Poly Haven · Worn Asphalt / Belfast Sunset | CC0，可直接下载。沥青实际采用同系列的 `asphalt_02`；Belfast Sunset 实测为低对比阴天、画面下半部是草地，作为可见天空会穿帮，故改为同站 `venice_sunset`（水面 + 日落），仍为 CC0 |

按任务要求，以上无法获取的模型改用许可明确的替代方案：环境素材统一使用 Poly Haven（CC0），玩家车辆与棕榈树改为程序化生成，避免任何授权风险。没有购买任何付费资源。

## 7. 优化记录

- 贴图：全部下载 2K 后统一降到 1024 长边、JPEG 质量 78，资源从约 250MB 降到 33MB。
- 模型：用 `gltf-transform simplify`（meshoptimizer）把 11 个 Poly Haven 道具减面到约 28%，`bin` 体积合计从 ~30MB 降到 19MB；未使用的 `concrete_floor_painted` 贴图已删除。
- Draw call：`PartBuilder` 按材质合并建筑零件；同款道具用 `InstancedMesh`（每种材质一次绘制）；停放车辆先按材质合并再实例化并用 `instanceColor` 染色。场景 draw call 从初版 2102 降到约 435~510（含阴影 pass），三角形约 2.3M。

## 8. 验收记录

测试环境：macOS 15.2 / Apple M4 / Google Chrome 156.0.8078.47 / 窗口 1467×748（画布按 DPR 渲染）/ 键盘操作。

| 用例 | 结果 |
| --- | --- |
| 打开页面 → 资源加载进度 → 开始页 | 通过 |
| 点击「开始游戏」→ 出现在停车场车内、追尾镜头 | 通过 |
| `E` 接单 → 状态「运送中」、计时启动 | 通过 |
| 依次通过 1、2 号检查点（顺序判定，HUD 与地图同步变色） | 通过：`passed` 依次为 1 → 2 |
| 高速路过交付区不判定 | 通过：距离 8.8m、4.4 km/h 时仍为「运送中」 |
| 驶入车位停稳 → 「等待交付」→ `E` → 结算面板 | 通过：停稳于车位中心（744,25），结算 00:27.4 |
| 「重新挑战」重置车辆/检查点/计时/状态 | 通过：回到 (-56,-22)、`passed=0`、计时 0、检查点视觉复位 |
| 「自由驾驶」 | 通过：状态「自由驾驶」，可继续驾驶 |
| `Esc` 暂停 → 计时冻结 / 音效挂起 → 恢复 | 通过：暂停 1s 期间计时保持 1017ms 不变，恢复后继续累加 |
| `R` 复位 | 通过：从 (6.8,-22) 吸附到路线点 (7.2,3.5)，提示「车辆已复位」 |
| 碰撞：旅馆外墙 | 通过：车头停在 z=-33.8（墙面 -36，车长半宽 2.24），未穿墙 |
| 碰撞：海边护栏 | 通过：停在 z=9.7（护栏 12.2），无法进入沙滩/海面 |
| 碰撞：道路尽头路障 | 通过：停在 x=818.8，累计 4 次碰撞反馈 |
| 小地图实时更新（道路、海岸、检查点、交付点、玩家朝向） | 通过（截图见下） |
| 窗口尺寸变化（1467×748 → 1211×731 → 860×575） | 通过：画布与相机比例同步，HUD 按断点收缩，无溢出 |
| 资源加载失败提示与重试 | 通过：临时移除 `asphalt_02_diff_2k.jpg` 后显示失败列表与「重试」按钮；恢复文件后正常 |
| 连续重开（多次「重新挑战」） | 通过：无报错、无残留计时/检查点状态 |
| 控制台 | 除 RGBELoader 的弃用提示外无报错 |

运行表现（实测，非估算）：

- 可见窗口下 3 秒采样稳定在 **60 FPS**（受显示器刷新率限制），此时 510 draw calls / 2.32M 三角形。
- 首屏资源总量约 33MB（本地），生产 JS 829KB（gzip 224KB）。
- 未在低端集显、移动端或公网带宽下测试，不声称这些环境下的帧率。

### 8.1 关键画面

| 文件 | 内容 |
| --- | --- |
| [`docs/screenshots/00-motellot.jpg`](docs/screenshots/00-motellot.jpg) | 起点：落日旅馆停车场、车内外视角（追尾镜头） |
| [`docs/screenshots/02-checkpoint-gate.jpg`](docs/screenshots/02-checkpoint-gate.jpg) | 海滨大街与 1 号检查点门架 |
| [`docs/screenshots/03-checkpoint.jpg`](docs/screenshots/03-checkpoint.jpg) | 通过检查点后沿街行驶（棕榈、海岸、店铺） |
| [`docs/screenshots/05-delivery-parked.jpg`](docs/screenshots/05-delivery-parked.jpg) | 海边交付区停稳（地面标线、光柱、日落海面） |

界面截图（开始页、HUD、暂停、结算）为 DOM 层，未随包内 canvas 截图保存。

## 9. 已知限制

- 只有外观与驾驶，没有步行、上下车、人物和车内视角。
- 没有 AI 交通与行人；街边停放车辆为静态实例。
- 交付判定用的是车位矩形 + 车速，没有做车轮朝向/车身角度的精细判定。
- 水面为程序化着色（无实时屏幕空间反射）；远处海岸线是天空与雾的混合，不是真实几何。
- 音效为合成音，风格统一但不含真实采样。

## 10. 问题修复记录（开发中在浏览器里实测发现并修复）

| # | 现象 | 原因 | 修复 |
| --- | --- | --- | --- |
| 1 | 天空中央出现巨大深色圆顶，把晚霞挡住 | 天空球半径 2800 超过相机远裁剪 2600，被整片裁掉露出背景色 | 半径改 1350，远裁剪改 3000 |
| 2 | 车顶竖起一块黑色三角 | 挡风玻璃用 `rotation.y` 后再叠 `rotation.x`，玻璃被拉成 1.46m 高的竖面 | 取消贴片玻璃，座舱放样时按面法线分流为「车漆 / 玻璃」两组 |
| 3 | 车能穿墙、能冲进海里 | `resolve()` 收到的是临时对象，推出的坐标没有写回车辆 | 用探针对象解算后回写 `pos` |
| 4 | 修好 #3 后仍有部分建筑不阻挡 | SAT 里障碍物的宽/深轴与 `addBox(hw, hd)` 约定相反，92m 长的旅馆被当成 5m 宽 92m 深 | 修正障碍物轴映射 |
| 5 | 检查点牌、交付牌是一块纯白发光板 | 用了 `emissive` 但没设 `emissiveMap`，整面材质自发光 | 贴图同时作为 `map` 与 `emissiveMap` |
| 6 | 地面「海边交付」字样侧躺/倒置 | 地贴 `rotation.z` 叠加了 90° / 180° | 调整为与入场方向一致 |
| 7 | 交付点光柱像一块半透明玻璃板 | 圆柱面加色混合，边缘生硬 | 换成带纵向渐变贴图的柔光锥体并降低不透明度 |
| 8 | 单层店铺招牌悬在屋顶上方 | 招牌/遮阳棚按楼层高度定位 | 改为固定标高 3.95m / 3.18m |
| 9 | 停车场里看不到旅馆招牌 | 招牌单面且朝街，玩家在背面 | 改双面 + 转向车道，并把遮挡视线的棕榈挪开 |
| 10 | 首版 2102 draw calls，画面卡顿风险高 | 每个道具/店铺零件都是独立 mesh | 建筑按材质合并、道具与停放车辆实例化，降到约 500 |

## 11. 目录结构

```
index.html                 界面骨架（加载页 / 开始页 / HUD / 暂停 / 结算）
src/main.ts                启动、资源加载、PMREM、主循环、尺寸自适应
src/game/Game.ts           状态机、输入、任务与结算、暂停/重开
src/game/Vehicle.ts        街机车辆物理与姿态
src/game/CarModel.ts       程序化跑车建模（放样车身、玻璃、轮组、灯组）
src/game/CollisionWorld.ts OBB 碰撞世界（网格加速 + SAT）
src/game/ChaseCamera.ts    追尾相机（弹簧跟随 + 遮挡拉近）
src/game/Mission.ts        任务状态机与交付判定
src/world/World.ts         场景装配、光照、检查点、路牌
src/world/Street.ts        路面、标线、人行道、海堤、护栏、电线杆
src/world/Buildings.ts     旅馆、沿街店铺、广告牌、远景
src/world/Props.ts         GLTF 道具加载、归一化、实例化
src/world/Palms.ts         程序化棕榈树（alpha 叶片）
src/world/Ocean.ts         海面 shader
src/world/Sky.ts           日落天空 shader
src/world/Materials.ts     PBR 贴图与材质库
src/ui/Hud.ts              HUD 与小地图绘制
src/audio/AudioBus.ts      WebAudio 引擎 / 风 / 海浪 / 提示音
public/assets/             HDRI、贴图、模型、界面图
tools/save-shot.py         开发期截图留档工具（不参与运行）
docs/screenshots/          验收截图
```

# Sema Demo

用 [Sema Code](https://github.com/midea-ai/sema-code-core) **一句输入、从零生成**的项目演示集。

在线访问：<https://zhoujie1113.github.io/sema-demo/>

在展示站里，每张卡片都是项目实时运行的缩略画面，点击即可全屏交互，并查看生成它所用的**需求提示词、对话模型、生图模型和本地启动命令**。所有项目都是纯静态页面，可在浏览器中直接运行。

## 项目列表

| 项目 | 说明 | 对话模型 | 生图模型 | 生成用时 |
| --- | --- | --- | --- | --- |
| [森林遗迹](forest-ruins/) | 俯视角绘本风格的网页推箱子解谜游戏，5 关可解，支持撤销、重置、进度保存 | deepseek-v4.1-flash-1017 | gpt-image-2.5-flare | 约 20 分钟 |
| [长征·征途](long-march/) | 面向历史课堂的长征路线交互地图，总览、阶段、节点详情与教师演示模式 | deepseek-v4.1-flash-1017 | gpt-image-2.5-flare | 约 51 分钟 |
| [落日海岸](gpt6-demo/) | 浏览器实时 3D 驾驶 demo，写实向海滨街区，Three.js，送货任务与自由驾驶 | deepseek-v4.1-flash-1017 | gpt-image-2.5-flare | 约 47 分钟 |

每个项目目录自包含：源码、生成的素材，以及一份 `sema.yaml` 记录生成信息。

## 本地预览展示站

```bash
git clone https://github.com/zhoujie1113/sema-demo.git
cd sema-demo
python3 -m http.server 8000
```

打开 <http://127.0.0.1:8000/>。展示站只依赖 CDN 上的 js-yaml 解析 `sema.yaml`，没有构建步骤。单个项目的启动命令见各自目录下的 `sema.yaml` 或 README。

## 提交你的 Demo

欢迎把自己用 Sema Code 生成的项目加进来。要求：可在浏览器直接运行，入口默认为 `index.html`。使用 Vite 等构建工具的项目**不需要提交构建产物**：只要 `package.json` 里有 `build` 脚本，GitHub Actions 会在部署时自动执行 `npm ci && npm run build`；用 `entry` 指向产物入口（如 `dist/index.html`），并把产物目录加进根目录 `.gitignore`，同时确保构建配置里资源为相对路径（Vite 设 `base: "./"`）。

1. 在仓库根目录新建一个目录（英文小写、短横线分隔，例如 `my-demo`），把项目的完整源码和素材放进去。
2. 在该目录下新建 `sema.yaml`：

   ```yaml
   name: 项目名称
   description: 一两句话介绍项目
   author: 你的 GitHub 用户名
   tags: [标签1, 标签2]
   cover: assets/cover.jpg          # 可选，填写后卡片用此图代替实时预览画面
   entry: index.html                # 可选，默认 index.html

   model: deepseek-v4.1-flash-1017  # 生成时使用的对话模型
   image_model: gpt-image-2.5-flare # 生成时使用的生图模型，没有可留空
   duration: 约 20 分钟              # 从零生成到可交付的用时

   run: python3 -m http.server 8080 # 在项目目录下的本地启动命令
   url: http://127.0.0.1:8080/      # 启动后访问地址

   prompt: |
     生成本项目所用的完整需求提示词……
   ```

3. 把目录名加到根目录 `projects.json` 列表的最前面（首页“最新”排序按这个顺序）。
4. 提 Pull Request。合并后 GitHub Actions 会自动构建并发布到 GitHub Pages（工作流见 `.github/workflows/pages.yml`）。

注意：项目内所有资源请使用相对路径，不要依赖本机绝对路径或需要后端的接口；单个大文件尽量控制在 10 MB 以内。

## SemaWork：在浏览器里生成你的项目

**SemaWork** 是 Sema Code 随仓库提供的本地 Web 界面（位于 [`webui/`](https://github.com/midea-ai/sema-code-core/tree/main/webui) 目录）：在浏览器里与 Agent 对话，驱动其对本地目录读写文件、执行命令，并可视化展示整个过程。本仓库中的 Demo 都是在 SemaWork 里输入一段需求提示词后生成的。

<img src="https://github.com/midea-ai/sema-code-core/releases/download/docs-assets/webui.gif" alt="SemaWork" />

### 功能亮点

- **对话与工具可视化** — 流式回复、工具调用卡片、权限应答、待办列表
- **代码审阅** — 查看会话中的文件改动 diff
- **右侧面板** — 终端、内嵌浏览器、文件预览多标签并存
- **任务面板** — 定时任务管理、快问旁路问答、子代理运行详情
- **项目 / 会话管理** — 项目与独立会话两级组织，支持分支到新聊天、刷新与断线恢复

### 启动方式

**npm 安装（推荐）**，要求 Node ≥ 20.18.1：

```bash
npm i -g sema-code-ui
sema-ui                 # 启动服务并打开浏览器
```

参数：`--port 3210` 改端口，`--no-open` 不自动打开浏览器。打开后在「设置」添加模型与 API Key 即可对话。`sema-ui status` / `open` / `stop` 子命令用于管理实例。

**从源码运行**：

```bash
# 1. 克隆并构建 sema-core
git clone https://github.com/midea-ai/sema-code-core.git
cd sema-code-core && npm install && npm run build

# 2. 构建并启动 SemaWork
cd webui && npm install && npm run build
npm start -- --open
```

启动后用浏览器打开终端打印的地址（`http://127.0.0.1:3210/?token=…`）。

**桌面版**：直接下载安装包使用：<https://github.com/midea-ai/sema-code-core/releases/tag/SemaWork>。

### 用 SemaWork 生成一个 Demo

1. 启动 SemaWork，在「设置」中配置对话模型（以及生图模型，如需要）。
2. 新建项目，指向一个空目录。
3. 在对话框中输入完整的需求提示词（可参考各项目 `sema.yaml` 中的 `prompt`），让 Agent 从零生成。
4. 生成完成后，在右侧内嵌浏览器中验证效果，再按上文「提交你的 Demo」加入本仓库。

更多文档见 [Sema Code 快速开始](https://github.com/midea-ai/sema-code-core)。

## 许可

本仓库展示站代码以 MIT 许可发布；各 Demo 目录内的内容版权归其作者所有，提交即视为同意公开展示。

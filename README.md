# 🎬 Video Prompt Builder v2

为 **MiniMax 海螺 2.3 (Hailuo 2.3)** 视频生成设计的可视化提示词工坊。

包含两个模式：
- **⚡ 单分镜 Builder**（`/`） — 6 字段结构化表单 + 实时 prompt 预览 + 一键出片
- **🎞️ 分镜工作流**（`/project`） — 完整短片制作：剧本 → 角色 → 分镜 → AI 定妆照 → 候选图 → i2v 视频 → ffmpeg 拼接成片

## ✨ 核心特性

### 单分镜 Builder
- 6 字段结构化表单（主体/场景/动作/镜头/风格/运镜）
- 200+ 可选项（人物/动物/物体、40+ 室内外/幻想场景、50+ 动作、35 艺术风格、15 运镜指令）
- 10 套精选预设
- 实时 prompt 预览
- Hailuo 2.3 专用运镜指令 `[推进]/[拉远]/[跟拍]` 等

### 分镜工作流（C 方案：角色锁定 + 分镜 + 拼接）
- **Step 1 剧本** — 项目信息、宽高比（16:9/9:16/1:1/4:3/3:2），**带 AI 头脑风暴**：给 1-3 句话创意，AI 扩写出 3-10 个差异化方向，挑一个用
- **Step 2 角色** — image-01 自动生成定妆照候选，挑选正式参考图，**支持主体参考锁定**
- **Step 3 分镜** — 多分镜管理，每个分镜 3 张候选图，选定后一键 i2v 渲染
- **Step 4 渲染导出** — ffmpeg 拼接所有分镜，6 种转场可选（fade/wipe/slide/circlecrop/none）
- **跨分镜角色一致性**：i2v 用首帧锁定角色外观，主体参考模式（`S2V-01`）额外锁定面部特征
- **省钱**：图比视频便宜 10 倍，AI 抽卡先看图再决定要不要花视频额度

### 🧠 AI 头脑风暴（v3 新增）
- 输入 1-3 句话的简单创意（比如"深夜街角的孤独感"）
- 调 minimax M2.7 扩写 3-10 个**真正差异化**的方向（情绪/视角/视觉/结构全方位不同）
- 每个方向有：标题、一句话核心创意、200-350 字完整剧本、英文风格关键词、中文情绪标签、短片结构、节奏
- 选中后自动填到项目剧本字段
- 可选指定"风格倾向"（如温暖治愈/赛博朋克/国风）

## 📦 安装

需要 Python 3.9+ 和 ffmpeg。

```bash
# macOS
brew install ffmpeg
cd video-prompt-builder
chmod +x run.sh
./run.sh
```

手动安装：
```bash
cd video-prompt-builder
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

## ⚙️ 配置 API Key

启动后浏览器打开 `http://localhost:8765`，点击右上角"设置"按钮，把 `platform.minimaxi.com` 用户中心的 API key 粘进去。

也可以直接编辑 `config.json`：
```json
{"api_key": "eyJhbGciOi..."}
```

或用环境变量（优先级最高）：
```bash
export MINIMAX_VIDEO_KEY="eyJhbGciOi..."
python server.py
```

## 🚀 启动

```bash
./run.sh
# 或：
cd video-prompt-builder && source .venv/bin/activate && python server.py
```

服务起在 `http://localhost:8765`：
- `http://localhost:8765/` — 单分镜 Prompt Builder
- `http://localhost:8765/project` — 分镜工作流

## 📂 项目结构

```
video-prompt-builder/
├── server.py              ← FastAPI 后端
├── config.json            ← API key 配置
├── requirements.txt
├── run.sh                 ← 一键启动
├── README.md
├── data/                  ← 预设数据 + 项目存储
│   ├── subjects.json      ← 30+ 主体
│   ├── scenes.json        ← 41 场景
│   ├── actions.json       ← 56 动作
│   ├── cameras.json       ← 镜头（5 组）
│   ├── styles.json        ← 35 艺术风格 + 色调/光线
│   ├── motions.json       ← 15 运镜指令
│   ├── atmospheres.json   ← 26 氛围关键词
│   ├── presets.json       ← 10 套精选预设
│   ├── history.json       ← 单分镜 Builder 历史
│   └── projects/          ← 分镜工作流的项目数据
│       └── {project_id}/
│           ├── project.json
│           ├── characters/   ← 角色定妆照
│           ├── storyboards/  ← 分镜候选图 + 视频
│           └── output.mp4    ← 最终成片
├── static/
│   ├── index.html         ← 单分镜 Builder
│   ├── project.html       ← 分镜工作流
│   ├── style.css
│   ├── app.js             ← Builder 逻辑
│   └── project-app.js     ← Workflow 逻辑
└── outputs/               ← 单分镜 Builder 生成的视频
```

## 🎯 分镜工作流（重点）

### 工作流示意
```
[剧本/项目设置]
       ↓
[角色设计]  → image-01 生成 3 张定妆照候选 → 选 1 张
       ↓
[分镜设计]  → 为每个分镜写简单 prompt
              → image-01 生成 3 张候选图
              → 选 1 张作为该分镜"定稿图"
       ↓
[分镜渲染]  → 用 i2v（图生视频）把定稿图扩展成 6-10s 视频
              → 可选：开"主体参考"模式锁定角色（S2V-01）
       ↓
[拼接成片]  → ffmpeg concat 所有分镜视频
              → 6 种转场可选（淡入淡出/擦除/滑动/圆形展开/无）
       ↓
[导出]      → 下载 output.mp4
```

### 关键概念

#### 角色定妆照
- 自动用 `image-01` 模型生成 3 张候选（1024×1024）
- 用户挑选一张作为正式参考图
- 后续所有分镜如果开了"主体参考"，都会用这张图锁定角色外观

#### 分镜候选图
- 同样用 `image-01` 模型生成
- 用户挑选 1 张作为该分镜"定稿图"
- 这张图会作为 i2v 视频生成的首帧

#### 视频生成模式

| 模式 | 模型 | 用途 |
|---|---|---|
| i2v（图生视频） | `MiniMax-Hailuo-2.3` | 通用，从首帧扩展出 6-10s 视频 |
| 主体参考（subject reference） | `S2V-01` | 跨分镜保持角色面部一致 |

两种模式不能同时用。**推荐默认 i2v**（画质更好），只有需要严格角色一致时用主体参考。

#### ffmpeg 转场
- `fade`（默认，淡入淡出，0.5s）
- `wipeleft/wiperight`（左/右擦除）
- `slideup/slidedown`（上/下滑动）
- `circlecrop`（圆形展开）
- `none`（无转场，直接 concat）

## 💰 额度估算

| 步骤 | API | 单价（估） |
|---|---|---|
| 角色定妆照 | image-01 ×3 | ~0.3 元 |
| 分镜候选图 | image-01 ×3 | ~0.3 元/分镜 |
| 分镜视频 | Hailuo 2.3 (768P 6s) | ~1 元/分镜 |
| 主体参考视频 | S2V-01 (6s) | ~1.5 元/分镜 |

一个 5 分镜的短片大约 8-10 元（不算下载的图）。

## 🔧 自定义扩展

### 添加新预设
编辑 `data/presets.json`。

### 添加新主体类型
- `data/subjects.json` 加新对象
- `static/app.js` 的 `SUBJECT_TRANSLATIONS` 加英文翻译

### 添加新风格
编辑 `data/styles.json`。

## 🐛 故障排查

| 问题 | 解决 |
|---|---|
| `insufficient quota` | 充值或换 key |
| 视频一直 Preparing | 等待 1-3 分钟；超时可以重试 |
| 提示"未配置 ffmpeg" | `brew install ffmpeg` |
| 端口 8765 被占 | `PORT=8888 python server.py` |
| 主体参考图不符合预期 | 主体参考模式对面部特写要求高，参考图短边要 >300px |
| Python 依赖装不上 | `pip install -U pip` 后重试 |

## 🆕 v1 → v2 升级

v1 的 6 字段表单 Builder 完全保留，`/` 路径就是 v1 的入口。
v2 在 `/project` 路径新增分镜工作流，调用 `image-01`（文生图）+ `Hailuo-2.3`（i2v）+ `S2V-01`（主体参考）三个模型。

## 📄 License

MIT

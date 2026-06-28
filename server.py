#!/usr/bin/env python3
"""
video-prompt-builder 后端 v2
- 保留 v1 的单分镜 prompt builder 端点
- 新增项目工作流：项目 → 角色 → 分镜 → 候选图 → 渲染 → 拼接成片
"""
import asyncio
import json
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import logging
import re

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.staticfiles import StaticFiles as StarletteStaticFiles


class NoCacheStaticFiles(StarletteStaticFiles):
    """StaticFiles but always no-cache（开发用，避免改完 JS 用户看不到）"""
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response is not None:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

# -------------------- 路径配置 --------------------
ROOT = Path(__file__).parent.resolve()
DATA_DIR = ROOT / "data"
STATIC_DIR = ROOT / "static"
OUTPUTS_DIR = ROOT / "outputs"
PROJECTS_DIR = DATA_DIR / "projects"
CONFIG_PATH = ROOT / "config.json"
HISTORY_PATH = DATA_DIR / "history.json"
TASKS_PATH = DATA_DIR / "tasks.json"

for d in (OUTPUTS_DIR, DATA_DIR, PROJECTS_DIR):
    d.mkdir(exist_ok=True)

API_BASE = "https://api.minimaxi.com"
API_KEY_ENV = "MINIMAX_VIDEO_KEY"

# -------------------- 配置 --------------------
def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    return {}


def save_config(cfg: dict):
    atomic_write_json(CONFIG_PATH, cfg)


def atomic_write_json(path: Path, data: Any):
    """原子写 JSON：先写 .tmp 再 os.replace，避免崩溃时留下半截文件。"""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def get_api_key() -> str:
    return os.environ.get(API_KEY_ENV) or load_config().get("api_key", "")


def load_json(path: Path, default: Any = None) -> Any:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default if default is not None else {}


# -------------------- Prompt 组装（v1 沿用） --------------------
SUBJECT_TRANSLATIONS = {
    "child_boy": "a young boy", "child_girl": "a young girl", "teen_boy": "a teenage boy",
    "teen_girl": "a teenage girl", "man": "a man", "woman": "a woman", "elder_man": "an elderly man",
    "elder_woman": "an elderly woman", "baby": "a baby",
    "cat": "a cat", "dog": "a dog", "rabbit": "a rabbit", "bird": "a bird", "fox": "a fox",
    "deer": "a deer", "horse": "a horse", "tiger": "a tiger", "wolf": "a wolf", "panda": "a panda",
    "dragon": "a dragon", "phoenix": "a phoenix",
    "car": "a car", "building": "a building", "flower": "a flower", "book": "a book", "cup": "a cup",
    "sword": "a sword", "lantern": "a lantern", "tree": "a tree", "moon": "the moon", "star": "a star",
}


def render_subject(s):
    if not s:
        return ""
    parts = []
    base = SUBJECT_TRANSLATIONS.get(s.get("type", ""), s.get("custom_type", ""))
    if not base:
        return ""
    parts.append(base)
    n = s.get("number", 1)
    if n > 1:
        if base.endswith("y"):
            parts = [base[:-1] + "ies"]
        elif base.endswith(("s", "x", "ch", "sh")):
            parts = [base + "es"]
        else:
            parts = [base + "s"]
        parts.append(f"({n} of them)")
    desc = s.get("description", "").strip()
    if desc:
        if not re.match(r"^(with|wearing|holding|in|at)", desc):
            desc = f"with {desc}"
        parts.append(desc)
    return ", ".join(parts)


def render_scene(sc):
    if not sc:
        return ""
    parts = []
    location = sc.get("location", "").strip()
    time_of_day = sc.get("time", "").strip()
    details = sc.get("details", "").strip()
    weather = sc.get("weather", "").strip()
    light_dir = sc.get("light_dir", "").strip()
    if time_of_day and location:
        parts.append(f"{time_of_day} {location}")
    elif time_of_day:
        parts.append(time_of_day)
    elif location:
        parts.append(location)
    if details:
        parts.append(details)
    if weather:
        parts.append(weather)
    if light_dir:
        parts.append(light_dir)
    return ", ".join(parts)


def render_action(a):
    if not a:
        return ""
    timeline = a.get("timeline", [])
    if not timeline:
        return ""
    timeline = sorted(timeline, key=lambda x: x.get("time", "0"))
    actions = [t.get("action", "").strip() for t in timeline if t.get("action", "").strip()]
    if not actions:
        return ""
    result = actions[0]
    for i, act in enumerate(actions[1:], 1):
        result += (f", then {act}" if i == len(actions) - 1 else f", {act}")
    expr = a.get("expression", "").strip()
    if expr:
        tail = result[-80:].lower()
        if "expression" not in tail and "facial" not in tail:
            result += f", {expr} expression"
    return result


def render_camera(c):
    if not c:
        return ""
    parts = []
    if c.get("shot"): parts.append(c["shot"])
    if c.get("movement") and c["movement"] != "fixed": parts.append(c["movement"])
    if c.get("angle"): parts.append(c["angle"])
    if c.get("focal"): parts.append(c["focal"])
    if c.get("depth"): parts.append(c["depth"])
    return ", ".join(parts)


def render_style(st):
    if not st:
        return ""
    parts = list(st.get("anchors", []))
    if st.get("tone"): parts.append(st["tone"])
    if st.get("saturation"): parts.append(st["saturation"])
    if st.get("lighting"): parts.append(st["lighting"])
    if st.get("moods"): parts.append(", ".join(st["moods"]))
    return ", ".join(parts)


def render_motion(cmds):
    if not cmds:
        return ""
    groups = {}
    for c in cmds:
        g = c.get("group", 0)
        groups.setdefault(g, []).append(c.get("code", ""))
    keys = sorted(groups.keys())
    if len(keys) == 1:
        return f"[{groups[keys[0]][0] if len(groups[keys[0]]) == 1 else ', '.join(groups[keys[0]])}]"
    return ", then ".join(f"[{', '.join(groups[k])}]" for k in keys)


def assemble_prompt(data: dict) -> str:
    sections = []
    subj = render_subject(data.get("subject", {}))
    if subj: sections.append(subj)
    scene = render_scene(data.get("scene", {}))
    if scene: sections.append(f"in {scene}")
    action = render_action(data.get("action", {}))
    if action: sections.append(action)
    camera = render_camera(data.get("camera", {}))
    if camera: sections.append(camera)
    style = render_style(data.get("style", {}))
    if style: sections.append(f"{style} style")
    motion = render_motion(data.get("motion", []))
    if motion: sections.append(motion)
    extra = data.get("extra", "").strip()
    if extra: sections.append(extra)
    return ", ".join(sections)




# -------------------- 数据模型 --------------------
class GenerateRequest(BaseModel):
    subject: dict = Field(default_factory=dict)
    scene: dict = Field(default_factory=dict)
    action: dict = Field(default_factory=dict)
    camera: dict = Field(default_factory=dict)
    style: dict = Field(default_factory=dict)
    motion: list = Field(default_factory=list)
    extra: str = ""
    duration: int = 6
    resolution: str = "768P"
    preset_name: str = ""
    save_to_history: bool = True


class SetKeyRequest(BaseModel):
    api_key: str


class ProjectCreate(BaseModel):
    name: str
    script: str = ""
    aspect_ratio: str = "16:9"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    script: Optional[str] = None
    aspect_ratio: Optional[str] = None


class StoryboardCreate(BaseModel):
    name: str = ""
    script: str = ""
    prompt_data: dict = Field(default_factory=dict)
    # 角色 id 字符串表示锁定；None / "" / False 都视为未锁定。后端用 `if not char_id` 统一判空。
    use_subject_reference: Optional[object] = None
    candidate_count: int = 3


class StoryboardUpdate(BaseModel):
    name: Optional[str] = None
    script: Optional[str] = None
    prompt_data: Optional[dict] = None
    # 角色 id / None / "" / False：见 StoryboardCreate。
    use_subject_reference: Optional[object] = None
    duration: Optional[int] = None
    resolution: Optional[str] = None
    selected: Optional[str] = None


class StoryboardSelect(BaseModel):
    candidate_index: int  # 0-based


class StoryboardCandidatesRequest(BaseModel):
    n: int = 3
    # 角色 id / None / "" / False：见 StoryboardCreate。
    use_subject_reference: Optional[object] = None


class GridBundleRequest(BaseModel):
    duration: int = 10  # 网格视频总时长（Hailuo 2.3 最大 10s）
    resolution: str = "768P"


class ImageGenerateRequest(BaseModel):
    prompt: str
    model: str = "image-01"
    aspect_ratio: str = "16:9"
    n: int = 1
    prompt_optimizer: bool = True


class BrainstormRequest(BaseModel):
    brief: str
    count: int = 8
    style_hint: str = ""  # 用户倾向风格，可选
    aspect_ratio: str = "16:9"  # 项目宽高比


class CharacterAIGenerateRequest(BaseModel):
    script: str  # 剧本文本；可空（前端会用项目里的 script 兜底）
    style_hint: str = ""  # 可选风格倾向


class CharacterAIRewriteRequest(BaseModel):
    name: str = ""  # 当前角色名（仅用于上下文，可空）
    description: str  # 当前描述
    script: str = ""  # 剧本上下文（让 AI 更懂角色定位）
    count: int = 3  # 候选版本数


class CharacterTurnaroundRequest(BaseModel):
    description: str  # 用户当前描述；可空（用项目里的）
    style_hint: str = ""  # 可选风格倾向
    n: int = 3  # 候选数


class StoryboardAIGenerateRequest(BaseModel):
    script: str  # 剧本文本；可空（前端会用项目里的 script 兜底）
    style_hint: str = ""  # 可选风格倾向
    target_count: int = 0  # 期望分镜数；0 = 让 LLM 自己决定（3-8 个）


# -------------------- 项目管理 --------------------
def project_path(pid: str) -> Path:
    return PROJECTS_DIR / pid


def project_json_path(pid: str) -> Path:
    return project_path(pid) / "project.json"


def characters_dir(pid: str) -> Path:
    p = project_path(pid) / "characters"
    p.mkdir(parents=True, exist_ok=True)
    return p


def storyboards_dir(pid: str) -> Path:
    p = project_path(pid) / "storyboards"
    p.mkdir(parents=True, exist_ok=True)
    return p


def storyboard_dir(pid: str, sid: str) -> Path:
    p = storyboards_dir(pid) / sid
    p.mkdir(parents=True, exist_ok=True)
    return p


def load_project(pid: str) -> dict:
    p = project_json_path(pid)
    if not p.exists():
        raise HTTPException(404, "项目不存在")
    data = json.loads(p.read_text(encoding="utf-8"))
    data.setdefault("grid_bundles", [])  # back-compat for old projects
    return data


def save_project(project: dict):
    pid = project["id"]
    project_path(pid).mkdir(parents=True, exist_ok=True)
    project["updated_at"] = datetime.now().isoformat()
    atomic_write_json(project_json_path(pid), project)


# -------------------- 并发控制 --------------------
# 单进程内 per-project asyncio.Lock，避免两个请求 read-modify-write 同一个 project.json 时丢更新。
_project_locks: dict = {}
_history_lock = asyncio.Lock()


def get_project_lock(pid: str) -> asyncio.Lock:
    if pid not in _project_locks:
        _project_locks[pid] = asyncio.Lock()
    return _project_locks[pid]


async def update_project(pid: str, mutator):
    """带锁的 read-modify-write：mutator(project) -> Any（通常返回要发给客户端的数据）。"""
    lock = get_project_lock(pid)
    async with lock:
        project = load_project(pid)
        result = mutator(project)
        save_project(project)
        return result


def list_projects() -> list:
    out = []
    for d in sorted(PROJECTS_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if d.is_dir():
            pj = project_json_path(str(d.name))
            if pj.exists():
                d_data = json.loads(pj.read_text(encoding="utf-8"))
                out.append({
                    "id": d_data.get("id"),
                    "name": d_data.get("name"),
                    "script": d_data.get("script", "")[:100],
                    "aspect_ratio": d_data.get("aspect_ratio"),
                    "character_count": len(d_data.get("characters", [])),
                    "storyboard_count": len(d_data.get("storyboards", [])),
                    "created_at": d_data.get("created_at"),
                    "updated_at": d_data.get("updated_at"),
                })
    return out


# -------------------- MiniMax API 客户端 --------------------
async def minimax_image_generate(prompt: str, model: str, aspect_ratio: str, n: int, optimizer: bool, api_key: str, **kwargs) -> list:
    """文生图，返回 image_urls 列表。
    可选 kwargs:
      - reference_image: list[data_url]（如果平台 image-01 支持该字段，会透传）
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "response_format": "url",
        "n": n,
        "prompt_optimizer": optimizer,
    }
    if kwargs.get("reference_image"):
        payload["reference_image"] = kwargs["reference_image"]
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{API_BASE}/v1/image_generation",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        data = r.json()
        if data.get("base_resp", {}).get("status_code") != 0:
            raise HTTPException(400, f"图片生成失败: {data.get('base_resp', {}).get('status_msg', '未知')}")
        return data.get("data", {}).get("image_urls", [])


async def minimax_video_create(prompt: str, duration: int, resolution: str, api_key: str, **kwargs) -> str:
    """文生视频，返回 task_id"""
    # Hailuo 2.3 只支持 6s / 10s 两档，UI 自由输入到这里被截断。
    # ≤6s 按 6s 算（最低档），>6s 按 10s 算。S2V-01 不传 duration。
    if kwargs.get("model", "MiniMax-Hailuo-2.3") == "MiniMax-Hailuo-2.3" and "subject_reference" not in kwargs:
        try:
            d = int(duration)
        except (TypeError, ValueError):
            d = 6
        duration = 6 if d <= 6 else 10
    payload = {
        "model": kwargs.get("model", "MiniMax-Hailuo-2.3"),
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "prompt_optimizer": True,
    }
    # 可选：first_frame_image（图生视频）
    if "first_frame_image" in kwargs:
        payload["first_frame_image"] = kwargs["first_frame_image"]
    # 可选：subject_reference（主体参考）
    if "subject_reference" in kwargs:
        payload["subject_reference"] = kwargs["subject_reference"]
        # 主体参考用专用模型
        payload["model"] = "S2V-01"
        # 删除 duration/resolution 限制（S2V-01 不支持这些参数）
        payload.pop("duration", None)
        payload.pop("resolution", None)
        payload.pop("prompt_optimizer", None)
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{API_BASE}/v1/video_generation",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        data = r.json()
        if data.get("base_resp", {}).get("status_code") != 0:
            raise HTTPException(400, f"视频任务创建失败: {data.get('base_resp', {}).get('status_msg', '未知')} - 完整: {data}")
        return data["task_id"]


async def minimax_poll(task_id: str, api_key: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{API_BASE}/v1/query/video_generation",
            params={"task_id": task_id},
            headers={"Authorization": f"Bearer {api_key}"},
        )
        return r.json()


async def minimax_get_download_url(file_id: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{API_BASE}/v1/files/retrieve",
            params={"file_id": file_id},
            headers={"Authorization": f"Bearer {api_key}"},
        )
        data = r.json()
        if data.get("base_resp", {}).get("status_code") != 0:
            raise HTTPException(400, f"获取文件失败: {data}")
        return data["file"]["download_url"]


async def download_to_file(url: str, dest: Path):
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as client:
        async with client.stream("GET", url) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    f.write(chunk)


async def download_image_to_file(url: str, dest: Path):
    await download_to_file(url, dest)


# -------------------- ffmpeg 拼接 --------------------
# 宽高比 → 最终输出画布尺寸 (w, h)。所有 ffmpeg filter / grid 拼图都按这个对齐。
_ASPECT_CANVAS = {
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "1:1":  (960, 960),
    "4:3":  (1024, 768),
    "3:2":  (1152, 768),
}

def aspect_to_canvas(aspect_ratio: str) -> tuple:
    return _ASPECT_CANVAS.get(aspect_ratio or "16:9", (1280, 720))


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None

def has_ffprobe() -> bool:
    return shutil.which("ffprobe") is not None


def concat_videos(video_paths: list, output_path: Path, transition: str = "fade",
                    transition_duration: float = 0.5, canvas: tuple = (1280, 720)):
    """拼接多个视频。canvas 是最终输出画布尺寸 (w, h)，与项目 aspect_ratio 对齐。

    简单方案：直接 concat（无转场）
    高级方案：两两之间加 crossfade 转场
    """
    if not video_paths:
        raise ValueError("没有视频可拼接")

    if len(video_paths) == 1 or transition == "none":
        # 直接拼接或复制
        with open(str(output_path.with_suffix(".list.txt")), "w") as f:
            for vp in video_paths:
                p = Path(vp).resolve()
                f.write(f"file '{p}'\n")
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(output_path.with_suffix(".list.txt")),
            "-c", "copy", str(output_path)
        ], check=True, capture_output=True)
        output_path.with_suffix(".list.txt").unlink(missing_ok=True)
        return

    # 带转场拼接
    # 先获取每个视频时长
    durations = []
    for vp in video_paths:
        result = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(Path(vp).resolve())
        ], capture_output=True, text=True, check=True)
        durations.append(float(result.stdout.strip()))

    # 构造 filter_complex: 每个视频 fade in，连接处 crossfade
    inputs = []
    for vp in video_paths:
        inputs.extend(["-i", str(Path(vp).resolve())])

    # filter: scale + fade in/out + acrossfade
    n = len(video_paths)
    canvas_w, canvas_h = canvas
    filter_parts = []
    for i in range(n):
        filter_parts.append(
            f"[{i}:v]scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=decrease,"
            f"pad={canvas_w}:{canvas_h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fade=t=in:st=0:d=0.3[v{i}]"
        )

    # 链式 acrossfade
    if n == 1:
        # 单个视频只需淡入
        cmd = ["ffmpeg", "-y"] + inputs + [
            "-filter_complex", ",".join(filter_parts),
            "-map", "[v0]", "-c:v", "libx264", "-preset", "fast",
            str(output_path)
        ]
    else:
        # 链式：v0 + v1 -> xfade 0,v1+v2 -> ...
        chain = filter_parts[0]
        last_label = "v0"
        for i in range(1, n):
            offset = sum(durations[:i]) - transition_duration * i
            new_label = f"x{i}" if i < n - 1 else "outv"
            chain += ";" + f"[{last_label}][v{i}]xfade=transition={transition}:duration={transition_duration}:offset={offset}[{new_label}]"
            last_label = new_label
        cmd = ["ffmpeg", "-y"] + inputs + [
            "-filter_complex", chain,
            "-map", f"[{last_label}]", "-c:v", "libx264", "-preset", "fast",
            str(output_path)
        ]

    subprocess.run(cmd, check=True, capture_output=True)


def compose_grid_image(image_paths: list, out_path: Path, cols: int = 3, rows: int = 3,
                       canvas_w: int = 1280, canvas_h: int = 720, gap: int = 8, bg=(0, 0, 0)) -> int:
    """把多张图片拼成 rows*cols 网格。canvas_w/canvas_h 默认 1280x720，
    9:16 竖屏项目可由调用方传入 720x1280 以匹配最终视频。"""
    """把多张图片拼成 rows×cols 网格，保存为 out_path。返回实际填充的图数（剩余格子填空）。"""
    from PIL import Image
    canvas = Image.new("RGB", (canvas_w, canvas_h), bg)
    cell_w = (canvas_w - gap * (cols + 1)) // cols
    cell_h = (canvas_h - gap * (rows + 1)) // rows
    used = 0
    for i, p in enumerate(image_paths[:cols * rows]):
        try:
            img = Image.open(p).convert("RGB")
            img.thumbnail((cell_w, cell_h), Image.LANCZOS)
            cx = (i % cols) * (cell_w + gap) + gap + (cell_w - img.width) // 2
            cy = (i // cols) * (cell_h + gap) + gap + (cell_h - img.height) // 2
            canvas.paste(img, (cx, cy))
            used += 1
        except Exception as e:
            print(f"[grid] skip {p}: {e}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, "JPEG", quality=92)
    return used


# -------------------- FastAPI App --------------------
app = FastAPI(title="Video Prompt Builder v2", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/project")
async def project_page():
    return FileResponse(STATIC_DIR / "project.html")


# ============== v1: 通用 prompt builder 端点 ==============
@app.get("/api/options")
async def get_options():
    return {
        "subjects": load_json(DATA_DIR / "subjects.json", {}),
        "actions": load_json(DATA_DIR / "actions.json", []),
        "scenes": load_json(DATA_DIR / "scenes.json", {}),
        "cameras": load_json(DATA_DIR / "cameras.json", {}),
        "styles": load_json(DATA_DIR / "styles.json", {}),
        "motions": load_json(DATA_DIR / "motions.json", []),
        "atmospheres": load_json(DATA_DIR / "atmospheres.json", []),
        "presets": load_json(DATA_DIR / "presets.json", []),
    }


@app.post("/api/prompt/preview")
async def preview_prompt(data: GenerateRequest):
    prompt = assemble_prompt(data.dict())
    return {"prompt": prompt, "length": len(prompt)}


@app.post("/api/generate")
async def generate_v1(data: GenerateRequest):
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    prompt = assemble_prompt(data.dict())
    if not prompt.strip():
        raise HTTPException(400, "Prompt 为空")
    if len(prompt) > 2000:
        raise HTTPException(400, f"Prompt 过长（{len(prompt)}/2000）")
    task_id = await minimax_video_create(prompt, data.duration, data.resolution, api_key)

    tasks = load_json(TASKS_PATH, {})
    tasks[task_id] = {
        "task_id": task_id, "prompt": prompt, "duration": data.duration,
        "resolution": data.resolution, "status": "Preparing", "created_at": datetime.now().isoformat(),
    }
    atomic_write_json(TASKS_PATH, tasks)
    return {"task_id": task_id, "prompt": prompt}


@app.post("/api/status/{task_id}/wait")
async def wait_status(task_id: str):
    """v1 用：服务端轮询直到完成，下载视频"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    # 读 tasks.json 拿真实参数（之前是死代码，现在用来填 history 的 duration/resolution/prompt）
    task_meta = load_json(TASKS_PATH, {}).get(task_id) or {}
    start = time.time()
    while time.time() - start < 600:
        result = await minimax_poll(task_id, api_key)
        status = result.get("status", "Fail")
        if status == "Success":
            file_id = result.get("file_id", "")
            if file_id:
                url = await minimax_get_download_url(file_id, api_key)
                filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{task_id}.mp4"
                dest = OUTPUTS_DIR / filename
                await download_to_file(url, dest)
                # 写历史（带锁，避免两个 v1 请求并发 read-modify-write 丢记录）
                async with _history_lock:
                    history = load_json(HISTORY_PATH, [])
                    history.insert(0, {
                        "id": str(uuid.uuid4())[:8], "task_id": task_id,
                        "prompt": task_meta.get("prompt") or result.get("prompt", ""),
                        "duration": int(task_meta.get("duration") or 6),
                        "resolution": task_meta.get("resolution") or "768P",
                        "local_file": filename,
                        "download_url": f"/outputs/{filename}",
                        "created_at": datetime.now().isoformat(),
                    })
                    atomic_write_json(HISTORY_PATH, history[:200])
                return {"task_id": task_id, "status": "Success", "file_id": file_id, "local_file": filename, "download_url": f"/outputs/{filename}"}
        elif status == "Fail":
            return {"task_id": task_id, "status": "Fail"}
        await asyncio.sleep(8)
    raise HTTPException(504, "轮询超时")


@app.get("/api/history")
async def get_history():
    return load_json(HISTORY_PATH, [])


@app.delete("/api/history/{hid}")
async def delete_history(hid: str):
    async with _history_lock:
        history = load_json(HISTORY_PATH, [])
        history = [h for h in history if h.get("id") != hid]
        atomic_write_json(HISTORY_PATH, history)
    return {"ok": True}


@app.get("/api/config")
async def get_config():
    key = get_api_key()
    return {
        "has_key": bool(key),
        "key_source": "env" if os.environ.get(API_KEY_ENV) else ("config" if key else "none"),
        "key_preview": (key[:7] + "..." + key[-4:]) if key and len(key) > 11 else "",
        "ffmpeg_available": has_ffmpeg(),
        "ffprobe_available": has_ffprobe(),
    }


@app.post("/api/config/key")
async def set_key(req: SetKeyRequest):
    cfg = load_config()
    cfg["api_key"] = req.api_key.strip()
    save_config(cfg)
    return {"ok": True}


# ============== v2: 项目工作流 ==============
@app.get("/api/projects")
async def api_list_projects():
    return list_projects()


@app.post("/api/projects")
async def api_create_project(req: ProjectCreate):
    pid = str(uuid.uuid4())[:8]
    project = {
        "id": pid,
        "name": req.name,
        "script": req.script,
        "aspect_ratio": req.aspect_ratio,
        "characters": [],
        "storyboards": [],
        "output_video": "",
        "grid_bundles": [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    save_project(project)
    return project


@app.get("/api/projects/{pid}")
async def api_get_project(pid: str):
    return load_project(pid)


@app.put("/api/projects/{pid}")
async def api_update_project(pid: str, req: ProjectUpdate):
    project = load_project(pid)
    for k, v in req.dict(exclude_none=True).items():
        project[k] = v
    save_project(project)
    return project


@app.delete("/api/projects/{pid}")
async def api_delete_project(pid: str):
    p = project_path(pid)
    if p.exists():
        shutil.rmtree(p)
    return {"ok": True}


class BatchDeleteRequest(BaseModel):
    ids: list  # 项目 id 列表


@app.post("/api/projects/batch-delete")
async def api_batch_delete_projects(req: BatchDeleteRequest):
    """批量删除项目。返回成功/失败明细。"""
    if not req.ids:
        raise HTTPException(400, "ids 不能为空")
    if not isinstance(req.ids, list):
        raise HTTPException(400, "ids 必须是数组")
    if len(req.ids) > 100:
        raise HTTPException(400, "一次最多删除 100 个")
    deleted, missing, errors = [], [], []
    for pid in req.ids:
        try:
            proj_dir = project_path(pid)
            if proj_dir.exists():
                shutil.rmtree(proj_dir)
                deleted.append(pid)
            else:
                missing.append(pid)
        except Exception as e:
            errors.append({"id": pid, "error": str(e)})
    return {
        "ok": True,
        "deleted": deleted,
        "missing": missing,
        "errors": errors,
        "deleted_count": len(deleted),
    }


# ---------- 角色管理 ----------
@app.post("/api/projects/{pid}/characters")
async def api_add_character(
    pid: str,
    name: str = Form(...),
    description: str = Form(""),
    image: Optional[UploadFile] = File(None),
):
    """新增角色：可上传参考图或稍后生成"""
    project = load_project(pid)
    cid = str(uuid.uuid4())[:6]
    char = {
        "id": cid,
        "name": name,
        "description": description,
        "reference_image": "",  # 主参考图（用于主体参考视频）
        "generated_images": [],  # 候选定妆照（来自 image-01）
        "selected": "",  # 用户最终选定的
    }
    if image:
        # 限制 10MB，避免被上传巨大文件
        MAX_BYTES = 10 * 1024 * 1024
        data = await image.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(400, f"图片过大（>{MAX_BYTES // (1024*1024)}MB）")
        # 校验确实是图片（防 exe/php 等任意文件上传）
        try:
            from PIL import Image
            import io
            Image.open(io.BytesIO(data)).verify()
        except Exception:
            raise HTTPException(400, "上传的不是有效图片")
        ext = Path(image.filename).suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        fname = f"{cid}_ref{ext}"
        dest = characters_dir(pid) / fname
        dest.write_bytes(data)
        char["reference_image"] = f"characters/{fname}"
    project["characters"].append(char)
    save_project(project)
    return char


@app.post("/api/projects/{pid}/characters/{cid}/generate")
async def api_generate_character_images(
    pid: str,
    cid: str,
    aspect_ratio: str = "1:1",
    n: int = 3,
):
    """用 image-01 为角色生成多张定妆照候选"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")

    # 构造 prompt
    desc_parts = []
    if char.get("description"):
        desc_parts.append(char["description"])
    desc_parts.append("full body portrait, front view, neutral expression, clean background, character reference sheet, high quality")
    prompt = ", ".join(desc_parts)

    urls = await minimax_image_generate(
        prompt=prompt, model="image-01",
        aspect_ratio=aspect_ratio, n=n, optimizer=False, api_key=api_key
    )

    # 下载到本地
    char["generated_images"] = []
    for i, url in enumerate(urls):
        fname = f"{cid}_v{i+1}.jpg"
        dest = characters_dir(pid) / fname
        await download_image_to_file(url, dest)
        char["generated_images"].append(f"characters/{fname}")

    save_project(project)
    return char


@app.post("/api/projects/{pid}/characters/{cid}/select")
async def api_select_character_image(pid: str, cid: str, image_path: str = Form(...)):
    """从 generated_images 选一张作为定妆照"""
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")
    if image_path not in char.get("generated_images", []):
        raise HTTPException(400, "图片不在候选列表中")
    char["selected"] = image_path
    save_project(project)
    return char


@app.delete("/api/projects/{pid}/characters/{cid}")
async def api_delete_character(pid: str, cid: str):
    project = load_project(pid)
    project["characters"] = [c for c in project["characters"] if c["id"] != cid]
    # 清理分镜对该角色的引用，避免幽灵引用在 render 时报莫名其妙的 400
    for sb in project.get("storyboards", []):
        if sb.get("use_subject_reference") == cid:
            sb["use_subject_reference"] = False
    save_project(project)
    return {"ok": True}


# ---------- 分镜管理 ----------
@app.post("/api/projects/{pid}/storyboards")
async def api_add_storyboard(pid: str, req: StoryboardCreate):
    project = load_project(pid)
    sid = str(uuid.uuid4())[:6]
    sb = {
        "id": sid,
        "order": len(project["storyboards"]),
        "name": req.name or f"分镜 {len(project['storyboards'])+1}",
        "script": req.script,
        "prompt_data": req.prompt_data,
        "use_subject_reference": req.use_subject_reference,
        "duration": 6,
        "resolution": "768P",
        "candidates": [],
        "selected": "",
        "video_task_id": "",
        "video_status": "",
        "video_file": "",
    }
    project["storyboards"].append(sb)
    save_project(project)
    return sb


@app.put("/api/projects/{pid}/storyboards/{sid}")
async def api_update_storyboard(pid: str, sid: str, req: StoryboardUpdate):
    project = load_project(pid)
    sb = next((s for s in project["storyboards"] if s["id"] == sid), None)
    if not sb:
        raise HTTPException(404, "分镜不存在")
    for k, v in req.dict(exclude_none=True).items():
        sb[k] = v
    save_project(project)
    return sb


@app.delete("/api/projects/{pid}/storyboards/{sid}")
async def api_delete_storyboard(pid: str, sid: str):
    project = load_project(pid)
    project["storyboards"] = [s for s in project["storyboards"] if s["id"] != sid]
    # 重排 order 为 0..n-1，避免新分镜 order 撞上旧的残值
    for i, sb in enumerate(project["storyboards"]):
        sb["order"] = i
    # 清理目录
    sd = storyboard_dir(pid, sid)
    if sd.exists():
        shutil.rmtree(sd)
    save_project(project)
    return {"ok": True}


class StoryboardReorderItem(BaseModel):
    id: str
    order: int = 0


@app.post("/api/projects/{pid}/storyboards/reorder")
async def api_reorder_storyboards(pid: str, items: list[StoryboardReorderItem]):
    """items: [{id, order}, ...]。按请求顺序重写 0..n-1，避免历史 order 残留。"""
    order = [it.model_dump() for it in items]
    project = load_project(pid)
    # 先按请求中的 order 排序，再按数组下标重写为 0..n-1
    sb_by_id = {s["id"]: s for s in project["storyboards"]}
    # 只保留仍然存在的 sb
    desired = [sb_by_id[item["id"]] for item in order if item.get("id") in sb_by_id]
    # 加上请求里没出现、但项目里有的（不丢）
    seen = set(item.get("id") for item in order)
    for sb in project["storyboards"]:
        if sb["id"] not in seen:
            desired.append(sb)
    for i, sb in enumerate(desired):
        sb["order"] = i
    project["storyboards"] = desired
    save_project(project)
    return project


@app.post("/api/projects/{pid}/storyboards/{sid}/candidates")
async def api_generate_candidates(pid: str, sid: str, req: StoryboardCandidatesRequest):
    """为分镜生成 n 张候选定稿图。
    若分镜 use_subject_reference 指向一个角色，会把角色的完整外貌描述拼到 prompt，
    并尝试用 image-01 的 reference image 传图（如果后端支持）；不支持就只拼文字。
    """
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    sb = next((s for s in project["storyboards"] if s["id"] == sid), None)
    if not sb:
        raise HTTPException(404, "分镜不存在")

    n = req.n if req.n and 1 <= req.n <= 9 else 3

    pd = sb.get("prompt_data", {}) or {}
    # 优先 simple_prompt 字符串；其次 6 字段结构
    prompt = pd.get("simple_prompt", "").strip()
    if not prompt:
        prompt = assemble_prompt(pd)
    if not prompt.strip():
        raise HTTPException(400, "分镜 prompt 为空")

    # ---- 角色一致性：把角色外貌描述注入到 prompt ----
    # 优先用请求里的 use_subject_reference（前端刚改的），否则用 sb 自身的字段
    char_id = req.use_subject_reference if req.use_subject_reference else sb.get("use_subject_reference")
    char = None
    if char_id:
        char = next((c for c in project.get("characters", []) if c.get("id") == char_id), None)

    extra_parts = []
    if char:
        desc = (char.get("description") or "").strip()
        name = (char.get("name") or "").strip()
        if desc:
            # 把完整外貌描述拼到 prompt 头部（image-01 优先看前面的内容）
            extra_parts.append(f'Character "{name}" (must appear identical across shots): {desc}')
        # 如果有选定的定妆照/三视图，标注出来让模型更清楚
        if char.get("selected") or char.get("reference_image"):
            extra_parts.append("Maintain the exact look of the character reference design.")

    # 加上"分镜定稿"风格说明
    suffix = ", single frame composition, cinematic still, no motion blur, high detail"
    full_prompt = " ".join(extra_parts + [prompt]) + suffix

    # ---- 调用 image-01（尝试传 reference_image，如果 API 支持）----
    img_kwargs = {}
    if char and (char.get("selected") or char.get("reference_image")):
        ref_rel = char.get("selected") or char.get("reference_image")
        ref_full = project_path(pid) / ref_rel
        if ref_full.exists() and ref_full.is_file():
            try:
                import base64
                b64 = base64.b64encode(ref_full.read_bytes()).decode()
                ext = ref_full.suffix.lower()
                mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
                ref_data_url = f"data:{mime};base64,{b64}"
                # image-01 的 reference_image 字段（如果平台支持）— 失败也没关系，下面的 prompt 兜底
                img_kwargs["reference_image"] = [ref_data_url]
            except Exception:
                pass

    urls = await minimax_image_generate(
        prompt=full_prompt, model="image-01",
        aspect_ratio=project.get("aspect_ratio", "16:9"),
        n=n, optimizer=False, api_key=api_key, **img_kwargs
    )

    sb["candidates"] = []
    sd = storyboard_dir(pid, sid)
    for i, url in enumerate(urls):
        fname = f"v{i+1}.jpg"
        dest = sd / fname
        await download_image_to_file(url, dest)
        sb["candidates"].append(f"storyboards/{sid}/{fname}")

    save_project(project)
    return sb


@app.post("/api/projects/{pid}/storyboards/{sid}/select")
async def api_select_candidate(pid: str, sid: str, req: StoryboardSelect):
    project = load_project(pid)
    sb = next((s for s in project["storyboards"] if s["id"] == sid), None)
    if not sb:
        raise HTTPException(404, "分镜不存在")
    idx = req.candidate_index
    if idx < 0 or idx >= len(sb.get("candidates", [])):
        raise HTTPException(400, "候选图索引越界")
    sb["selected"] = sb["candidates"][idx]
    save_project(project)
    return sb


@app.post("/api/projects/{pid}/storyboards/{sid}/render")
async def api_render_storyboard(pid: str, sid: str):
    """渲染单个分镜视频（i2v 或主体参考）"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    sb = next((s for s in project["storyboards"] if s["id"] == sid), None)
    if not sb:
        raise HTTPException(404, "分镜不存在")
    if not sb.get("selected"):
        raise HTTPException(400, "未选定候选图")

    pd = sb.get("prompt_data", {}) or {}
    prompt = pd.get("simple_prompt", "").strip()
    if not prompt:
        prompt = assemble_prompt(pd)
    # 加注：保持静态构图
    if prompt:
        prompt = f"{prompt}, maintaining the composition from the first frame, no major reframing"

    selected_path = project_path(pid) / sb["selected"]
    if not selected_path.exists():
        raise HTTPException(400, f"选定的图不存在: {selected_path}")

    # 决定使用哪种模式
    char_ref = sb.get("use_subject_reference")
    if char_ref:
        # 主体参考模式：用 S2V-01
        char = next((c for c in project["characters"] if c["id"] == char_ref), None)
        if not char:
            raise HTTPException(400, "主体参考模式需要选择已存在的角色")
        ref_path = char.get("selected") or char.get("reference_image")
        if not ref_path:
            raise HTTPException(400, "主体参考模式需要先选定角色参考图或上传参考图")
        # 关键：minimax 不支持上传图片，但 image-01 返回的 URL 24h 有效
        # 我们用 file:// 协议无法直接传给 minimax，需要公网 URL
        # 方案：本地起一个静态文件服务，路径已经通过 /files/{pid}/ 暴露了
        # 但 minimax 后端访问不到 localhost —— 不可行
        # 替代方案：用 subject_reference 时，提示用户上传到自己的公网图床，或先用 image-01 生成一遍
        # 简化方案：s2v-01 也支持 base64 data URL！我们把图转成 base64 传进去
        import base64
        ref_full_path = project_path(pid) / ref_path
        if not ref_full_path.exists():
            raise HTTPException(400, f"角色参考图不存在: {ref_full_path}")
        b64 = base64.b64encode(ref_full_path.read_bytes()).decode()
        # 检测 mime
        ext = ref_full_path.suffix.lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
        ref_data_url = f"data:{mime};base64,{b64}"
        task_id = await minimax_video_create(
            prompt=prompt, duration=0, resolution="",
            api_key=api_key,
            subject_reference=[{"type": "character", "image": [ref_data_url]}]
        )
    else:
        # 普通 i2v 模式：first_frame_image 用 base64
        import base64
        b64 = base64.b64encode(selected_path.read_bytes()).decode()
        ext = selected_path.suffix.lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
        img_data_url = f"data:{mime};base64,{b64}"
        task_id = await minimax_video_create(
            prompt=prompt, duration=sb.get("duration", 6), resolution=sb.get("resolution", "768P"),
            api_key=api_key,
            first_frame_image=img_data_url
        )

    sb["video_task_id"] = task_id
    sb["video_status"] = "Preparing"
    save_project(project)
    return {"task_id": task_id, "status": "Preparing"}


@app.get("/api/projects/{pid}/storyboards/{sid}/video")
async def api_check_storyboard_video(pid: str, sid: str):
    """检查分镜视频生成状态，如果完成则下载"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    sb = next((s for s in project["storyboards"] if s["id"] == sid), None)
    if not sb:
        raise HTTPException(404, "分镜不存在")
    task_id = sb.get("video_task_id")
    if not task_id:
        raise HTTPException(400, "未触发视频生成")
    if sb.get("video_status") == "Success" and sb.get("video_file"):
        return sb

    # 轮询一次
    result = await minimax_poll(task_id, api_key)
    status = result.get("status", "Fail")
    sb["video_status"] = status

    if status == "Success":
        file_id = result.get("file_id", "")
        if file_id:
            url = await minimax_get_download_url(file_id, api_key)
            sd = storyboard_dir(pid, sid)
            vname = f"video.mp4"
            dest = sd / vname
            await download_to_file(url, dest)
            sb["video_file"] = f"storyboards/{sid}/{vname}"
    elif status == "Fail":
        sb["video_status"] = "Fail"

    save_project(project)
    return sb


@app.post("/api/projects/{pid}/render-all")
async def api_render_all_storyboards(pid: str, transition: str = "fade", transition_duration: float = 0.5):
    """一键渲染所有分镜视频，然后拼接成片"""
    if not has_ffmpeg():
        raise HTTPException(400, "服务器未安装 ffmpeg，无法拼接")
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")

    project = load_project(pid)
    if not project["storyboards"]:
        raise HTTPException(400, "项目没有分镜")

    # 1. 检查所有分镜是否都已选定候选图
    for sb in project["storyboards"]:
        if not sb.get("selected"):
            raise HTTPException(400, f"分镜 {sb.get('name')} 未选定候选图")
        if not sb.get("video_file"):
            raise HTTPException(400, f"分镜 {sb.get('name')} 还没生成视频，请先单独渲染")

    # 2. 拼接
    project["storyboards"].sort(key=lambda s: s.get("order", 0))
    video_paths = [project_path(pid) / sb["video_file"] for sb in project["storyboards"]]
    output = project_path(pid) / "output.mp4"
    if not has_ffprobe():
        raise HTTPException(400, "服务器未安装 ffprobe，无法做转场拼接")
    canvas = aspect_to_canvas(project.get("aspect_ratio"))
    total_duration = sum(int(sb.get("duration", 6)) for sb in project["storyboards"])
    try:
        concat_videos(
            [str(p) for p in video_paths], output,
            transition=transition, transition_duration=transition_duration,
            canvas=canvas,
        )
        project["output_video"] = "output.mp4"
        save_project(project)
        return {"ok": True, "output": "output.mp4", "duration": total_duration}
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode(errors="replace") if e.stderr else "未知"
        raise HTTPException(500, f"ffmpeg 拼接失败: {err}")


@app.post("/api/projects/{pid}/grid-bundle")
async def api_grid_bundle(pid: str, req: GridBundleRequest):
    """把已选定候选图的分镜拼成 3x3 网格，作为 first_frame_image 调一次 Hailuo 视频。
    每行/列最多 3 个分镜，不足 9 个就空格（黑底）。
    """
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    sbs = sorted(project["storyboards"], key=lambda s: s.get("order", 0))
    sbs_with_sel = [s for s in sbs if s.get("selected")]
    if len(sbs_with_sel) < 1:
        raise HTTPException(400, "至少需要 1 个分镜已选定候选图")

    # 1. 拼图
    n = len(sbs_with_sel)
    if n <= 4:
        cols = rows = 2
    else:
        cols = rows = 3
    img_paths = [str(project_path(pid) / sb["selected"]) for sb in sbs_with_sel]

    bundle_idx = len(project["grid_bundles"]) + 1
    bundle_id = uuid.uuid4().hex[:6]
    grid_relpath = f"grid_bundles/{bundle_id}_grid.jpg"
    grid_abspath = project_path(pid) / grid_relpath
    canvas_w, canvas_h = aspect_to_canvas(project.get("aspect_ratio"))
    used = compose_grid_image(img_paths, grid_abspath, cols=cols, rows=rows,
                              canvas_w=canvas_w, canvas_h=canvas_h)

    # 2. 拼 prompt：每个分镜一句话概述 + 全局风格
    lines = []
    for i, sb in enumerate(sbs_with_sel[:cols * rows], 1):
        prompt_summary = ((sb.get("prompt_data") or {}).get("simple_prompt") or sb.get("script") or sb.get("name") or "")[:200]
        lines.append(f"Panel {i}: {prompt_summary}")
    full_prompt = (
        "A cinematic 3x3 grid montage showing nine storyboard panels simultaneously. "
        "Smooth continuous motion across all panels, unified lighting and color tone. "
        + " | ".join(lines)
    )

    # 3. base64 编码网格图，传给 Hailuo 2.3 作为 first_frame_image
    import base64
    b64 = base64.b64encode(grid_abspath.read_bytes()).decode()
    data_url = f"data:image/jpeg;base64,{b64}"

    duration = req.duration if req.duration in (6, 10) else 10
    resolution = req.resolution if req.resolution in ("768P", "1080P") else "768P"
    if resolution == "1080P":
        duration = 6  # 1080P 仅支持 6s

    task_id = await minimax_video_create(
        prompt=full_prompt, duration=duration, resolution=resolution, api_key=api_key,
        first_frame_image=data_url,
    )

    bundle = {
        "id": bundle_id,
        "grid_image": grid_relpath,
        "duration": duration,
        "resolution": resolution,
        "storyboard_ids": [sb["id"] for sb in sbs_with_sel[:cols * rows]],
        "panel_count": used,
        "video_task_id": task_id,
        "video_status": "Preparing",
        "video_file": "",
        "created_at": datetime.now().isoformat(),
    }
    project["grid_bundles"].append(bundle)
    save_project(project)
    return {"ok": True, "bundle": bundle}


@app.get("/api/projects/{pid}/grid-bundles/{bid}/video")
async def api_check_grid_bundle_video(pid: str, bid: str):
    """轮询网格包视频状态。Success 后下载到 grid_bundles/{bid}.mp4 并写入 video_file。"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    bundle = next((b for b in project["grid_bundles"] if b["id"] == bid), None)
    if not bundle:
        raise HTTPException(404, "网格包不存在")
    if not bundle.get("video_task_id"):
        raise HTTPException(400, "没有进行中的视频任务")
    if bundle.get("video_status") == "Success" and bundle.get("video_file"):
        return bundle
    try:
        status = await minimax_poll(bundle["video_task_id"], api_key)
    except Exception as e:
        raise HTTPException(500, f"轮询失败: {e}")
    raw_status = status.get("status", "")
    file_id = status.get("file_id", "")
    if raw_status == "Success" and file_id:
        url = await minimax_get_download_url(file_id, api_key)
        out = project_path(pid) / "grid_bundles" / f"{bid}_video.mp4"
        await download_to_file(url, out)
        bundle["video_file"] = f"grid_bundles/{bid}_video.mp4"
        bundle["video_status"] = "Success"
    elif raw_status == "Fail":
        bundle["video_status"] = "Fail"
    elif raw_status:
        bundle["video_status"] = raw_status
    save_project(project)
    return bundle


# 静态文件
@app.get("/outputs/{filename}")
async def get_output(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "非法文件名")
    p = OUTPUTS_DIR / filename
    if p.exists():
        return FileResponse(p, media_type="video/mp4", filename=filename)
    raise HTTPException(404, "文件不存在")


@app.get("/files/{pid}/{path:path}")
async def get_project_file(pid: str, path: str):
    """服务项目内的文件（图片、视频）"""
    if not path or ".." in path:
        raise HTTPException(400, "非法路径")
    # 防止以 / 开头的“绝对路径”穿越出项目目录
    safe_path = path.lstrip("/")
    p = (project_path(pid) / safe_path).resolve()
    proj_root = project_path(pid).resolve()
    if proj_root not in p.parents and p != proj_root:
        raise HTTPException(400, "非法路径")
    if not p.is_file():  # 目录、缺失文件、路径穿越都安全 404，避免 FileResponse 把 worker 干崩
        raise HTTPException(404, "文件不存在")
    # 推断 mime
    if p.suffix.lower() in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif p.suffix.lower() == ".png":
        media = "image/png"
    elif p.suffix.lower() == ".webp":
        media = "image/webp"
    elif p.suffix.lower() == ".mp4":
        media = "video/mp4"
    else:
        media = "application/octet-stream"
    return FileResponse(p, media_type=media)


@app.post("/api/image/test")
async def api_test_image(req: ImageGenerateRequest):
    """快速测试文生图（不存盘）"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    urls = await minimax_image_generate(
        prompt=req.prompt, model=req.model, aspect_ratio=req.aspect_ratio,
        n=req.n, optimizer=req.prompt_optimizer, api_key=api_key
    )
    return {"image_urls": urls}


# -------------------- LLM 头脑风暴 --------------------
BRAINSTORM_SYSTEM = """你是一位有 20 年经验的短片编剧 + AI 视觉导演。用户会给你一段非常简短的创意（可能只有一两句话，甚至只是一个画面或一个概念）。

你的任务：**基于这个简短创意，向 8 个截然不同的方向扩写出完整的短片剧本**。每个方向必须真的不同（不是换皮），差异体现在：
- 情绪氛围（治愈/紧张/史诗/悬疑/温馨/孤独/神秘/温暖/黑暗/轻松/怀旧等）
- 叙事视角（角色视角/旁观者/上帝视角/时间跳跃/记忆闪回等）
- 视觉风格倾向（写实/动画/复古/超现实/赛博朋克/水墨/油画/吉卜力/新海诚/8-bit 等）
- 短片结构（线性叙事/蒙太奇/单镜头长镜头/循环结构/倒叙等）

每个方向严格按 JSON 格式输出一个对象，整体返回 JSON 数组（不要加任何 markdown 代码块标记，不要解释）：

[
  {
    "title": "方向标题（4-10 字，中文）",
    "logline": "一句话核心创意（15-30 字，中文，能让人眼前一亮）",
    "full_script": "完整剧本描述（200-350 字，中文），必须包含：场景设定、人物/角色、主要动作序列、关键情绪点、镜头/视觉风格倾向。读起来像电影分场大纲。",
    "suggested_style": "建议视觉风格关键词（英文，逗号分隔，例：Studio Ghibli style, cinematic, warm tones）",
    "suggested_moods": ["情绪1", "情绪2", "情绪3"],
    "structure": "短片结构（线性叙事/蒙太奇/长镜头/循环 等）",
    "pacing": "节奏（舒缓/紧凑/跳跃）"
  },
  ... 共 {count} 个方向
]

要求：
1. 8 个方向必须**真的不一样**，避免只是同主题换背景
2. logline 要能让人 3 秒内 get 到点
3. full_script 要有画面感、能直接用来生成视觉
4. suggested_style 用英文关键词（用于 AI 视频 prompt）
5. 不要写任何解释性文字，只返回 JSON 数组
"""


async def minimax_chat(messages: list, api_key: str, model: str = "MiniMax-M2.7", max_tokens: int = 8192, temperature: float = 0.9) -> str:
    """调 minimax chat completion，返回 content 字符串"""
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{API_BASE}/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": messages,
                "max_completion_tokens": max_tokens,
                "temperature": temperature,
                "top_p": 0.95,
            },
        )
        data = r.json()
        if data.get("base_resp", {}).get("status_code") != 0:
            raise HTTPException(400, f"LLM 调用失败: {data.get('base_resp', {}).get('status_msg', '未知')} - {data}")
        return data["choices"][0]["message"]["content"]


def extract_json_array(text: str) -> list:
    r"""From LLM output, extract a JSON array. Tolerates:
    - <think>...</think> blocks
    - markdown code fences
    - unescaped control chars in strings
    - native ASCII quotes embedded in string values (e.g. 王记 -> 招牌从"王记"变成了"老王").
      An ASCII double quote inside a string value is treated as a closing boundary
      if and only if the next non-whitespace character is one of: : , ] } or EOF.
      Otherwise it is treated as an embedded quote and escaped as \" .
    This is a heuristic that works because LLM-generated JSON has well-formed
    structure markers even when string values are dirty.
    """
    text = text.strip()

    # 1. strip markdown code-fence
    if text.startswith("`" * 3):
        lines = text.split(chr(10))
        if lines[0].startswith("`" * 3):
            lines = lines[1:]
        if lines and lines[-1].strip() == "`" * 3:
            lines = lines[:-1]
        text = chr(10).join(lines).strip()

    # 2. strip <think>...</think> blocks
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    if "<think>" in text:
        text = text[text.find("["):]
    if text.startswith("</think>"):
        text = text[text.find("</think>") + len("</think>"):].strip()

    # 3. find JSON array boundary
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        raise ValueError("Cant find JSON array boundary")
    text = text[start:end+1]

    # 4. state machine to fix unescaped control chars AND embedded quotes.
    JSON_CLOSERS = ":,]} "
    # (space included so a string value followed by whitespace+closer is detected;
    #  we strip whitespace in the peek helper)
    _WS = " \t\r\n"
    _BS = chr(92)  # backslash
    _DQ = chr(34)  # double quote

    def _peek_non_space(s, i, direction):
        i = i + direction
        n = len(s)
        while 0 <= i < n and s[i] in _WS:
            i = i + direction
        return i if 0 <= i < n else -1

    def _is_closing_quote(s, i):
        # A `"` is a closing boundary iff the next non-whitespace char is a
        # JSON structural closer (: , ] }) or end of input.
        k = _peek_non_space(s, i, 1)
        return k == -1 or s[k] in ":,]}"

    out = []
    in_string = False
    escape_next = False
    n = len(text)
    for i, ch in enumerate(text):
        if escape_next:
            out.append(ch)
            escape_next = False
            continue
        if ch == _BS:
            out.append(ch)
            escape_next = True
            continue
        if ch == _DQ:
            if not in_string:
                # start of a new string
                out.append(ch)
                in_string = True
                continue
            # already in string: is this a boundary or an embedded quote?
            if _is_closing_quote(text, i):
                out.append(ch)
                in_string = False
            else:
                out.append(_BS + _DQ)
            continue
        if in_string:
            if ch == chr(10):
                out.append(_BS + "n")
            elif ch == chr(13):
                out.append(_BS + "r")
            elif ch == chr(9):
                out.append(_BS + "t")
            elif ord(ch) < 0x20:
                out.append(chr(92) + "u{:04x}".format(ord(ch)))
            else:
                out.append(ch)
        else:
            out.append(ch)
    text = "".join(out)

    return json.loads(text)




@app.post("/api/brainstorm")
async def api_brainstorm(req: BrainstormRequest):
    """基于用户简短 brief，让 LLM 向多个方向扩写剧本"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    if not req.brief or not req.brief.strip():
        raise HTTPException(400, "请提供 brief 内容")
    if req.count < 3 or req.count > 12:
        raise HTTPException(400, "count 范围应为 3-12")

    system = BRAINSTORM_SYSTEM.replace("{count}", str(req.count))
    user_parts = [f"用户 brief：{req.brief.strip()}"]
    if req.style_hint:
        user_parts.append(f"\n用户偏好的风格方向：{req.style_hint}")
    if req.aspect_ratio and req.aspect_ratio != "16:9":
        user_parts.append(f"\n项目宽高比：{req.aspect_ratio}（视频需要适配这个比例）")
    user_parts.append(f"\n请按 system 要求，生成 {req.count} 个差异化的短片方向，返回 JSON 数组。")
    user_msg = "\n".join(user_parts)

    content = await minimax_chat(
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
        api_key=api_key, model="MiniMax-M2.7", max_tokens=8192, temperature=1.0
    )

    try:
        ideas = extract_json_array(content)
    except (json.JSONDecodeError, ValueError) as e:
        # 解析失败：返回原始内容让前端能显示
        # 同时记录前后 200 字符到日志，便于排查 LLM 输出格式问题
        raw_len = len(content)
        # 找到错误位置（e.pos 是字节偏移）做上下文切片
        err_pos = getattr(e, "pos", -1)
        if 0 <= err_pos <= raw_len:
            ctx_start = max(0, err_pos - 200)
            ctx_end = min(raw_len, err_pos + 200)
            ctx = content[ctx_start:ctx_end]
        else:
            ctx = content[:400]
        logging.warning(
            "brainstorm JSON parse failed: %s | raw_len=%d | ctx=%r",
            e, raw_len, ctx,
        )
        return {
            "ok": False,
            "error": f"解析失败: {e}",
            "raw": content,
            "raw_length": raw_len,
            "error_context": ctx,
            "ideas": [],
        }

    return {
        "ok": True,
        "ideas": ideas,
        "count": len(ideas),
    }


# -------------------- AI 角色生成 --------------------
CHARACTER_GENERATE_SYSTEM = """你是专业的短片角色设计师。用户会给你一段剧本（可能含 AI 头脑风暴选出的方向，或用户自由撰写的）。

你的任务：**从剧本中识别所有出场的独立角色**（人类/拟人化生物；纯背景道具或群演路人忽略），对每个角色输出：
- "name": 角色名（4-12 字，中文；如果是泛指角色如"外卖员"，用剧本里出现的称呼）
- "description": 详细的外貌 + 关键特征描述（80-180 字，中文）。必须能直接喂给 image-01 生成定妆照，所以重点写**视觉信息**：年龄段、性别、身材、发型发色、脸型、肤色、穿着、标志性配饰/物品、整体气质。

要求：
1. 不要重复（同一个角色不要写两次）
2. 主要角色（推动情节的）必须列出，戏份极少的可省略
3. description 不要写"性格""背景故事"，只写**视觉/外观**
4. 不要写"还有一个叫XX的角色"等解释性文字
5. 如果剧本里没有明确角色（比如只有一段氛围描述），就基于剧本合理推断 2-4 个可能的角色
6. 不要返回群演/路人

整体返回 JSON 数组（不要加任何 markdown 代码块标记，不要解释）：
[
  {"name": "...", "description": "..."},
  ...
]
"""


CHARACTER_REWRITE_SYSTEM = """你是 AI 视频提示词专家。用户会给你一个角色的当前外貌描述，目标是基于同一角色**生成 {count} 个差异化的备选描述**（用于抽卡 / 重新生成视觉）。

每个候选描述要求：
- 80-180 字，中文
- 重点写视觉信息（年龄、身材、发型、脸型、肤色、穿着、配饰、气质）
- 必须和原描述**真的不同**（变的是年龄段、风格倾向、穿着体系、气质等，不是同义改写）
- 仍然符合用户给的剧本上下文（如果有）
- 候选之间也要差异化（避免 3 个版本都偏向同一个方向）

整体返回 JSON 数组（不要加任何 markdown 代码块标记，不要解释）：
["候选描述1", "候选描述2", "候选描述3"]
"""


async def ai_generate_characters(script: str, style_hint: str, api_key: str) -> list:
    """从剧本里抽角色。返回 [{name, description}, ...]"""
    user_parts = [f"剧本：\n{script.strip()}"]
    if style_hint:
        user_parts.append(f"\n风格倾向：{style_hint}")
    user_parts.append("\n请按 system 要求，从剧本中识别所有独立角色，返回 JSON 数组。")
    user_msg = "\n".join(user_parts)
    content = await minimax_chat(
        messages=[{"role": "system", "content": CHARACTER_GENERATE_SYSTEM}, {"role": "user", "content": user_msg}],
        api_key=api_key, model="MiniMax-M2.7", max_tokens=4096, temperature=0.9
    )
    items = extract_json_array(content)
    # 兜底：确保每项都有 name/description
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        out.append({
            "name": (it.get("name") or "").strip() or "未命名角色",
            "description": (it.get("description") or "").strip(),
        })
    return out


async def ai_rewrite_character(name: str, description: str, script: str, count: int, api_key: str) -> list:
    """生成 N 个候选描述。返回 [str, ...]"""
    system = CHARACTER_REWRITE_SYSTEM.replace("{count}", str(count))
    user_parts = []
    if name:
        user_parts.append(f"角色名：{name}")
    user_parts.append(f"当前描述：{description}")
    if script:
        user_parts.append(f"\n剧本上下文：\n{script.strip()}")
    user_parts.append(f"\n请生成 {count} 个差异化的备选描述，返回 JSON 字符串数组。")
    user_msg = "\n".join(user_parts)
    content = await minimax_chat(
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
        api_key=api_key, model="MiniMax-M2.7", max_tokens=2048, temperature=1.0
    )
    items = extract_json_array(content)
    # 兜底：只要字符串
    return [str(x).strip() for x in items if str(x).strip()]


@app.post("/api/projects/{pid}/characters/ai-generate")
async def api_ai_generate_characters(pid: str, req: CharacterAIGenerateRequest):
    """从剧本抽取角色，追加到项目。返回更新后的角色列表。"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    script = (req.script or project.get("script") or "").strip()
    if not script:
        raise HTTPException(400, "剧本为空，请先在 Step 1 填写剧本")
    try:
        items = await ai_generate_characters(script, req.style_hint, api_key)
    except Exception as e:
        raise HTTPException(500, f"AI 生成失败: {e}")
    if not items:
        raise HTTPException(500, "AI 没生成出有效角色")
    # 追加到项目（用现有 char schema；不重置已存在角色）
    for it in items:
        cid = str(uuid.uuid4())[:6]
        char = {
            "id": cid,
            "name": it["name"],
            "description": it["description"],
            "reference_image": "",
            "generated_images": [],
            "turnaround_images": [],
            "selected": "",
        }
        project["characters"].append(char)
    save_project(project)
    return {"ok": True, "added": len(items), "characters": project["characters"]}


@app.post("/api/projects/{pid}/characters/{cid}/ai-rewrite")
async def api_ai_rewrite_character(pid: str, cid: str, req: CharacterAIRewriteRequest):
    """为某个角色生成 N 个候选描述（不落库，前端让用户挑一个再写回）"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")
    if not req.description.strip():
        raise HTTPException(400, "当前描述为空，无法换一版")
    try:
        options = await ai_rewrite_character(
            name=char.get("name", ""),
            description=req.description,
            script=req.script or project.get("script", ""),
            count=max(2, min(req.count, 5)),
            api_key=api_key,
        )
    except Exception as e:
        raise HTTPException(500, f"AI 重写失败: {e}")
    return {"ok": True, "options": options}


@app.put("/api/projects/{pid}/characters/{cid}")
async def api_update_character(pid: str, cid: str, req: dict):
    """更新角色的 name / description（description 自由编辑后保存）"""
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")
    if "name" in req and req["name"] is not None:
        char["name"] = str(req["name"]).strip() or char["name"]
    if "description" in req and req["description"] is not None:
        char["description"] = str(req["description"]).strip()
    save_project(project)
    return char


@app.post("/api/projects/{pid}/characters/{cid}/turnaround/generate")
async def api_generate_turnaround(pid: str, cid: str, req: CharacterTurnaroundRequest):
    """生成 N 张三视图候选（每张含正面/侧面/背面）。保存到 turnaround_images 字段。"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")
    desc = (req.description or char.get("description") or "").strip()
    if not desc:
        raise HTTPException(400, "请先填写角色描述")

    # 构造三视图 prompt
    desc_parts = [desc]
    desc_parts.append("character turnaround sheet, three views: front view, side view, back view, T-pose, full body, clean white background, character reference sheet, consistent design across views, high detail")
    if req.style_hint:
        desc_parts.append(req.style_hint)
    prompt = ", ".join(desc_parts)

    n = max(1, min(req.n, 6))
    try:
        urls = await minimax_image_generate(
            prompt=prompt, model="image-01",
            aspect_ratio="1:1", n=n, optimizer=False, api_key=api_key
        )
    except Exception as e:
        raise HTTPException(500, f"三视图生成失败: {e}")

    # 下载到本地
    char.setdefault("turnaround_images", [])
    char["turnaround_images"] = []  # 重新生成：清空旧的
    for i, url in enumerate(urls):
        fname = f"{cid}_turnaround_v{i+1}.jpg"
        dest = characters_dir(pid) / fname
        try:
            await download_image_to_file(url, dest)
            char["turnaround_images"].append(f"characters/{fname}")
        except Exception as e:
            # 单张失败不影响整体
            print(f"[turnaround] download failed for {fname}: {e}")
    save_project(project)
    return char


@app.post("/api/projects/{pid}/characters/{cid}/turnaround/select")
async def api_select_turnaround(pid: str, cid: str, image_path: str = Form(...)):
    """从 turnaround_images 选一张作为正式定妆照（写入 selected）"""
    project = load_project(pid)
    char = next((c for c in project["characters"] if c["id"] == cid), None)
    if not char:
        raise HTTPException(404, "角色不存在")
    if image_path not in char.get("turnaround_images", []):
        raise HTTPException(400, "图片不在三视图候选列表中")
    char["selected"] = image_path
    save_project(project)
    return char


# -------------------- AI 分镜生成 --------------------
STORYBOARD_GENERATE_SYSTEM = """你是专业短片分镜师。用户会给你一段短片剧本，以及已经设计好的角色列表（名字 + 外貌）。

你的任务：**把剧本拆分成 {target_count} 个分镜**（每个分镜对应一段连贯的镜头），让用户能依次拍出来。

每个分镜输出：
- "name": 分镜标题（4-15 字，中文），格式如 "开场：xxx"、"转折：xxx"、"结尾：xxx"，或 "分镜 1：xxx"。让用户一眼能看出这个镜头的功能。
- "script": 中文场景描述（80-150 字）。说清楚：场景、人物、动作、情绪、镜头语言（角度/景别/运镜）。这是给分镜师看的，要具体到能直接画分镜。
- "simple_prompt": **必须 100% 英文** image-01 prompt（40-100 词，全英文，零中文字符），用于直接生成该分镜的定稿候选图。**必须包含**：
  - 角色外观（从角色描述里抄关键视觉特征，例如 "5-year-old boy with short black hair, white tank top, blue shorts"）
  - 场景/背景细节
  - 镜头角度（close-up / wide shot / over-the-shoulder 等）
  - 光线与色调
  - 整体风格（cinematic / film grain / warm tones 等）
  - 写实/风格化倾向
- "duration": 时长秒数（6 或 10，建议默认 6；如果是高潮/慢镜头可写 10）
- "shot_type": 景别（close-up / medium / wide / extreme wide / over-the-shoulder），用英文

要求：
1. {target_count} 个分镜要按剧情顺序，覆盖完整的起承转合
2. 简单剧本 → 少分镜（3-5），复杂剧本 → 多分镜（6-8）
3. 每个分镜必须能独立成为一张画面（不是抽象的概念描述）
4. simple_prompt 不要复述"分镜"，直接给画面描述
5. 角色出镜时必须 reference 角色描述里的视觉特征，不要凭空捏造
6. **simple_prompt 必须是纯英文，绝对不能出现任何中文字符**（Chinese characters break the image model）
7. 只返回 JSON 数组，不要 markdown 代码块，不要解释

整体格式：
[
  {{
    "name": "...",
    "script": "...",
    "simple_prompt": "...",
    "duration": 6,
    "shot_type": "wide"
  }},
  ...
]
"""


async def ai_generate_storyboards(script: str, characters: list, style_hint: str, target_count: int, aspect_ratio: str, api_key: str) -> list:
    """从剧本拆分成 N 个分镜。返回 [{name, script, simple_prompt, duration, shot_type}, ...]"""
    # 让 LLM 自己决定 3-8 个，除非用户指定
    count_str = str(target_count) if target_count and 3 <= target_count <= 8 else "3-8"
    system = STORYBOARD_GENERATE_SYSTEM.replace("{target_count}", count_str)

    user_parts = [f"剧本：\n{script.strip()}"]
    if characters:
        chars_desc = "\n".join([f"- {c.get('name', '未命名')}：{c.get('description', '')}" for c in characters])
        user_parts.append(f"\n已有角色（出镜时必须 reference 视觉特征）：\n{chars_desc}")
    if style_hint:
        user_parts.append(f"\n风格倾向：{style_hint}")
    if aspect_ratio and aspect_ratio != "16:9":
        user_parts.append(f"\n项目宽高比：{aspect_ratio}（镜头构图要适配这个比例）")
    user_parts.append(f"\n请按 system 要求拆分成 {count_str} 个分镜，返回 JSON 数组。")
    user_msg = "\n".join(user_parts)

    content = await minimax_chat(
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
        api_key=api_key, model="MiniMax-M2.7", max_tokens=8192, temperature=0.8
    )
    items = extract_json_array(content)
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        name = (it.get("name") or "").strip()
        sb_script = (it.get("script") or "").strip()
        prompt = (it.get("simple_prompt") or "").strip()
        if not name or not sb_script or not prompt:
            continue
        # 兜底：如果 AI 误返回中文 simple_prompt（违反 system 要求），自动翻译成英文
        # 避免 image-01 收到中文导致生成失败
        has_chinese = any('一' <= c <= '鿿' for c in prompt[:80])
        if has_chinese:
            try:
                translated = await minimax_chat(
                    messages=[
                        {"role": "system", "content": "你是翻译助手。把用户给的中文 image prompt 翻译成 40-100 词的纯英文 image-01 prompt。要求：保留场景/角色/镜头/光线/风格等视觉信息，不要包含任何中文字符。只输出英文 prompt，不要任何解释。"},
                        {"role": "user", "content": prompt},
                    ],
                    api_key=api_key, model="MiniMax-M2.7", max_tokens=512, temperature=0.3,
                )
                if translated and not any('一' <= c <= '鿿' for c in translated[:80]):
                    prompt = translated.strip().strip('"').strip("'")
            except Exception:
                pass  # 翻译失败就保留原文（让用户在 UI 里手动改）
        # 兜底字段
        try:
            duration = int(it.get("duration") or 6)
        except (TypeError, ValueError):
            duration = 6
        duration = 6 if duration not in (6, 10) else duration
        shot_type = (it.get("shot_type") or "").strip() or "medium"
        out.append({
            "name": name,
            "script": sb_script,
            "simple_prompt": prompt,
            "duration": duration,
            "shot_type": shot_type,
        })
    return out


@app.post("/api/projects/{pid}/storyboards/ai-generate")
async def api_ai_generate_storyboards(pid: str, req: StoryboardAIGenerateRequest):
    """从剧本拆分成 N 个分镜，追加到项目。返回更新后的分镜列表。"""
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(400, "未配置 API key")
    project = load_project(pid)
    script = (req.script or project.get("script") or "").strip()
    if not script:
        raise HTTPException(400, "剧本为空，请先在 Step 1 填写剧本")
    try:
        items = await ai_generate_storyboards(
            script=script,
            characters=project.get("characters", []),
            style_hint=req.style_hint,
            target_count=req.target_count,
            aspect_ratio=project.get("aspect_ratio", "16:9"),
            api_key=api_key,
        )
    except Exception as e:
        raise HTTPException(500, f"AI 生成失败: {e}")
    if not items:
        raise HTTPException(500, "AI 没生成出有效分镜")

    # 追加到项目（用现有 sb schema）
    base_order = len(project["storyboards"])
    new_sbs = []
    for i, it in enumerate(items):
        sid = str(uuid.uuid4())[:6]
        sb = {
            "id": sid,
            "order": base_order + i,
            "name": it["name"],
            "script": it["script"],
            "prompt_data": {"simple_prompt": it["simple_prompt"], "shot_type": it["shot_type"]},
            "use_subject_reference": False,
            "duration": it["duration"],
            "resolution": "768P",
            "candidates": [],
            "selected": "",
            "video_task_id": "",
            "video_status": "",
            "video_file": "",
        }
        project["storyboards"].append(sb)
        new_sbs.append(sb)
    save_project(project)
    return {"ok": True, "added": len(new_sbs), "storyboards": new_sbs}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8765))
    print(f"\n  🎬 Video Prompt Builder v2")
    print(f"  📂 工作目录: {ROOT}")
    print(f"  🔑 API key: {'已配置 ✓' if get_api_key() else '未配置 ✗'}")
    print(f"  🎥 ffmpeg:  {'可用 ✓' if has_ffmpeg() else '未安装 ✗'}")
    print(f"  🔬 ffprobe: {'可用 ✓' if has_ffprobe() else '未安装 ✗（转场拼接将不可用）'}")
    print(f"  🌐 Prompt Builder: http://localhost:{port}")
    print(f"  🌐 Project Workflow: http://localhost:{port}/project\n")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

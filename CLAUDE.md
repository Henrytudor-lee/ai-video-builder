# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FastAPI web app for crafting **MiniMax Hailuo 2.3** (海螺 2.3) video prompts. Two modes share one server:
- `/` — single-shot 6-field Prompt Builder (`static/index.html` + `static/app.js`)
- `/project` — multi-shot storyboard workflow (`static/project.html` + `static/project-app.js`): script → character design → storyboards → i2v render → ffmpeg stitch

## Commands

```bash
# Run the app (auto-creates venv, installs deps)
./run.sh
# Manual: source .venv/bin/activate && python server.py

# Install deps
pip install -r requirements.txt

# Change port if 8765 is taken
PORT=8888 python server.py
```

External dependency: `ffmpeg` must be on PATH (for video stitching) — `brew install ffmpeg` on macOS.

There is no test suite, no linter, and no build step. The frontend is plain HTML/CSS/JS served as static files. To verify changes, run the server and open it in a browser.

## API key configuration

Precedence (highest first): `MINIMAX_VIDEO_KEY` env var → `config.json` `api_key` field → user-set via `/api/config/key` (persisted to `config.json`).

`config.json` is in `.gitignore` and contains a real key — never commit it, and be careful printing it.

## Architecture

**`server.py` (1829 lines)** — single-file FastAPI app. The interesting sections, in order:
- `load_json` / `save_json` / `load_project` / `save_project` — disk persistence
- `render_subject/scene/action/camera/style/motion` + `assemble_prompt` — the prompt-assembly logic for the single-shot builder; this is the "domain rules" of the app
- `minimax_image_generate` / `minimax_video_create` / `minimax_poll` / `minimax_get_download_url` / `minimax_chat` — async wrappers around the `api.minimaxi.com` API for four models:
  - **`image-01`** — t2i (character turnaround, storyboard candidate images, image test)
  - **`MiniMax-Hailuo-2.3`** — t2v / i2v (default storyboard render via `first_frame_image` base64)
  - **`S2V-01`** — subject reference; locks face across shots. Mutually exclusive with i2v on the same shot. Subtle: the platform doesn't accept local file URLs, so the backend base64-encodes the character ref and posts it as a data URL inside `subject_reference=[{type:character, image:[data:url]}]`. The `duration` / `resolution` / `prompt_optimizer` fields are also stripped on this path (S2V-01 doesn't accept them).
  - **`MiniMax-M2.7`** — LLM used by `/api/brainstorm`, `characters/ai-generate`, `characters/.../ai-rewrite`, `characters/.../turnaround/generate`, `storyboards/ai-generate`. Brainstorm expands a 1–3 sentence brief into 3–12 differentiated short-film directions.
- `has_ffmpeg` / `concat_videos` — ffmpeg invocation for the final stitch with 6 transition modes (`fade`/`wipeleft`/`wiperight`/`slideup`/`slidedown`/`circlecrop`/`none`). Non-`none` transitions use `ffprobe` to read durations, then build a chain of `xfade` filters. Requires both `ffmpeg` and `ffprobe` on PATH.
- `compose_grid_image` + `/api/projects/{pid}/grid-bundle` — composes selected storyboard images into a 3×3 (or 2×2 for ≤4) grid, posts it as `first_frame_image` to a single Hailuo call. Distinct from the per-storyboard i2v render — produces one animated montage video containing all storyboards.
- `extract_json_array` — shared LLM-output cleanup (strips `<think>` blocks, markdown fences, escapes unescaped control chars inside string literals). Used by every `/ai-*` endpoint.
- REST endpoints under `/api/*` (project CRUD, character/storyboard generation, video polling/render, AI helpers)

**`data/`** — preset vocabulary (subjects/scenes/actions/cameras/styles/motions/atmospheres/presets) loaded as JSON. `data/projects/{project_id}/` is per-project storage: `project.json` + `characters/` + `storyboards/{sid}/` + `grid_bundles/` + `output.mp4`.

**`static/`** — vanilla JS, no build, no framework. `app.js` handles Builder; `project-app.js` handles workflow. Static files are served via `NoCacheStaticFiles` (sets `Cache-Control: no-cache, no-store, must-revalidate` on every response) so frontend edits are picked up on refresh without a hard reload.

**`outputs/`** — videos from the single-shot Builder. Pre-existing files (e.g. `20260624_*.mp4`) should not be treated as scratch.

## Conventions

- Project IDs are 8-char hex (`uuid.uuid4().hex[:8]`); character / storyboard IDs are 6-char hex (`uuid.uuid4().hex[:6]`).
- The Chinese term 海螺 = Hailuo; the brand "MiniMax" appears in the env var name (`MINIMAX_VIDEO_KEY`) and the model prefix (`MiniMax-Hailuo-2.3`).
- API base is `https://api.minimaxi.com` (hardcoded in server.py).
- Project aspect ratio: one of `16:9` / `9:16` / `1:1` / `4:3` / `3:2`. Drives both `image-01` aspect_ratio and Hailuo resolution choices (1080P only valid with 6s duration).
- Video generation is async: API returns a `task_id`, client polls `/api/status/{task_id}/wait` (v1 Builder) or `/api/projects/{pid}/storyboards/{sid}/video` (v2 workflow) until `Success`, then downloads via `file_id` → temp URL → local file.
- For the storyboard workflow, i2v is the default mode; `S2V-01` subject-reference is opt-in per storyboard and is mutually exclusive with i2v on the same shot.
- Adding a new preset/option: edit the relevant `data/*.json`. If adding a subject, also add an English translation in `static/app.js` `SUBJECT_TRANSLATIONS`.

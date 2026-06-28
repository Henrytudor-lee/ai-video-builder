import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { loadProject, saveProject, projectDir, gridBundlesDir } from "@/lib/project";
import { videoCreate } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ASPECT_DIM: Record<string, [number, number]> = {
  "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1024, 1024],
  "4:3": [1440, 1080], "3:2": [1620, 1080],
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  const { duration = 10, resolution = "768P" } = await req.json();
  const project = await loadProject(pid);

  const sbs = project.storyboards.filter((s: any) => s.selected);
  if (sbs.length === 0) return NextResponse.json({ detail: "没有已选图的分镜" }, { status: 400 });

  const n = Math.min(sbs.length, 9);
  const cols = n <= 4 ? 2 : 3;
  const rows = n <= 4 ? 2 : 3;
  const [W, H] = ASPECT_DIM[project.aspect_ratio] || ASPECT_DIM["16:9"];

  // 缩略图 → N 等分网格
  const tileW = Math.floor(W / cols);
  const tileH = Math.floor(H / rows);
  const composites: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    const buf = await fs.readFile(path.join(projectDir(pid), sbs[i].selected));
    const resized = await sharp(buf).resize(tileW, tileH, { fit: "cover" }).jpeg().toBuffer();
    composites.push(resized);
  }
  // 用 sharp 创建画布并拼接
  const gridPath = path.join(gridBundlesDir(pid), `${uuid().replace(/-/g, "").slice(0, 6)}_grid.jpg`);
  await fs.mkdir(path.dirname(gridPath), { recursive: true });
  const canvas = sharp({ create: { width: W, height: H, channels: 3, background: "#000" } });
  const composite = composites.map((buf, i) => ({
    input: buf,
    left: (i % cols) * tileW,
    top: Math.floor(i / cols) * tileH,
  }));
  await canvas.composite(composite).jpeg().toFile(gridPath);
  const gridRel = `grid_bundles/${path.basename(gridPath)}`;

  const b64 = (await fs.readFile(gridPath)).toString("base64");
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  // 拼 prompt
  const lines = sbs.slice(0, n).map((sb: any, i: number) =>
    `Panel ${i + 1}: ${((sb.prompt_data || {}).simple_prompt || sb.script || sb.name || "").slice(0, 200)}`
  );
  const fullPrompt = `A cinematic 3x3 grid montage showing nine storyboard panels simultaneously. Smooth continuous motion across all panels, unified lighting and color tone. ${lines.join(" | ")}`;

  const realDur = resolution === "1080P" ? 6 : (duration === 6 ? 6 : 10);

  let taskId: string;
  try {
    taskId = await videoCreate({
      prompt: fullPrompt,
      duration: realDur,
      resolution,
      firstFrameImage: dataUrl,
      apiKey,
    });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 });
  }

  const bid = uuid().replace(/-/g, "").slice(0, 6);
  const bundle = {
    id: bid,
    grid_image: gridRel,
    duration: realDur,
    resolution,
    storyboard_ids: sbs.slice(0, n).map((s: any) => s.id),
    panel_count: n,
    video_task_id: taskId,
    video_status: "Preparing",
    video_file: "",
    created_at: new Date().toISOString(),
  };
  if (!project.grid_bundles) project.grid_bundles = [];
  project.grid_bundles.push(bundle);
  await saveProject(project);
  return NextResponse.json({ ok: true, bundle });
}

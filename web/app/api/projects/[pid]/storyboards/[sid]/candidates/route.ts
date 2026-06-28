import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject, storyboardDir } from "@/lib/project";
import { imageGenerate } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });

  const { n = 4, use_subject_reference = "" } = await req.json();
  const project = await loadProject(pid);
  const sb = project.storyboards.find((s) => s.id === sid);
  if (!sb) return NextResponse.json({ detail: "分镜不存在" }, { status: 404 });

  const simplePrompt = sb.prompt_data?.simple_prompt || sb.script || sb.name;
  if (!simplePrompt.trim()) {
    return NextResponse.json({ detail: "分镜无描述" }, { status: 400 });
  }

  const aspect = project.aspect_ratio || "16:9";
  try {
    let refImage: string[] | undefined;
    if (use_subject_reference) {
      const char = project.characters.find((c) => c.id === use_subject_reference);
      const refPath = char?.selected || char?.reference_image;
      if (refPath) {
        const buf = await fs.readFile(path.join(require("@/lib/paths").PROJECTS_DIR, pid, refPath));
        refImage = [`data:image/jpeg;base64,${buf.toString("base64")}`];
      }
    }
    const urls = await imageGenerate({
      prompt: simplePrompt,
      model: "image-01",
      aspectRatio: aspect,
      n,
      promptOptimizer: false, // 关键修复：避免 1026 报错
      referenceImage: refImage,
      apiKey,
    });
    await fs.mkdir(storyboardDir(pid, sid), { recursive: true });
    const candidates: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const fname = `v${(sb.candidates?.length || 0) + i + 1}.jpg`;
      const buf = await fetch(urls[i]).then((r) => r.arrayBuffer());
      await fs.writeFile(path.join(storyboardDir(pid, sid), fname), Buffer.from(buf));
      candidates.push(`storyboards/${sid}/${fname}`);
    }
    sb.candidates = [...(sb.candidates || []), ...candidates];
    await saveProject(project);
    return NextResponse.json({ candidates });
  } catch (e: any) {
    return NextResponse.json({ detail: `图片生成失败: ${e.message}` }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject, charactersDir } from "@/lib/project";
import { imageGenerate } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });

  const { n = 3, aspect_ratio = "1:1" } = await req.json();
  const project = await loadProject(pid);
  const char = project.characters.find((c) => c.id === cid);
  if (!char) return NextResponse.json({ detail: "角色不存在" }, { status: 404 });

  const prompt = char.description?.trim() || char.name;
  try {
    const urls = await imageGenerate({
      prompt: `Character turnaround concept art of ${prompt}. Clear facial features, full body, neutral expression, white background.`,
      model: "image-01",
      aspectRatio: aspect_ratio,
      n,
      promptOptimizer: false, // 角色定妆照：不要 prompt 优化（之前有 1026 报错）
      apiKey,
    });
    await fs.mkdir(charactersDir(pid), { recursive: true });
    const newImages: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const fname = `${cid}_v${(char.generated_images?.length || 0) + i + 1}.jpg`;
      const buf = await fetch(urls[i]).then((r) => r.arrayBuffer());
      await fs.writeFile(path.join(charactersDir(pid), fname), Buffer.from(buf));
      newImages.push(`characters/${fname}`);
    }
    char.generated_images = [...(char.generated_images || []), ...newImages];
    await saveProject(project);
    return NextResponse.json({ images: newImages });
  } catch (e: any) {
    return NextResponse.json({ detail: `图片生成失败: ${e.message}` }, { status: 500 });
  }
}

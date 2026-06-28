import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject, charactersDir } from "@/lib/project";
import { imageGenerate } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  const { description, style_hint = "", n = 3 } = await req.json();

  const project = await loadProject(pid);
  const char = project.characters.find((c) => c.id === cid);
  if (!char) return NextResponse.json({ detail: "角色不存在" }, { status: 404 });
  const desc = description || char.description;
  if (!desc?.trim()) return NextResponse.json({ detail: "无角色描述" }, { status: 400 });

  try {
    const urls = await imageGenerate({
      prompt: `Character turnaround sheet of ${desc}. Three views: front, side, back. White background, clear features, full body. ${style_hint}`,
      model: "image-01",
      aspectRatio: "16:9",
      n,
      promptOptimizer: false,
      apiKey,
    });
    await fs.mkdir(charactersDir(pid), { recursive: true });
    const newImages: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const fname = `${cid}_t${(char.generated_images?.length || 0) + i + 1}.jpg`;
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

import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";
import { chat } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { extractJsonArray } from "@/lib/extract-json-array";
import { v4 as uuid } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  const { script = "", style_hint = "" } = await req.json();
  const project = await loadProject(pid);
  const text = script || project.script;
  if (!text.trim()) return NextResponse.json({ detail: "剧本为空" }, { status: 400 });

  const existingNames = new Set(project.characters.map((c) => c.name));

  const system = `你是角色设计师。阅读剧本，提取所有**有台词或被聚焦描写**的角色（不提取路人/背景/动物）。
输出 JSON 数组，字段：name（角色名）/ description（中文，2-3 句具体外貌+性格）/ age（年龄段）。
${style_hint ? `视觉风格：${style_hint}\n` : ""}只输出 JSON 数组。`;

  const raw = await chat({ system, user: text, temperature: 0.5, apiKey });
  try {
    const arr = extractJsonArray(raw);
    const added: any[] = [];
    for (const item of arr) {
      if (!item?.name || existingNames.has(item.name)) continue;
      const cid = uuid().replace(/-/g, "").slice(0, 6);
      const c = {
        id: cid,
        name: item.name,
        description: item.description || "",
        reference_image: "",
        generated_images: [],
        selected: "",
      };
      project.characters.push(c);
      added.push(c);
    }
    await saveProject(project);
    return NextResponse.json({ added });
  } catch (e: any) {
    return NextResponse.json({ detail: `解析失败: ${e.message}`, raw: raw.slice(0, 300) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { loadProject, saveProject } from "@/lib/project";
import { chat } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { extractJsonArray } from "@/lib/extract-json-array";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  const { script = "", style_hint = "", target_count = 0, style_anchor = "" } = await req.json();

  const project = await loadProject(pid);
  const text = script || project.script;
  if (!text.trim()) return NextResponse.json({ detail: "剧本为空" }, { status: 400 });

  const characterList = project.characters.map((c) => c.name).join("、");
  const aspect = project.aspect_ratio;

  const system = `你是分镜师。把剧本拆成 ${target_count || "3-8"} 个**连续**分镜，按剧情顺序。
要求：
- 每个分镜是 1 句具体镜头描述（中文，含主体/动作/环境）
- duration 默认 6 秒，可写 2-10 秒
- 复用剧本里的角色名：${characterList || "（无）"}
- 风格锚点：${style_anchor || style_hint || "无"}
输出 JSON 数组，字段：name（分镜名）/ script（具体镜头描述）/ duration（数字秒数）。只输出数组。`;

  const raw = await chat({ system, user: text, temperature: 0.7, apiKey });
  try {
    const arr = extractJsonArray(raw);
    const added: any[] = [];
    for (const item of arr) {
      const sid = uuid().replace(/-/g, "").slice(0, 6);
      const dur = Number(item.duration) || 6;
      const sb = {
        id: sid,
        order: project.storyboards.length,
        name: item.name || `分镜 ${project.storyboards.length + 1}`,
        script: item.script || "",
        prompt_data: { simple_prompt: item.script || item.name, style_anchor: style_anchor || "" },
        use_subject_reference: "",
        duration: Math.max(0.5, Math.min(10, dur)),
        resolution: "768P",
        candidates: [],
        selected: "",
        video_task_id: "",
        video_status: "",
        video_file: "",
      };
      project.storyboards.push(sb);
      added.push(sb);
    }
    await saveProject(project);
    return NextResponse.json({ added });
  } catch (e: any) {
    return NextResponse.json({ detail: `解析失败: ${e.message}`, raw: raw.slice(0, 300) }, { status: 500 });
  }
}

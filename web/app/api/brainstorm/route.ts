import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { extractJsonArray } from "@/lib/extract-json-array";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });

  const { brief, count = 8, style_hint = "", aspect_ratio = "16:9" } = await req.json();
  if (!brief?.trim()) {
    return NextResponse.json({ detail: "brief 不能为空" }, { status: 400 });
  }

  const system = `你是一位资深短片导演。用户给出一段 1-3 句的创意简报，你要扩展为 ${count} 个**截然不同**的短片方向。
要求：
1. 每个方向有明确的情绪、节奏、视觉风格区分（不要 8 个变体）
2. 适合 ${aspect_ratio} 画幅，约 30-60 秒
3. 输出必须是 JSON 数组，字段：title（方向名）/ script（2-3 句具体剧本概要）/ tone（一句话调性）
${style_hint ? `4. 风格倾向：${style_hint}` : ""}
只输出 JSON 数组，不要任何前言后语。`;

  const user = `简报：${brief.trim()}\n\n请生成 ${count} 个方向。`;

  const raw = await chat({ system, user, temperature: 0.9, apiKey });
  try {
    const ideas = extractJsonArray(raw);
    return NextResponse.json({ ideas });
  } catch (e: any) {
    return NextResponse.json({ detail: `解析失败: ${e.message}`, raw: raw.slice(0, 500) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { extractJsonArray } from "@/lib/extract-json-array";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { cid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  const { name = "", description, script = "", count = 3 } = await req.json();
  if (!description?.trim()) return NextResponse.json({ detail: "描述为空" }, { status: 400 });

  const system = `你是角色设计师。基于当前描述改写 ${count} 个**有差异的变体**。
要求：
- 每个变体保持核心特征（年龄段/性别/主要性格）
- 变体之间在外貌细节、气质、风格取向上有明显差异
- 每条 2-3 句中文
输出 JSON 数组，字段：description（变体描述）。只输出数组。`;

  const user = `角色：${name}\n当前描述：${description}\n${script ? `剧本：\n${script.slice(0, 800)}` : ""}`;

  const raw = await chat({ system, user, temperature: 0.8, apiKey });
  try {
    const arr = extractJsonArray(raw);
    return NextResponse.json({ options: arr });
  } catch (e: any) {
    return NextResponse.json({ detail: `解析失败: ${e.message}` }, { status: 500 });
  }
}

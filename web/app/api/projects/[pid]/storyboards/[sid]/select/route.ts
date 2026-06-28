import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const { candidate_index } = await req.json();
  const p = await loadProject(pid);
  const sb = p.storyboards.find((s) => s.id === sid);
  if (!sb) return NextResponse.json({ detail: "分镜不存在" }, { status: 404 });
  if (candidate_index < 0 || candidate_index >= (sb.candidates || []).length) {
    return NextResponse.json({ detail: "候选图索引越界" }, { status: 400 });
  }
  sb.selected = sb.candidates[candidate_index];
  await saveProject(p);
  return NextResponse.json({ ok: true, selected: sb.selected });
}

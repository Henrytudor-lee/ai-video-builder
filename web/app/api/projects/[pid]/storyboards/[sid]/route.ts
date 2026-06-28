import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const body = await req.json();
  const p = await loadProject(pid);
  const sb = p.storyboards.find((s) => s.id === sid);
  if (!sb) return NextResponse.json({ detail: "分镜不存在" }, { status: 404 });
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) (sb as any)[k] = v;
  }
  // duration clamp 0.5-10
  if (typeof (sb as any).duration === "number") {
    sb.duration = Math.max(0.5, Math.min(10, sb.duration));
  }
  await saveProject(p);
  return NextResponse.json(sb);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const p = await loadProject(pid);
  p.storyboards = p.storyboards.filter((s) => s.id !== sid);
  // 重新排序
  p.storyboards.forEach((s, i) => (s.order = i));
  await saveProject(p);
  return NextResponse.json({ ok: true });
}

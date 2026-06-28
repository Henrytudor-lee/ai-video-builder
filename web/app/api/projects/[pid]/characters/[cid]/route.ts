import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const p = await loadProject(pid);
  p.characters = p.characters.filter((c) => c.id !== cid);
  // 同步清空 storyboards 的 use_subject_reference
  for (const sb of p.storyboards) {
    if (sb.use_subject_reference === cid) sb.use_subject_reference = "";
  }
  await saveProject(p);
  return NextResponse.json({ ok: true });
}

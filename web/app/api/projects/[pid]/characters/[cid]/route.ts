import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const p = await loadProject(pid);
  p.characters = p.characters.filter((c) => c.id !== cid);
  for (const sb of p.storyboards) {
    if (sb.use_subject_reference === cid) sb.use_subject_reference = "";
  }
  await saveProject(p);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const body = await req.json();
  const p = await loadProject(pid);
  const c = p.characters.find((x) => x.id === cid);
  if (!c) return NextResponse.json({ detail: "角色不存在" }, { status: 404 });
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) (c as any)[k] = v;
  }
  await saveProject(p);
  return NextResponse.json(c);
}

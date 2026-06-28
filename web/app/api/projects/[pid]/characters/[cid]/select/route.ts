import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const { image_path } = await req.json();
  const p = await loadProject(pid);
  const c = p.characters.find((x) => x.id === cid);
  if (!c) return NextResponse.json({ detail: "角色不存在" }, { status: 404 });
  c.selected = image_path;
  await saveProject(p);
  return NextResponse.json({ ok: true, selected: image_path });
}

import { NextRequest, NextResponse } from "next/server";
import { loadProject, projectDir } from "@/lib/project";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const p = await loadProject(pid);
  const sb = p.storyboards.find((s) => s.id === sid);
  if (!sb?.selected) return NextResponse.json({ detail: "未选图" }, { status: 404 });
  const abs = path.join(projectDir(pid), sb.selected);
  if (!fs.existsSync(abs)) return NextResponse.json({ detail: "文件丢失" }, { status: 404 });
  const buf = fs.readFileSync(abs);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-cache",
    },
  });
}

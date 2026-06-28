import { NextRequest, NextResponse } from "next/server";
import { loadProject, projectDir } from "@/lib/project";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const p = await loadProject(pid);
  const sb = p.storyboards.find((s) => s.id === sid);
  if (!sb?.video_file) return NextResponse.json({ detail: "暂无视频" }, { status: 404 });
  const abs = path.join(projectDir(pid), sb.video_file);
  if (!fs.existsSync(abs)) return NextResponse.json({ detail: "文件丢失" }, { status: 404 });
  return new NextResponse(fs.readFileSync(abs), {
    headers: { "Content-Type": "video/mp4", "Cache-Control": "no-cache" },
  });
}

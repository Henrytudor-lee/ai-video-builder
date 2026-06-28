import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject, storyboardDir } from "@/lib/project";
import { videoPoll, getDownloadUrl } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });

  const project = await loadProject(pid);
  const sb = project.storyboards.find((s) => s.id === sid);
  if (!sb) return NextResponse.json({ detail: "分镜不存在" }, { status: 404 });
  if (!sb.video_task_id) {
    return NextResponse.json({ status: "", video_file: sb.video_file });
  }

  const r = await videoPoll(sb.video_task_id, apiKey);
  sb.video_status = r.status;
  if (r.status === "Success" && r.file_id) {
    const url = await getDownloadUrl(r.file_id, apiKey);
    const vname = "video.mp4";
    await fs.mkdir(storyboardDir(pid, sid), { recursive: true });
    const buf = await fetch(url).then((x) => x.arrayBuffer());
    await fs.writeFile(path.join(storyboardDir(pid, sid), vname), Buffer.from(buf));
    sb.video_file = `storyboards/${sid}/${vname}`;
    await saveProject(project);
  } else {
    await saveProject(project);
  }
  return NextResponse.json({
    status: r.status,
    video_file: sb.video_file,
    video_status: sb.video_status,
  });
}

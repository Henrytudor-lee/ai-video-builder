import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { loadProject, projectDir } from "@/lib/project";
import { concatVideos, hasFFmpeg, hasFFprobe } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const { transition = "fade", transition_duration = 0.5 } = await req.json();
  const project = await loadProject(pid);
  const videos = project.storyboards
    .filter((s: any) => s.video_file)
    .map((s: any) => path.join(projectDir(pid), s.video_file));
  if (videos.length === 0) {
    return NextResponse.json({ detail: "没有可拼接的视频" }, { status: 400 });
  }
  const ff = await hasFFmpeg();
  const fp = await hasFFprobe();
  if (!ff || !fp) {
    return NextResponse.json({ detail: "未检测到 ffmpeg/ffprobe" }, { status: 500 });
  }
  const out = path.join(projectDir(pid), "output.mp4");
  try {
    await concatVideos(videos, out, transition, transition_duration);
    return NextResponse.json({ ok: true, output: "output.mp4" });
  } catch (e: any) {
    return NextResponse.json({ detail: e.message }, { status: 500 });
  }
}

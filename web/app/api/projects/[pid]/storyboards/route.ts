import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { loadProject, saveProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const body = await req.json();
  const project = await loadProject(pid);
  const sid = uuid().replace(/-/g, "").slice(0, 6);
  const sb = {
    id: sid,
    order: project.storyboards.length,
    name: body.name || `分镜 ${project.storyboards.length + 1}`,
    script: body.script || "",
    prompt_data: body.prompt_data || {},
    use_subject_reference: body.use_subject_reference || "",
    duration: 6,
    resolution: "768P",
    candidates: [],
    selected: "",
    video_task_id: "",
    video_status: "",
    video_file: "",
  };
  project.storyboards.push(sb);
  await saveProject(project);
  return NextResponse.json(sb);
}

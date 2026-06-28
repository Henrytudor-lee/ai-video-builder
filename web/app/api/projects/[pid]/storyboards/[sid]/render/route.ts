import { NextRequest, NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/project";
import { videoCreate } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ pid: string; sid: string }> }) {
  const { pid, sid } = await params;
  const apiKey = getApiKey();
  if (!apiKey) return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });

  const project = await loadProject(pid);
  const sb = project.storyboards.find((s) => s.id === sid);
  if (!sb) return NextResponse.json({ detail: "分镜不存在" }, { status: 404 });
  if (!sb.selected) return NextResponse.json({ detail: "未选候选图" }, { status: 400 });

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { projectDir } = await import("@/lib/project");

  // 读 first_frame_image
  const firstFramePath = path.join(projectDir(pid), sb.selected);
  const buf = await fs.readFile(firstFramePath);
  const firstFrame = `data:image/jpeg;base64,${buf.toString("base64")}`;

  const simplePrompt = sb.prompt_data?.simple_prompt || sb.script || sb.name;

  // duration / resolution 校验
  let dur = sb.duration;
  if (sb.resolution === "1080P") dur = 6;
  if (dur !== 6 && dur !== 10) dur = dur <= 6 ? 6 : 10;

  // 主体参考模式 vs i2v
  let subjectReference: Array<{ type: "character"; image: string[] }> | undefined;
  if (sb.use_subject_reference) {
    const char = project.characters.find((c) => c.id === sb.use_subject_reference);
    const refRel = char?.selected || char?.reference_image;
    if (refRel) {
      const refBuf = await fs.readFile(path.join(projectDir(pid), refRel));
      const dataUrl = `data:image/jpeg;base64,${refBuf.toString("base64")}`;
      subjectReference = [{ type: "character", image: [dataUrl] }];
    }
  }

  try {
    const taskId = await videoCreate({
      prompt: simplePrompt,
      model: "MiniMax-Hailuo-2.3",
      duration: dur,
      resolution: sb.resolution,
      firstFrameImage: subjectReference ? undefined : firstFrame,
      subjectReference,
      promptOptimizer: true,
      apiKey,
    });
    sb.video_task_id = taskId;
    sb.video_status = "Preparing";
    sb.video_file = "";
    await saveProject(project);
    return NextResponse.json({ task_id: taskId });
  } catch (e: any) {
    return NextResponse.json({ detail: `视频任务发起失败: ${e.message}` }, { status: 500 });
  }
}

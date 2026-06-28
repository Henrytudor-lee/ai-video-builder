import { NextRequest, NextResponse } from "next/server";
import { assemblePrompt } from "@/lib/prompt";
import { videoCreate, videoPoll, getDownloadUrl } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { saveJson, loadJson } from "@/lib/storage";
import { HISTORY_PATH, OUTPUTS_DIR, TASKS_PATH } from "@/lib/paths";
import { v4 as uuid } from "uuid";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 分钟

export async function POST(req: NextRequest) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  }
  const body = await req.json();
  const prompt = assemblePrompt(body);
  if (!prompt) {
    return NextResponse.json({ detail: "Prompt 为空" }, { status: 400 });
  }
  if (prompt.length > 2000) {
    return NextResponse.json({ detail: `Prompt 过长（${prompt.length}/2000）` }, { status: 400 });
  }

  // duration / resolution 校验
  const duration = body.duration === 10 ? 10 : 6;
  let resolution = body.resolution === "1080P" ? "1080P" : "768P";
  if (resolution === "1080P" && duration !== 6) {
    return NextResponse.json({ detail: "1080P 仅支持 6s" }, { status: 400 });
  }

  const taskId = await videoCreate({
    prompt,
    duration,
    resolution,
    apiKey,
    promptOptimizer: true,
  });

  // 记录 task 元信息
  const tasks = await loadJson<Record<string, any>>(TASKS_PATH, {});
  tasks[taskId] = { prompt, duration, resolution, created_at: new Date().toISOString() };
  await saveJson(TASKS_PATH, tasks);

  // server-side 轮询（最长 10 分钟）
  const start = Date.now();
  while (Date.now() - start < 9 * 60 * 1000) {
    const r = await videoPoll(taskId, apiKey);
    if (r.status === "Success" && r.file_id) {
      const url = await getDownloadUrl(r.file_id, apiKey);
      const filename = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Date.now()}_${taskId}.mp4`;
      const dest = `${OUTPUTS_DIR}/${filename}`;
      await fs.mkdir(OUTPUTS_DIR, { recursive: true });
      const buf = await fetch(url).then((r) => r.arrayBuffer());
      await fs.writeFile(dest, Buffer.from(buf));
      // 写 history
      const history = await loadJson<any[]>(HISTORY_PATH, []);
      history.unshift({
        id: uuid().replace(/-/g, "").slice(0, 8),
        task_id: taskId,
        prompt,
        duration,
        resolution,
        local_file: filename,
        download_url: `/api/outputs/${filename}`,
        created_at: new Date().toISOString(),
      });
      await saveJson(HISTORY_PATH, history.slice(0, 200));
      return NextResponse.json({
        task_id: taskId,
        status: "Success",
        file_id: r.file_id,
        local_file: filename,
        download_url: `/api/outputs/${filename}`,
      });
    }
    if (r.status === "Fail") {
      return NextResponse.json({ task_id: taskId, status: "Fail" });
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  return NextResponse.json({ detail: "轮询超时" }, { status: 504 });
}

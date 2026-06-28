import { NextRequest, NextResponse } from "next/server";
import { videoPoll, getDownloadUrl } from "@/lib/minimax";
import { getApiKey } from "@/lib/config";
import { loadJson, saveJson } from "@/lib/storage";
import { HISTORY_PATH, OUTPUTS_DIR, TASKS_PATH } from "@/lib/paths";
import { v4 as uuid } from "uuid";
import fs from "node:fs/promises";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ task_id: string }> }) {
  const { task_id: taskId } = await params;
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ detail: "未配置 API key" }, { status: 400 });
  }
  const start = Date.now();
  while (Date.now() - start < 9 * 60 * 1000) {
    const r = await videoPoll(taskId, apiKey);
    if (r.status === "Success" && r.file_id) {
      const url = await getDownloadUrl(r.file_id, apiKey);
      const filename = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Date.now()}_${taskId}.mp4`;
      await fs.mkdir(OUTPUTS_DIR, { recursive: true });
      const buf = await fetch(url).then((r) => r.arrayBuffer());
      await fs.writeFile(`${OUTPUTS_DIR}/${filename}`, Buffer.from(buf));
      const tasks = await loadJson<Record<string, any>>(TASKS_PATH, {});
      const meta = tasks[taskId] || {};
      const history = await loadJson<any[]>(HISTORY_PATH, []);
      history.unshift({
        id: uuid().replace(/-/g, "").slice(0, 8),
        task_id: taskId,
        prompt: meta.prompt || "",
        duration: meta.duration || 6,
        resolution: meta.resolution || "768P",
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

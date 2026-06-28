/** MiniMax 海螺 2.3 API 客户端（v1 Builder 用 image-01 + Hailuo-2.3） */
const API_BASE = "https://api.minimaxi.com";

export type ModelName = "image-01" | "MiniMax-Hailuo-2.3" | "S2V-01" | "MiniMax-M2.7";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class MiniMaxError extends Error {
  status: number;
  raw: string;
  constructor(message: string, status: number, raw: string) {
    super(message);
    this.status = status;
    this.raw = raw;
  }
}

async function call<T>(path: string, body: any, apiKey: string, timeoutMs = 30000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) {
      throw new MiniMaxError(`MiniMax API ${r.status}: ${text.slice(0, 200)}`, r.status, text);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 文生图，返回 image_urls 列表 */
export async function imageGenerate(opts: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  n?: number;
  promptOptimizer?: boolean;
  referenceImage?: string[]; // data URLs
  apiKey: string;
}): Promise<string[]> {
  const body: any = {
    model: opts.model || "image-01",
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio || "16:9",
    n: opts.n || 1,
    prompt_optimizer: opts.promptOptimizer ?? false,
  };
  if (opts.referenceImage?.length) {
    body.reference_image = opts.referenceImage;
  }
  const r = await call<{ data?: { image_urls?: string[] }; base_resp?: { status_code: number; status_msg: string } }>(
    "/v1/image/generation",
    body,
    opts.apiKey
  );
  if (r.base_resp && r.base_resp.status_code !== 0) {
    throw new MiniMaxError(`image_generate: ${r.base_resp.status_msg}`, 200, JSON.stringify(r));
  }
  return r.data?.image_urls || [];
}

/** 文/图生视频 */
export async function videoCreate(opts: {
  prompt: string;
  model?: string;
  duration?: number; // 6 或 10（Hailuo 2.3），后端 clamp
  resolution?: string; // 768P / 1080P（1080P 仅 6s）
  firstFrameImage?: string; // data URL（i2v）
  subjectReference?: Array<{ type: "character"; image: string[] }>;
  promptOptimizer?: boolean;
  apiKey: string;
}): Promise<string> {
  const body: any = {
    model: opts.model || "MiniMax-Hailuo-2.3",
    prompt: opts.prompt,
  };
  // 1080P 只支持 6s
  let dur = opts.duration ?? 6;
  if (opts.resolution === "1080P") dur = 6;
  if (dur !== 6 && dur !== 10) dur = dur <= 6 ? 6 : 10;
  body.duration = dur;
  if (opts.resolution) body.resolution = opts.resolution;

  if (opts.subjectReference) {
    // S2V-01 模式：锁定主体，不接受 first_frame_image / duration / resolution / prompt_optimizer
    body.subject_reference = opts.subjectReference;
  } else {
    // i2v / t2v 模式
    if (opts.firstFrameImage) body.first_frame_image = opts.firstFrameImage;
    if (opts.promptOptimizer !== undefined) body.prompt_optimizer = opts.promptOptimizer;
  }
  const r = await call<{ task_id?: string; base_resp?: { status_code: number; status_msg: string } }>(
    "/v1/video_generation",
    body,
    opts.apiKey
  );
  if (!r.task_id) throw new MiniMaxError("video_create: no task_id", 200, JSON.stringify(r));
  return r.task_id;
}

/** 轮询任务状态 */
export async function videoPoll(taskId: string, apiKey: string): Promise<{ status: string; file_id?: string; base_resp?: any }> {
  const r = await fetch(`${API_BASE}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new MiniMaxError(`video_poll ${r.status}`, r.status, await r.text());
  const j = await r.json();
  return { status: j.status, file_id: j.file_id, base_resp: j.base_resp };
}

/** file_id → 临时下载 URL（24h 有效） */
export async function getDownloadUrl(fileId: string, apiKey: string): Promise<string> {
  const r = await call<{ file?: { download_url?: string }; base_resp?: any }>(
    "/v1/files/retrieve",
    { file_id: fileId },
    apiKey
  );
  if (!r.file?.download_url) throw new MiniMaxError("get_download_url: no url", 200, JSON.stringify(r));
  return r.file.download_url;
}

/** LLM 调用（用于头脑风暴、角色 AI、分镜 AI） */
export async function chat(opts: {
  model?: string;
  system: string;
  user: string;
  temperature?: number;
  apiKey: string;
}): Promise<string> {
  const r = await call<{ choices?: Array<{ message: { content: string } }>; base_resp?: any }>(
    "/v1/chat/completions",
    {
      model: opts.model || "MiniMax-M2.7",
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      temperature: opts.temperature ?? 0.8,
      response_format: { type: "json_object" },
    },
    opts.apiKey
  );
  const content = r.choices?.[0]?.message?.content;
  if (!content) throw new MiniMaxError("chat: no content", 200, JSON.stringify(r));
  return content;
}

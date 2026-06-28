import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.resolve(process.cwd(), "..", "config.json");

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { api_key } = await req.json();
  if (!api_key || !api_key.trim()) {
    return NextResponse.json({ detail: "key 不能为空" }, { status: 400 });
  }
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ api_key: api_key.trim() }, null, 2));
  // 同步更新 .env（便于 dev 模式立即生效）
  const envPath = path.resolve(process.cwd(), ".env");
  try {
    let envText = await fs.readFile(envPath, "utf-8");
    envText = envText.replace(/^MINIMAX_VIDEO_KEY=.*$/m, `MINIMAX_VIDEO_KEY=${api_key.trim()}`);
    await fs.writeFile(envPath, envText);
  } catch {}
  return NextResponse.json({ ok: true });
}

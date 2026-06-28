import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");

/** API key 优先级：env > config.json */
export function getApiKey(): string {
  const fromEnv = process.env.MINIMAX_VIDEO_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf-8"));
    return (cfg.api_key || "").trim();
  } catch {
    return "";
  }
}

/** API key 是否已配置（用于前端"更换/设置"按钮判断） */
export function hasApiKey(): boolean {
  return getApiKey().length > 0 && !getApiKey().startsWith("REPLACE");
}

/** 给前端展示的预览（前 8 + 后 4） */
export function keyPreview(): string {
  const k = getApiKey();
  if (k.length < 12) return "";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

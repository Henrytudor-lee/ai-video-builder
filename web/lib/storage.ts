import fs from "node:fs/promises";
import path from "node:path";

/** 读取 JSON 文件，缺则返回 default */
export async function loadJson<T>(p: string, defaultValue: T): Promise<T> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (e.code === "ENOENT") return defaultValue;
    throw e;
  }
}

/** 原子写：先写 .tmp 再 rename，避免崩溃中途损坏 */
export async function saveJson(p: string, data: unknown): Promise<void> {
  const dir = path.dirname(p);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, p);
}

/** 删除文件，ENOENT 视为成功 */
export async function removeIfExists(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}

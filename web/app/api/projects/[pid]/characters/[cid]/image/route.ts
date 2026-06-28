import { NextRequest, NextResponse } from "next/server";
import { loadProject, projectDir } from "@/lib/project";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ pid: string; cid: string }> }) {
  const { pid, cid } = await params;
  const p = await loadProject(pid);
  const c = p.characters.find((x) => x.id === cid);
  if (!c) return NextResponse.json({ detail: "角色不存在" }, { status: 404 });
  // 优先 selected > reference_image > 第一张 generated
  const rel = c.selected || c.reference_image || c.generated_images?.[0];
  if (!rel) return NextResponse.json({ detail: "暂无图" }, { status: 404 });
  const abs = path.join(projectDir(pid), rel);
  if (!fs.existsSync(abs)) return NextResponse.json({ detail: "文件丢失" }, { status: 404 });
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).slice(1);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg",
      "Cache-Control": "no-cache",
    },
  });
}

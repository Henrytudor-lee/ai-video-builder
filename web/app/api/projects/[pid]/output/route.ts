import { NextRequest, NextResponse } from "next/server";
import { projectDir } from "@/lib/project";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const abs = path.join(projectDir(pid), "output.mp4");
  if (!fs.existsSync(abs)) return NextResponse.json({ detail: "not found" }, { status: 404 });
  return new NextResponse(fs.readFileSync(abs), {
    headers: { "Content-Type": "video/mp4", "Cache-Control": "no-cache" },
  });
}

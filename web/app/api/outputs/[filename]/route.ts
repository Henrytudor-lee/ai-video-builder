import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { OUTPUTS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ detail: "非法路径" }, { status: 400 });
  }
  const filePath = path.join(OUTPUTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ detail: "not found" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-cache",
    },
  });
}

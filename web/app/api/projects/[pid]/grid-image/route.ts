import { NextRequest, NextResponse } from "next/server";
import { projectDir } from "@/lib/project";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const filePath = req.nextUrl.searchParams.get("path");
  if (!filePath) return NextResponse.json({ detail: "path required" }, { status: 400 });
  if (filePath.includes("..")) return NextResponse.json({ detail: "bad path" }, { status: 400 });
  const abs = path.join(projectDir(pid), filePath);
  if (!fs.existsSync(abs)) return NextResponse.json({ detail: "not found" }, { status: 404 });
  return new NextResponse(fs.readFileSync(abs), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-cache" },
  });
}

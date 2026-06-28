import { NextRequest, NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ detail: "项目名不能为空" }, { status: 400 });
  }
  const p = await createProject({
    name: body.name.trim(),
    script: body.script || "",
    aspect_ratio: body.aspect_ratio || "16:9",
  });
  return NextResponse.json(p);
}

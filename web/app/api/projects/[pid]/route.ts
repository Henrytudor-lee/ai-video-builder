import { NextRequest, NextResponse } from "next/server";
import { loadProject, updateProject, deleteProject } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  try {
    return NextResponse.json(await loadProject(pid));
  } catch {
    return NextResponse.json({ detail: "项目不存在" }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const body = await req.json();
  try {
    return NextResponse.json(await updateProject(pid, body));
  } catch {
    return NextResponse.json({ detail: "项目不存在" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  await deleteProject(pid);
  return NextResponse.json({ ok: true });
}

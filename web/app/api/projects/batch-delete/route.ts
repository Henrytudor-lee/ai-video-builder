import { NextRequest, NextResponse } from "next/server";
import { batchDeleteProjects } from "@/lib/project";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ detail: "ids 不能为空" }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ detail: "单次最多 100 个" }, { status: 400 });
  }
  const result = await batchDeleteProjects(ids);
  return NextResponse.json({ ...result, ok: true, deleted_count: result.deleted.length });
}

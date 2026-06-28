import { NextResponse } from "next/server";
import { loadJson } from "@/lib/storage";
import { HISTORY_PATH } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadJson<any[]>(HISTORY_PATH, []));
}

import { NextResponse } from "next/server";
import { loadPresets } from "@/lib/presets";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = await loadPresets();
  return NextResponse.json(p);
}

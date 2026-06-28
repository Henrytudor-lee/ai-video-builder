import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { loadJson, saveJson, removeIfExists } from "@/lib/storage";
import { HISTORY_PATH, OUTPUTS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ hid: string }> }) {
  const { hid } = await params;
  const history = await loadJson<any[]>(HISTORY_PATH, []);
  const item = history.find((h) => h.id === hid);
  const next = history.filter((h) => h.id !== hid);
  await saveJson(HISTORY_PATH, next);
  if (item?.local_file) {
    await removeIfExists(path.join(OUTPUTS_DIR, item.local_file));
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { hasApiKey, keyPreview } from "@/lib/config";
import { hasFFmpeg, hasFFprobe } from "@/lib/ffmpeg";

export const dynamic = "force-dynamic";

export async function GET() {
  const [ffmpeg, ffprobe] = await Promise.all([hasFFmpeg(), hasFFprobe()]);
  return NextResponse.json({
    has_key: hasApiKey(),
    key_preview: keyPreview(),
    ffmpeg_available: ffmpeg && ffprobe,
  });
}
